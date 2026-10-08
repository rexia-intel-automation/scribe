import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createBuildPlan } from '../build-distribution.mjs';
import { collectReleaseArtifacts, validateReleaseTag } from '../prepare-release.mjs';

const sourceSha = '0123456789abcdef0123456789abcdef01234567';
const version = '0.1.0';
const artifactNames = {
  windows: ['Scribe_0.1.0_x64-setup.exe', 'Scribe_0.1.0_x64_en-US.msi'],
  macos: ['Scribe_0.1.0_universal.dmg'],
  linux: ['scribe_0.1.0_amd64.deb', 'scribe_0.1.0_amd64.AppImage'],
};

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'scribe-release-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const inputRoot = join(root, 'input');
  mkdirSync(inputRoot);
  for (const platform of ['windows', 'macos', 'linux']) {
    const dir = join(inputRoot, `release-${platform}`);
    mkdirSync(dir);
    const plan = createBuildPlan(platform);
    const lines = [];
    for (const name of artifactNames[platform]) {
      const content = Buffer.from(`${platform}:${name}`);
      writeFileSync(join(dir, name), content);
      lines.push(`${createHash('sha256').update(content).digest('hex')}  ${name}`);
    }
    writeFileSync(join(dir, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`, 'utf8');
    writeFileSync(join(dir, 'BUILD-METADATA.txt'), [
      `source_sha=${sourceSha}`,
      `platform=${platform}`,
      `target=${plan.target}`,
      `bundles=${plan.artifacts.join(',')}`,
      `version=${version}`,
      '',
    ].join('\n'), 'utf8');
  }
  return { root, inputRoot, outputDir: join(root, 'output') };
}

function collect(paths, overrides = {}) {
  return collectReleaseArtifacts({
    inputRoot: paths.inputRoot,
    outputDir: paths.outputDir,
    tag: `v${version}`,
    sourceSha,
    ...overrides,
  });
}

test('release tag validation accepts stable and prerelease SemVer but requires exact package versions', () => {
  const versions = { app: '0.1.0-beta.1', desktop: '0.1.0-beta.1', plugin: '0.1.0-beta.1' };
  assert.deepEqual(validateReleaseTag('v0.1.0-beta.1', versions), {
    tag: 'v0.1.0-beta.1', version: '0.1.0-beta.1', prerelease: true,
  });
  assert.deepEqual(validateReleaseTag('v1.2.3', { app: '1.2.3', desktop: '1.2.3', plugin: '1.2.3' }), {
    tag: 'v1.2.3', version: '1.2.3', prerelease: false,
  });
  for (const tag of ['0.1.0', 'v01.2.3', 'v1.02.3', 'v1.2.3+build.1', 'v1.2', 'v1.2.3-01']) {
    assert.throws(() => validateReleaseTag(tag, versions), /tag/);
  }
  assert.throws(() => validateReleaseTag('v0.1.0-beta.1', { ...versions, plugin: '0.1.0' }), /exactly match/);
});

test('validate-tag CLI reports the checked version, prerelease, and normalized source SHA', () => {
  const script = fileURLToPath(new URL('../prepare-release.mjs', import.meta.url));
  const output = execFileSync(process.execPath, [script, 'validate-tag', '--tag', 'v0.1.0', '--source-sha', sourceSha.toUpperCase()], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), {
    tag: 'v0.1.0', version: '0.1.0', prerelease: false, sourceSha,
  });
  assert.throws(() => execFileSync(process.execPath, [script, 'validate-tag', '--tag', 'v0.2.0', '--source-sha', sourceSha], { encoding: 'utf8', stdio: 'pipe' }));
});

test('collect validates all three platform manifests, copies only release inputs, and writes checksums', (t) => {
  const paths = fixture(t);
  const result = collect(paths);
  assert.equal(result.tag, 'v0.1.0');
  assert.equal(result.sourceSha, sourceSha);
  assert.equal(result.files.length, 10);
  for (const name of [...artifactNames.windows, ...artifactNames.macos, ...artifactNames.linux,
    'README.md', 'README.pt-BR.md', 'LICENSE', 'configure-claude-plugin.ps1', 'teste-equipe-ti.md']) {
    assert.ok(result.files.includes(name));
  }
  const sums = readFileSync(join(paths.outputDir, 'SHA256SUMS.txt'));
  assert.equal(sums.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
  assert.equal(sums.includes(0x0d), false);
  assert.equal(sums.at(-1), 0x0a);
  const lines = sums.toString('utf8').trimEnd().split('\n');
  assert.equal(lines.length, 10);
  for (const line of lines) {
    const [digest, filename] = line.split('  ');
    assert.equal(digest, createHash('sha256').update(readFileSync(join(paths.outputDir, filename))).digest('hex'));
  }
  const metadata = readFileSync(join(paths.outputDir, 'BUILD-METADATA.txt'), 'utf8');
  assert.match(metadata, /^tag=v0\.1\.0$/m);
  assert.match(metadata, /^status=unsigned$/m);
  const notes = readFileSync(join(paths.outputDir, 'RELEASE-NOTES.md'), 'utf8');
  assert.match(notes, /unsigned and have not been notarized/);
  assert.match(notes, /does not claim human acceptance/);
  assert.throws(() => collect(paths), /already exists/);
});

test('collect rejects tampered file hashes, version metadata, unsafe manifest paths, and partial platforms', (t) => {
  const badHash = fixture(t);
  writeFileSync(join(badHash.inputRoot, 'release-windows', artifactNames.windows[0]), 'tampered');
  assert.throws(() => collect(badHash), /SHA-256 mismatch/);

  const badVersion = fixture(t);
  const metadataPath = join(badVersion.inputRoot, 'release-macos', 'BUILD-METADATA.txt');
  writeFileSync(metadataPath, readFileSync(metadataPath, 'utf8').replace('version=0.1.0', 'version=0.2.0'));
  assert.throws(() => collect(badVersion), /does not match/);

  const unsafe = fixture(t);
  writeFileSync(join(unsafe.inputRoot, 'release-linux', 'SHA256SUMS.txt'), `${'0'.repeat(64)}  ../escape.deb\n`);
  assert.throws(() => collect(unsafe), /invalid path or duplicate/);

  for (const unsafeName of ['-package.deb', 'package\tname.deb', 'package\nname.deb']) {
    const invalidName = fixture(t);
    const invalidSums = join(invalidName.inputRoot, 'release-linux', 'SHA256SUMS.txt');
    writeFileSync(invalidSums, `${'0'.repeat(64)}  ${unsafeName}\n`);
    assert.throws(() => collect(invalidName), /invalid path or duplicate/);
  }

  const partial = fixture(t);
  rmSync(join(partial.inputRoot, 'release-macos', artifactNames.macos[0]));
  assert.throws(() => collect(partial), /must contain exactly/);
});

test('collect rejects extra/duplicate entries and malformed metadata or checksum encoding', (t) => {
  const extra = fixture(t);
  writeFileSync(join(extra.inputRoot, 'release-linux', 'debug.log'), 'not a bundle');
  assert.throws(() => collect(extra), /must contain exactly/);

  const duplicate = fixture(t);
  const sumsPath = join(duplicate.inputRoot, 'release-windows', 'SHA256SUMS.txt');
  const sums = readFileSync(sumsPath, 'utf8');
  writeFileSync(sumsPath, `${sums}${sums.split('\n')[0]}\n`);
  assert.throws(() => collect(duplicate), /invalid path or duplicate/);

  const bom = fixture(t);
  const linuxSums = join(bom.inputRoot, 'release-linux', 'SHA256SUMS.txt');
  writeFileSync(linuxSums, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), readFileSync(linuxSums)]));
  assert.throws(() => collect(bom), /without BOM/);
});
