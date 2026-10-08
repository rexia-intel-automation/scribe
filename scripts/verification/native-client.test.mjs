import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { EVENTS } from './lib.mjs';

if (/OneDrive/i.test(process.cwd())) throw new Error('Run in the D: runtime mirror');
const binary = resolve('app/hook-client/target/debug', process.platform === 'win32' ? 'scribe-hook.exe' : 'scribe-hook');
const token = 'PUBLIC_SYNTHETIC_TOKEN_WITH_32_CHARACTERS';
const hookKey = 'PUBLIC_INDEPENDENT_HOOK_KEY_32_CHARACTERS';
function sign(key, fields) {
  const mac = createHmac('sha256', key).update('scribe-hook-v1');
  for (const value of fields) { const bytes = Buffer.from(value); const size = Buffer.alloc(8); size.writeBigUInt64BE(BigInt(bytes.length)); mac.update(size).update(bytes); }
  return mac.digest('base64url');
}
function assertChallengeRequest(req, body, nonce) {
  assert.equal(Buffer.byteLength(body), 0, 'Challenge GET must not carry a body');
  assert.equal(req.headers.authorization, undefined, 'Challenge request must not send the Bearer token');
  assert.equal(req.headers['x-scribe-server-nonce'], undefined, 'Challenge request cannot choose the server nonce');
  assert.equal(req.headers['x-scribe-proof'], sign(hookKey, ['hook-challenge-request', nonce]));
  const values = Object.values(req.headers).flat().map(String);
  assert.ok(!values.includes(token) && !values.includes(hookKey), 'Challenge request must not send either secret');
}

function answerChallenge(req, res, nonce, scenario = 'valid') {
  const serverNonce = randomBytes(16).toString('hex');
  if (scenario === 'server-nonce-missing') {
    res.writeHead(204, {
      'x-scribe-proof': sign(hookKey, ['hook-challenge', nonce, serverNonce]),
    }).end();
    return serverNonce;
  }
  const signingNonce = scenario === 'server-proof-wrong-nonce' ? 'f'.repeat(32) : nonce;
  const key = scenario === 'bearer-forgery' ? token : hookKey;
  const proof = scenario === 'challenge-reflection'
    ? req.headers['x-scribe-proof']
    : sign(key, ['hook-challenge', signingNonce, serverNonce]);
  const headers = { 'x-scribe-server-nonce': serverNonce, 'x-scribe-proof': proof };
  if (scenario === 'server-nonce-malformed') headers['x-scribe-server-nonce'] = 'bad';
  if (scenario === 'connection-close') headers.Connection = 'close';
  res.writeHead(204, headers).end();
  return serverNonce;
}

function assertSignedRequest(req, body, event) {
  const nonce = req.headers['x-scribe-nonce'];
  const serverNonce = req.headers['x-scribe-server-nonce'];
  const path = `/v1/hooks/${event}`;
  assert.match(nonce, /^[0-9a-f]{32}$/);
  assert.match(serverNonce, /^[0-9a-f]{32}$/);
  assert.equal(req.headers.authorization, undefined, 'Signed hook POST must not send a Bearer token');
  const values = Object.values(req.headers).flat().map(String);
  assert.ok(!values.includes(token) && !values.includes(hookKey), 'Signed hook POST must not send either secret');
  assert.equal(req.headers['x-scribe-proof'], sign(hookKey,
    ['hook-request', nonce, serverNonce, path, body]));
  return { nonce, serverNonce, path };
}

function signedResponseProof(nonce, serverNonce, path, status, body, scenario = 'valid') {
  const key = scenario === 'response-bearer-forgery' ? token : hookKey;
  const signedNonce = scenario === 'replay' ? '0'.repeat(32) : nonce;
  const signedServerNonce = scenario === 'wrong-response-server-nonce' ? 'f'.repeat(32) : serverNonce;
  const signedPath = scenario === 'wrong-event' ? '/v1/hooks/Stop' : path;
  const signedStatus = scenario === 'wrong-status' ? '204' : String(status);
  const signedBody = scenario === 'changed-body' ? body.replace('allow', 'deny') : body;
  return sign(key, ['hook-response', signedNonce, signedServerNonce, signedPath, signedStatus, signedBody]);
}

test('PreToolUse plugin matchers give interactive tools 130s and all others 1s', async () => {
  const manifest = JSON.parse(await readFile(resolve('plugins/scribe/hooks/hooks.json'), 'utf8'));
  const entries = manifest.hooks.PreToolUse;
  assert.equal(entries.length, 2);
  for (const [tool, timeout] of [
    ['AskUserQuestion', 130], ['ExitPlanMode', 130], ['Bash', 1], ['Write', 1],
  ]) {
    const selected = entries.filter(entry => new RegExp(entry.matcher).test(tool));
    assert.equal(selected.length, 1, `${tool} must select exactly one hook`);
    assert.equal(selected[0].hooks[0].timeout, timeout);
  }
});

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

async function stopIsolatedFixture(pid) {
  try { process.kill(pid); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  for (let attempt = 0; attempt < 50; attempt++) {
    try { process.kill(pid, 0); } catch (error) {
      if (error.code === 'ESRCH') return;
      throw error;
    }
    await new Promise(ok => setTimeout(ok, 20));
  }
  throw new Error('Isolated open fixture did not exit within 1 second');
}

async function removeFixtureDirectory(root) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try { await rm(root, { recursive: true, force: true }); return; } catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt === 9) throw error;
      await new Promise(ok => setTimeout(ok, 50));
    }
  }
}

test('native client forwards eleven events, returns only supported human decisions and blocks redirects/proxies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scribe native test '));
  const executable = join(root, process.platform === 'win32' ? 'scribe-hook.exe' : 'scribe-hook');
  await copyFile(binary, executable);
  const config = join(root, 'connection.json');
  const events = [], challengeSockets = new Map(), challengeServerNonces = new Map();
  const challengeResponsesSent = new WeakSet();
  let scenario = 'healthy', forbiddenRequests = 0;
  let tcpConnections = 0, connectionCloseSocket = null;
  const rawTraffic = new WeakMap();
  const trap = createServer((_req, res) => { forbiddenRequests++; res.end(); });
  await new Promise(ok => trap.listen(0, '127.0.0.1', ok));
  const trapUrl = `http://127.0.0.1:${trap.address().port}`;
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    assert.equal(req.headers.authorization, undefined, 'Neither MCP Bearer nor hook key may be sent');
    if (req.url.startsWith('/v1/hooks/challenge/')) {
      const nonce = req.url.split('/').at(-1);
      assertChallengeRequest(req, body, nonce);
      assert.equal(challengeSockets.has(nonce), false, 'Client challenge nonce must be fresh');
      challengeSockets.set(nonce, req.socket);
      res.once('finish', () => challengeResponsesSent.add(req.socket));
      if (scenario === 'connection-close') connectionCloseSocket = req.socket;
      if (scenario === 'impostor') { res.writeHead(200).end('{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}'); return; }
      const challengeScenario = ['bearer-forgery', 'challenge-reflection', 'server-nonce-missing',
        'server-nonce-malformed', 'server-proof-wrong-nonce', 'connection-close'].includes(scenario)
        ? scenario : 'valid';
      const serverNonce = answerChallenge(req, res, nonce, challengeScenario);
      if (serverNonce) {
        assert.equal([...challengeServerNonces.values()].includes(serverNonce), false,
          'Server challenge nonce must be fresh');
        challengeServerNonces.set(nonce, serverNonce);
      }
      return;
    }
    const payload = JSON.parse(body);
    const event = payload.hook_event_name;
    assert.equal(req.url, '/v1/hooks/' + event);
    const { nonce, serverNonce, path } = assertSignedRequest(req, body, event);
    assert.strictEqual(req.socket, challengeSockets.get(nonce), 'Challenge and signed POST must use the same TCP socket');
    assert.equal(challengeResponsesSent.has(req.socket), true, 'Server proof must finish before the hook POST arrives');
    assert.equal(serverNonce, challengeServerNonces.get(nonce), 'POST must bind the challenge server nonce');
    events.push(event);
    if (scenario === 'stalled') return;
    if (scenario === 'redirect') { res.writeHead(307, { Location: trapUrl }).end(); return; }
    if (scenario === 'http-error') { res.writeHead(503).end(); return; }
    let output;
    if (event === 'PreToolUse') {
      let updatedInput = payload.tool_input;
      if (payload.tool_name === 'AskUserQuestion') updatedInput = {
        ...payload.tool_input,
        answers: Object.fromEntries(payload.tool_input.questions.map(question => [question.question, 'PUBLIC ANSWER'])),
      };
      output = { hookSpecificOutput: {
        hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput,
      } };
      if (scenario === 'altered-questions') {
        output.hookSpecificOutput.updatedInput.questions[0].question = 'ALTERED QUESTION';
      }
      if (scenario === 'altered-plan') {
        output.hookSpecificOutput.updatedInput.plan = 'ALTERED PLAN';
      }
    } else {
      output = { hookSpecificOutput: {
        hookEventName: 'PermissionRequest', decision: { behavior: 'allow' },
      } };
    }
    const reply = scenario === 'invalid-json' ? 'invalid JSON' : JSON.stringify(output);
    if (scenario !== 'unsigned') {
      res.setHeader('x-scribe-proof', signedResponseProof(nonce, serverNonce, path, 200, reply, scenario));
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(reply);
  });
  server.on('connection', socket => {
    tcpConnections++;
    const chunks = [];
    rawTraffic.set(socket, chunks);
    socket.on('data', chunk => chunks.push(Buffer.from(chunk)));
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
    for (const [tool, toolInput] of [
      ['AskUserQuestion', { questions: [{ question: 'PUBLIC Q?', header: 'Q', options: [
        { label: 'A', description: 'First option' }, { label: 'B', description: 'Second option' },
      ] }] }],
      ['ExitPlanMode', { plan: 'PUBLIC PLAN', planFilePath: '/public/plan.md', allowedPrompts: [] }],
    ]) {
      const result = await launch(executable, config, 'PreToolUse', JSON.stringify({
        hook_event_name: 'PreToolUse', session_id: 'public', cwd: '/public',
        tool_name: tool, tool_input: toolInput,
      }));
      assert.equal(result.code, 0);
      assert.equal(result.stderr, '');
      const returned = JSON.parse(result.stdout).hookSpecificOutput;
      assert.equal(returned.hookEventName, 'PreToolUse');
      assert.equal(returned.permissionDecision, 'allow');
      assert.deepEqual(returned.updatedInput, tool === 'AskUserQuestion'
        ? { ...toolInput, answers: { 'PUBLIC Q?': 'PUBLIC ANSWER' } }
        : toolInput);
    }
    assert.deepEqual(events, [...EVENTS, 'PreToolUse', 'PreToolUse']);
    for (scenario of [
      'unsigned', 'wrong-event', 'changed-body', 'replay', 'response-bearer-forgery', 'challenge-reflection',
      'impostor', 'server-nonce-missing', 'server-nonce-malformed', 'server-proof-wrong-nonce',
      'connection-close', 'wrong-response-server-nonce', 'altered-questions', 'altered-plan',
    ]) {
      const countBefore = events.length;
      const connectionsBefore = tcpConnections;
      const tool = scenario === 'altered-plan' ? 'ExitPlanMode' : 'AskUserQuestion';
      const toolInput = tool === 'ExitPlanMode'
        ? { plan: 'PUBLIC PLAN', planFilePath: '/public/plan.md', allowedPrompts: [] }
        : { questions: [{ question: 'PUBLIC Q?', header: 'Q', options: [
          { label: 'A', description: 'First option' }, { label: 'B', description: 'Second option' },
        ] }] };
      const result = await launch(executable, config, 'PreToolUse', JSON.stringify({
        hook_event_name: 'PreToolUse', session_id: 'public', cwd: '/public',
        tool_name: tool, tool_input: toolInput,
      }));
      assert.equal(result.code, 0, scenario);
      assert.equal(result.stdout, '', `${scenario} must not return a decision`);
      assert.equal(result.stderr, '', scenario);
      if (['impostor', 'bearer-forgery', 'challenge-reflection', 'server-nonce-missing',
        'server-nonce-malformed', 'server-proof-wrong-nonce', 'connection-close'].includes(scenario)) {
        assert.equal(events.length, countBefore, `${scenario} must be rejected before forwarding`);
      } else {
        assert.equal(events.length, countBefore + 1, `${scenario} request should reach the server`);
      }
      if (scenario === 'connection-close') {
        assert.equal(tcpConnections - connectionsBefore, 1,
          'A valid challenge on a closing connection must not trigger a reconnect');
        const received = Buffer.concat(rawTraffic.get(connectionCloseSocket) ?? []).toString('latin1');
        assert.equal(received.includes('POST /v1/hooks/'), false,
          'A challenge response with Connection: close must stop before sending the POST');
        assert.equal(received.includes('PUBLIC Q?'), false,
          'No tool input may be sent after the challenge connection closes');
      }
    }
    for (scenario of ['stalled', 'redirect', 'http-error', 'invalid-json', 'unsigned', 'response-bearer-forgery', 'wrong-response-server-nonce', 'challenge-reflection', 'replay', 'wrong-event', 'changed-body', 'wrong-status', 'impostor', 'bearer-forgery', 'healthy']) {
      const countBefore = events.length;
      const event = scenario === 'stalled' ? 'Stop' : 'PermissionRequest';
      const result = await launch(executable, config, event, JSON.stringify({
        hook_event_name: event, session_id: 'public', cwd: '/public' }), false,
      { HTTP_PROXY: trapUrl, HTTPS_PROXY: trapUrl, ALL_PROXY: trapUrl, NO_PROXY: '' });
      assert.equal(result.code, 0);
      if (scenario === 'healthy') assert.equal(JSON.parse(result.stdout).hookSpecificOutput.decision.behavior, 'allow');
      else assert.equal(result.stdout, '');
      assert.equal(result.stderr, '');
      if (['impostor', 'bearer-forgery', 'challenge-reflection'].includes(scenario)) assert.equal(events.length, countBefore, 'Reject impersonator before sending the payload');
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

test('native PermissionRequest echoes only one exact original permission suggestion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scribe permission update '));
  const config = join(root, 'connection.json');
  const update = {
    type: 'addRules',
    rules: [{ toolName: 'Bash', ruleContent: 'git status' }],
    behavior: 'allow',
    destination: 'projectSettings',
  };
  const scenarios = [
    ['changed-destination', (value) => { value.destination = 'userSettings'; }],
    ['broadened-rule', (value) => { value.rules[0].ruleContent = 'Bash'; }],
    ['removed-rule-content', (value) => { delete value.rules[0].ruleContent; }],
    ['unknown-field', (value) => { value.unrecognized = true; }],
    ['wrong-field-type', (value) => { value.destination = 7; }],
    ['deny-with-updates', (_value, decision) => { decision.behavior = 'deny'; }],
    ['two-entries', (_value, decision) => { decision.updatedPermissions.push(update); }],
    ['empty-array', (_value, decision) => { decision.updatedPermissions = []; }],
    ['object-not-array', (_value, decision) => { decision.updatedPermissions = update; }],
    ['wrong-entry-type', (_value, decision) => { decision.updatedPermissions = ['not-an-update']; }],
  ];
  let scenario = 'valid';
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    assert.equal(req.headers.authorization, undefined);
    if (req.url.startsWith('/v1/hooks/challenge/')) {
      const nonce = req.url.split('/').at(-1);
      assertChallengeRequest(req, body, nonce);
      answerChallenge(req, res, nonce);
      return;
    }
    assert.equal(req.url, '/v1/hooks/PermissionRequest');
    const payload = JSON.parse(body);
    const { nonce, serverNonce, path } = assertSignedRequest(req, body, 'PermissionRequest');
    assert.deepEqual(payload.permission_suggestions, [update]);
    const echoed = structuredClone(update);
    const decision = { behavior: 'allow', updatedPermissions: [echoed] };
    const selected = scenarios.find(([name]) => name === scenario);
    if (selected) selected[1](echoed, decision);
    const reply = JSON.stringify({ hookSpecificOutput: {
      hookEventName: 'PermissionRequest', decision,
    } });
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'x-scribe-proof': signedResponseProof(nonce, serverNonce, path, 200, reply),
    }).end(reply);
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  await writeFile(config, JSON.stringify({ port: server.address().port, token, hook_key: hookKey }));
  try {
    const input = JSON.stringify({
      hook_event_name: 'PermissionRequest', session_id: 'synthetic-session', cwd: '/synthetic/project',
      permission_suggestions: [update],
    });
    const accepted = await launch(binary, config, 'PermissionRequest', input);
    assert.equal(accepted.code, 0);
    assert.equal(accepted.stderr, '');
    assert.deepEqual(JSON.parse(accepted.stdout), { hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'allow', updatedPermissions: [update] },
    } });

    for (const [name] of scenarios) {
      scenario = name;
      const rejected = await launch(binary, config, 'PermissionRequest', input);
      assert.equal(rejected.code, 0, name);
      assert.equal(rejected.stdout, '', `${name} must not emit a decision`);
      assert.equal(rejected.stderr, '', name);
    }
  } finally {
    server.closeAllConnections();
    await new Promise(ok => server.close(ok));
    await rm(root, { recursive: true, force: true });
  }
});

test('native client rejects oversized/malformed input and terminates with unfinished stdin', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scribe-client-input-'));
  const config = join(root, 'connection.json');
  let challengeRequests = 0, hookRequests = 0, receivedBodies = [];
  const challengeSockets = new Map(), challengeServerNonces = new Map();
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    assert.equal(req.headers.authorization, undefined);
    if (req.url.startsWith('/v1/hooks/challenge/')) {
      challengeRequests++;
      const nonce = req.url.split('/').at(-1);
      assertChallengeRequest(req, body, nonce);
      challengeSockets.set(nonce, req.socket);
      challengeServerNonces.set(nonce, answerChallenge(req, res, nonce));
      return;
    }
    hookRequests++;
    const text = body.toString('utf8');
    const payload = JSON.parse(text);
    assert.equal(req.url, '/v1/hooks/Stop');
    assert.equal(payload.hook_event_name, 'Stop');
    const { nonce, serverNonce } = assertSignedRequest(req, text, 'Stop');
    assert.strictEqual(req.socket, challengeSockets.get(nonce), 'Challenge and signed POST must share the socket');
    assert.equal(serverNonce, challengeServerNonces.get(nonce));
    receivedBodies.push(body.length);
    res.writeHead(200).end();
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  await writeFile(config, JSON.stringify({ port: server.address().port, token, hook_key: hookKey }));
  try {
    const base = JSON.stringify({ hook_event_name: 'Stop', session_id: 'public', cwd: '/public' });
    const exactBody = base + ' '.repeat(1024 * 1024 - Buffer.byteLength(base));
    const accepted = await launch(binary, config, 'Stop', exactBody);
    assert.equal(Buffer.byteLength(exactBody), 1024 * 1024);
    assert.equal(accepted.code, 0);
    assert.equal(accepted.stdout, ''); assert.equal(accepted.stderr, '');
    assert.equal(challengeRequests, 1, 'exact-limit valid input must reach the challenge endpoint');
    assert.equal(hookRequests, 1, 'exact-limit valid input must reach the signed hook endpoint');
    assert.deepEqual(receivedBodies, [1024 * 1024]);

    for (const [event, body, open] of [
      ['Stop', 'invalid', false],
      ['Stop', base + 'x', false],
      ['Stop', '{', true],
      ['Stop', JSON.stringify({ hook_event_name: 'Stop', session_id: 42, cwd: '/public' }), false],
      ['Unknown', '{}', false],
      ['Stop', base + ' '.repeat(1024 * 1024 + 1 - Buffer.byteLength(base)), false],
    ]) {
      const countBefore = [challengeRequests, hookRequests];
      const result = await launch(binary, config, event, body, open);
      assert.equal(result.code, 0); assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
      assert.ok(result.elapsedMs < 1000);
      assert.deepEqual([challengeRequests, hookRequests], countBefore,
        `${event} input (${Buffer.byteLength(body)} bytes) must be rejected before any request`);
    }
    await writeFile(config, '{"port":80,"token":"invalid"}');
    const countBefore = [challengeRequests, hookRequests];
    const badConfig = await launch(binary, config, 'Stop', '{}');
    assert.equal(badConfig.code, 0); assert.equal(badConfig.stdout, ''); assert.equal(badConfig.stderr, '');
    assert.ok(badConfig.elapsedMs < 1000);
    assert.deepEqual([challengeRequests, hookRequests], countBefore, 'invalid configuration must not contact the server');
  } finally {
    server.closeAllConnections();
    if (server.listening) await new Promise(ok => server.close(ok));
    await rm(root, { recursive: true, force: true });
  }
});

test('native client accepts an exactly 8192-byte signed response and suppresses 8193 bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scribe-client-response-'));
  const config = join(root, 'connection.json');
  const responseSizes = [8192, 8193];
  const challengeNonces = [];
  const challengeSockets = new Map(), challengeServerNonces = new Map();
  const hookBodyLengths = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    assert.equal(req.headers.authorization, undefined);
    if (req.url.startsWith('/v1/hooks/challenge/')) {
      const nonce = req.url.split('/').at(-1);
      assertChallengeRequest(req, body, nonce);
      challengeNonces.push(nonce);
      challengeSockets.set(nonce, req.socket);
      challengeServerNonces.set(nonce, answerChallenge(req, res, nonce));
      return;
    }
    assert.equal(req.url, '/v1/hooks/PermissionRequest');
    const text = body.toString('utf8');
    const payload = JSON.parse(text);
    assert.equal(payload.hook_event_name, 'PermissionRequest');
    const { nonce, serverNonce, path } = assertSignedRequest(req, text, 'PermissionRequest');
    assert.strictEqual(req.socket, challengeSockets.get(nonce), 'Challenge and signed POST must share the socket');
    assert.equal(serverNonce, challengeServerNonces.get(nonce));
    hookBodyLengths.push(body.length);
    const size = responseSizes.shift();
    assert.ok(size);
    const json = Buffer.from(JSON.stringify({ hookSpecificOutput: {
      hookEventName: 'PermissionRequest', decision: { behavior: 'allow' },
    } }));
    const responseBody = Buffer.concat([json, Buffer.alloc(size - json.length, 0x20)]);
    assert.equal(responseBody.length, size);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': String(size),
      'x-scribe-proof': signedResponseProof(nonce, serverNonce, path, 200, responseBody),
    }).end(responseBody);
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  await writeFile(config, JSON.stringify({ port: server.address().port, token, hook_key: hookKey }));
  try {
    const input = JSON.stringify({ hook_event_name: 'PermissionRequest', session_id: 'public', cwd: '/public' });
    const bounded = await launch(binary, config, 'PermissionRequest', input);
    assert.equal(bounded.code, 0);
    assert.equal(bounded.stderr, '');
    let boundedBehavior = null;
    try { boundedBehavior = JSON.parse(bounded.stdout).hookSpecificOutput.decision.behavior; } catch { /* asserted after exercising the 8193-byte case */ }
    assert.equal(challengeNonces.length, 1, '8192-byte response case must complete a challenge');
    assert.equal(hookBodyLengths.length, 1, '8192-byte response case must reach the signed hook handler');

    const oversized = await launch(binary, config, 'PermissionRequest', input);
    assert.equal(oversized.code, 0);
    assert.equal(oversized.stdout, '', '8193-byte response must not emit a decision');
    assert.equal(oversized.stderr, '');
    assert.deepEqual(challengeNonces.length, 2, '8193-byte response case must complete a challenge');
    assert.deepEqual(hookBodyLengths.length, 2, '8193-byte response case must reach the signed hook handler');
    assert.deepEqual(responseSizes, []);
    assert.ok(bounded.elapsedMs < 1000);
    assert.ok(oversized.elapsedMs < 1000);
    assert.equal(boundedBehavior, 'allow', `8192-byte response was suppressed after ${challengeNonces.length} challenges and ${hookBodyLengths.length} signed requests`);
  } finally {
    server.closeAllConnections();
    if (server.listening) await new Promise(ok => server.close(ok));
    await rm(root, { recursive: true, force: true });
  }
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
    assert.equal(await readFile(join(root, 'started.args'), 'utf8'), '--open');
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
    let fixtureStopError;
    try {
      const pid = Number(await readFile(marker, 'utf8'));
      if (Number.isSafeInteger(pid) && pid > 0) await stopIsolatedFixture(pid);
    } catch (error) { if (error.code !== 'ENOENT') fixtureStopError = error; }
    if (child?.exitCode === null) child.kill();
    await removeFixtureDirectory(root);
    if (fixtureStopError) throw fixtureStopError;
  }
});
