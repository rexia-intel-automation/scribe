import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { anonymize, redact } from './lib.mjs';

// Preserve historical aliases and relative provenance paths while sanitizing old evidence.
const root = resolve(process.argv[2] ?? '.');
const rewrite = process.argv.includes('--rewrite');
function sanitize(value, key = '') {
  // Administrative evidence is authored by the probes. Sanitize the untrusted
  // protocol subtrees as a whole, including their keys, before preserving it.
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, 'hook_event_name')) {
    return anonymize(value, '', true);
  }
  if (key === 'params') return anonymize(value, '', true);
  if (key === 'stdout' || key === 'stderr') return redact(value);
  if (key === 'method') return anonymize(value, key);
  if (key === 'hookSession') return anonymize(value, 'session_id', true);
  if (Array.isArray(value)) return value.map((item) => sanitize(item, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v, k)]));
  }
  if (typeof value !== 'string') return value;
  return value;
}
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? files(join(dir, entry.name)) : entry.name.endsWith('.json') ? [join(dir, entry.name)] : []));
  return nested.flat();
}
let changes = 0;
for (const path of [
  ...await files(join(root, 'app/src-tauri/tests/fixtures/hooks')),
  ...await files(join(root, 'docs/evidence')),
]) {
  const original = JSON.parse(await readFile(path, 'utf8'));
  const safe = sanitize(original);
  if (JSON.stringify(original) !== JSON.stringify(safe)) {
    changes++;
    if (rewrite) await writeFile(path, JSON.stringify(safe, null, 2) + '\n');
    else console.log('Needs sanitization: ' + path);
  }
}
console.log(JSON.stringify({ rewrite, changedFiles: changes }));
if (changes && !rewrite) process.exitCode = 1;
