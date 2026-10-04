import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { anonymize, validProbeHeaders, redact } from './lib.mjs';

if (/OneDrive/i.test(process.cwd())) throw new Error('Run in the D: runtime mirror');
const runId = `plugin-${Date.now()}`;
const root = resolve('.verification', runId);
const workspace = join(root, 'workspace');
const clientDir = join(root, 'native client with spaces');
await mkdir(workspace, { recursive: true });
await mkdir(clientDir, { recursive: true });
const exeName = process.platform === 'win32' ? 'scribe-hook.exe' : 'scribe-hook';
const executable = join(clientDir, exeName);
await copyFile(resolve('app/hook-client/target/release', exeName), executable);
const token = randomBytes(32).toString('base64url');
let hookSession;
const events = [], calls = [], cli = [];
let sessionSettings;
const server = createServer(async (req, res) => {
  try {
    if (!validProbeHeaders(req.headers, server.address().port, token)) { res.writeHead(403).end(); return; }
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 1024 * 1024) { res.writeHead(413).end(); return; }
    }
    const input = JSON.parse(body);
    if (req.url?.startsWith('/v1/hooks/')) {
      events.push({ event: input.hook_event_name, authenticated: true });
      if (input.hook_event_name === 'SessionStart') hookSession = input.session_id;
      res.writeHead(200).end(); return;
    }
    if (req.url !== '/mcp') { res.writeHead(404).end(); return; }
    calls.push({ method: anonymize(input.method, 'method'), authenticated: true });
    if (input.id === undefined) { res.writeHead(202).end(); return; }
    let result;
    if (input.method === 'initialize') {
      result = { protocolVersion: input.params.protocolVersion, capabilities: { tools: {} },
        serverInfo: { name: 'scribe-installation-probe', version: '0.1.0' } };
    } else if (input.method === 'tools/list') {
      const session = { type: 'string' };
      result = { tools: [
        { name: 'scribe_report', description: 'Record a public test milestone in this local probe.',
          inputSchema: { type: 'object', properties: { session_id: session, text: { type: 'string', maxLength: 140 } },
            required: ['session_id', 'text'], additionalProperties: false } },
        { name: 'scribe_ask', description: 'Public test question. This probe deliberately returns timeout.',
          inputSchema: { type: 'object', properties: { session_id: session, question: { type: 'string', maxLength: 200 },
            options: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'string', maxLength: 40 } } },
            required: ['session_id', 'question', 'options'], additionalProperties: false } },
      ] };
    } else if (input.method === 'tools/call') {
      calls.at(-1).name = anonymize(input.params.name, 'name');
      calls.at(-1).sessionMatchesHook = input.params.arguments.session_id === hookSession;
      const response = input.params.name === 'scribe_report' ? { ok: true } : { answer: null, reason: 'timeout' };
      result = { content: [{ type: 'text', text: JSON.stringify(response) }] };
    } else if (input.method === 'ping') result = {};
    else {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: input.id,
        error: { code: -32601, message: 'Method not found' } })); return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: input.id, result }));
  } catch { res.writeHead(400).end(); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const connectionFile = join(root, 'connection.json');
await writeFile(connectionFile, JSON.stringify({ port: server.address().port, token }), { mode: 0o600 });

async function run(label, args, stdin = '') {
  if (args.includes('-p')) args = [...args, '--output-format', 'json'];
  if (sessionSettings && !['plugin'].includes(args[0])) args = [...args, '--settings', sessionSettings];
  const start = performance.now();
  const child = spawn('claude', args, { cwd: workspace, windowsHide: true,
    env: { ...process.env, SCRIBE_CONNECTION_FILE: connectionFile, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
    stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end(stdin);
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const timer = setTimeout(() => child.kill(), 90000);
  const code = await new Promise((ok, fail) => { child.once('error', fail); child.once('close', ok); });
  clearTimeout(timer);
  const signals = ['not configured', 'not found', 'missing', 'required', 'trusted', 'not installed',
    'Unknown', 'Warning', 'Error', 'userConfig', 'client_path', 'token', 'port', 'configuration',
    'plugin', 'marketplace', 'scribe', 'settings.local.json', 'scope', 'local',
    'budget', 'Exceeded', 'authentication', 'rate limit', 'Unknown skill']
    .filter(signal => stderr.includes(signal) || stdout.includes(signal));
  let result;
  if (args.includes('-p')) {
    try {
      const parsed = JSON.parse(stdout);
      const output = Array.isArray(parsed) ? parsed.at(-1) : parsed;
      result = { subtype: ['success', 'error_max_budget_usd', 'error_during_execution', 'error_max_turns'].includes(output.subtype) ? output.subtype : '[omitted]',
        totalCostUsd: Number.isFinite(output.total_cost_usd) ? output.total_cost_usd : null };
      if (output.type === 'result') {
        result.isError = output.is_error === true;
        result.errorSignals = ['rate limit', 'usage limit', 'limit', 'hit', 'reset', 'credit', 'plan', 'sign in', 'login', 'budget', 'balance', 'API Error', 'authentication',
          'context', 'overloaded', 'timeout', 'invalid', 'permission', 'requires', 'verbose', 'output-format']
          .filter(signal => JSON.stringify(output.errors ?? output.result ?? '').toLowerCase().includes(signal.toLowerCase()));
      }
    } catch { result = { subtype: 'not-json' }; }
  }
  cli.push({ label, code, elapsedMs: Math.round(performance.now() - start), stdout: redact(stdout), stderr: redact(stderr), signals, result });
  console.log(JSON.stringify({ label, code, signals, result }));
  if (code !== 0) throw new Error(`CLI ${label} failed; external output omitted`);
  return stdout;
}

let registered = false, installed = false, passed = false, installationPassed = false;
try {
  const existing = JSON.parse(await run('marketplace inventory', ['plugin', 'marketplace', 'list', '--json']));
  if (JSON.stringify(existing).includes('rexia-scribe')) throw new Error('Selected marketplace already registered; preserve it');
  await run('add local marketplace', ['plugin', 'marketplace', 'add', resolve('.'), '--scope', 'local', '--json']);
  registered = true;
  await run('install local plugin', ['plugin', 'install', 'scribe@rexia-scribe', '--scope', 'local', '--json',
    '--config', `client_path=${executable}`, '--config', `port=${server.address().port}`]);
  installed = true;
  await run('configure through stdin', ['plugin', 'configure', 'scribe@rexia-scribe', '--values-stdin'], JSON.stringify({ token }) + '\n');
  // CLI saves non-sensitive userConfig in user settings, even for a local install.
  // Load only this plugin's saved config into the probe session; exclude all other user customization.
  const userSettings = JSON.parse(await readFile(join(homedir(), '.claude/settings.json'), 'utf8'));
  const saved = userSettings.pluginConfigs?.['scribe@rexia-scribe']?.options;
  if (saved?.client_path !== executable || saved?.port !== server.address().port) throw new Error('CLI did not save the requested native path and port');
  const pluginConfigs = { 'scribe@rexia-scribe': { options: { client_path: saved.client_path, port: saved.port } } };
  sessionSettings = join(root, 'session-settings.json');
  await writeFile(sessionSettings, JSON.stringify({ pluginConfigs }), { mode: 0o600 });
  await run('installed lifecycle', ['--init-only', '--setting-sources', 'local']);
  installationPassed = events.some(e => e.event === 'SessionStart') && events.some(e => e.event === 'SessionEnd');
  if (process.argv.includes('--installation-only')) {
    passed = installationPassed;
  } else {
  await run('automatic MCP + production skill', ['-p', '--permission-mode', 'auto', '--setting-sources', 'local',
    '--no-session-persistence', '--max-budget-usd', '1.50', '--tools', 'Skill',
    '--system-prompt', 'Perform only this artificial public local Scribe test. Never read files, run commands, approve permissions or access private data.',
    'Load the scribe-context skill to obtain the current session ID. Use scribe_report with PUBLIC TEST. Then scribe_ask with PUBLIC QUESTION and options YES and NO. Report its real result without inventing an answer.']);
  const commandOutput = await run('bare slash command without installed app', ['-p', '--permission-mode', 'auto',
    '--setting-sources', 'local', '--no-session-persistence', '--max-budget-usd', '0.50', '--tools', '',
    '--system-prompt', 'The desktop app is not installed in this protocol test. Follow the requested command and provide installation guidance. Do not claim to launch anything.', '/scribe']);
  const commandHasInstallLink = commandOutput.includes('rexia-intel-automation.github.io/scribe');
  const tools = calls.filter(call => call.method === 'tools/call');
  passed = events.some(e => e.event === 'SessionStart') && events.some(e => e.event === 'SessionEnd') &&
    ['scribe_report', 'scribe_ask'].every(name => tools.some(call => call.name === name && call.sessionMatchesHook)) && commandHasInstallLink;
  cli.at(-1).commandHasInstallLink = commandHasInstallLink;
  }
} finally {
  if (installed) await run('uninstall probe plugin', ['plugin', 'uninstall', 'scribe@rexia-scribe', '--scope', 'local', '--json']);
  if (registered) await run('remove probe marketplace', ['plugin', 'marketplace', 'remove', 'rexia-scribe', '--scope', 'local', '--json']);
  server.closeAllConnections();
  await new Promise(ok => server.close(ok));
  await writeFile(join(root, 'result.json'), JSON.stringify({ runId, passed, installationPassed,
    modelChecksRun: !process.argv.includes('--installation-only'), cli, events, calls,
    limitations: ['Native client is an observer at Phase 1; decisions belong to Phase 4.',
      'Server is a local protocol probe, not the production app.', 'No GUI launch or cross-platform installer is claimed.'] }, null, 2) + '\n');
}
console.log(JSON.stringify({ runId, passed, installationPassed, cli: cli.map(({ label, code }) => ({ label, code })), events, calls }));
if (!passed) process.exitCode = 1;
