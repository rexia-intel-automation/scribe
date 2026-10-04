import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { anonymize } from './lib.mjs';

// Real Claude turns, auto mode, an isolated ask rule, and no hook decisions.
if (/OneDrive/i.test(process.cwd())) throw new Error('Run in the D: runtime mirror, outside OneDrive');
const root = resolve('.verification', `permissions-${Date.now()}`);
await mkdir(root, { recursive: true });
const results = [];
async function listen(server) {
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  return server.address().port;
}
async function close(server) {
  server.closeAllConnections();
  await new Promise((ok) => server.close(ok));
}
for (const scenario of ['healthy', 'closed', 'stalled', 'invalid-json', 'http-error']) {
  const token = randomBytes(32).toString('base64url');
  const witnessEvents = [];
  const witness = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(403).end(); return; }
    let body = '';
    for await (const chunk of req) body += chunk;
    try { witnessEvents.push(anonymize(JSON.parse(body))); } catch { res.writeHead(400).end(); return; }
    res.writeHead(200).end();
  });
  const targetEvents = [];
  const target = createServer((req, res) => {
    targetEvents.push(req.url);
    req.resume();
    if (scenario === 'stalled') return;
    if (scenario === 'http-error') { res.writeHead(503).end(); return; }
    res.writeHead(200).end(scenario === 'invalid-json' ? 'invalid JSON' : '');
  });
  const witnessPort = await listen(witness);
  const targetPort = await listen(target);
  if (scenario === 'closed') await close(target);
  const observer = resolve('scripts/verification/command-observer.mjs');
  const hook = (port) => ({ type: 'command', command: process.execPath,
    args: [observer, `http://127.0.0.1:${port}/v1/hooks/PermissionRequest`], timeout: 1 });
  const settings = { permissions: { ask: ['Write'] }, hooks: {
    PermissionRequest: [{ matcher: 'Write', hooks: [hook(targetPort), hook(witnessPort)] }],
  } };
  const settingsFile = join(root, `${scenario}.json`);
  await writeFile(settingsFile, JSON.stringify(settings));
  const destination = join(root, `${scenario}-public-test.txt`);
  const prompt = `Use Write exactly once to write PUBLIC TEST to ${destination}. If permission is denied, stop and reply DENIED. Never retry, approve permissions, read files, run commands or access the network.`;
  const child = spawn('claude', ['-p', '--permission-mode', 'auto', '--setting-sources', '', '--settings', settingsFile,
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--no-session-persistence', '--max-budget-usd', '0.50',
    '--tools', 'Write', '--system-prompt', 'Execute only the artificial public protocol test. Permission denial is an expected test outcome.', prompt], {
    windowsHide: true, env: { ...process.env, SCRIBE_PROBE_TOKEN: token, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const start = performance.now();
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const timer = setTimeout(() => child.kill(), 60000);
  const exitCode = await new Promise((ok, fail) => { child.once('error', fail); child.once('close', ok); });
  clearTimeout(timer);
  await close(witness);
  if (scenario !== 'closed') await close(target);
  const destinationExists = await stat(destination).then(() => true, (error) => {
    if (error.code === 'ENOENT') return false;
    throw error;
  });
  results.push({ scenario, permissionMode: 'auto', temporaryAskRule: 'Write', exitCode,
    elapsedMs: Math.round(performance.now() - start), targetEvents, witnessEvents,
    destinationExists, stdout: anonymize(stdout), stderr: anonymize(stderr),
    passed: exitCode === 0 && stderr === '' && !destinationExists &&
      witnessEvents.some((event) => event.hook_event_name === 'PermissionRequest') });
}
await writeFile(join(root, 'result.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results.map(({ scenario, passed, elapsedMs, exitCode, witnessEvents }) =>
  ({ scenario, passed, elapsedMs, exitCode, permissionRequests: witnessEvents.length })), null, 2));
if (results.some((result) => !result.passed)) process.exitCode = 1;
