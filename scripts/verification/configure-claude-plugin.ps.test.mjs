import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
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
            var mode = Environment.GetEnvironmentVariable("SCRIBE_TEST_MARKETPLACE_MODE");
            Console.WriteLine(mode == "missing"
                ? "{\"marketplaces\":[{\"name\":\"synthetic-other\"}]}"
                : "{\"marketplaces\":[{\"name\":\"rexia-scribe\"},{\"name\":\"synthetic-other\"}]}");
            return 0;
        }
        var cliMode = Environment.GetEnvironmentVariable("SCRIBE_TEST_CLI_MODE");
        if (args.Length >= 4 && args[0] == "plugin" && args[1] == "marketplace" && args[2] == "update")
        {
            if (cliMode == "fail-marketplace-update") return Fail();
        }
        if (args.Length >= 3 && args[0] == "plugin" && args[1] == "update")
        {
            if (cliMode == "fail-plugin-update") return Fail();
        }
        if (args.Length >= 3 && args[0] == "plugin" && args[1] == "list" && args[2] == "--json")
        {
            if (cliMode == "fail-plugin-list") return Fail();
            var mode = Environment.GetEnvironmentVariable("SCRIBE_TEST_PLUGIN_LIST_MODE");
            if (mode == "malformed") { Console.WriteLine("not JSON"); return 0; }
            if (mode == "trailing-composite") { Console.WriteLine("[" + PluginRecord("0.1.1", true) + "],\"extra\":1"); return 0; }
            if (mode == "envelope") { Console.WriteLine("{\"plugins\":[" + PluginRecord("0.1.1", true) + "]}"); return 0; }
            if (mode == "missing") { Console.WriteLine("[]"); return 0; }
            if (mode == "duplicate") { Console.WriteLine("[" + PluginRecord("0.1.1", true) + "," + PluginRecord("0.1.1", true) + "]"); return 0; }
            if (mode == "wrong-scope") { Console.WriteLine("[" + PluginRecord("0.1.1", true, null, "scribe@rexia-scribe", "project") + "]"); return 0; }
            if (mode == "old") { Console.WriteLine("[" + PluginRecord("0.1.0", true, "0.1.1") + "]"); return 0; }
            if (mode == "disabled") { Console.WriteLine("[" + PluginRecord("0.1.1", false) + "]"); return 0; }
            if (mode == "folder-current") { Console.WriteLine("[" + PluginRecord("0.1.1", true, "0.1.1") + "]"); return 0; }
            if (mode == "folder-old") { Console.WriteLine("[" + PluginRecord("0.1.1", true, "0.1.0") + "]"); return 0; }
            Console.WriteLine("[" + PluginRecord("0.1.1", true) + "]");
            return 0;
        }
        if (cliMode == "fail-install" && args.Length >= 2 && args[0] == "plugin" && args[1] == "install")
        {
            return Fail();
        }
        if (Array.IndexOf(args, "--values-stdin") >= 0)
            Record("STDIN:" + Convert.ToBase64String(Encoding.UTF8.GetBytes(Console.In.ReadToEnd())));
        return 0;
    }

    private static int Fail()
    {
        Console.WriteLine("SYNTHETIC_CLI_SECRET");
        Console.Error.WriteLine("SYNTHETIC_CLI_SECRET");
        return 42;
    }

    private static string PluginRecord(string version, bool enabled, string folderVersion = null, string id = "scribe@rexia-scribe", string scope = "user")
    {
        var folder = folderVersion == null ? "" : ",\"folderVersion\":\"" + folderVersion + "\"";
        return "{\"id\":\"" + id + "\",\"version\":\"" + version +
            "\",\"scope\":\"" + scope + "\",\"enabled\":" + (enabled ? "true" : "false") +
            ",\"projectEnabled\":false,\"installPath\":\"SYNTHETIC_INSTALL_PATH\"," +
            "\"installedAt\":\"2026-10-08T00:00:00Z\",\"lastUpdated\":\"2026-10-08T00:00:00Z\"," +
            "\"mcpServers\":{},\"hasUserConfig\":true" + folder + "}";
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

function runSetup(fixture, extraEnv = {}) {
  return spawnSync(fixture.powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fixture.scriptPath], {
    cwd: process.cwd(),
    env: { ...fixture.env, ...extraEnv },
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
  });
}

function diagnostic(result, fixture) {
  const scrub = value => String(value ?? '')
    .replaceAll(fixture.root, '[synthetic-temp]')
    .replaceAll(process.cwd(), '[workspace]')
    .replaceAll('SYNTHETIC_BEARER_TOKEN_012345678901234567890123', '[synthetic-secret]')
    .replaceAll('SYNTHETIC_INDEPENDENT_HOOK_KEY_012345678901234567890123', '[synthetic-secret]')
    .replaceAll('SYNTHETIC_CLI_SECRET', '[synthetic-cli-output]')
    .slice(0, 1200);
  return JSON.stringify({
    status: result.status,
    signal: result.signal,
    error: result.error ? { code: result.error.code, syscall: result.error.syscall, message: scrub(result.error.message) } : null,
    stdout: scrub(result.stdout),
    stderr: scrub(result.stderr),
  });
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
      assert.deepEqual(args.map(values => values.slice(0, 3)), [
        ['plugin', 'marketplace', 'list'],
        ['plugin', 'marketplace', 'update'],
        ['plugin', 'install', 'scribe@rexia-scribe'],
        ['plugin', 'update', 'scribe@rexia-scribe'],
        ['plugin', 'list', '--json'],
        ['plugin', 'configure', 'scribe@rexia-scribe'],
        ['plugin', 'marketplace', 'list'],
        ['plugin', 'marketplace', 'update'],
        ['plugin', 'install', 'scribe@rexia-scribe'],
        ['plugin', 'update', 'scribe@rexia-scribe'],
        ['plugin', 'list', '--json'],
        ['plugin', 'configure', 'scribe@rexia-scribe'],
      ]);
      assert.equal(args.filter(values => values[2] === 'list').length, 2);
      assert.equal(args.filter(values => values[1] === 'install').length, 2);
      assert.equal(args.filter(values => values[1] === 'marketplace' && values[2] === 'update').length, 2);
      assert.equal(args.filter(values => values[1] === 'update' && values[2] === 'scribe@rexia-scribe').length, 2);
      for (const values of args.filter(values => values[1] === 'update' && values[2] === 'scribe@rexia-scribe')) {
        assert.deepEqual(values.slice(-2), ['--scope', 'user']);
      }
      assert.equal(args.filter(values => values[1] === 'list' && values[2] === '--json').length, 2);
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

windowsTest('PowerShell 5.1 and 7 upgrade the marketplace default plugin source and install a new marketplace plugin', async t => {
  for (const shell of ['5.1', '7']) {
    await t.test(`PowerShell ${shell}`, async t2 => {
      const fixture = await makeFixture(shell);
      t2.after(() => rm(fixture.root, { recursive: true, force: true }));
      const result = runSetup(fixture, { SCRIBE_TEST_HELPER_MODE: 'valid', SCRIBE_TEST_MARKETPLACE_MODE: 'missing', SCRIBE_TEST_PLUGIN_LIST_MODE: 'folder-current' });
      assert.equal(result.status, 0, diagnostic(result, fixture));
      const calls = (await recordedCalls(fixture.logPath)).filter(call => call.kind === 'ARGS').map(call => call.value.split('\u001f'));
      assert.deepEqual(calls.map(values => values.slice(0, 3)), [
        ['plugin', 'marketplace', 'list'],
        ['plugin', 'install', 'scribe'],
        ['plugin', 'update', 'scribe@rexia-scribe'],
        ['plugin', 'list', '--json'],
        ['plugin', 'configure', 'scribe@rexia-scribe'],
      ]);
      assert.ok(calls[1].includes('--marketplace'));
    });
  }
});

windowsTest('PowerShell 5.1 and 7 refuse stale, disabled, ambiguous, missing, malformed, or incompatible plugin inventory', async t => {
  const cases = [
    ['5.1', 'old', /plugin version check/, /marketplace did not provide an enabled Scribe plugin at version 0\.1\.1/i],
    ['5.1', 'disabled', /plugin version check/, /marketplace did not provide an enabled Scribe plugin at version 0\.1\.1/i],
    ['5.1', 'folder-old', /plugin version check/, /marketplace did not provide an enabled Scribe plugin at version 0\.1\.1/i],
    ['5.1', 'duplicate', /plugin version check/, /multiple user-scope Scribe plugins/i],
    ['7', 'missing', /plugin version check/, /marketplace did not provide plugin version 0\.1\.1/i],
    ['7', 'wrong-scope', /plugin version check/, /marketplace did not provide plugin version 0\.1\.1/i],
    ['7', 'envelope', /plugin version check/, /did not provide a valid plugin list/i],
    ['7', 'malformed', /plugin version check/, /did not provide a valid plugin list/i],
    ['7', 'trailing-composite', /plugin version check/, /did not provide a valid plugin list/i],
  ];
  for (const [shell, mode, stage, reason] of cases) {
    await t.test(`PowerShell ${shell} ${mode}`, async t2 => {
      const fixture = await makeFixture(shell);
      t2.after(() => rm(fixture.root, { recursive: true, force: true }));
      const result = runSetup(fixture, { SCRIBE_TEST_HELPER_MODE: 'valid', SCRIBE_TEST_PLUGIN_LIST_MODE: mode });
      assert.equal(result.status, 1, diagnostic(result, fixture));
      assert.match(result.stderr, stage, diagnostic(result, fixture));
      assert.match(result.stderr, reason, diagnostic(result, fixture));
      assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /SYNTHETIC_(?:CLI_SECRET|INSTALL_PATH|BEARER|INDEPENDENT_HOOK_KEY)/);
      const calls = (await recordedCalls(fixture.logPath)).filter(call => call.kind === 'ARGS').map(call => call.value.split('\u001f'));
      assert.equal(calls.some(values => values[1] === 'configure'), false);
    });
  }
});

windowsTest('PowerShell 5.1 and 7 report marketplace and plugin command failures without leaking CLI output', async t => {
  const cases = [
    ['fail-marketplace-update', 'marketplace update'],
    ['fail-plugin-update', 'plugin update'],
    ['fail-plugin-list', 'plugin version check'],
  ];
  for (const shell of ['5.1', '7']) {
    for (const [mode, stage] of cases) {
      await t.test(`PowerShell ${shell} ${mode}`, async t2 => {
        const fixture = await makeFixture(shell);
        t2.after(() => rm(fixture.root, { recursive: true, force: true }));
        const result = runSetup(fixture, { SCRIBE_TEST_HELPER_MODE: 'valid', SCRIBE_TEST_CLI_MODE: mode });
        assert.equal(result.status, 1, diagnostic(result, fixture));
        assert.ok(result.stderr.includes(`${stage} (exit code 42)`), diagnostic(result, fixture));
        assert.match(result.stderr, /CLI output was withheld/);
        assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /SYNTHETIC_CLI_SECRET|SYNTHETIC_INSTALL_PATH|SYNTHETIC_BEARER|SYNTHETIC_INDEPENDENT_HOOK_KEY/);
        const calls = (await recordedCalls(fixture.logPath)).filter(call => call.kind === 'ARGS').map(call => call.value.split('\u001f'));
        assert.equal(calls.some(values => values[1] === 'configure'), false);
      });
    }
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
