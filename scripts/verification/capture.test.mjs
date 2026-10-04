import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { anonymize, EVENTS, validProbeHeaders } from './lib.mjs';

test('real capture handler writes contracts without sensitive command or basename content', async () => {
  // Exercise the original callback with writes intercepted in memory. These are
  // synthetic attacks, never published fixtures or real Claude captures.
  const source = await readFile(new URL('./capture.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('const server = createServer');
  const end = source.indexOf('\nawait new Promise((ok, fail) =>', start);
  assert.ok(start >= 0 && end > start);
  const writes = [];
  const server = new Function('createServer', 'validProbeHeaders', 'token', 'EVENTS',
    'join', 'fixtureRoot', 'runId', 'mkdir', 'writeFile', 'anonymize', 'captured',
    'sequence', source.slice(start, end) + '\nreturn server;')(
    createServer, validProbeHeaders, 'TEST', EVENTS, join, 'memory-only',
    'synthetic-regression', async () => {}, async (path, body) => writes.push({ path, body }),
    anonymize, [], 0);
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const port = server.address().port;
  try {
    const attacks = [
      { file_path: '/tmp/backup_sk-testprivate123.txt' },
      { file_path: '/tmp/backup_ghp_testprivate123.txt' },
      { file_path: '/tmp/arbitrary-private-name.txt' },
      { command: 'echo {"access_token":"synthetic-private","db_password":"synthetic-private"}' },
      { command: 'echo "{\\"token\\":\\"synthetic-private\\"}"' },
      { command: 'echo arbitrary-private-content' },
      { description: JSON.stringify({ db_password: 'SYNTHETIC_A"SYNTHETIC_B' }) },
      { description: 'password: "SYNTHETIC_C SYNTHETIC_D"' },
      { description: 'SYNTHETIC_PRIVATE_TEXT', SYNTHETIC_PRIVATE_KEY: 'SYNTHETIC_PRIVATE_VALUE' },
      { _meta: { clientInfo: { name: 731947204681 } } },
      { _meta: { clientInfo: { name: [731947204681] } } },
      { _meta: { clientInfo: { name: { name: 731947204681 } } } },
      { file_path: 731947204681, agent_id: [731947204681] },
    ];
    for (const tool_input of attacks) {
      const response = await fetch(`http://127.0.0.1:${port}/v1/hooks/PermissionRequest`, {
        method: 'POST', headers: { Authorization: 'Bearer TEST' },
        body: JSON.stringify({ hook_event_name: 'PermissionRequest',
          session_id: 'synthetic-session', cwd: '/test', tool_input }),
      });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), '');
    }
    assert.equal(writes.length, attacks.length);
    for (const { body } of writes) {
      assert.doesNotMatch(body, /731947204681|SYNTHETIC|testprivate|synthetic-private|arbitrary-private|synthetic-session|behavior|updatedPermissions/);
      const payload = JSON.parse(body);
      assert.equal(payload.hook_event_name, 'PermissionRequest');
      assert.match(payload.session_id, /^session_id-[a-f0-9]{12}$/);
      assert.equal(typeof payload.cwd, 'string');
      assert.equal(typeof payload.tool_input, 'object');
    }
  } finally {
    server.closeAllConnections();
    await new Promise(ok => server.close(ok));
  }
});
