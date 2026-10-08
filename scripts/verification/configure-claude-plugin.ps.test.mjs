import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  const env = {
    SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
    WINDIR: process.env.WINDIR ?? process.env.SystemRoot ?? 'C:\\Windows',
    TEMP: root,
    TMP: root,
    LOCALAPPDATA: localAppData,
    APPDATA: appData,
    PATH: fakeBin,
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
    SCRIBE_TEST_LOG: logPath,
  };
  return { root, appData, fakeBin, helperPath, logPath, powershell, scriptPath, env };
}

function runSetup(fixture, extraEnv = {}) {
  return spawnSync(fixture.powershell, ['-NoProfile', '-File', fixture.scriptPath], {
    cwd: process.cwd(),
    env: { ...fixture.env, ...extraEnv },
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
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
      assert.equal(result.status, 1, result.stderr);
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
        assert.equal(result.status, 0, `${result.stderr}\n${JSON.stringify(await recordedCalls(fixture.logPath))}`);
        assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /SYNTHETIC_BEARER|SYNTHETIC_HOOK_KEY/);
      }
      const calls = await recordedCalls(fixture.logPath);
      const args = calls.filter(call => call.kind === 'ARGS').map(call => call.value.split('\u001f'));
      const configPayloads = calls.filter(call => call.kind === 'STDIN').map(call => JSON.parse(call.value));
      assert.equal(args.filter(values => values[2] === 'list').length, 2);
      assert.equal(args.filter(values => values[1] === 'install').length, 2);
      assert.equal(configPayloads.length, 2);
      for (const values of args.filter(values => values[1] === 'install')) {
        assert.deepEqual(values.slice(-2), ['--config', `client_path=${fixture.helperPath}`]);
        assert.doesNotMatch(values.join(' '), /SYNTHETIC_BEARER|SYNTHETIC_INDEPENDENT_HOOK_KEY|\bport=/);
      }
      for (const payload of configPayloads) {
        assert.deepEqual(Object.keys(payload), ['client_path']);
        assert.equal(payload.client_path, fixture.helperPath);
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
      assert.equal(result.status, 1, result.stderr);
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
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /MCP helper capability check \(timeout\)/);
      assert.match(result.stderr, /Update the Scribe app and helper together/);
      assert.ok(Date.now() - started < 10000, 'helper check must have a short deadline');
      assert.deepEqual(await recordedCalls(fixture.logPath), []);
    });
  }
});
