import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { EVENTS } from './lib.mjs';

// The gate deliberately fails when real captures are absent. No fabricated fallback.
const root = resolve(process.argv[2] ?? '.');
let failed = false;
for (const event of EVENTS) {
  const dir = join(root, 'app/src-tauri/tests/fixtures/hooks', event);
  const files = await readdir(dir).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const json = files.filter((file) => file.endsWith('.json'));
  let valid = 0;
  for (const file of json) {
    const payload = JSON.parse(await readFile(join(dir, file), 'utf8'));
    if (payload.hook_event_name !== event || typeof payload.session_id !== 'string' || typeof payload.cwd !== 'string') {
      throw new Error(`Invalid capture: ${event}/${file}`);
    }
    valid++;
  }
  console.log(`${event}: ${valid}/2 ${valid >= 2 ? 'OK' : 'MISSING'}`);
  if (valid < 2) failed = true;
}
process.exitCode = failed ? 1 : 0;
