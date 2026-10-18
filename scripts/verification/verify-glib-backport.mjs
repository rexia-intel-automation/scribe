import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const vendor = path.join(root, 'vendor/glib-0.18.5');
const proof = JSON.parse(readFileSync(path.join(root, 'vendor/glib-0.18.5-integrity.json'), 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = (directory, prefix = '') => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  assert(!entry.isSymbolicLink(), 'Vendor source must not contain symlinks');
  const relative = prefix + entry.name;
  return entry.isDirectory() ? files(path.join(directory, entry.name), relative + '/') : [relative];
});

assert.equal(proof.crateSha256, '233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5');
assert.equal(proof.upstreamCommit, '05dff0ee696f9bcd8617cd48c4b812d046d440cb');
assert.deepEqual(files(vendor).sort(), proof.files.map((file) => file.path).sort());
for (const file of proof.files) {
  assert(!file.path.split('/').includes('..') && !path.isAbsolute(file.path));
  assert.equal(sha256(readFileSync(path.join(vendor, file.path))), file.sha256, file.path);
}
const source = readFileSync(path.join(vendor, 'src/variant_iter.rs'), 'utf8');
const original = source
  .replace('            let mut p: *mut libc::c_char = std::ptr::null_mut();', '            let p: *mut libc::c_char = std::ptr::null_mut();')
  .replace('                &mut p,', '                &p,');
assert.notEqual(original, source, 'Upstream security backport is absent');
assert.equal(sha256(original), '1fd02859333761c45321b32f28b24233446b97d0022a90d3a937ed162585b90e');
const manifest = readFileSync(path.join(root, 'app/src-tauri/Cargo.toml'), 'utf8');
assert.match(manifest, /^\[patch\.crates-io\]\r?\nglib = \{ path = "\.\.\/\.\.\/vendor\/glib-0\.18\.5" \}/m);
const locked = readFileSync(path.join(root, 'app/src-tauri/Cargo.lock'), 'utf8')
  .split('[[package]]').filter((block) => /^\s*name = "glib"\r?\n/m.test(block));
assert.equal(locked.length, 1);
assert.match(locked[0], /^version = "0\.18\.5"$/m);
assert(!/^source = /m.test(locked[0]), 'GLib must resolve to the local security backport');
const distribution = JSON.parse(readFileSync(path.join(root, 'app/src-tauri/tauri.distribution.conf.json'), 'utf8'));
assert.equal(distribution.bundle.resources['../../vendor/glib-0.18.5/LICENSE'], 'licenses/glib-LICENSE');
assert.equal(distribution.bundle.resources['../../vendor/glib-0.18.5/COPYRIGHT'], 'licenses/glib-COPYRIGHT');
console.log(`GLib 0.18.5 backport: ${proof.files.length} source files verified; only upstream VariantStrIter fix.`);
