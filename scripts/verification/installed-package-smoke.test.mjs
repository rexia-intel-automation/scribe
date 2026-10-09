import assert from 'node:assert/strict';
import test from 'node:test';
import { assertTrustedRunner, helperProcess, parseAttestation, parseReportResult, runMcpSmoke, startupFailure, waitForLine } from './installed-package-smoke.mjs';

const trusted = {
  GITHUB_ACTIONS: 'true', CI: 'true', GITHUB_REF: 'refs/heads/main',
  GITHUB_REPOSITORY: 'rexia-intel-automation/scribe', GITHUB_RUN_ID: '123',
  RUNNER_TEMP: 'C:\\runner-temp', GITHUB_WORKSPACE: 'C:\\workspace', GITHUB_EVENT_NAME: 'workflow_dispatch',
};
const success = (id, result) => JSON.stringify({ jsonrpc: '2.0', id, result });

function fakeChild() {
  return { writes: [], stdin: { write(line) { this.owner.writes.push(JSON.parse(line)); }, owner: null } };
}
const successfulReplies = [
  (id) => success(id, { tools: [{ name: 'scribe_report' }] }),
  (id) => success(id, { resultType: 'complete', structuredContent: { ok: true }, isError: false }),
];

test('startup failures report a bounded category and never echo stderr or credentials', () => {
  const secret = 'PUBLIC_SECRET_MARKER';
  for (const [message, category] of [
    [`fuse: device not found ${secret}`, 'FUSE unavailable'],
    [`error while loading shared libraries: libexample.so ${secret}`, 'shared library unavailable'],
    [`Gtk cannot open display ${secret}`, 'display unavailable'],
    [`bwrap sandbox failure ${secret}`, 'sandbox startup failed'],
    [`unrecognized failure ${secret}`, 'unclassified startup failure'],
    [`Connection refused ${secret}`, 'unclassified startup failure'],
  ]) {
    const error = startupFailure(message, 1, null);
    assert.ok(error.message.includes(category));
    assert.ok(error.message.includes('exit=1'));
    assert.equal(error.message.includes(secret), false);
  }
  const signaled = startupFailure(secret, null, 'SIGTERM');
  assert.ok(signaled.message.includes('signal=SIGTERM'));
  assert.equal(startupFailure(secret, secret, secret).message.includes(secret), false);
});

test('runner guard accepts main and v tags, rejects local, pull request, and non-v refs', () => {
  assert.doesNotThrow(() => assertTrustedRunner(trusted));
  assert.doesNotThrow(() => assertTrustedRunner({ ...trusted, GITHUB_REF: 'refs/tags/v0.1.0' }));
  for (const env of [
    {},
    { ...trusted, GITHUB_ACTIONS: 'false' },
    { ...trusted, GITHUB_REF: 'refs/pull/7/merge' },
    { ...trusted, GITHUB_REF: 'refs/tags/test' },
    { ...trusted, GITHUB_REPOSITORY: 'someone/fork' },
  ]) assert.throws(() => assertTrustedRunner(env), /restricted to GitHub Actions/);
});

test('attestation requires the installed helper name, release version, and transport', () => {
  assert.deepEqual(parseAttestation('{"name":"scribe-hook","version":"0.1.0","mcp_transport":"attested-stdio-v1"}', '0.1.0'), {
    name: 'scribe-hook', version: '0.1.0', mcp_transport: 'attested-stdio-v1',
  });
  for (const body of [
    'not json',
    '{"name":"other","version":"0.1.0","mcp_transport":"attested-stdio-v1"}',
    '{"name":"scribe-hook","version":"0.1.1","mcp_transport":"attested-stdio-v1"}',
    '{"name":"scribe-hook","version":"0.1.0","mcp_transport":"stdio"}',
  ]) assert.throws(() => parseAttestation(body, '0.1.0'), /attestation/);
});

test('report accepts public success text, rejects malformed JSON and MCP errors', () => {
  assert.doesNotThrow(() => parseReportResult({
    resultType: 'complete', content: [{ type: 'text', text: '{"ok":true}' }], isError: false,
  }));
  assert.doesNotThrow(() => parseReportResult({ resultType: 'complete', structuredContent: { ok: true } }));
  assert.throws(() => parseReportResult({ resultType: 'complete', content: [{ text: 'not json' }] }), /successful public/);
  assert.throws(() => parseReportResult({ resultType: 'complete', isError: true, structuredContent: { ok: true } }), /successful public/);
});

test('modern MCP smoke lists tools and reports one public synthetic milestone', async () => {
  const child = fakeChild(); child.stdin.owner = child;
  let waits = 0;
  const result = await runMcpSmoke(child, async (id) => successfulReplies[waits++](id));
  assert.equal(result, true);
  const calls = child.writes.filter((message) => message.method === 'tools/call');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params._meta['io.modelcontextprotocol/protocolVersion'], '2026-07-28');
  assert.equal(calls[0].params.name, 'scribe_report');
  assert.equal(calls[0].params.arguments.text, 'Public installed package smoke check.');
  assert.equal(child.writes.some((message) => message.method === 'initialize'), false);
});

test('malformed, error, EOF, and timeout replies fail without echoing response content', async () => {
  const secret = 'PUBLIC_SECRET_MARKER_DO_NOT_ECHO';
  for (const next of [
    async () => `{malformed ${secret}`,
    async (id) => JSON.stringify({ jsonrpc: '2.0', id, error: { message: secret } }),
    async () => null,
    async (_id, timeout) => new Promise((_, reject) => setTimeout(() => reject(new Error('Installed helper MCP request timed out.')), timeout)),
  ]) {
    const child = fakeChild(); child.stdin.owner = child;
    await assert.rejects(runMcpSmoke(child, next, 5), (error) => {
      assert.equal(error.message.includes(secret), false);
      return true;
    });
  }
});

test('stdio EOF and bounded reply timeout end without exposing pipe data', async () => {
  const eof = { __smokeLines: { replies: new Map(), waiters: new Map(), closed: true } };
  await assert.rejects(waitForLine(eof, 1, 20), /closed before replying/);
  const hung = { __smokeLines: { replies: new Map(), waiters: new Map(), closed: false } };
  await assert.rejects(waitForLine(hung, 1, 5), /request timed out/);
});

test('pipe reader handles synthetic helper success, malformed EOF, and bounded hang', async () => {
  const scripts = [
    `const r=require('node:readline').createInterface({input:process.stdin});r.on('line',l=>{const q=JSON.parse(l);const result=q.method==='tools/list'?{tools:[{name:'scribe_report'}]}:{resultType:'complete',content:[{text:'{"ok":true}'}]};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result})+'\\n')})`,
    `const r=require('node:readline').createInterface({input:process.stdin});r.on('line',()=>{process.stdout.write('not-json PUBLIC_SECRET_MARKER\\n');r.close()})`,
    'setInterval(()=>{},1000)',
  ];
  const ok = await helperProcess(process.execPath, ['-e', scripts[0]]);
  const wait = (child) => (id, limit) => waitForLine(child, id, limit);
  try { assert.equal(await runMcpSmoke(ok.child, wait(ok.child)), true); }
  finally { ok.lines.close(); ok.child.stdin.end(); await new Promise((done) => ok.child.once('close', done)); }

  const malformed = await helperProcess(process.execPath, ['-e', scripts[1]]);
  try {
    await assert.rejects(runMcpSmoke(malformed.child, wait(malformed.child), 500), (error) => {
      assert.equal(error.message.includes('PUBLIC_SECRET_MARKER'), false);
      return true;
    });
  } finally {
    malformed.child.stdin.end(); malformed.child.kill();
    await new Promise((done) => malformed.child.once('close', done));
  }

  const hung = await helperProcess(process.execPath, ['-e', scripts[2]]);
  try { await assert.rejects(runMcpSmoke(hung.child, wait(hung.child), 10), /request timed out/); }
  finally { hung.child.kill(); await new Promise((done) => hung.child.once('close', done)); }
});
