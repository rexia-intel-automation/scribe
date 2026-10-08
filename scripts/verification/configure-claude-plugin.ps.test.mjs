import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const windowsTest = process.platform === 'win32' ? test
  : (name, fn) => test(name, { skip: 'Windows-only onboarding script and executable fixtures' }, fn);

const fakeExecutableSource = String.raw`
using System;
using System.IO;
using System.Text;
using System.Threading;

public static class FakeScribeExecutable
{
    private static void Record(string value)
    {
        var path = Environment.GetEnvironmentVariable("SCRIBE_TEST_LOG");
        if (!String.IsNullOrEmpty(path)) File.AppendAllText(path, value + Environment.NewLine);
    }

    public static int Main(string[] args)
    {
        var name = Path.GetFileNameWithoutExtension(typeof(FakeScribeExecutable).Assembly.Location);
        if (name == "scribe-hook")
        {
            var mode = Environment.GetEnvironmentVariable("SCRIBE_TEST_HELPER_MODE");
            if (mode == "hang") Thread.Sleep(30000);
            if (args.Length != 1 || args[0] != "--mcp-check") return 2;
            if (mode == "old")
            {
                return 0;
            }
            Console.WriteLine("{\"name\":\"scribe-hook\",\"version\":\"0.1.0\",\"mcp_transport\":\"attested-stdio-v1\"}");
            return 0;
        }

        Record("ARGS:" + Convert.ToBase64String(Encoding.UTF8.GetBytes(String.Join("\u001f", args))));
        if (args.Length >= 4 && args[0] == "plugin" && args[1] == "marketplace" && args[2] == "list")
        {
            Console.WriteLine("{\"marketplaces\":[{\"name\":\"rexia-scribe\"},{\"name\":\"synthetic-other\"}]}");
            return 0;
        }
        if (Environment.GetEnvironmentVariable("SCRIBE_TEST_CLI_MODE") == "fail-install" &&
            args.Length >= 2 && args[0] == "plugin" && args[1] == "install")
        {
            Console.WriteLine("SYNTHETIC_CLI_SECRET");
            Console.Error.WriteLine("SYNTHETIC_CLI_SECRET");
            return 42;
        }
        if (Array.IndexOf(args, "--values-stdin") >= 0)
            Record("STDIN:" + Convert.ToBase64String(Encoding.UTF8.GetBytes(Console.In.ReadToEnd())));
        return 0;
    }
}`;

function findCompiler() {
  const paths = [
    join(process.env.SystemRoot ?? 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    join(process.env.SystemRoot ?? 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ];
  const compiler = paths.find(path => {
    try { execFileSync(path, ['/help'], { stdio: 'ignore' }); return true; }
    catch (error) { return error.status === 1; }
  });
  if (!compiler) throw new Error('A .NET Framework C# compiler is required for the synthetic executable fixtures.');
  return compiler;
}

async function makeFixture(shell) {
  const root = await mkdtemp(join(tmpdir(), 'Scribe Plugin Test '));
  const localAppData = join(root, 'local app data');
  const appData = join(root, 'roaming app data');
  const fakeBin = join(root, 'fake bin with spaces');
  const appDir = join(localAppData, 'Scribe');
  const profileDir = join(appData, 'com.rexia.scribe');
  const scriptPath = resolve('scripts/configure-claude-plugin.ps1');
  await Promise.all([mkdir(appDir, { recursive: true }), mkdir(profileDir, { recursive: true }), mkdir(fakeBin, { recursive: true })]);
  const sourcePath = join(root, 'fake source.cs');
  const compiled = join(root, 'fake executable.exe');
  await writeFile(sourcePath, fakeExecutableSource, 'utf8');
  execFileSync(findCompiler(), ['/nologo', '/target:exe', `/out:${compiled}`, sourcePath], { stdio: 'pipe' });
  const helperPath = join(appDir, 'scribe-hook.exe');
  await copyFile(compiled, helperPath);
  await copyFile(compiled, join(fakeBin, 'claude.exe'));
  const logPath = join(root, 'synthetic CLI log.txt');
  await writeFile(join(profileDir, 'connection.json'), JSON.stringify({
    port: 43210,
    token: 'SYNTHETIC_BEARER_TOKEN_012345678901234567890123',
    hook_key: 'SYNTHETIC_INDEPENDENT_HOOK_KEY_012345678901234567890123',
  }), 'utf8');
  const powershell = shell === '5.1'
    ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
  const powershellHome = shell === '5.1'
    ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0')
    : 'C:\\Program Files\\PowerShell\\7';
  const syntheticProfile = join(root, 'synthetic user profile');
  await mkdir(syntheticProfile, { recursive: true });
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
  const system32 = join(systemRoot, 'System32');
  const pathEntries = [fakeBin, powershellHome, system32];
  const systemModules = [join(system32, 'WindowsPowerShell', 'v1.0', 'Modules'), join(powershellHome, 'Modules')];
  // The CI log proves PS5.1 hit spawnSync's 15s deadline with empty output; it
  // does not prove which omitted variable caused the wait. Supply Windows shell
  // prerequisites with a synthetic profile and keep executable lookup isolated.
  const env = {
    SystemRoot: systemRoot,
    WINDIR: systemRoot,
    TEMP: root,
    TMP: root,
    USERPROFILE: syntheticProfile,
    HOME: syntheticProfile,
    LOCALAPPDATA: localAppData,
    APPDATA: appData,
    ComSpec: join(system32, 'cmd.exe'),
    PSHOME: powershellHome,
    PSModulePath: systemModules.join(';'),
    PATH: pathEntries.join(';'),
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
    SCRIBE_TEST_LOG: logPath,
  };
  return { root, appData, fakeBin, helperPath, logPath, powershell, scriptPath, env };
}

function runPowerShell(fixture, args, extraEnv = {}, timeout = 15000) {
  const started = Date.now();
  const result = spawnSync(fixture.powershell, args, {
    cwd: process.cwd(),
    env: { ...fixture.env, ...extraEnv },
    encoding: 'utf8',
    timeout,
    windowsHide: true,
  });
  return { ...result, elapsedMs: Date.now() - started };
}

function runSetup(fixture, extraEnv = {}) {
  return runPowerShell(fixture, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fixture.scriptPath], extraEnv, 15000);
}

function runPowerShellDiagnosticAsync(fixture, args, extraEnv = {}, timeout = 90000) {
  const started = Date.now();
  const child = spawn(fixture.powershell, args, {
    cwd: process.cwd(),
    env: { ...fixture.env, ...extraEnv },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const outputLimit = 12000;
  const captured = { stdout: '', stderr: '' };
  const pending = { stdout: '', stderr: '' };
  let processError = null;
  let timedOut = false;
  let settled = false;
  let killTimer;
  let hardKillTimer;

  const appendTail = (key, text) => {
    captured[key] += text;
    if (captured[key].length > outputLimit) {
      captured[key] = `[earlier output truncated]\n${captured[key].slice(-outputLimit)}`;
    }
  };
  const consume = (key, chunk) => {
    pending[key] += chunk;
    const lines = pending[key].split(/\r?\n/);
    pending[key] = lines.pop();
    for (const line of lines) {
      appendTail(key, `[+${Date.now() - started}ms ${key}] ${line}\n`);
    }
    if (pending[key].length > outputLimit) {
      const excess = pending[key].length - outputLimit;
      appendTail(key, `[+${Date.now() - started}ms ${key}] [unterminated output truncated]\n`);
      pending[key] = pending[key].slice(excess);
    }
  };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => consume('stdout', chunk));
  child.stderr.on('data', chunk => consume('stderr', chunk));

  return new Promise(resolve => {
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      clearTimeout(hardKillTimer);
      for (const key of ['stdout', 'stderr']) {
        if (pending[key]) appendTail(key, `[+${Date.now() - started}ms ${key}] ${pending[key]} [trailing partial line]\n`);
      }
      resolve({
        status: timedOut ? null : child.exitCode,
        signal: child.signalCode,
        error: processError,
        stdout: captured.stdout,
        stderr: captured.stderr,
        elapsedMs: Date.now() - started,
        timedOut,
      });
    };
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill();
      killTimer = setTimeout(() => child.kill('SIGKILL'), 1000);
      hardKillTimer = setTimeout(finish, 2000);
    }, timeout);
    child.on('error', error => {
      processError = error;
    });
    child.on('close', finish);
  });
}

function diagnostic(result, fixture, { maxOutput = 1200, tail = false } = {}) {
  const redactPath = (value, path, replacement) => path
    ? value.replace(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), replacement)
    : value;
  const scrub = value => {
    let cleaned = String(value ?? '');
    cleaned = redactPath(cleaned, fixture.root, '[synthetic-temp]');
    cleaned = redactPath(cleaned, process.cwd(), '[workspace]');
    return cleaned
    .replaceAll('SYNTHETIC_BEARER_TOKEN_012345678901234567890123', '[synthetic-secret]')
    .replaceAll('SYNTHETIC_INDEPENDENT_HOOK_KEY_012345678901234567890123', '[synthetic-secret]')
    .replaceAll('SYNTHETIC_CLI_SECRET', '[synthetic-cli-output]');
  };
  const limit = value => {
    const cleaned = scrub(value);
    return cleaned.length > maxOutput
      ? (tail ? `[truncated; showing tail]\n${cleaned.slice(-maxOutput)}` : `${cleaned.slice(0, maxOutput)}\n[truncated]`)
      : cleaned;
  };
  return JSON.stringify({
    status: result.status,
    signal: result.signal,
    elapsedMs: result.elapsedMs,
    timedOut: Boolean(result.timedOut),
    error: result.error ? { code: result.error.code, syscall: result.error.syscall, message: scrub(result.error.message) } : null,
    stdout: limit(result.stdout),
    stderr: limit(result.stderr),
  });
}

async function runPowerShellDiagnostic() {
  if (process.platform !== 'win32') {
    console.error('PowerShell diagnostic mode requires Windows.');
    process.exitCode = 1;
    return;
  }

  let baselineOk = false;
  let scriptOk = false;
  const baseline = await makeFixture('5.1');
  try {
    const result = runPowerShell(baseline, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-Command', "[Console]::WriteLine('DIAG_BOOT'); exit 0",
    ], {}, 90000);
    baselineOk = result.status === 0 && String(result.stdout ?? '').includes('DIAG_BOOT');
    console.log(JSON.stringify({ mode: 'powershell-5.1-baseline', passed: baselineOk, result: JSON.parse(diagnostic(result, baseline, { maxOutput: 12000 })) }));
  } catch (error) {
    console.log(JSON.stringify({ mode: 'powershell-5.1-baseline', passed: false, result: JSON.parse(diagnostic({ status: null, signal: null, error }, baseline)) }));
  } finally {
    await rm(baseline.root, { recursive: true, force: true });
  }

  const trace = await makeFixture('5.1');
  try {
    const scriptLiteral = trace.scriptPath.replaceAll("'", "''");
    const result = await runPowerShellDiagnosticAsync(trace, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-Command', `Set-PSDebug -Trace 1; & '${scriptLiteral}'`,
    ], { SCRIBE_TEST_HELPER_MODE: 'old' }, 90000);
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    scriptOk = result.status === 1 && /Update the Scribe app and helper together/.test(output);
    console.log(JSON.stringify({ mode: 'powershell-5.1-old-helper-trace', passed: scriptOk, result: JSON.parse(diagnostic(result, trace, { maxOutput: 12000, tail: true })) }));
  } catch (error) {
    console.log(JSON.stringify({ mode: 'powershell-5.1-old-helper-trace', passed: false, result: JSON.parse(diagnostic({ status: null, signal: null, error }, trace, { maxOutput: 12000, tail: true })) }));
  } finally {
    await rm(trace.root, { recursive: true, force: true });
  }

  if (!baselineOk || !scriptOk) process.exitCode = 1;
}

async function recordedCalls(path) {
  let contents;
  try { contents = await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  return contents.trim().split(/\r?\n/).filter(Boolean).map(line => {
    const [kind, encoded] = line.split(':', 2);
    return { kind, value: Buffer.from(encoded, 'base64').toString('utf8') };
  });
}

if (process.env.SCRIBE_TEST_POWERSHELL_DIAGNOSTIC === '1') {
  await runPowerShellDiagnostic();
} else {
windowsTest('PowerShell 5.1 and 7 reject a helper without attested-stdio-v1 before invoking Claude CLI', async t => {
  for (const shell of ['5.1', '7']) {
    await t.test(`PowerShell ${shell}`, async t2 => {
      const fixture = await makeFixture(shell);
      t2.after(() => rm(fixture.root, { recursive: true, force: true }));
      const result = runSetup(fixture, { SCRIBE_TEST_HELPER_MODE: 'old' });
      assert.equal(result.status, 1, diagnostic(result, fixture));
      assert.match(result.stderr, /Update the Scribe app and helper together/);
      assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /SYNTHETIC_BEARER|SYNTHETIC_CLI_SECRET/);
      assert.deepEqual(await recordedCalls(fixture.logPath), []);
    });
  }
});

windowsTest('PowerShell 5.1 and 7 accept the marker, allow repeated setup, and pass only client_path', async t => {
  for (const shell of ['5.1', '7']) {
    await t.test(`PowerShell ${shell}`, async t2 => {
      const fixture = await makeFixture(shell);
      t2.after(() => rm(fixture.root, { recursive: true, force: true }));
      for (let run = 0; run < 2; run++) {
        const result = runSetup(fixture, { SCRIBE_TEST_HELPER_MODE: 'valid' });
        assert.equal(result.status, 0, `${diagnostic(result, fixture)}\n${JSON.stringify(await recordedCalls(fixture.logPath))}`);
        assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /SYNTHETIC_BEARER|SYNTHETIC_HOOK_KEY/);
      }
      const calls = await recordedCalls(fixture.logPath);
      const args = calls.filter(call => call.kind === 'ARGS').map(call => call.value.split('\u001f'));
      const configPayloads = calls.filter(call => call.kind === 'STDIN').map(call => JSON.parse(call.value));
      const expectedHelperPath = await realpath(fixture.helperPath);
      assert.equal(args.filter(values => values[2] === 'list').length, 2);
      assert.equal(args.filter(values => values[1] === 'install').length, 2);
      assert.equal(configPayloads.length, 2);
      for (const values of args.filter(values => values[1] === 'install')) {
        const configArgs = values.slice(-2);
        assert.equal(configArgs[0], '--config');
        const configuredPath = configArgs[1].slice('client_path='.length);
        assert.ok(configArgs[1].startsWith('client_path='));
        assert.ok(configuredPath.toLowerCase().endsWith('\\local app data\\scribe\\scribe-hook.exe'));
        assert.equal((await realpath(configuredPath)).toLowerCase(), expectedHelperPath.toLowerCase());
        assert.doesNotMatch(values.join(' '), /SYNTHETIC_BEARER|SYNTHETIC_INDEPENDENT_HOOK_KEY|\bport=/);
        for (const payload of configPayloads) assert.equal(payload.client_path.toLowerCase(), configuredPath.toLowerCase());
      }
      for (const payload of configPayloads) {
        assert.deepEqual(Object.keys(payload), ['client_path']);
        assert.ok(payload.client_path.toLowerCase().includes('scribe plugin test'));
        assert.equal((await realpath(payload.client_path)).toLowerCase(), expectedHelperPath.toLowerCase());
        assert.doesNotMatch(JSON.stringify(payload), /SYNTHETIC_BEARER|SYNTHETIC_INDEPENDENT_HOOK_KEY|token|hook_key|port/i);
      }
    });
  }
});

windowsTest('PowerShell 5.1 and 7 withhold fake CLI errors and secrets', async t => {
  for (const shell of ['5.1', '7']) {
    await t.test(`PowerShell ${shell}`, async t2 => {
      const fixture = await makeFixture(shell);
      t2.after(() => rm(fixture.root, { recursive: true, force: true }));
      const result = runSetup(fixture, { SCRIBE_TEST_HELPER_MODE: 'valid', SCRIBE_TEST_CLI_MODE: 'fail-install' });
      assert.equal(result.status, 1, diagnostic(result, fixture));
      assert.match(result.stderr, /plugin install \(exit code 42\)/);
      assert.match(result.stderr, /CLI output was withheld/);
      assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /SYNTHETIC_CLI_SECRET|SYNTHETIC_BEARER|SYNTHETIC_INDEPENDENT_HOOK_KEY/);
    });
  }
});

windowsTest('PowerShell 5.1 and 7 stop a hung helper check before CLI use', async t => {
  for (const shell of ['5.1', '7']) {
    await t.test(`PowerShell ${shell}`, async t2 => {
      const fixture = await makeFixture(shell);
      t2.after(() => rm(fixture.root, { recursive: true, force: true }));
      const started = Date.now();
      const result = runSetup(fixture, { SCRIBE_TEST_HELPER_MODE: 'hang' });
      assert.equal(result.status, 1, diagnostic(result, fixture));
      assert.match(result.stderr, /MCP helper capability check \(timeout\)/);
      assert.match(result.stderr, /Update the Scribe app and helper together/);
      assert.ok(Date.now() - started < 10000, 'helper check must have a short deadline');
      assert.deepEqual(await recordedCalls(fixture.logPath), []);
    });
  }
});
}
