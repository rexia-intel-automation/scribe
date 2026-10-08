import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, chmod, access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';
import { collectReleaseArtifacts } from '../prepare-release.mjs';

const VERSION = JSON.parse(await readFile(new URL('../../app/src-tauri/tauri.conf.json', import.meta.url), 'utf8')).version;
const PROTOCOL = '2026-07-28';
const CLIENT_META = {
  'io.modelcontextprotocol/protocolVersion': PROTOCOL,
  'io.modelcontextprotocol/clientCapabilities': {},
  'io.modelcontextprotocol/clientInfo': { name: 'scribe-installed-package-smoke', version: '1' },
};
const timeoutMs = 20_000;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function assertTrustedRunner(env = process.env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.CI !== 'true'
    || env.GITHUB_REPOSITORY !== 'rexia-intel-automation/scribe'
    || !env.GITHUB_RUN_ID || !env.RUNNER_TEMP || !env.GITHUB_WORKSPACE
    || env.GITHUB_EVENT_NAME === 'pull_request'
    || !(env.GITHUB_REF === 'refs/heads/main' || /^refs\/tags\/v/.test(env.GITHUB_REF ?? ''))) {
    throw new Error('Installed package smoke is restricted to GitHub Actions on main or a v* tag.');
  }
}

export function parseAttestation(text, expectedVersion) {
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('Installed helper returned invalid attestation JSON.'); }
  if (value?.name !== 'scribe-hook' || value?.version !== expectedVersion
    || value?.mcp_transport !== 'attested-stdio-v1') {
    throw new Error('Installed helper attestation does not match the selected release.');
  }
  return value;
}

function safeResponse(line, id) {
  let value;
  try { value = JSON.parse(line); } catch { throw new Error('Installed helper returned malformed MCP JSON.'); }
  if (value?.jsonrpc !== '2.0' || value.id !== id || value.error || !value.result) {
    throw new Error('Installed helper returned an invalid or error MCP reply.');
  }
  return value.result;
}

export function parseReportResult(result) {
  const okFromText = result?.content?.some((block) => {
    if (typeof block?.text !== 'string') return false;
    try { return JSON.parse(block.text)?.ok === true; } catch { return false; }
  }) === true;
  if (result?.resultType !== 'complete' || result.isError === true
    || !(result.structuredContent?.ok === true || okFromText)) {
    throw new Error('Installed app did not return a successful public scribe_report result.');
  }
}

export async function runMcpSmoke(child, waitForLine, requestTimeout = timeoutMs) {
  let nextId = 0;
  const request = async (method, params) => {
    const id = ++nextId;
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) })}\n`);
    return safeResponse(await waitForLine(id, requestTimeout), id);
  };
  const listed = await request('tools/list', { _meta: CLIENT_META });
  if (!Array.isArray(listed.tools) || !listed.tools.some((tool) => tool.name === 'scribe_report')) {
    throw new Error('Installed helper did not advertise scribe_report.');
  }
  const called = await request('tools/call', {
    _meta: CLIENT_META,
    name: 'scribe_report',
    arguments: { session_id: 'installed-package-smoke', text: 'Public installed package smoke check.' },
  });
  parseReportResult(called);
  return true;
}

function command(file, args, options = {}, limit = timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    const { input, capture = true, ...spawnOptions } = options;
    const child = spawn(file, args, {
      windowsHide: true,
      stdio: [input === undefined ? 'ignore' : 'pipe', capture ? 'pipe' : 'ignore', 'ignore'],
      ...spawnOptions,
    });
    let stdout = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Command timed out.')); }, limit);
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); if (stdout.length > 64_000) { child.kill(); reject(new Error('Command output exceeded the limit.')); } });
    if (input !== undefined) child.stdin.end(input);
    child.once('error', () => { clearTimeout(timer); reject(new Error('Required platform command could not start.')); });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error('Required platform command failed.'));
      else resolvePromise({ stdout, child });
    });
  });
}

async function exists(path) { try { await access(path, constants.F_OK); return true; } catch { return false; } }
async function requireFresh(paths) {
  if (paths.some((path) => !isAbsolute(path))) {
    throw new Error('Runner profile paths are not valid.');
  }
  for (const path of paths) if (await exists(path)) throw new Error('Runner is not fresh: an Scribe install or account profile already exists.');
}
const run = async (file, args, options, limit) => (await command(file, args, options, limit)).stdout;

function profilePaths() {
  if (process.platform === 'win32') return [
    join(process.env.APPDATA ?? '', 'com.rexia.scribe'),
    join(process.env.LOCALAPPDATA ?? '', 'com.rexia.scribe'),
  ];
  if (process.platform === 'darwin') return [join(process.env.HOME ?? '', 'Library/Application Support/com.rexia.scribe')];
  return [join(process.env.HOME ?? '', '.config/com.rexia.scribe'), join(process.env.HOME ?? '', '.local/share/com.rexia.scribe')];
}

async function install(bundle, artifact, root) {
  if (bundle === 'nsis') {
    await run(artifact, ['/S'], { capture: false }, 120_000);
    const bases = [join(process.env.LOCALAPPDATA ?? '', 'Scribe')];
    return windowsPaths(bases);
  }
  if (bundle === 'msi') {
    await run('msiexec.exe', ['/i', artifact, '/qn', '/norestart'], { capture: false }, 120_000);
    return windowsPaths([join(process.env.LOCALAPPDATA ?? '', 'Scribe'), join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Scribe')]);
  }
  if (bundle === 'dmg') {
    const mount = join(root, 'dmg-mount');
    await mkdir(mount);
    try {
      await run('hdiutil', ['attach', '-readonly', '-nobrowse', '-noautoopen', '-mountpoint', mount, artifact], { capture: false });
      await run('ditto', [join(mount, 'Scribe.app'), '/Applications/Scribe.app'], { capture: false });
    } finally { await run('hdiutil', ['detach', mount], { capture: false }).catch(() => {}); }
    return { app: '/Applications/Scribe.app/Contents/MacOS/scribe', helper: '/Applications/Scribe.app/Contents/MacOS/scribe-hook' };
  }
  if (bundle === 'deb') {
    await run('sudo', ['apt', 'install', '-y', `./${basename(artifact)}`], { cwd: dirname(artifact), capture: false }, 120_000);
    const files = (await run('dpkg-query', ['-L', 'scribe'])).split(/\r?\n/).filter(Boolean);
    return linuxPaths(files);
  }
  await chmod(artifact, 0o755);
  const persistent = join(root, 'appimage-extracted');
  await mkdir(persistent);
  await run(artifact, ['--appimage-extract'], { cwd: persistent, capture: false }, 120_000);
  const extracted = join(persistent, 'squashfs-root');
  return { app: artifact, helper: join(extracted, 'usr', 'bin', 'scribe-hook') };
}

async function windowsPaths(bases) {
  for (const base of bases) {
    const app = join(base, 'scribe.exe'), helper = join(base, 'scribe-hook.exe');
    // Exact documented installer locations only; no filesystem-wide search.
    if (await exists(app) && await exists(helper)) return { app, helper };
  }
  throw new Error('No documented Scribe install location was available.');
}
function linuxPaths(files) {
  const apps = files.filter((path) => basename(path) === 'scribe');
  const helpers = files.filter((path) => basename(path) === 'scribe-hook');
  if (apps.length !== 1 || helpers.length !== 1) throw new Error('DEB package listing did not identify one app and helper.');
  return { app: apps[0], helper: helpers[0] };
}

export async function waitForLine(child, id, limit) {
  const lines = child.__smokeLines;
  let timer;
  return new Promise((resolvePromise, reject) => {
    if (lines.closed) { reject(new Error('Installed helper closed before replying.')); return; }
    if (lines.replies.has(id)) { const value = lines.replies.get(id); lines.replies.delete(id); resolvePromise(value); return; }
    timer = setTimeout(() => { lines.waiters.delete(id); reject(new Error('Installed helper MCP request timed out.')); }, limit);
    lines.waiters.set(id, (value) => { clearTimeout(timer); resolvePromise(value); });
  });
}

export async function helperProcess(path, args = ['--mcp']) {
  const child = spawn(path, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  const state = { replies: new Map(), waiters: new Map(), closed: false };
  child.__smokeLines = state;
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    let id;
    try { id = JSON.parse(line).id; } catch { return; }
    const waiter = state.waiters.get(id);
    if (waiter) { state.waiters.delete(id); waiter(line); } else state.replies.set(id, line);
  });
  const closed = () => { state.closed = true; for (const waiter of state.waiters.values()) waiter(null); state.waiters.clear(); };
  child.once('error', closed);
  child.once('close', closed);
  child.stdin.on('error', () => {});
  return { child, lines };
}

async function stopChild(child, stdin) {
  if (stdin && !stdin.destroyed) stdin.end();
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise((done) => child.once('close', () => done(true)));
  const graceful = await Promise.race([closed, new Promise((done) => setTimeout(() => done(false), 500))]);
  if (!graceful && child.exitCode === null && child.signalCode === null) child.kill();
  if (!graceful) await Promise.race([closed, new Promise((done) => setTimeout(done, 1000))]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

async function waitForHealth(port, token, app, deadline) {
  while (Date.now() < deadline) {
    if (app.exitCode !== null || app.signalCode !== null) throw new Error('Installed app exited before becoming ready.');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/health`, {
        headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(1500),
      });
      if (response.ok) return;
    } catch { /* Listener startup is asynchronous; retry inside the fixed deadline. */ }
    await new Promise((ok) => setTimeout(ok, 250));
  }
  throw new Error('Installed app local health check timed out.');
}

async function runInstalled(paths, version) {
  const attested = await run(paths.helper, ['--mcp-check']);
  parseAttestation(attested, version);
  for (const path of [paths.app, paths.helper]) if (!(await exists(path))) throw new Error('Installed app or helper is missing.');
  const app = spawn(paths.app, ['--open'], { windowsHide: true, stdio: 'ignore' });
  let appError = false;
  app.once('error', () => { appError = true; });
  let helper;
  try {
    const connection = profilePaths()[0] && join(profilePaths()[0], 'connection.json');
    const deadline = Date.now() + 60_000;
    let config;
    while (Date.now() < deadline) {
      if (appError || app.exitCode !== null || app.signalCode !== null) throw new Error('Installed app exited before becoming ready.');
      try { config = JSON.parse(await readFile(connection, 'utf8')); break; } catch { await new Promise((ok) => setTimeout(ok, 250)); }
    }
    if (!config || !Number.isInteger(config.port) || typeof config.token !== 'string') throw new Error('Installed app did not create a valid local connection.');
    await waitForHealth(config.port, config.token, app, deadline);
    const event = JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'installed-package-smoke', cwd: process.env.RUNNER_TEMP });
    await run(paths.helper, ['--hook', 'SessionStart'], { input: event, capture: false });
    const sessionDeadline = Date.now() + 5000;
    let sessionReady = false;
    while (Date.now() < sessionDeadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${config.port}/v1/state`, {
          headers: { authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          const state = await response.json();
          sessionReady = state.sessions?.some((session) => session.id === 'installed-package-smoke' && session.endedAt == null) === true;
          if (sessionReady) break;
        }
      } catch { /* A hook is observational; require its state instead of trusting exit zero. */ }
      await new Promise((done) => setTimeout(done, 100));
    }
    if (!sessionReady) throw new Error('Installed helper SessionStart did not create a live session.');
    const { child, lines } = await helperProcess(paths.helper); helper = { child, lines };
    await runMcpSmoke(child, (id, limit) => waitForLine(child, id, limit));
  } finally {
    if (helper) { helper.lines.close(); await stopChild(helper.child, helper.child.stdin); }
    await stopChild(app);
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--bundle', '--input-root', '--source-sha', '--tag'].includes(argv[i]) || !argv[i + 1] || argv[i + 1].startsWith('--') || args[argv[i]]) throw new Error('Invalid smoke arguments.');
    args[argv[i]] = argv[i + 1];
  }
  if (Object.keys(args).length !== 4 || !['nsis', 'msi', 'dmg', 'deb', 'appimage'].includes(args['--bundle'])) throw new Error('Expected --bundle, --input-root, --source-sha, and --tag.');
  return args;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  assertTrustedRunner(env);
  if (resolve(env.GITHUB_WORKSPACE) !== repositoryRoot || !isAbsolute(env.RUNNER_TEMP)) {
    throw new Error('Runner workspace or temporary directory is invalid.');
  }
  const args = parseArgs(argv), bundle = args['--bundle'];
  const requiredPlatform = ({ nsis: 'win32', msi: 'win32', dmg: 'darwin', deb: 'linux', appimage: 'linux' })[bundle];
  if (process.platform !== requiredPlatform) throw new Error('Selected package does not match this runner OS.');
  if (args['--tag'] !== env.GITHUB_REF.slice('refs/tags/'.length) && env.GITHUB_REF.startsWith('refs/tags/')) throw new Error('Release tag does not match this runner ref.');
  const runnerTemp = resolve(env.RUNNER_TEMP);
  const root = await mkdtemp(join(runnerTemp, 'scribe-installed-smoke-'));
  const installPaths = [...profilePaths()];
  if (process.platform === 'win32') installPaths.push(join(process.env.LOCALAPPDATA ?? '', 'Scribe'));
  if (process.platform === 'win32') installPaths.push(join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Scribe'));
  if (process.platform === 'darwin') installPaths.push('/Applications/Scribe.app');
  if (process.platform === 'linux') installPaths.push('/usr/bin/scribe', '/usr/bin/scribe-hook');
  await requireFresh(installPaths);
  const collected = join(root, 'verified');
  const result = collectReleaseArtifacts({ inputRoot: resolve(args['--input-root']), outputDir: collected, tag: args['--tag'], sourceSha: args['--source-sha'] });
  const filenames = result.files;
  const artifactName = filenames.find((name) => ({ nsis: /-setup\.exe$/i, msi: /\.msi$/i, dmg: /\.dmg$/i, deb: /\.deb$/i, appimage: /\.appimage$/i })[bundle].test(name));
  if (!artifactName) throw new Error('Verified release did not contain the selected bundle.');
  const paths = await install(bundle, join(collected, artifactName), root);
  await runInstalled(paths, VERSION);
  process.stdout.write(`PASS ${bundle}: verified release ${args['--tag']} installed; app health and attested MCP scribe_report succeeded.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
