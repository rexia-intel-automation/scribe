import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('historical audit removes protocol text and keys while preserving provenance and aliases', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scribe-audit-test-'));
  const fixtures = join(root, 'app/src-tauri/tests/fixtures/hooks/PermissionRequest');
  const evidence = join(root, 'docs/evidence');
  await mkdir(fixtures, { recursive: true });
  await mkdir(evidence, { recursive: true });
  const fixture = {
    hook_event_name: 'PermissionRequest', session_id: 'session_id-0123456789ab',
    cwd: '/anonymous/path-0123456789ab/[name omitted]',
    tool_name: 'Read', tool_input: { description: 'password: "SYNTHETIC_C SYNTHETIC_D"',
      SYNTHETIC_PRIVATE_KEY: 'SYNTHETIC_PRIVATE_VALUE' },
  };
  const file = 'app/src-tauri/tests/fixtures/hooks/PermissionRequest/synthetic.json';
  const record = { runId: 'synthetic-only', captured: [{ event: 'PermissionRequest', file }],
    hookSession: fixture.session_id, stdout: 'SYNTHETIC_PRIVATE_OUTPUT', stderr: '',
    calls: [{ method: 'tools/call', authenticated: true, params: { name: 'scribe_report',
      arguments: { session_id: fixture.session_id, text: 'SYNTHETIC_PRIVATE_TEXT' } } },
      { method: 731947204681 }],
    witnessEvents: [fixture] };
  await writeFile(join(fixtures, 'synthetic.json'), JSON.stringify(fixture));
  await writeFile(join(evidence, 'synthetic.json'), JSON.stringify(record));
  const cli = resolve('scripts/verification/audit-evidence.mjs');
  try {
    let result = spawnSync(process.execPath, [cli, root], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    result = spawnSync(process.execPath, [cli, root, '--rewrite'], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const safe = JSON.parse(await readFile(join(evidence, 'synthetic.json'), 'utf8'));
    assert.doesNotMatch(JSON.stringify(safe), /SYNTHETIC|731947204681/);
    assert.equal(safe.captured[0].file, file);
    assert.equal(safe.hookSession, fixture.session_id);
    assert.equal(safe.calls[0].params.arguments.session_id, fixture.session_id);
    assert.equal(safe.witnessEvents[0].cwd, fixture.cwd);
    assert.equal(safe.stderr, '');
    result = spawnSync(process.execPath, [cli, root], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /"changedFiles":0/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
