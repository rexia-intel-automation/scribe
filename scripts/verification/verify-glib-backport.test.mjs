import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

function isolatedGuard(change) {
  const parent = realpathSync(tmpdir());
  const fixture = mkdtempSync(path.join(parent, 'scribe-glib-guard-'));
  try {
    for (const relative of [
      'vendor', 'app/src-tauri/Cargo.toml', 'app/src-tauri/Cargo.lock',
      'app/src-tauri/tauri.distribution.conf.json',
      'scripts/verification/verify-glib-backport.mjs',
    ]) {
      const destination = path.join(fixture, relative);
      mkdirSync(path.dirname(destination), { recursive: true });
      cpSync(path.join(root, relative), destination, { recursive: true });
    }
    change?.(fixture);
    return spawnSync(process.execPath, [path.join(fixture, 'scripts/verification/verify-glib-backport.mjs')], { encoding: 'utf8' });
  } finally {
    assert.equal(path.dirname(realpathSync(fixture)), parent);
    assert(path.basename(fixture).startsWith('scribe-glib-guard-'));
    rmSync(fixture, { recursive: true });
  }
}

test('verified upstream backport resolves locally and carries its licenses', () => {
  const result = isolatedGuard();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /121 source files verified/);
});

test('reintroducing the original immutable FFI out-pointer fails integrity', () => {
  const result = isolatedGuard((fixture) => {
    const file = path.join(fixture, 'vendor/glib-0.18.5/src/variant_iter.rs');
    const vulnerable = readFileSync(file, 'utf8')
      .replace('let mut p: *mut libc::c_char', 'let p: *mut libc::c_char')
      .replace('                &mut p,', '                &p,');
    writeFileSync(file, vulnerable);
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /src\/variant_iter\.rs/);
});

test('a lockfile selecting the unpatched registry crate fails the guard', () => {
  const result = isolatedGuard((fixture) => {
    const file = path.join(fixture, 'app/src-tauri/Cargo.lock');
    writeFileSync(file, readFileSync(file, 'utf8').replace(
      'name = "glib"\nversion = "0.18.5"',
      'name = "glib"\nversion = "0.18.5"\nsource = "registry+https://github.com/rust-lang/crates.io-index"',
    ));
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must resolve to the local security backport/);
});
