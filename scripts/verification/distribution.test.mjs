import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createBuildPlan, defaultBundleRoot, stageMacTargetSidecars, verifyUniversalMacApp, writeArtifactMetadata } from '../build-distribution.mjs';

const sourceSha = '0123456789abcdef0123456789abcdef01234567';
const version = JSON.parse(readFileSync(new URL('../../app/src-tauri/tauri.conf.json', import.meta.url), 'utf8')).version;
const debName = `scribe_${version}_amd64.deb`;
const appImageName = `scribe_${version}_amd64.AppImage`;
const nsisName = `Scribe_${version}_x64-setup.exe`;
const msiName = `Scribe_${version}_x64_en-US.msi`;
const dmgName = `Scribe_${version}_universal.dmg`;

test('build plans declare each platform bundle and exact sidecar suffix', () => {
  assert.deepEqual(createBuildPlan('windows'), {
    platform: 'windows',
    runner: 'windows-latest',
    target: 'x86_64-pc-windows-msvc',
    sidecars: [{
      triple: 'x86_64-pc-windows-msvc',
      filename: 'scribe-hook-x86_64-pc-windows-msvc.exe',
    }],
    stagedSidecar: 'scribe-hook-x86_64-pc-windows-msvc.exe',
    bundles: ['nsis', 'msi'],
    artifacts: ['nsis', 'msi'],
  });
  const macos = createBuildPlan('macos');
  assert.equal(macos.target, 'universal-apple-darwin');
  assert.equal(macos.stagedSidecar, 'scribe-hook-universal-apple-darwin');
  assert.deepEqual(macos.sidecars.map((sidecar) => sidecar.filename), [
    'scribe-hook-aarch64-apple-darwin',
    'scribe-hook-x86_64-apple-darwin',
  ]);
  assert.deepEqual(macos.artifacts, ['dmg']);
  const linux = createBuildPlan('linux');
  assert.equal(linux.stagedSidecar, 'scribe-hook-x86_64-unknown-linux-gnu');
  assert.deepEqual(linux.artifacts, ['deb', 'appimage']);
  assert.throws(() => createBuildPlan('freebsd'), /Unsupported platform/);
  const cliPlan = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(new URL('../build-distribution.mjs', import.meta.url)),
    'plan', '--platform', 'macos',
  ], { encoding: 'utf8' }));
  assert.equal(cliPlan.target, 'universal-apple-darwin');
  assert.ok(defaultBundleRoot('macos').endsWith(join('target', 'universal-apple-darwin', 'release', 'bundle')));
  assert.ok(defaultBundleRoot('windows').endsWith(join('target', 'release', 'bundle')));
  assert.ok(defaultBundleRoot('linux').endsWith(join('target', 'release', 'bundle')));
});

test('distribution overlay enables all required bundles without changing the base config', () => {
  const base = JSON.parse(readFileSync(new URL('../../app/src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  const overlay = JSON.parse(readFileSync(new URL('../../app/src-tauri/tauri.distribution.conf.json', import.meta.url), 'utf8'));
  assert.equal(base.bundle.active, false);
  assert.equal(overlay.version, undefined, 'overlay preserves the base version');
  assert.equal(overlay.bundle.active, true);
  assert.deepEqual(overlay.bundle.targets, ['nsis', 'msi', 'app', 'dmg', 'deb', 'appimage']);
  assert.deepEqual(overlay.bundle.externalBin, ['binaries/scribe-hook']);
});

test('macOS staging provides each Tauri target-specific external sidecar', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'scribe-distribution-sidecars-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const buildDir = join(root, 'build');
  const binariesDir = join(root, 'binaries');
  mkdirSync(buildDir);
  mkdirSync(binariesDir);
  const plan = createBuildPlan('macos');
  const built = plan.sidecars.map(({ filename }) => {
    const path = join(buildDir, filename);
    writeFileSync(path, filename);
    return path;
  });

  const staged = stageMacTargetSidecars(built, plan, binariesDir);
  assert.deepEqual(staged.map((path) => path.split(/[\\/]/).at(-1)), plan.sidecars.map(({ filename }) => filename));
  assert.deepEqual(staged.map((path) => readFileSync(path, 'utf8')), plan.sidecars.map(({ filename }) => filename));
});

test('finalize copies only required bundles and writes LF UTF-8 checksums with source SHA metadata', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'scribe-distribution-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bundleRoot = join(root, 'bundle');
  const artifactDir = join(root, 'artifact');
  const linuxBundle = join(bundleRoot, 'linux');
  mkdirSync(linuxBundle, { recursive: true });
  const deb = join(linuxBundle, debName);
  const appImage = join(linuxBundle, appImageName);
  writeFileSync(deb, 'package-deb');
  writeFileSync(appImage, 'package-appimage');

  const result = writeArtifactMetadata({
    platform: 'linux', bundleRoot, artifactDir, sourceSha,
  });
  assert.deepEqual(result.artifacts.sort(), [appImageName, debName].sort());
  const sums = readFileSync(join(artifactDir, 'SHA256SUMS.txt'));
  assert.equal(sums.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false, 'checksum file has no UTF-8 BOM');
  assert.equal(sums.includes(0x0d), false, 'checksum file uses LF newlines');
  assert.equal(sums.at(-1), 0x0a, 'checksum file ends with LF');
  const lines = sums.toString('utf8').trimEnd().split('\n');
  assert.equal(lines.length, 2);
  for (const [line, filename] of [
    [lines.find((item) => item.endsWith(`  ${debName}`)), debName],
    [lines.find((item) => item.endsWith(`  ${appImageName}`)), appImageName],
  ]) {
    const expected = createHash('sha256').update(readFileSync(join(artifactDir, filename))).digest('hex');
    assert.equal(line, `${expected}  ${filename}`);
  }
  const metadata = readFileSync(join(artifactDir, 'BUILD-METADATA.txt'), 'utf8');
  assert.match(metadata, new RegExp(`^source_sha=${sourceSha}$`, 'm'));
  assert.match(metadata, /^target=x86_64-unknown-linux-gnu$/m);
  assert.ok(metadata.split('\n').includes(`version=${version}`));
});

test('finalize fails rather than emitting a partial platform artifact set', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'scribe-distribution-missing-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bundleRoot = join(root, 'bundle');
  mkdirSync(bundleRoot);
  writeFileSync(join(bundleRoot, debName), 'only-deb');
  assert.throws(() => writeArtifactMetadata({
    platform: 'linux', bundleRoot, artifactDir: join(root, 'artifact'), sourceSha,
  }), /Expected exactly one of each deb, appimage bundle/);
});

test('finalize requires both Windows installers and validates universal app paths before copying the DMG', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'scribe-distribution-platforms-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const windowsBundles = join(root, 'windows');
  mkdirSync(windowsBundles);
  writeFileSync(join(windowsBundles, nsisName), 'nsis');
  writeFileSync(join(windowsBundles, msiName), 'msi');
  assert.deepEqual(writeArtifactMetadata({
    platform: 'windows', bundleRoot: windowsBundles, artifactDir: join(root, 'windows-artifact'), sourceSha,
  }).artifacts.sort(), [nsisName, msiName].sort());

  const macBundles = join(root, 'macos');
  mkdirSync(macBundles);
  const macosDir = join(macBundles, 'macos', 'Scribe.app', 'Contents', 'MacOS');
  mkdirSync(macosDir, { recursive: true });
  writeFileSync(join(macosDir, 'scribe'), 'not a Mach-O fixture');
  writeFileSync(join(macosDir, 'scribe-hook'), 'not a Mach-O fixture');
  writeFileSync(join(macBundles, dmgName), 'universal-dmg');
  const lipoCalls = [];
  assert.deepEqual(writeArtifactMetadata({
    platform: 'macos', bundleRoot: macBundles, artifactDir: join(root, 'macos-artifact'), sourceSha,
    invoke: (command, args) => lipoCalls.push([command, args]),
  }).artifacts, [dmgName]);
  assert.deepEqual(lipoCalls, [
    ['lipo', [join(macosDir, 'scribe'), '-verify_arch', 'arm64', 'x86_64']],
    ['lipo', [join(macosDir, 'scribe-hook'), '-verify_arch', 'arm64', 'x86_64']],
  ]);
});

test('macOS verifier calls lipo for the app and sidecar and rejects missing files first', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'scribe-distribution-universal-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const macosDir = join(root, 'Scribe.app', 'Contents', 'MacOS');
  mkdirSync(macosDir, { recursive: true });
  const app = join(macosDir, 'scribe');
  const hook = join(macosDir, 'scribe-hook');
  writeFileSync(app, 'placeholder; test does not assert Mach-O architecture');
  writeFileSync(hook, 'placeholder; test does not assert Mach-O architecture');
  const calls = [];
  assert.deepEqual(verifyUniversalMacApp(root, (command, args) => calls.push([command, args])), [app, hook]);
  assert.deepEqual(calls, [
    ['lipo', [app, '-verify_arch', 'arm64', 'x86_64']],
    ['lipo', [hook, '-verify_arch', 'arm64', 'x86_64']],
  ]);

  rmSync(hook);
  calls.length = 0;
  assert.throws(() => verifyUniversalMacApp(root, (command, args) => calls.push([command, args])), /missing .*scribe-hook/);
  assert.deepEqual(calls, []);
});

test('finalize rejects malformed source commit metadata', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'scribe-distribution-sha-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.throws(() => writeArtifactMetadata({
    platform: 'linux', bundleRoot: root, artifactDir: join(root, 'artifact'), sourceSha: 'not-a-sha',
  }), /40-character Git commit SHA/);
});
