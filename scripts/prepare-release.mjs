import { createHash } from 'node:crypto';
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createBuildPlan } from './build-distribution.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const platforms = ['windows', 'macos', 'linux'];
const sourceFiles = [
  'README.md',
  'README.pt-BR.md',
  'LICENSE',
  'scripts/configure-claude-plugin.ps1',
  'docs/teste-equipe-ti.md',
];

function validSemVer(value) {
  if (typeof value !== 'string' || value.includes('+')) return false;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  if (!match || match[0] !== value) return false;
  return !match[4]?.split('.').some((identifier) => /^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith('0'));
}

export function validateReleaseTag(tag, versions) {
  if (typeof tag !== 'string' || !tag.startsWith('v')) throw new Error('tag must start with v');
  const version = tag.slice(1);
  if (!validSemVer(version)) throw new Error('tag must contain a supported SemVer version (without build metadata)');
  if (!versions || typeof versions !== 'object') throw new Error('versions are required');
  const values = ['app', 'desktop', 'plugin'].map((name) => versions[name]);
  if (values.some((value) => value !== version)) {
    throw new Error(`all package versions must exactly match ${version}`);
  }
  return { tag, version, prerelease: version.includes('-') };
}

function currentVersions(root = repoRoot) {
  const readVersion = (path) => JSON.parse(readFileSync(join(root, path), 'utf8')).version;
  return {
    app: readVersion('app/package.json'),
    desktop: readVersion('app/src-tauri/tauri.conf.json'),
    plugin: readVersion('plugins/scribe/.claude-plugin/plugin.json'),
  };
}

function validSourceSha(sourceSha) {
  if (typeof sourceSha !== 'string' || !/^[0-9a-f]{40}$/i.test(sourceSha)) {
    throw new Error('sourceSha must be a 40-character Git commit SHA');
  }
  return sourceSha.toLowerCase();
}

function strictText(path) {
  const bytes = readFileSync(path);
  if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) || bytes.includes(0x0d)) {
    throw new Error(`${basename(path)} must be UTF-8 without BOM and use LF newlines`);
  }
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error(`${basename(path)} is not valid UTF-8`);
  return text;
}

function parseKeyValue(text, filename, keys) {
  if (!text.endsWith('\n')) throw new Error(`${filename} must end with LF`);
  const result = {};
  for (const line of text.slice(0, -1).split('\n')) {
    const match = /^([a-z_]+)=([^\n]*)$/.exec(line);
    if (!match || Object.hasOwn(result, match[1]) || !keys.includes(match[1])) {
      throw new Error(`${filename} has invalid or duplicate fields`);
    }
    result[match[1]] = match[2];
  }
  if (Object.keys(result).length !== keys.length || keys.some((key) => !Object.hasOwn(result, key))) {
    throw new Error(`${filename} is missing required fields`);
  }
  return result;
}

function listFlatFiles(directory, expectedNames) {
  const rootStat = lstatSync(directory, { throwIfNoEntry: false });
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) throw new Error(`Missing regular platform directory: ${directory}`);
  const entries = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isFile()) throw new Error(`${directory} must contain regular files only`);
    if (entry.name.includes('/') || entry.name.includes('\\') || entry.name === '.' || entry.name === '..') {
      throw new Error(`Unsafe artifact path: ${entry.name}`);
    }
  }
  const names = entries.map((entry) => entry.name).sort();
  if (names.length !== expectedNames.length || expectedNames.some((name) => !names.includes(name))) {
    throw new Error(`${directory} must contain exactly ${expectedNames.join(', ')}`);
  }
  return names;
}

function expectedBundles(platform, filenames) {
  const bundles = createBuildPlan(platform).artifacts;
  const selected = new Map();
  for (const bundle of bundles) {
    const matches = filenames.filter((filename) => {
      const extension = extname(filename).toLowerCase();
      if (bundle === 'nsis') return /-setup\.exe$/i.test(filename);
      if (bundle === 'msi') return extension === '.msi';
      if (bundle === 'dmg') return extension === '.dmg';
      if (bundle === 'deb') return extension === '.deb';
      if (bundle === 'appimage') return extension === '.appimage';
      return false;
    });
    if (matches.length !== 1) throw new Error(`${platform} must provide exactly one ${bundle} artifact`);
    selected.set(bundle, matches[0]);
  }
  return [...selected.values()];
}

function checkPlatform({ inputRoot, platform, tag, version, sourceSha }) {
  const directory = join(inputRoot, `release-${platform}`);
  const directoryStat = lstatSync(directory, { throwIfNoEntry: false });
  if (!directoryStat?.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error(`Missing regular platform directory: ${directory}`);
  }
  const buildMetadata = join(directory, 'BUILD-METADATA.txt');
  const sumsPath = join(directory, 'SHA256SUMS.txt');
  const metadata = parseKeyValue(strictText(buildMetadata), 'BUILD-METADATA.txt', [
    'source_sha', 'platform', 'target', 'bundles', 'version',
  ]);
  const plan = createBuildPlan(platform);
  if (metadata.source_sha !== sourceSha || metadata.platform !== platform || metadata.target !== plan.target
    || metadata.bundles !== plan.artifacts.join(',') || metadata.version !== version) {
    throw new Error(`BUILD-METADATA.txt does not match ${tag} ${platform} build`);
  }

  const expectedNames = ['BUILD-METADATA.txt', 'SHA256SUMS.txt'];
  const sumText = strictText(sumsPath);
  if (!sumText.endsWith('\n')) throw new Error('SHA256SUMS.txt must end with LF');
  const entries = sumText.slice(0, -1).split('\n');
  const parsed = new Map();
  for (const line of entries) {
    const match = /^([0-9a-f]{64})  ([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(line);
    if (!match || match[2].includes('..') || basename(match[2]) !== match[2] || parsed.has(match[2])) {
      throw new Error('SHA256SUMS.txt contains an invalid path or duplicate entry');
    }
    parsed.set(match[2], match[1]);
  }
  const artifactNames = [...parsed.keys()];
  const bundles = expectedBundles(platform, artifactNames);
  if (artifactNames.length !== bundles.length) throw new Error(`${platform} checksum list has extra artifacts`);
  expectedNames.push(...bundles);
  listFlatFiles(directory, expectedNames);

  for (const filename of bundles) {
    const digest = createHash('sha256').update(readFileSync(join(directory, filename))).digest('hex');
    if (parsed.get(filename) !== digest) throw new Error(`SHA-256 mismatch for ${platform}/${filename}`);
  }
  return bundles.map((filename) => ({ platform, filename, path: join(directory, filename) }));
}

function releaseNotes({ tag, version, prerelease, sourceSha, artifactNames }) {
  const status = prerelease ? 'Prerelease' : 'Release';
  const download = (filename) => `https://github.com/rexia-intel-automation/scribe/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(filename)}`;
  const links = [
    ...artifactNames.map((filename) => `[${filename}](${download(filename)})`),
    ...['README.md', 'README.pt-BR.md', 'LICENSE', 'configure-claude-plugin.ps1', 'teste-equipe-ti.md', 'SHA256SUMS.txt']
      .map((filename) => `[${filename}](${download(filename)})`),
  ];
  return `# Scribe ${tag}\n\n${status} build from source commit \`${sourceSha}\`. These artifacts are unsigned and have not been notarized. This preparation step does not claim human acceptance or certify installation.\n\nDownload the platform packages and documentation below. Verify each downloaded file against [SHA256SUMS.txt](${download('SHA256SUMS.txt')}) before use. Windows setup guidance is in [README.md](${download('README.md')}) and [README.pt-BR.md](${download('README.pt-BR.md')}).\n\nPackage version: \`${version}\`.\n\n${links.join('\n')}.\n`;
}

export function collectReleaseArtifacts({ inputRoot, outputDir, tag, sourceSha }) {
  const sourceHash = validSourceSha(sourceSha);
  const release = validateReleaseTag(tag, currentVersions());
  const resolvedInput = resolve(inputRoot);
  const resolvedOutput = resolve(outputDir);
  const outputs = [];
  for (const platform of platforms) {
    outputs.push(...checkPlatform({
      inputRoot: resolvedInput,
      platform,
      tag: release.tag,
      version: release.version,
      sourceSha: sourceHash,
    }));
  }

  const byName = new Map();
  for (const artifact of outputs) {
    if (byName.has(artifact.filename)) throw new Error(`Artifact filename collision: ${artifact.filename}`);
    byName.set(artifact.filename, artifact.path);
  }
  const sourceCopies = sourceFiles.map((relative) => ({
    filename: relative.split('/').at(-1),
    path: join(repoRoot, relative),
  }));
  for (const file of sourceCopies) {
    if (byName.has(file.filename)) throw new Error(`Artifact filename collision: ${file.filename}`);
    byName.set(file.filename, file.path);
  }

  if (lstatSync(resolvedOutput, { throwIfNoEntry: false })) {
    throw new Error(`Output directory already exists; refusing to overwrite: ${resolvedOutput}`);
  }
  const parent = dirname(resolvedOutput);
  mkdirSync(parent, { recursive: true });
  const stagingPrefix = `.scribe-release-${basename(resolvedOutput)}-`;
  const staging = mkdtempSync(join(parent, stagingPrefix));
  try {
    for (const [filename, source] of byName) copyFileSync(source, join(staging, filename));
    const checksums = [...byName.keys()].sort().map((filename) => {
      const digest = createHash('sha256').update(readFileSync(join(staging, filename))).digest('hex');
      return `${digest}  ${filename}`;
    });
    writeFileSync(join(staging, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`, 'utf8');
    writeFileSync(join(staging, 'BUILD-METADATA.txt'), [
      `tag=${release.tag}`,
      `version=${release.version}`,
      `source_sha=${sourceHash}`,
      'status=unsigned',
      '',
    ].join('\n'), 'utf8');
    writeFileSync(join(staging, 'RELEASE-NOTES.md'), releaseNotes({
      ...release,
      sourceSha: sourceHash,
      artifactNames: outputs.map(({ filename }) => filename).sort(),
    }), 'utf8');
    renameSync(staging, resolvedOutput);
  } catch (error) {
    const resolvedStaging = resolve(staging);
    if (dirname(resolvedStaging) === resolve(parent) && basename(resolvedStaging).startsWith(stagingPrefix)) {
      rmSync(resolvedStaging, { recursive: true, force: true });
    }
    throw error;
  }
  return {
    tag: release.tag,
    version: release.version,
    sourceSha: sourceHash,
    outputDir: resolvedOutput,
    files: [...byName.keys()].sort(),
  };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--') || index + 1 >= argv.length || argv[index + 1].startsWith('--')) {
      throw new Error(`Invalid arguments near ${key}`);
    }
    const name = key.slice(2);
    if (Object.hasOwn(result, name)) throw new Error(`Duplicate argument: ${key}`);
    result[name] = argv[++index];
  }
  return result;
}

async function main(argv) {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  if (command === 'validate-tag') {
    if (Object.keys(args).sort().join(',') !== 'source-sha,tag') throw new Error('Usage: prepare-release.mjs validate-tag --tag <vX.Y.Z> --source-sha <40-char-sha>');
    const sourceSha = validSourceSha(args['source-sha']);
    const tag = validateReleaseTag(args.tag, currentVersions());
    process.stdout.write(`${JSON.stringify({ ...tag, sourceSha }, null, 2)}\n`);
    return;
  }
  if (command === 'collect') {
    if (Object.keys(args).sort().join(',') !== 'input-root,output-dir,source-sha,tag') throw new Error('Usage: prepare-release.mjs collect --input-root <dir> --output-dir <new-dir> --tag <vX.Y.Z> --source-sha <40-char-sha>');
    const result = collectReleaseArtifacts({
      inputRoot: args['input-root'],
      outputDir: args['output-dir'],
      tag: args.tag,
      sourceSha: args['source-sha'],
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  throw new Error('Usage: prepare-release.mjs <validate-tag|collect> ...');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
