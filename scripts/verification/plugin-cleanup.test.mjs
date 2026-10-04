import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('original installer cleanup tries each official removal, closes server and saves failures independently', async () => {
  const source = await readFile(new URL('./plugin-install.mjs', import.meta.url), 'utf8');
  const body = source.match(/\} finally \{([\s\S]+?)\n\}\nconsole\.log/)[1];
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const cleanup = new AsyncFunction('installed', 'registered', 'run', 'server', 'writeFile',
    'join', 'root', 'runId', 'passed', 'installationPassed', 'executionFailed',
    'process', 'cli', 'events', 'calls', body);
  for (const failures of [['uninstall probe plugin'], ['remove probe marketplace'],
    ['uninstall probe plugin', 'remove probe marketplace'], ['save result']]) {
    const effects = [], processStub = { argv: ['--installation-only'] };
    let report;
    await cleanup(true, true, async label => {
      effects.push(label);
      if (failures.includes(label)) throw Error('PUBLIC SYNTHETIC failure');
    }, { listening: true, closeAllConnections() { effects.push('close connections'); },
      close(callback) { effects.push('close server'); callback(); } }, async (_path, content) => {
      effects.push('save result');
      if (failures.includes('save result')) throw Error('PUBLIC SYNTHETIC write failure');
      report = JSON.parse(content);
    }, (...parts) => parts.join('/'), 'public', 'public', true, true, false, processStub, [], [], []);
    assert.deepEqual(effects, ['uninstall probe plugin', 'remove probe marketplace', 'close connections', 'close server', 'save result']);
    assert.equal(processStub.exitCode, 1);
    if (report) {
      assert.equal(report.passed, false);
      assert.deepEqual(report.cleanupErrors, failures);
      assert.equal(report.modelChecksRun, false);
      assert.doesNotMatch(JSON.stringify(report), /SYNTHETIC failure/);
    }
  }
});
