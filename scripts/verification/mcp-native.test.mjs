import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

if (/OneDrive/i.test(process.cwd())) throw new Error('Run in the runtime mirror');
const binary = resolve('app/hook-client/target/fixture/release', process.platform === 'win32' ? 'scribe-hook.exe' : 'scribe-hook');
const token = 'PUBLIC_SYNTHETIC_MCP_TOKEN_32_CHARACTERS';
const key = 'PUBLIC_INDEPENDENT_MCP_KEY_32_CHARACTERS';
const fresh = 'abcdef0123456789abcdef0123456789';
function sign(fields) {
  const mac = createHmac('sha256', key).update('scribe-hook-v1');
  for (const field of fields) {
    const bytes = Buffer.from(field), length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(bytes.length)); mac.update(length).update(bytes);
  }
  return mac.digest('base64url');
}
async function fixture(t, handler) {
  const root = await mkdtemp(join(tmpdir(), 'scribe public mcp '));
  const server = createServer(handler);
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const config = join(root, 'connection.json');
  await writeFile(config, JSON.stringify({ port: server.address().port, token, hook_key: key }));
  const child = spawn(binary, ['--mcp'], { windowsHide: true,
    env: { ...process.env, SCRIBE_CONNECTION_FILE: config }, stdio: ['pipe', 'pipe', 'pipe'] });
  const replies = new Map(), waiters = new Map(), invalid = [];
  let stderr = '';
  child.stderr.on('data', bytes => { stderr += bytes; });
  child.stdin.on('error', () => {});
  const closed = new Promise((ok, fail) => { child.once('error', fail); child.once('close', code => ok({ code, stderr })); });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    try {
      const value = JSON.parse(line);
      if (value.jsonrpc !== '2.0') invalid.push(line);
      const waiter = waiters.get(value.id);
      if (waiter) { waiters.delete(value.id); waiter(value); } else replies.set(value.id, value);
    } catch { invalid.push(line); }
  });
  const timer = setTimeout(() => child.kill(), 10000);
  t.after(async () => {
    clearTimeout(timer); child.kill(); await closed;
    server.closeAllConnections(); await new Promise(ok => server.close(ok));
    await rm(root, { recursive: true, force: true });
  });
  const send = value => child.stdin.write(JSON.stringify(value) + '\n');
  async function reply(id) {
    if (replies.has(id)) { const value = replies.get(id); replies.delete(id); return value; }
    let replyTimer;
    try {
      return await Promise.race([
        new Promise(ok => waiters.set(id, ok)),
        new Promise((_, fail) => { replyTimer = setTimeout(() => fail(new Error(`No reply for ${id}`)), 5000); }),
      ]);
    } finally { clearTimeout(replyTimer); }
  }
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'public-test', version: '1' } } });
  assert.equal((await reply(1)).result.serverInfo.name, 'scribe');
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  async function finish() {
    child.stdin.end();
    const result = await closed;
    assert.equal(result.code, 0); assert.equal(result.stderr, ''); assert.deepEqual(invalid, []);
  }
  return { server, child, send, reply, finish };
}
const report = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: {
  name: 'scribe_report', arguments: { session_id: 'public-session', text: 'PUBLIC CONTENT' } } };

test('legacy native MCP discovery includes private cache hints without contacting the app', async t => {
  let requests = 0;
  const f = await fixture(t, (_req, res) => { requests++; res.end(); });
  f.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const { result } = await f.reply(2);
  assert.equal(result.ttlMs, 0);
  assert.equal(result.cacheScope, 'private');
  assert.deepEqual(result.tools.map(tool => tool.name).sort(), ['scribe_ask', 'scribe_report']);
  assert.equal(requests, 0);
  await f.finish();
});

test('native MCP proves the server before sending content and uses one socket for challenge and POST', async t => {
  let calls = 0, firstSocket;
  const f = await fixture(t, async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    assert.equal(req.headers.authorization, undefined);
    assert.ok(!Object.values(req.headers).includes(token));
    assert.ok(!Object.values(req.headers).includes(key));
    const nonce = req.url.split('/').at(-1);
    if (req.method === 'GET') {
      firstSocket = req.socket; assert.equal(body.length, 0);
      assert.equal(req.headers['x-scribe-proof'], sign(['mcp-challenge-request', nonce]));
      res.writeHead(204, { 'x-scribe-server-nonce': fresh, 'x-scribe-proof': sign(['mcp-challenge', nonce, fresh]) }); res.end();
    } else {
      calls++; assert.equal(req.socket, firstSocket); assert.equal(req.url, '/mcp');
      assert.equal(req.headers['x-scribe-server-nonce'], fresh);
      assert.equal(req.headers['x-scribe-proof'], sign(['mcp-request', req.headers['x-scribe-nonce'], fresh, '/mcp', body]));
      const call = JSON.parse(body);
      const result = JSON.stringify({ jsonrpc: '2.0', id: call.id, result: { content: [{ type: 'text', text: '{"ok":true}' }] } });
      res.writeHead(200, { 'content-type': 'application/json', 'x-scribe-proof': sign(['mcp-response', req.headers['x-scribe-nonce'], fresh, '200', result]) }); res.end(result);
    }
  });
  let connections = 0; f.server.on('connection', () => connections++);
  f.send(report);
  const response = await f.reply(2);
  assert.notEqual(response.result.isError, true); assert.equal(calls, 1); assert.equal(connections, 1);
  await f.finish();
});

test('an unproved local listener never receives a tool body or credentials', async t => {
  const requests = [];
  const f = await fixture(t, async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    requests.push({ method: req.method, body: Buffer.concat(chunks), headers: req.headers });
    res.writeHead(204, { 'x-scribe-server-nonce': fresh, 'x-scribe-proof': 'UNTRUSTED' }); res.end();
  });
  f.send(report);
  assert.equal((await f.reply(2)).result.isError, true);
  assert.equal(requests.length, 1); assert.equal(requests[0].method, 'GET'); assert.equal(requests[0].body.length, 0);
  assert.equal(requests[0].headers.authorization, undefined);
  assert.ok(!JSON.stringify(requests).includes('PUBLIC CONTENT'));
  await f.finish();
});

test('a socket closed after a valid challenge causes no reconnect or content POST', async t => {
  let posts = 0, connections = 0;
  const f = await fixture(t, (req, res) => {
    if (req.method === 'POST') { posts++; res.end(); return; }
    const nonce = req.url.split('/').at(-1);
    // Explicit close forces the established HTTP sender to retire, despite valid proof.
    res.writeHead(204, { connection: 'close', 'x-scribe-server-nonce': fresh, 'x-scribe-proof': sign(['mcp-challenge', nonce, fresh]) }); res.end();
  });
  f.server.on('connection', () => connections++);
  f.send(report);
  assert.equal((await f.reply(2)).result.isError, true);
  assert.equal(posts, 0); assert.equal(connections, 1);
  await f.finish();
});

test('forged response content never becomes a tool result or stderr data', async t => {
  const f = await fixture(t, async (req, res) => {
    const nonce = req.url.split('/').at(-1);
    if (req.method === 'GET') {
      res.writeHead(204, { 'x-scribe-server-nonce': fresh, 'x-scribe-proof': sign(['mcp-challenge', nonce, fresh]) }); res.end(); return;
    }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks));
    res.writeHead(200, { 'x-scribe-proof': 'UNTRUSTED', 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'PUBLIC FORGED ANSWER' }] } }));
  });
  f.send(report);
  const response = await f.reply(2);
  assert.equal(response.result.isError, true); assert.ok(!JSON.stringify(response).includes('PUBLIC FORGED ANSWER'));
  await f.finish();
});
