import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

test('original CLI runner clears its deadline after spawn failure, normal exit and timeout', async () => {
  const source = await readFile(new URL('./plugin-install.mjs', import.meta.url), 'utf8');
  const body = source.match(/async function run\(label, args, stdin = ''\) \{([\s\S]+?)\n\}\n\nlet registered/)[1];
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  for (const mode of ['missing', 'exit', 'timeout']) {
    const active = new Set();
    let cleared = 0;
    const deadline = callback => {
      const handle = setTimeout(callback, mode === 'timeout' ? 100 : 5000);
      active.add(handle);
      return handle;
    };
    const clear = handle => { active.delete(handle); cleared++; clearTimeout(handle); };
    const cli = [];
    const run = new AsyncFunction('label', 'args', 'stdin', 'sessionSettings', 'performance',
      'spawn', 'workspace', 'connectionFile', 'process', 'setTimeout', 'clearTimeout',
      'redact', 'cli', 'console', body);
    const spawnProbe = (_command, _args, options) => spawn(
      mode === 'missing' ? 'scribe-public-test-nonexistent-executable' : process.execPath,
      ['-e', mode === 'timeout' ? 'setInterval(() => {}, 1000)' : 'process.exit(0)'], options);
    try {
      const result = run('PUBLIC TEST', [], '', undefined, performance, spawnProbe,
        process.cwd(), 'PUBLIC CONFIG PATH', process, deadline, clear,
        () => '[content omitted]', cli, { log() {} });
      if (mode === 'missing') await assert.rejects(result, { code: 'ENOENT' });
      else if (mode === 'timeout') await assert.rejects(result, /CLI PUBLIC TEST failed/);
      else await result;
      assert.equal(active.size, 0, `${mode}: deadline must not retain the process`);
      assert.equal(cleared, 1);
      assert.equal(cli.length, mode === 'missing' ? 0 : 1);
    } finally {
      for (const handle of active) clearTimeout(handle);
    }
  }
});
