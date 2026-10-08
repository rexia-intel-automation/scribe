import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdtemp, mkdir, readdir, realpath, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const expectedCliVersion = '2.1.294';
const serverName = 'scribe-discovery-smoke';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const helperPath = path.join(repoRoot, 'app', 'hook-client', 'target', 'release', 'scribe-hook.exe');
const tempBase = await realpath(os.tmpdir());
const tempRoot = await mkdtemp(path.join(tempBase, 'scribe-claude-mcp-discovery-'));
const canonicalRoot = await realpath(tempRoot);

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

const awaitRealRepoRoot = await realpath(repoRoot);
const workDir = path.join(canonicalRoot, 'cwd');
const configDir = path.join(canonicalRoot, 'claude-config');
const profileDir = path.join(canonicalRoot, 'profile');
const appDataDir = path.join(canonicalRoot, 'appdata');
const localAppDataDir = path.join(canonicalRoot, 'localappdata');
const missingConnection = path.join(canonicalRoot, 'missing-connection.json');

function cleanEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      /^(ANTHROPIC_|CLAUDE_CODE_|AWS_|AZURE_|GOOGLE_|GCP_|VERTEX_|BEDROCK_)/i.test(key) ||
      /^(GEMINI_API_KEY|OPENAI_API_KEY|CLAUDE_CONFIG_DIR)$/i.test(key) ||
      /(^|_)(TOKEN|API_KEY|SECRET|PASSWORD|CREDENTIALS?)(_|$)/i.test(key) ||
      /^(GIT_ASKPASS|SSH_AUTH_SOCK|NETRC)$/i.test(key)
    ) {
      delete env[key];
    }
  }
  env.CLAUDE_CONFIG_DIR = configDir;
  env.HOME = profileDir;
  env.USERPROFILE = profileDir;
  env.APPDATA = appDataDir;
  env.LOCALAPPDATA = localAppDataDir;
  env.XDG_CONFIG_HOME = path.join(profileDir, '.config');
  env.DISABLE_TELEMETRY = '1';
  env.DISABLE_ERROR_REPORTING = '1';
  return env;
}

function runCli(stage, args, env) {
  const literal = value => `'${value.replaceAll("'", "''")}'`;
  const command = "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; " +
    "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $OutputEncoding=[Console]::OutputEncoding; " +
    "$cli=(Get-Command claude -CommandType Application | Select-Object -First 1).Source; " +
    `& $cli ${args.map(literal).join(' ')}; exit $LASTEXITCODE`;
  const result = spawnSync(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], {
    cwd: workDir,
    env,
    encoding: 'utf8',
    timeout: 20_000,
    maxBuffer: 128 * 1024,
    windowsHide: true,
    shell: false,
  });
  if (result.error || result.status !== 0) {
    const reason = result.error?.code ?? (result.signal ? `signal ${result.signal}` : `exit ${result.status}`);
    throw new Error(`${stage} failed (${reason}); CLI output suppressed to protect configuration data`);
  }
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

try {
  assert.equal(process.platform, 'win32', 'this real-client smoke is Windows-only');
  assert.ok(canonicalRoot.startsWith(`${tempBase}${path.sep}`), 'temporary root is not beneath the OS temp directory');
  assert.ok(path.basename(canonicalRoot).startsWith('scribe-claude-mcp-discovery-'));
  assert.ok(!isInside(canonicalRoot, awaitRealRepoRoot) && !isInside(awaitRealRepoRoot, canonicalRoot), 'temporary root overlaps repository');
  await mkdir(workDir);
  await mkdir(configDir);
  await mkdir(profileDir);
  await mkdir(appDataDir);
  await mkdir(localAppDataDir);

  const [realWorkDir, realConfigDir, realProfileDir] = await Promise.all([
    realpath(workDir), realpath(configDir), realpath(profileDir),
  ]);
  assert.ok(isInside(canonicalRoot, realWorkDir), 'working directory escaped the temporary root');
  assert.ok(isInside(canonicalRoot, realConfigDir), 'Claude config directory escaped the temporary root');
  assert.ok(isInside(canonicalRoot, realProfileDir), 'profile directory escaped the temporary root');
  assert.equal((await stat(configDir)).isDirectory(), true);
  assert.deepEqual(await readdir(configDir), [], 'temporary Claude config directory is not empty');
  assert.equal(await access(missingConnection).then(() => true, () => false), false);
  assert.equal((await stat(helperPath)).isFile(), true, 'release helper is missing; build it before running this smoke');
  const realHelperPath = await realpath(helperPath);
  assert.ok(isInside(awaitRealRepoRoot, realHelperPath), 'release helper resolves outside the checked-out repository');

  const env = cleanEnvironment();
  assert.equal(env.CLAUDE_CONFIG_DIR, configDir);
  assert.equal(env.USERPROFILE, profileDir);
  assert.equal(env.HOME, profileDir);
  for (const key of Object.keys(env)) {
    assert.ok(
      !/^(ANTHROPIC_|CLAUDE_CODE_|AWS_|AZURE_|GOOGLE_|GCP_|VERTEX_|BEDROCK_)/i.test(key) &&
        !/(^|_)(TOKEN|API_KEY|SECRET|PASSWORD|CREDENTIALS?)(_|$)/i.test(key) &&
        !/^(GIT_ASKPASS|SSH_AUTH_SOCK|NETRC)$/i.test(key),
      'credential variable survived environment filtering',
    );
  }

  const versionOutput = runCli('Claude CLI version check', ['--version'], env).trim();
  assert.ok(versionOutput === expectedCliVersion || versionOutput === `${expectedCliVersion} (Claude Code)`,
    `expected Claude Code ${expectedCliVersion}`);

  runCli('isolated MCP registration', [
    'mcp', 'add', serverName, '--transport', 'stdio', '--scope', 'user', '--env',
    `SCRIBE_CONNECTION_FILE=${missingConnection}`, '--', helperPath, '--mcp',
  ], env);

  const listOutput = runCli('isolated MCP discovery', ['mcp', 'list'], env)
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
  assert.doesNotMatch(listOutput, /tools fetch failed|invalid result/i, 'Claude reported an MCP tools/list failure');

  const escapedServerName = serverName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matchingServerLines = listOutput.split(/\r?\n/).filter((line) =>
    new RegExp(`^\\s*${escapedServerName}(?=\\s*[:(]|\\s+-|\\s*$)`, 'i').test(line),
  );
  assert.equal(matchingServerLines.length, 1, 'Claude did not report exactly the registered Scribe smoke server');
  assert.match(matchingServerLines[0], /(?:✔|√)\s+Connected\s*$/, 'the registered Scribe smoke server was not Connected');

  console.log(`Claude Code ${expectedCliVersion} discovered ${serverName} as Connected in an isolated temporary profile.`);
} finally {
  const currentRoot = await realpath(tempRoot).catch(() => null);
  if (currentRoot !== null) {
    assert.equal(currentRoot, canonicalRoot, 'temporary cleanup target changed after isolation checks');
    assert.ok(currentRoot.startsWith(`${tempBase}${path.sep}`), 'refusing to remove a directory outside OS temp');
    assert.ok(path.basename(currentRoot).startsWith('scribe-claude-mcp-discovery-'), 'refusing to remove an unexpected directory');
    await rm(currentRoot, { recursive: true, force: true });
  }
}
