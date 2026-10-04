import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve, join } from 'node:path';
import { hookSettings, redact } from './lib.mjs';

// CLI lifecycle probes do not invoke a model. They do not validate interactive permissions.
if (/OneDrive/i.test(process.cwd())) throw new Error('Run in the D: runtime mirror, outside OneDrive');
const runDir = resolve('.verification', `failure-${Date.now()}`);
await mkdir(runDir, { recursive: true });
const results = [];
const transport = process.argv[2] ?? 'http';
if (!['http', 'command', 'native'].includes(transport)) throw new Error('Use http, command, or native');
for (const scenario of ['baseline', 'healthy', 'closed', 'stalled', 'invalid-json', 'http-error']) {
  const token = randomBytes(32).toString('base64url');
  const calls = [];
  const server = createServer((req, res) => {
    calls.push({ event: req.url?.split('/').pop(), authenticated: req.headers.authorization === `Bearer ${token}` });
    req.resume();
    if (scenario === 'stalled') return;
    if (scenario === 'http-error') { res.writeHead(503).end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(scenario === 'invalid-json' ? 'invalid JSON' : '');
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const port = server.address().port;
  if (scenario === 'closed') await new Promise((ok) => server.close(ok));
  const settings = scenario === 'baseline' ? {} : hookSettings(port);
  if (transport !== 'http' && scenario !== 'baseline') {
    for (const entries of Object.values(settings.hooks)) {
      const hook = entries[0].hooks[0];
      entries[0].hooks[0] = { type: 'command',
        command: transport === 'native' ? resolve('.verification/native-observer.exe') : process.execPath,
        args: transport === 'native' ? [hook.url] : [resolve('scripts/verification/command-observer.mjs'), hook.url], timeout: 1 };
    }
  }
  const settingsFile = join(runDir, `${scenario}.json`);
  await writeFile(settingsFile, JSON.stringify(settings));
  const start = performance.now();
  const child = spawn('claude', ['--init-only', '--setting-sources', '', '--settings', settingsFile,
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'], {
    windowsHide: true, env: { ...process.env, SCRIBE_PROBE_TOKEN: token, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const timer = setTimeout(() => child.kill(), 15000);
  const exitCode = await new Promise((ok, fail) => { child.once('error', fail); child.once('close', ok); });
  clearTimeout(timer);
  server.closeAllConnections();
  if (scenario !== 'closed') await new Promise((ok) => server.close(ok));
  results.push({ transport, scenario, exitCode, elapsedMs: Math.round(performance.now() - start), calls,
    stdout: redact(stdout), stderr: redact(stderr) });
}
await writeFile(join(runDir, 'result.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
if (results.some((result) => result.exitCode !== 0)) process.exitCode = 1;
