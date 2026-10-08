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
const version = JSON.parse(readFileSync(new URL('../../app/src-tauri/tauri.conf.json', import.meta.url), 'utf8')).version;
const pluginVersion = JSON.parse(readFileSync(new URL('../../plugins/scribe/.claude-plugin/plugin.json', import.meta.url), 'utf8')).version;
const tag = `v${version}`;
const versionParts = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
const differentValidTag = `v${versionParts[1]}.${versionParts[2]}.${Number(versionParts[3]) + 1}`;
const artifactNames = {
  windows: [`Scribe_${version}_x64-setup.exe`, `Scribe_${version}_x64_en-US.msi`],
  macos: [`Scribe_${version}_universal.dmg`],
  linux: [`scribe_${version}_amd64.deb`, `scribe_${version}_amd64.AppImage`],
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
    tag,
    sourceSha,
    ...overrides,
  });
}

test('release tag pins app and desktop versions and records independently versioned plugin', () => {
  const versions = { app: '0.1.0-beta.1', desktop: '0.1.0-beta.1', plugin: '0.1.0-beta.1' };
  assert.deepEqual(validateReleaseTag('v0.1.0-beta.1', versions), {
    tag: 'v0.1.0-beta.1', version: '0.1.0-beta.1', pluginVersion: '0.1.0-beta.1', prerelease: true,
  });
  assert.deepEqual(validateReleaseTag('v1.2.3', { app: '1.2.3', desktop: '1.2.3', plugin: '1.2.3' }), {
    tag: 'v1.2.3', version: '1.2.3', pluginVersion: '1.2.3', prerelease: false,
  });
  assert.deepEqual(validateReleaseTag('v0.1.0', { app: '0.1.0', desktop: '0.1.0', plugin: '0.1.1' }), {
    tag: 'v0.1.0', version: '0.1.0', pluginVersion: '0.1.1', prerelease: false,
  });
  for (const tag of ['0.1.0', 'v01.2.3', 'v1.02.3', 'v1.2.3+build.1', 'v1.2', 'v1.2.3-01']) {
    assert.throws(() => validateReleaseTag(tag, versions), /tag/);
  }
  for (const name of ['app', 'desktop']) {
    assert.throws(() => validateReleaseTag('v0.1.0-beta.1', { ...versions, [name]: '0.1.0' }), /exactly match/);
  }
  for (const plugin of [undefined, '', '0.1', '0.1.1\n', '0.1.1+local', '0.1.1-01']) {
    assert.throws(() => validateReleaseTag('v0.1.0-beta.1', { ...versions, plugin }), /plugin/);
  }
  const newlineVersions = { app: '0.1.0\n', desktop: '0.1.0\n', plugin: '0.1.0\n' };
  assert.throws(() => validateReleaseTag('v0.1.0\n', newlineVersions), /supported SemVer/);
  const tabVersions = { app: '0.1.0\t', desktop: '0.1.0\t', plugin: '0.1.0\t' };
  assert.throws(() => validateReleaseTag('v0.1.0\t', tabVersions), /supported SemVer/);
});

test('validate-tag CLI reports the checked version, prerelease, and normalized source SHA', () => {
  const script = fileURLToPath(new URL('../prepare-release.mjs', import.meta.url));
  const output = execFileSync(process.execPath, [script, 'validate-tag', '--tag', tag, '--source-sha', sourceSha.toUpperCase()], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), {
    tag, version, pluginVersion,
    prerelease: version.includes('-'), sourceSha,
  });
  assert.throws(() => execFileSync(process.execPath, [script, 'validate-tag', '--tag', differentValidTag, '--source-sha', sourceSha], { encoding: 'utf8', stdio: 'pipe' }));
});

test('collect validates all three platform manifests, copies only release inputs, and writes checksums', (t) => {
  const paths = fixture(t);
  const result = collect(paths);
  assert.equal(result.tag, tag);
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
  assert.ok(metadata.split('\n').includes(`tag=${tag}`));
  assert.match(metadata, /^status=unsigned$/m);
  assert.ok(metadata.split('\n').includes(`plugin_version=${pluginVersion}`));
  const notes = readFileSync(join(paths.outputDir, 'RELEASE-NOTES.md'), 'utf8');
  assert.ok(notes.includes(`Claude Code plugin version: \`${pluginVersion}\``));
  assert.match(notes, /unsigned and have not been notarized/);
  assert.match(notes, /does not claim human acceptance/);
  assert.ok(notes.includes(`https://github.com/rexia-intel-automation/scribe/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent('SHA256SUMS.txt')}`));
  assert.throws(() => collect(paths), /already exists/);
});

test('collect rejects tampered file hashes, version metadata, unsafe manifest paths, and partial platforms', (t) => {
  const badHash = fixture(t);
  writeFileSync(join(badHash.inputRoot, 'release-windows', artifactNames.windows[0]), 'tampered');
  assert.throws(() => collect(badHash), /SHA-256 mismatch/);

  const badVersion = fixture(t);
  const metadataPath = join(badVersion.inputRoot, 'release-macos', 'BUILD-METADATA.txt');
  writeFileSync(metadataPath, readFileSync(metadataPath, 'utf8').replace(`version=${version}`, `version=${differentValidTag.slice(1)}`));
  assert.throws(() => collect(badVersion), /does not match/);

  const badSourceSha = fixture(t);
  const windowsMetadata = join(badSourceSha.inputRoot, 'release-windows', 'BUILD-METADATA.txt');
  writeFileSync(windowsMetadata, readFileSync(windowsMetadata, 'utf8').replace(sourceSha, 'f'.repeat(40)));
  assert.throws(() => collect(badSourceSha), /does not match/);

  const badTarget = fixture(t);
  const linuxMetadata = join(badTarget.inputRoot, 'release-linux', 'BUILD-METADATA.txt');
  writeFileSync(linuxMetadata, readFileSync(linuxMetadata, 'utf8').replace('x86_64-unknown-linux-gnu', 'aarch64-unknown-linux-gnu'));
  assert.throws(() => collect(badTarget), /does not match/);

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

  const missingPlatform = fixture(t);
  rmSync(join(missingPlatform.inputRoot, 'release-macos'), { recursive: true });
  assert.throws(() => collect(missingPlatform), /Missing regular platform directory/);
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
