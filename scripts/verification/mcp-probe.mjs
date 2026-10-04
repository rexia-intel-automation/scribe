import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { anonymize, validProbeHeaders } from './lib.mjs';

// Ephemeral MCP compatibility probe. This is not the production MCP server.
if (/OneDrive/i.test(process.cwd())) throw new Error('Run in the D: runtime mirror, outside OneDrive');
const root = resolve('.verification', `mcp-${Date.now()}`);
const plugin = join(root, 'plugin');
await mkdir(join(plugin, '.claude-plugin'), { recursive: true });
await mkdir(join(plugin, 'skills/context'), { recursive: true });
const token = randomBytes(32).toString('base64url');
const calls = [];
let hookSession;
const server = createServer(async (req, res) => {
  try {
    if (!validProbeHeaders(req.headers, server.address().port, token)) { res.writeHead(403).end(); return; }
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 1024 * 1024) { res.writeHead(413).end(); return; }
    }
    const input = JSON.parse(body);
    if (req.url === '/v1/hooks/SessionStart') {
      hookSession = input.session_id;
      res.writeHead(200).end(); return;
    }
    if (req.url !== '/mcp') { res.writeHead(404).end(); return; }
    calls.push({ method: anonymize(input.method, 'method'), params: anonymize(input.params), authenticated: true });
    if (input.id === undefined) { res.writeHead(202).end(); return; }
    let result;
    if (input.method === 'initialize') {
      result = { protocolVersion: input.params.protocolVersion, capabilities: { tools: {} },
        serverInfo: { name: 'scribe-phase-zero-probe', version: '0.0.0' } };
    } else if (input.method === 'tools/list') {
      const session = { type: 'string', description: 'Current Claude session ID from the invoked skill' };
      result = { tools: [{ name: 'scribe_report', description: 'Record a public protocol-test milestone locally',
        inputSchema: { type: 'object', properties: { session_id: session, text: { type: 'string', maxLength: 140 } },
          required: ['session_id', 'text'], additionalProperties: false },
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
      { name: 'scribe_ask', description: 'Protocol-test question; returns an explicit timeout, never a fabricated answer',
        inputSchema: { type: 'object', properties: { session_id: session,
          question: { type: 'string', maxLength: 200 }, options: { type: 'array', minItems: 2, maxItems: 4,
            items: { type: 'string', maxLength: 40 } } }, required: ['session_id', 'question', 'options'], additionalProperties: false },
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } }] };
    } else if (input.method === 'tools/call') {
      const sameSession = input.params.arguments.session_id === hookSession;
      calls.at(-1).sessionMatchesHook = sameSession;
      const answer = input.params.name === 'scribe_report' ? { ok: sameSession } : { answer: null, reason: 'timeout' };
      result = { content: [{ type: 'text', text: JSON.stringify(answer) }], isError: !sameSession };
    } else if (input.method === 'ping') result = {};
    else {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: input.id,
        error: { code: -32601, message: 'Method not found' } })); return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: input.id, result }));
  } catch { res.writeHead(400).end(); }
});
await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
const url = `http://127.0.0.1:${server.address().port}`;
await writeFile(join(plugin, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'scribe-phase-zero-probe',
  version: '0.0.0', description: 'Temporary local protocol verification only', author: { name: 'RexIA' }, license: 'MIT' }));
await writeFile(join(plugin, '.mcp.json'), JSON.stringify({ mcpServers: { scribe: {
  type: 'http', url: `${url}/mcp`, timeout: 610000,
  headers: { Authorization: 'Bearer ${SCRIBE_PROBE_TOKEN}' },
} } }));
await writeFile(join(plugin, 'skills/context/SKILL.md'), [
  '---', 'name: context', 'description: Run the artificial public MCP verification.', 'disable-model-invocation: true', '---',
  'The current Claude session ID is ${CLAUDE_SESSION_ID}.',
  'Use the scribe_report MCP tool with this session_id and text PUBLIC TEST.',
  'Then use scribe_ask with the same session_id, question PUBLIC QUESTION and options YES and NO.',
  'The probe returns timeout intentionally. Report that outcome without inventing an answer.',
  'Do not read files, run commands, access the network or change any settings.',
].join('\n'));
const settings = { hooks: { SessionStart: [{ hooks: [{ type: 'command', command: process.execPath,
  args: [resolve('scripts/verification/command-observer.mjs'), `${url}/v1/hooks/SessionStart`], timeout: 1 }] }] } };
const settingsFile = join(root, 'settings.json');
await writeFile(settingsFile, JSON.stringify(settings));

async function run(cliArgs) {
  const child = spawn('claude', cliArgs, { windowsHide: true,
    env: { ...process.env, SCRIBE_PROBE_TOKEN: token, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const timer = setTimeout(() => child.kill(), 120000);
  const exitCode = await new Promise((ok, fail) => { child.once('error', fail); child.once('close', ok); });
  clearTimeout(timer);
  return { exitCode, stdout: anonymize(stdout), stderr: anonymize(stderr) };
}
const validation = await run(['plugin', 'validate', '--strict', plugin]);
const execution = await run(['-p', '--permission-mode', 'auto', '--plugin-dir', plugin,
  '--setting-sources', '', '--settings', settingsFile, '--strict-mcp-config', '--mcp-config', join(plugin, '.mcp.json'),
  '--no-session-persistence', '--max-budget-usd', '0.50', '--tools', '',
  '--system-prompt', 'Execute only the supplied public protocol test skill. Never approve permissions or access private data.',
  '/scribe-phase-zero-probe:context']);
server.closeAllConnections();
await new Promise((ok) => server.close(ok));
const toolCalls = calls.filter((call) => call.method === 'tools/call');
const passed = validation.exitCode === 0 && execution.exitCode === 0 &&
  ['scribe_report', 'scribe_ask'].every((name) => toolCalls.some((call) => call.params.name === name && call.sessionMatchesHook));
const report = { probe: 'MCP Streamable HTTP + skill session substitution', validation, execution,
  hookSession: anonymize(hookSession, 'session_id'), calls, passed,
  limitations: ['Question answer is intentionally timeout; this does not validate a real user choice or ten-minute wait.',
    'The validated plugin .mcp.json is explicitly loaded via --mcp-config to isolate the probe from user servers. Automatic plugin connection remains a Phase 1 installation test.'] };
await writeFile(join(root, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed, validationExitCode: validation.exitCode, executionExitCode: execution.exitCode,
  methods: calls.map((call) => call.method), toolSessionsMatch: toolCalls.map((call) => call.sessionMatchesHook) }));
if (!passed) process.exitCode = 1;
