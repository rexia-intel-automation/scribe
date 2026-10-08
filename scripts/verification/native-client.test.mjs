import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { EVENTS } from './lib.mjs';

if (/OneDrive/i.test(process.cwd())) throw new Error('Run in the D: runtime mirror');
const binary = resolve('app/hook-client/target/release', process.platform === 'win32' ? 'scribe-hook.exe' : 'scribe-hook');
const token = 'PUBLIC_SYNTHETIC_TOKEN_WITH_32_CHARACTERS';
const hookKey = 'PUBLIC_INDEPENDENT_HOOK_KEY_32_CHARACTERS';
function sign(key, fields) {
  const mac = createHmac('sha256', key).update('scribe-hook-v1');
  for (const value of fields) { const bytes = Buffer.from(value); const size = Buffer.alloc(8); size.writeBigUInt64BE(BigInt(bytes.length)); mac.update(size).update(bytes); }
  return mac.digest('base64url');
}


async function launch(exe, config, event, body, leaveStdinOpen = false, overrides = {}) {
  const started = performance.now();
  const child = spawn(exe, ['--hook', event], { windowsHide: true,
    env: { ...process.env, SCRIBE_CONNECTION_FILE: config, ...overrides }, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdin.on('error', () => {});
  if (leaveStdinOpen) child.stdin.write(body); else child.stdin.end(body);
  const timer = setTimeout(() => child.kill(), 2000);
  const code = await new Promise((ok, fail) => { child.once('error', fail); child.once('close', ok); });
  clearTimeout(timer);
  return { code, stdout, stderr, elapsedMs: performance.now() - started };
}

test('native client forwards eleven events, returns only permission decisions and blocks redirects/proxies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scribe native test '));
  const executable = join(root, process.platform === 'win32' ? 'scribe-hook.exe' : 'scribe-hook');
  await copyFile(binary, executable);
  const config = join(root, 'connection.json');
  const events = [];
  let scenario = 'healthy', forbiddenRequests = 0;
  const trap = createServer((_req, res) => { forbiddenRequests++; res.end(); });
  await new Promise(ok => trap.listen(0, '127.0.0.1', ok));
  const trapUrl = `http://127.0.0.1:${trap.address().port}`;
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    assert.equal(req.headers.authorization, undefined, 'Neither MCP Bearer nor hook key may be sent');
    if (req.url.startsWith('/v1/hooks/challenge/')) {
      assert.equal(body, '');
      const nonce = req.url.split('/').at(-1);
      if (scenario === 'impostor') { res.writeHead(200).end('{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}'); return; }
      const key = scenario === 'bearer-forgery' ? token : hookKey;
      res.writeHead(204, { 'x-scribe-proof': sign(key, ['challenge', nonce]) }).end();
      return;
    }
    const event = JSON.parse(body).hook_event_name;
    assert.equal(req.url, '/v1/hooks/' + event);
    const nonce = req.headers['x-scribe-nonce'];
    assert.equal(req.headers['x-scribe-proof'], sign(hookKey, ['request', nonce, event, body]));
    events.push(event);
    if (scenario === 'stalled') return;
    if (scenario === 'redirect') { res.writeHead(307, { Location: trapUrl }).end(); return; }
    if (scenario === 'http-error') { res.writeHead(503).end(); return; }
    const reply = scenario === 'invalid-json' ? 'invalid JSON' : JSON.stringify({ hookSpecificOutput: {
      hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } });
    if (scenario !== 'unsigned') {
      const key = scenario === 'response-bearer-forgery' ? token : hookKey;
      const boundNonce = scenario === 'replay' ? '0'.repeat(32) : nonce;
      const boundEvent = scenario === 'wrong-event' ? 'Stop' : event;
      const boundReply = scenario === 'changed-body' ? reply.replace('allow', 'deny') : reply;
      const boundStatus = scenario === 'wrong-status' ? '204' : '200';
      res.setHeader('x-scribe-proof', sign(key, ['response', boundNonce, boundEvent, boundStatus, boundReply]));
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(reply);
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  await writeFile(config, JSON.stringify({ port: server.address().port, token, hook_key: hookKey }));
  try {
    for (const event of EVENTS) {
      const result = await launch(executable, config, event, JSON.stringify({ hook_event_name: event, session_id: 'public', cwd: '/public' }));
      assert.equal(result.code, 0);
      if (event === 'PermissionRequest') assert.equal(JSON.parse(result.stdout).hookSpecificOutput.decision.behavior, 'allow');
      else assert.equal(result.stdout, '');
      assert.equal(result.stderr, '');
      assert.ok(result.elapsedMs < 1000);
    }
    assert.deepEqual(events, EVENTS);
    for (scenario of ['stalled', 'redirect', 'http-error', 'invalid-json', 'unsigned', 'response-bearer-forgery', 'replay', 'wrong-event', 'changed-body', 'wrong-status', 'impostor', 'bearer-forgery', 'healthy']) {
      const countBefore = events.length;
      const event = scenario === 'stalled' ? 'Stop' : 'PermissionRequest';
      const result = await launch(executable, config, event, JSON.stringify({
        hook_event_name: event, session_id: 'public', cwd: '/public' }), false,
      { HTTP_PROXY: trapUrl, HTTPS_PROXY: trapUrl, ALL_PROXY: trapUrl, NO_PROXY: '' });
      assert.equal(result.code, 0);
      if (scenario === 'healthy') assert.equal(JSON.parse(result.stdout).hookSpecificOutput.decision.behavior, 'allow');
      else assert.equal(result.stdout, '');
      assert.equal(result.stderr, '');
      if (['impostor', 'bearer-forgery'].includes(scenario)) assert.equal(events.length, countBefore, 'Reject impersonator before sending the payload');
      assert.ok(result.elapsedMs < 1000);
    }
    assert.equal(forbiddenRequests, 0);
    server.closeAllConnections(); await new Promise(ok => server.close(ok));
    const closed = await launch(executable, config, 'Stop', JSON.stringify({ hook_event_name: 'Stop', session_id: 'public', cwd: '/public' }));
    assert.equal(closed.code, 0); assert.equal(closed.stdout, ''); assert.equal(closed.stderr, '');
    assert.ok(closed.elapsedMs < 1000);
  } finally {
    server.closeAllConnections(); if (server.listening) await new Promise(ok => server.close(ok));
    await new Promise(ok => trap.close(ok));
    await rm(root, { recursive: true, force: true });
  }
});

test('native client rejects oversized/malformed input and terminates with unfinished stdin', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scribe-client-input-'));
  const config = join(root, 'connection.json');
  await writeFile(config, JSON.stringify({ port: 21517, token, hook_key: hookKey }));
  try {
    for (const [event, body, open] of [['Stop', 'invalid', false], ['Stop', 'x'.repeat(1024 * 1024 + 1), false],
      ['Unknown', '{}', false], ['Stop', '{', true], ['Stop', '{"hook_event_name":"Stop","session_id":42,"cwd":"/public"}', false]]) {
      const result = await launch(binary, config, event, body, open);
      assert.equal(result.code, 0); assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
      assert.ok(result.elapsedMs < 1000);
    }
    await writeFile(config, '{"port":80,"token":"invalid"}');
    const badConfig = await launch(binary, config, 'Stop', '{}');
    assert.equal(badConfig.code, 0); assert.equal(badConfig.stdout, ''); assert.equal(badConfig.stderr, '');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('native open detaches the app from captured command streams', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scribe open test '));
  assert.equal(dirname(resolve(root)), resolve(tmpdir()));
  const app = join(root, process.platform === 'win32' ? 'public-app.exe' : 'public-app');
  const marker = join(root, 'started.pid');
  const config = join(root, 'connection.json');
  let child, timer, compiler, compilerTimer;
  try {
    compiler = spawn('rustc', ['--edition=2021', resolve('scripts/verification/fixtures/open-fixture.rs'), '-o', app],
      { windowsHide: true, stdio: 'inherit' });
    compilerTimer = setTimeout(() => compiler.kill(), 30000);
    assert.equal(await new Promise((ok, fail) => { compiler.once('error', fail); compiler.once('close', ok); }), 0);
    clearTimeout(compilerTimer);
    await writeFile(config, JSON.stringify({ port: 21517, token, app_path: app }));
    child = spawn(binary, ['--open'], { windowsHide: true,
      env: { ...process.env, SCRIBE_CONNECTION_FILE: config, SCRIBE_OPEN_TEST_MARKER: marker },
      stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.on('error', () => {}); // Intentionally left open: the app must not inherit it.
    child.stdin.write('PUBLIC STDIN SENTINEL\n');
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const result = await Promise.race([
      new Promise((ok, fail) => { child.once('error', fail); child.once('close', code => ok({ closed: true, code })); }),
      new Promise(ok => { timer = setTimeout(() => ok({ closed: false }), 1000); }),
    ]);
    clearTimeout(timer);
    for (let tries = 0; tries < 50; tries++) {
      try { await readFile(marker); break; } catch { await new Promise(ok => setTimeout(ok, 20)); }
    }
    const pid = Number(await readFile(marker, 'utf8'));
    assert.ok(Number.isSafeInteger(pid) && pid > 0);
    assert.doesNotThrow(() => process.kill(pid, 0), 'App must remain running after the command returns');
    const stdinMarker = join(root, 'started.stdin');
    for (let tries = 0; tries < 50; tries++) {
      try { await readFile(stdinMarker); break; } catch { await new Promise(ok => setTimeout(ok, 20)); }
    }
    assert.equal(await readFile(stdinMarker, 'utf8'), 'EOF');
    assert.deepEqual(result, { closed: true, code: 0 });
    assert.equal(stdout, ''); assert.equal(stderr, '');
  } finally {
    clearTimeout(timer);
    clearTimeout(compilerTimer);
    if (compiler?.exitCode === null) compiler.kill();
    try { const pid = Number(await readFile(marker, 'utf8')); if (Number.isSafeInteger(pid) && pid > 0) process.kill(pid); } catch {}
    if (child?.exitCode === null) child.kill();
    await rm(root, { recursive: true, force: true });
  }
});
