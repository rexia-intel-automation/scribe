import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const expectedCliVersion = '2.1.294';
const serverName = 'scribe-call-smoke';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hookTargetRoot = path.join(repoRoot, 'app', 'hook-client', 'target');
const fixtureRoot = path.join(hookTargetRoot, 'fixture');
const helperArgument = process.argv.indexOf('--helper');
if (helperArgument >= 0 && (helperArgument !== process.argv.lastIndexOf('--helper') || !process.argv[helperArgument + 1])) {
  throw new Error('Use --helper with one release fixture path.');
}
const helperPath = helperArgument >= 0
  ? path.resolve(process.argv[helperArgument + 1])
  : path.join(fixtureRoot, 'release', 'scribe-hook.exe');
const tempBase = await realpath(os.tmpdir());
const tempRoot = await mkdtemp(path.join(tempBase, 'scribe-claude-mcp-call-'));
const canonicalRoot = await realpath(tempRoot);
const token = 'PUBLIC_SYNTHETIC_MCP_TOKEN_32_CHARACTERS';
const key = 'PUBLIC_INDEPENDENT_MCP_KEY_32_CHARACTERS';
const serverNonce = 'abcdef0123456789abcdef0123456789';
const providerKey = 'PUBLIC_SYNTHETIC_ANTHROPIC_KEY';
const finalText = 'PUBLIC SYNTHETIC FINAL RESPONSE';
const toolText = 'PUBLIC SYNTHETIC TOOL RESULT';

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function safeRouteShape(pathname) {
  const known = new Set(['v1', 'messages', 'count_tokens', 'models', 'beta', 'oauth', 'token', 'health', 'status']);
  const segments = pathname.split('/').filter(Boolean).map(segment =>
    known.has(segment.toLowerCase()) ? segment.toLowerCase() : ':id');
  return `/${segments.join('/')}`;
}

function sign(fields) {
  const mac = createHmac('sha256', key).update('scribe-hook-v1');
  for (const field of fields) {
    const bytes = Buffer.from(field), length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(bytes.length));
    mac.update(length).update(bytes);
  }
  return mac.digest('base64url');
}

function cleanEnvironment(configDir, profileDir, appDataDir, localAppDataDir, providerUrl) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (
      /^(ANTHROPIC_|CLAUDE_CODE_|AWS_|AZURE_|GOOGLE_|GCP_|VERTEX_|BEDROCK_)/i.test(name) ||
      /^(GEMINI_API_KEY|OPENAI_API_KEY|CLAUDE_CONFIG_DIR)$/i.test(name) ||
      /(^|_)(TOKEN|API_KEY|SECRET|PASSWORD|CREDENTIALS?)(_|$)/i.test(name) ||
      /^(GIT_ASKPASS|SSH_AUTH_SOCK|NETRC|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY)$/i.test(name)
    ) delete env[name];
  }
  env.CLAUDE_CONFIG_DIR = configDir;
  env.HOME = profileDir;
  env.USERPROFILE = profileDir;
  env.APPDATA = appDataDir;
  env.LOCALAPPDATA = localAppDataDir;
  env.XDG_CONFIG_HOME = path.join(profileDir, '.config');
  env.ANTHROPIC_BASE_URL = providerUrl;
  env.ANTHROPIC_API_KEY = providerKey;
  env.NO_PROXY = '127.0.0.1,localhost';
  env.CLAUDE_CODE_DISABLE_NON_ESSENTIAL_TRAFFIC = '1';
  env.DISABLE_TELEMETRY = '1';
  env.DISABLE_ERROR_REPORTING = '1';
  return env;
}

function runCli(args, env, cwd) {
  const literal = value => `'${value.replaceAll("'", "''")}'`;
  const command = "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; " +
    "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $OutputEncoding=[Console]::OutputEncoding; " +
    "$cli=(Get-Command claude -CommandType Application | Select-Object -First 1).Source; " +
    `& $cli ${args.map(literal).join(' ')}; exit $LASTEXITCODE`;
  const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const limit = 256 * 1024;
  return new Promise((resolve, reject) => {
    let stdout = '', capturedBytes = 0, timedOut = false, overflow = false, spawnError;
    const child = spawn(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
      Buffer.from(command, 'utf16le').toString('base64')], {
      cwd, env, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const terminateTree = () => {
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn(path.join(process.env.SystemRoot, 'System32', 'taskkill.exe'),
          ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.unref();
      } else child.kill();
    };
    const timeout = setTimeout(() => { timedOut = true; terminateTree(); }, 75_000);
    const capture = (stream, save) => stream.on('data', bytes => {
      capturedBytes += bytes.length;
      if (capturedBytes > limit) {
        overflow = true;
        terminateTree();
        return;
      }
      if (save) stdout += bytes.toString('utf8');
    });
    capture(child.stdout, true);
    capture(child.stderr, false);
    child.once('error', error => { spawnError = error; });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      if (spawnError || code !== 0 || timedOut || overflow) {
        const reason = timedOut ? 'timeout' : overflow ? 'output limit exceeded' :
          spawnError?.code ?? (signal ? `signal ${signal}` : `exit ${code}`);
        reject(new Error(`isolated Claude MCP call failed (${reason}); CLI output suppressed`));
      } else resolve(stdout);
    });
  });
}

function sseResponse(res, model, content, stopReason) {
  const events = [
    { type: 'message_start', message: { id: 'msg_public_mock', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } },
  ];
  for (let index = 0; index < content.length; index++) {
    const block = content[index];
    if (block.type === 'tool_use') {
      events.push({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} } });
      events.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } });
    } else {
      events.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
      events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } });
    }
    events.push({ type: 'content_block_stop', index });
  }
  events.push({ type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 3 } });
  events.push({ type: 'message_stop' });
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'close' });
  for (const event of events) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  res.end();
}

const realRepoRoot = await realpath(repoRoot);
const cwd = path.join(canonicalRoot, 'cwd');
const configDir = path.join(canonicalRoot, 'claude-config');
const profileDir = path.join(canonicalRoot, 'profile');
const appDataDir = path.join(canonicalRoot, 'appdata');
const localAppDataDir = path.join(canonicalRoot, 'localappdata');
const connectionPath = path.join(canonicalRoot, 'public connection.json');
const mcpConfigPath = path.join(canonicalRoot, 'mcp.json');
let mcpServer, providerServer;
let mcpCalls = 0, mcpConnections = 0, firstMcpSocket;
let providerCalls = 0, countTokenCalls = 0;
let unknownProviderRequests = 0;
let mcpPhase = 'awaiting challenge';
let providerPhase = 'awaiting first Messages request';
let cliPhase = 'before version check';
const failures = [];
const unknownProviderRoutes = [];

try {
  assert.equal(process.platform, 'win32', 'real Claude MCP call smoke is Windows-only');
  assert.ok(canonicalRoot.startsWith(`${tempBase}${path.sep}`));
  assert.ok(path.basename(canonicalRoot).startsWith('scribe-claude-mcp-call-'));
  assert.ok(!isInside(canonicalRoot, realRepoRoot) && !isInside(realRepoRoot, canonicalRoot), 'temporary root overlaps repository');
  const helperTargetRelative = path.relative(hookTargetRoot, helperPath);
  assert.ok(isInside(hookTargetRoot, helperPath) && helperTargetRelative.split(path.sep)[0].startsWith('fixture'),
    'helper override must remain in a named release-fixture directory under hook-client/target');
  assert.equal(path.basename(helperPath), 'scribe-hook.exe');
  for (const directory of [cwd, configDir, profileDir, appDataDir, localAppDataDir]) await mkdir(directory);
  const [realCwd, realConfigDir, realProfileDir] = await Promise.all([realpath(cwd), realpath(configDir), realpath(profileDir)]);
  assert.ok(isInside(canonicalRoot, realCwd) && isInside(canonicalRoot, realConfigDir) && isInside(canonicalRoot, realProfileDir));
  assert.equal((await stat(configDir)).isDirectory(), true);
  assert.deepEqual(await readdir(configDir), [], 'isolated Claude config directory is not empty');
  assert.equal((await stat(helperPath)).isFile(), true, 'release fixture helper is missing');
  const realHelper = await realpath(helperPath);
  const realHookTargetRoot = await realpath(hookTargetRoot);
  assert.ok(isInside(realRepoRoot, realHelper) && isInside(realHookTargetRoot, realHelper), 'fixture helper resolves outside repository target');

  mcpServer = createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      assert.equal(req.headers.authorization, undefined);
      assert.ok(!Object.values(req.headers).includes(token) && !Object.values(req.headers).includes(key));
      const nonce = req.url.split('/').at(-1);
      if (req.method === 'GET') {
        mcpPhase = 'validating challenge request';
        firstMcpSocket = req.socket;
        assert.equal(body.length, 0);
        assert.equal(req.headers['x-scribe-proof'], sign(['mcp-challenge-request', nonce]));
        res.writeHead(204, { 'x-scribe-server-nonce': serverNonce, 'x-scribe-proof': sign(['mcp-challenge', nonce, serverNonce]) });
        res.end();
        return;
      }
      mcpPhase = 'validating tools/call';
      mcpCalls++;
      assert.equal(req.method, 'POST');
      assert.equal(req.url, '/mcp');
      assert.equal(req.socket, firstMcpSocket, 'challenge and call did not reuse one socket');
      assert.equal(req.headers['mcp-protocol-version'], '2025-11-25');
      assert.equal(req.headers['x-scribe-server-nonce'], serverNonce);
      assert.equal(req.headers['x-scribe-proof'], sign(['mcp-request', req.headers['x-scribe-nonce'], serverNonce, '/mcp', body]));
      const call = JSON.parse(body);
      assert.equal(call.method, 'tools/call');
      assert.equal(call.params._meta, undefined);
      assert.equal(call.params.name, 'scribe_report');
      assert.deepEqual(call.params.arguments, { session_id: 'public-smoke-session', text: toolText });
      const response = JSON.stringify({ jsonrpc: '2.0', id: call.id, result: { content: [{ type: 'text', text: toolText }] } });
      res.writeHead(200, { 'content-type': 'application/json', 'x-scribe-proof': sign(['mcp-response', req.headers['x-scribe-nonce'], serverNonce, '200', response]) });
      res.end(response);
    } catch {
      failures.push(`synthetic MCP server rejected local request (${mcpPhase})`);
      res.writeHead(500); res.end();
    }
  });
  await new Promise((resolve, reject) => { mcpServer.once('error', reject); mcpServer.listen(0, '127.0.0.1', resolve); });
  mcpServer.on('connection', () => mcpConnections++);
  await writeFile(connectionPath, JSON.stringify({ port: mcpServer.address().port, token, hook_key: key }));

  providerServer = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (req.method === 'POST' && pathname === '/v1/messages/count_tokens') {
      countTokenCalls++;
      for await (const _chunk of req) { /* consume local request body */ }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"input_tokens":1}');
      return;
    }
    if (req.method !== 'POST' || pathname !== '/v1/messages') {
      unknownProviderRequests++;
      if (unknownProviderRoutes.length < 8) {
        const method = /^(GET|POST|PUT|DELETE|HEAD|OPTIONS)$/.test(req.method) ? req.method : 'OTHER';
        unknownProviderRoutes.push(`${method} ${safeRouteShape(pathname)}`);
      }
      for await (const _chunk of req) { /* consume only this localhost probe */ }
      if (unknownProviderRequests > 8) failures.push('synthetic provider probe limit exceeded');
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"type":"error","error":{"type":"not_found_error","message":"synthetic route not found"}}');
      return;
    }
    try {
      assert.equal(req.socket.remoteAddress, '127.0.0.1');
      assert.equal(req.headers['x-api-key'], providerKey);
      providerCalls++;
      assert.ok(providerCalls <= 2, 'mock provider call limit exceeded');
      providerPhase = providerCalls === 1 ? 'validating tool request' : 'validating consumed tool result';
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert.equal(request.stream, true, 'Claude CLI did not use the expected streaming Messages API');
      assert.equal(typeof request.model, 'string');
      assert.ok(request.max_tokens > 0);
      let content, stopReason;
      if (providerCalls === 1) {
        assert.ok(Array.isArray(request.tools));
        const matches = request.tools.filter(tool => typeof tool.name === 'string' &&
          tool.name.startsWith('mcp__') && tool.name.endsWith('__scribe_report'));
        assert.equal(matches.length, 1, 'CLI did not announce exactly one configured Scribe report tool');
        const messages = JSON.stringify(request.messages ?? []);
        assert.ok(messages.includes('PUBLIC USER-REQUEST MARKER'));
        content = [{ type: 'tool_use', id: 'toolu_public_smoke', name: matches[0].name,
          input: { session_id: 'public-smoke-session', text: toolText } }];
        stopReason = 'tool_use';
      } else {
        providerPhase = 'checking returned MCP tool result';
        const messages = Array.isArray(request.messages) ? request.messages : [];
        const blocks = messages.flatMap(message => Array.isArray(message.content) ? message.content : []);
        const requestedTool = blocks.find(block => block.type === 'tool_use' && block.id === 'toolu_public_smoke');
        const result = blocks.find(block => block.type === 'tool_result' && block.tool_use_id === 'toolu_public_smoke');
        const resultText = result && (typeof result.content === 'string' ? result.content :
          Array.isArray(result.content) ? result.content.filter(block => block.type === 'text').map(block => block.text).join('') : '');
        if (!requestedTool) failures.push('provider request omitted the expected tool-use history');
        if (!result) failures.push('provider request omitted the expected MCP tool result');
        else if (/resultType/i.test(resultText ?? '')) failures.push('helper result mentioned resultType validation');
        else if (result.is_error === true) failures.push('helper returned an MCP tool error');
        else if (resultText !== toolText) failures.push('helper returned an unexpected MCP result content');
        content = [{ type: 'text', text: finalText }];
        stopReason = 'end_turn';
      }
      sseResponse(res, request.model, content, stopReason);
    } catch {
      failures.push(`synthetic provider rejected local request (${providerPhase})`);
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end('{"type":"error","error":{"type":"invalid_request_error","message":"synthetic request rejected"}}');
    }
  });
  await new Promise((resolve, reject) => { providerServer.once('error', reject); providerServer.listen(0, '127.0.0.1', resolve); });

  await writeFile(mcpConfigPath, JSON.stringify({ mcpServers: {
    [serverName]: { command: helperPath, args: ['--mcp'], env: { SCRIBE_CONNECTION_FILE: connectionPath } },
  } }));
  const env = cleanEnvironment(configDir, profileDir, appDataDir, localAppDataDir,
    `http://127.0.0.1:${providerServer.address().port}`);
  assert.equal(env.ANTHROPIC_BASE_URL, `http://127.0.0.1:${providerServer.address().port}`);
  for (const name of Object.keys(env)) {
    if (name === 'CLAUDE_CODE_DISABLE_NON_ESSENTIAL_TRAFFIC') assert.equal(env[name], '1');
    else assert.ok(!/^(CLAUDE_CODE_|AWS_|AZURE_|GOOGLE_|GCP_|VERTEX_|BEDROCK_)/i.test(name));
    assert.ok(!/(^|_)(TOKEN|SECRET|PASSWORD|CREDENTIALS?)(_|$)/i.test(name));
  }
  cliPhase = 'checking isolated CLI version';
  const version = (await runCli(['--version'], env, cwd)).trim();
  assert.ok(version === expectedCliVersion || version === `${expectedCliVersion} (Claude Code)`);

  let output;
  try {
    cliPhase = 'running isolated MCP prompt';
    output = await runCli([
    '-p', 'Use the scribe_report MCP tool exactly once with the provided public marker. User text: PUBLIC USER-REQUEST MARKER.',
    '--output-format', 'text', '--mcp-config', mcpConfigPath, '--strict-mcp-config',
    '--allowedTools', `mcp__${serverName}__scribe_report`, '--max-turns', '2',
    ], env, cwd);
    cliPhase = 'MCP prompt returned';
  } catch (error) {
    throw new Error(`isolated CLI phase failed; ${error instanceof Error ? error.message : 'unknown local process error'}`);
  }
  assert.equal(failures.length, 0, failures.join('; ') || 'a local synthetic server rejected the smoke request');
  assert.equal(providerCalls, 2, 'expected one synthetic tool-use response and one final response');
  assert.equal(mcpCalls, 1, 'the real Claude client did not make exactly one MCP call');
  assert.equal(mcpConnections, 1, 'expected one authenticated MCP connection');
  assert.doesNotMatch(output, /malformed result|invalid result/i, 'Claude reported a malformed MCP result');
  assert.ok(output.includes(finalText), 'Claude CLI did not consume the mock provider final response');
  console.log(`Claude Code ${expectedCliVersion} consumed a modern MCP tools/call result using only local synthetic servers and a temporary profile.`);
  if (unknownProviderRoutes.length > 0) {
    console.log(`Optional local provider probes: ${unknownProviderRoutes.join(', ')}.`);
  }
} catch {
  console.error(JSON.stringify({
    phase: 'smoke-failed', cliPhase, providerCalls, countTokenCalls, unknownProviderRequests,
    unknownProviderRoutes, mcpCalls, mcpConnections, providerPhase, mcpPhase, failures,
  }));
  throw new Error('Isolated Claude MCP tool-call smoke failed; see static phase summary.');
} finally {
  for (const server of [mcpServer, providerServer]) {
    if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }
  const currentRoot = await realpath(tempRoot).catch(() => null);
  if (currentRoot !== null) {
    assert.equal(currentRoot, canonicalRoot, 'temporary cleanup target changed after isolation checks');
    assert.ok(currentRoot.startsWith(`${tempBase}${path.sep}`), 'refusing to remove a directory outside OS temp');
    assert.ok(path.basename(currentRoot).startsWith('scribe-claude-mcp-call-'), 'refusing to remove an unexpected directory');
    await rm(currentRoot, { recursive: true, force: true });
  }
}
