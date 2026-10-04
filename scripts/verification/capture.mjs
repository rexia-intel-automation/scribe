import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { EVENTS, anonymize, hookSettings, validProbeHeaders } from './lib.mjs';

// This is a Phase 0 probe, not the production Scribe server.
const args = process.argv.slice(2);
const mode = args[0] ?? 'init';
const transport = args[1] === '--command' ? 'command' : 'http';
if (transport === 'command') args.splice(1, 1);
if (!['init', 'turn', 'interactive'].includes(mode)) throw new Error('Use init, turn, or interactive');
if (/OneDrive/i.test(process.cwd())) throw new Error('Run in the D: runtime mirror, outside OneDrive');
const root = resolve('.');
const runId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const runDir = join(root, '.verification', runId);
const fixtureRoot = join(root, 'app/src-tauri/tests/fixtures/hooks');
const token = randomBytes(32).toString('base64url');
const captured = [];
let sequence = 0;
await mkdir(runDir, { recursive: true });

const server = createServer(async (req, res) => {
  try {
    const port = server.address().port;
    if (!validProbeHeaders(req.headers, port, token)) {
      res.writeHead(403).end(); return;
    }
    const event = req.url?.split('/').pop();
    if (req.method !== 'POST' || req.url !== `/v1/hooks/${event}` || !EVENTS.includes(event)) {
      res.writeHead(404).end(); return;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1024 * 1024) { res.writeHead(413).end(); return; }
      chunks.push(chunk);
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (payload.hook_event_name !== event || typeof payload.session_id !== 'string' || typeof payload.cwd !== 'string') {
      res.writeHead(400).end(); return;
    }
    const ordinal = ++sequence;
    const dir = join(fixtureRoot, event);
    await mkdir(dir, { recursive: true });
    const name = `${runId}-${ordinal}.json`;
    const safe = anonymize(payload);
    await writeFile(join(dir, name), `${JSON.stringify(safe, null, 2)}\n`, { flag: 'wx' });
    captured.push({ event, file: `app/src-tauri/tests/fixtures/hooks/${event}/${name}`, authenticated: true });
    // No decision output, including for PermissionRequest. Claude retains its normal flow.
    res.writeHead(200).end();
  } catch {
    res.writeHead(400).end();
  }
});
await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
server.requestTimeout = 5000;
const port = server.address().port;
const settingsFile = join(runDir, 'settings.json');
const settings = hookSettings(port);
if (transport === 'command') {
  for (const entries of Object.values(settings.hooks)) {
    const hook = entries[0].hooks[0];
    entries[0].hooks[0] = { type: 'command', command: process.execPath,
      args: [resolve('scripts/verification/command-observer.mjs'), hook.url], timeout: 1 };
  }
}
await writeFile(settingsFile, JSON.stringify(settings, null, 2));
const baseArgs = ['--permission-mode', 'auto', '--setting-sources', '', '--settings', settingsFile, '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'];

{
  const prompt = args.slice(1).join(' ');
  if (mode !== 'init' && !prompt) throw new Error('A controlled test prompt is required');
  const cliArgs = mode === 'init' ? [...baseArgs, '--init-only'] : [
    ...baseArgs, ...(mode === 'turn' ? ['-p', '--no-session-persistence', '--max-budget-usd', '0.50'] : []),
    '--tools', 'Read,Agent,Write',
    '--system-prompt',
    'You are a protocol test participant. Follow the exact test prompt. Only access public test files in the current directory. Never run commands or access the network. Do not approve permissions or change any settings. A denied test operation is an expected result.', prompt,
  ];
  const cliVersion = await new Promise((ok, fail) => {
    const version = spawn('claude', ['--version'], { windowsHide: true });
    let output = '';
    version.stdout.on('data', (chunk) => { output += chunk; });
    version.once('error', fail);
    version.once('close', (code) => code === 0 ? ok(output.trim()) : fail(new Error('Version check failed')));
  });
  const start = performance.now();
  const child = spawn('claude', cliArgs, {
    cwd: root, shell: false, windowsHide: true,
    env: { ...process.env, SCRIBE_PROBE_TOKEN: token, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
    stdio: mode === 'interactive' ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '', stderr = '';
  child.stdout?.on('data', (chunk) => { stdout += chunk; });
  child.stderr?.on('data', (chunk) => { stderr += chunk; });
  const timer = setTimeout(() => child.kill(), 180000);
  const exitCode = await new Promise((ok, fail) => { child.once('error', fail); child.once('close', ok); });
  clearTimeout(timer);
  const result = { runId, mode, transport, cliVersion, exitCode,
    elapsedMs: Math.round(performance.now() - start), captured,
    stdout: anonymize(stdout), stderr: anonymize(stderr) };
  await writeFile(join(runDir, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ runId, exitCode, elapsedMs: result.elapsedMs, events: captured.map((e) => e.event) }));
  if (exitCode !== 0) process.exitCode = 1;
}
await new Promise((done) => server.close(done));
