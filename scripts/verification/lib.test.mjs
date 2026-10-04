import test from 'node:test';
import assert from 'node:assert/strict';
import { anonymize, redact, hookSettings, EVENTS, validProbeHeaders } from './lib.mjs';

test('credentials and env assignments are redacted', () => {
  for (const secret of ['sk-abc123', 'ghp_abc123', 'xoxb-123-secret', 'AKIA1234567890ABCDEF', 'eyJabc.def.ghi']) {
    assert.equal(redact(secret), '[content omitted]');
  }
  assert.equal(redact('Authorization: Bearer private\npassword=private token=private'), '[content omitted]');
  assert.equal(redact('FOO=private\nBAR=private'), '[content omitted]');
  assert.equal(redact(''), '');
});

test('payload content and complete environment never reach evidence', () => {
  const safe = anonymize({ session_id: 'real-session', cwd: 'C:\\Users\\someone\\project',
    prompt: 'sensitive conversation', tool_response: { arbitrary: 'secret' },
    tool_input: { token: 'private', env: { SOMETHING: 'private' }, content: 'private' } });
  assert.doesNotMatch(JSON.stringify(safe), /private|someone|sensitive conversation|real-session/);
  assert.equal(safe.tool_response, '[content omitted]');
});

test('anonymized identifiers preserve relationships without preserving originals', () => {
  assert.equal(anonymize('session-a', 'session_id'), anonymize('session-a', 'session_id'));
  assert.notEqual(anonymize('session-a', 'session_id'), anonymize('session-b', 'session_id'));
  assert.equal(redact('session 12345678-1234-1234-1234-123456789012'), '[content omitted]');
  assert.match(anonymize('C:\\Users\\someone\\12345678-1234-1234-1234-123456789012.jsonl', 'transcript_path'), /\/transcript\.jsonl$/);
});

test('path basenames redact credentials, emails, and literal UUIDs', () => {
  const safe = anonymize({ tool_input: { file_path: '/tmp/sk-testprivate123.txt' },
    cwd: '/home/person/person@example.com', transcript_path: '/tmp/12345678-1234-1234-1234-123456789012.jsonl' });
  assert.doesNotMatch(JSON.stringify(safe), /sk-testprivate123|person@example\.com|12345678-1234/);
  for (const name of ['backup_sk-testprivate123.txt', 'backup_ghp_testprivate123.txt', 'arbitrary-private-name.txt']) {
    const path = anonymize('/tmp/' + name, 'file_path');
    assert.doesNotMatch(path, /testprivate|arbitrary-private/);
    assert.equal(anonymize(path, 'file_path', true), path);
  }
});

test('inline environment values and quoted credentials are redacted', () => {
  for (const command of [
    'env COMPANY_CREDENTIAL=synthetic-private node build.js',
    'env PUBLIC_LABEL="synthetic private value" node build.js',
    "env PUBLIC_LABEL='synthetic private value' node build.js",
    'echo {"token":"synthetic-private","password":"synthetic-private"}',
    'echo {"access_token":"synthetic-private","db_password":"synthetic-private"}',
    'echo "{\\"token\\":\\"synthetic-private\\"}"',
    'echo arbitrary-private-content',
  ]) {
    assert.equal(anonymize(command, 'command'), '[content omitted]');
  }
});

test('credential patterns cover embedded prefixes and compound or escaped JSON keys', () => {
  for (const text of [
    'backup_sk-testprivate123.txt', 'backup_ghp_testprivate123.txt',
    '{"access_token":"synthetic-private","db_password":"synthetic-private"}',
    '{\\"token\\":\\"synthetic-private\\"}',
  ]) assert.doesNotMatch(redact(text), /testprivate|synthetic-private/);
});

test('probe headers reject wrong host, absent token, wrong token and every Origin including empty', () => {
  const headers = { host: '127.0.0.1:7717', authorization: 'Bearer test' };
  assert.equal(validProbeHeaders(headers, 7717, 'test'), true);
  for (const origin of ['', 'null', 'https://attacker.example']) {
    assert.equal(validProbeHeaders({ ...headers, origin }, 7717, 'test'), false);
  }
  assert.equal(validProbeHeaders({ ...headers, host: 'attacker.example' }, 7717, 'test'), false);
  assert.equal(validProbeHeaders({ host: headers.host }, 7717, 'test'), false);
  assert.equal(validProbeHeaders({ ...headers, authorization: 'Bearer fail' }, 7717, 'test'), false);
});

test('HTTP capture configuration has every required event and cannot grant permission', () => {
  const settings = hookSettings(7717);
  assert.deepEqual(Object.keys(settings.hooks), EVENTS);
  for (const entries of Object.values(settings.hooks)) {
    const hook = entries[0].hooks[0];
    assert.equal(hook.type, 'http');
    assert.equal(hook.timeout, 1);
    assert.deepEqual(hook.allowedEnvVars, ['SCRIBE_PROBE_TOKEN']);
    assert.match(hook.url, /^http:\/\/127\.0\.0\.1:7717\/v1\/hooks\//);
    assert.equal(hook.headers.Authorization, 'Bearer $SCRIBE_PROBE_TOKEN');
  }
  assert.doesNotMatch(JSON.stringify(settings), /updatedPermissions|behavior|permissionDecision/);
});

test('free text is omitted regardless of credential syntax, escapes or field name', () => {
  for (const description of [
    JSON.stringify({ db_password: 'SYNTHETIC_A"SYNTHETIC_B' }),
    'password: "SYNTHETIC_C SYNTHETIC_D"',
    'arbitrary SYNTHETIC_PRIVATE_TEXT without a credential prefix',
  ]) {
    assert.equal(anonymize(description, 'description'), '[content omitted]');
    assert.equal(redact(description), '[content omitted]');
  }
  const safe = anonymize({ tool_input: { description: { password: 123456 },
    SYNTHETIC_PRIVATE_KEY: 'SYNTHETIC_PRIVATE_VALUE' } });
  assert.doesNotMatch(JSON.stringify(safe), /SYNTHETIC|123456/);
  assert.equal(safe.tool_input.description, '[content omitted]');
});

test('metadata values require explicit membership, not just a trusted key', () => {
  assert.equal(anonymize('Read', 'tool_name'), 'Read');
  assert.equal(anonymize('SessionStart', 'hook_event_name'), 'SessionStart');
  for (const key of ['tool_name', 'hook_event_name', 'source', 'reason', 'agent_type', 'level']) {
    assert.equal(anonymize('SYNTHETIC_PRIVATE_VALUE', key), '[content omitted]');
  }
});

test('enums, identifiers and paths reject unexpected scalar and container types', () => {
  for (const key of ['tool_name', 'hook_event_name', 'name', 'method', 'level',
    'session_id', 'agent_id', 'tool_use_id', 'file_path', 'cwd', 'transcript_path']) {
    for (const value of [731947204681, true, null, [731947204681], { name: 731947204681 }]) {
      assert.equal(anonymize(value, key), '[content omitted]', key);
    }
  }
  assert.equal(anonymize(1, 'limit'), 1);
  assert.equal(anonymize(300, 'duration_ms'), 300);
  assert.equal(anonymize(false, 'stop_hook_active'), false);
  assert.equal(anonymize(731947204681, 'options'), '[content omitted]');
  assert.equal(anonymize(731947204681, 'limit'), '[content omitted]');
});
