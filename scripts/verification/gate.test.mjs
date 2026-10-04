import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { EVENTS } from './lib.mjs';

test('fixture gate rejects incomplete and malformed evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scribe-fixture-gate-'));
  const cli = resolve('scripts/verification/check-fixtures.mjs');
  try {
    let result = spawnSync(process.execPath, [cli, root], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /PermissionRequest: 0\/2 MISSING/);
    for (const event of EVENTS) {
      const dir = join(root, 'app/src-tauri/tests/fixtures/hooks', event);
      await mkdir(dir, { recursive: true });
      const payload = { hook_event_name: event, session_id: 'synthetic-test-only', cwd: '/test' };
      await writeFile(join(dir, 'synthetic-1.json'), JSON.stringify(payload));
      await writeFile(join(dir, 'synthetic-2.json'), JSON.stringify(payload));
    }
    result = spawnSync(process.execPath, [cli, root], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    await writeFile(join(root, 'app/src-tauri/tests/fixtures/hooks/PermissionRequest/synthetic-1.json'), '{}');
    result = spawnSync(process.execPath, [cli, root], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid capture/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
