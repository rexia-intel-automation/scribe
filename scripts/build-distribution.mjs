import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = join(repoRoot, 'app');
const hookManifest = join(packageRoot, 'hook-client', 'Cargo.toml');
const hookTargetRoot = join(packageRoot, 'hook-client', 'target');
const binariesDir = join(packageRoot, 'src-tauri', 'binaries');
const platformPlans = {
  windows: {
    runner: 'windows-latest',
    target: 'x86_64-pc-windows-msvc',
    sidecars: ['x86_64-pc-windows-msvc'],
    bundles: ['nsis', 'msi'],
    artifacts: ['nsis', 'msi'],
  },
  macos: {
    runner: 'macos-latest',
    target: 'universal-apple-darwin',
    sidecars: ['aarch64-apple-darwin', 'x86_64-apple-darwin'],
    bundles: ['app', 'dmg'],
    artifacts: ['dmg'],
  },
  linux: {
    runner: 'ubuntu-22.04',
    target: 'x86_64-unknown-linux-gnu',
    sidecars: ['x86_64-unknown-linux-gnu'],
    bundles: ['deb', 'appimage'],
    artifacts: ['deb', 'appimage'],
  },
};

export function createBuildPlan(platform) {
  const plan = platformPlans[platform];
  if (!plan) throw new Error(`Unsupported platform: ${platform}`);
  return {
    platform,
    runner: plan.runner,
    target: plan.target,
    sidecars: plan.sidecars.map((triple) => ({
      triple,
      filename: `scribe-hook-${triple}${platform === 'windows' ? '.exe' : ''}`,
    })),
    stagedSidecar: `scribe-hook-${plan.target}${platform === 'windows' ? '.exe' : ''}`,
    bundles: plan.bundles,
    artifacts: plan.artifacts,
  };
}

export function defaultBundleRoot(platform) {
  createBuildPlan(platform);
  const targetDir = platform === 'macos'
    ? join('universal-apple-darwin', 'release')
    : 'release';
  return join(packageRoot, 'src-tauri', 'target', targetDir, 'bundle');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
    stdio: options.capture ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 'unknown'}`);
  }
  return result.stdout ?? '';
}

function hostTriple() {
  const details = run('rustc', ['-vV'], { capture: true });
  const match = details.match(/^host:\s*(\S+)\s*$/m);
  if (!match) throw new Error('rustc -vV did not report the host target triple');
  return match[1];
}

function buildHook(triple) {
  run('cargo', [
    'build', '--locked', '--release', '--no-default-features', '--manifest-path', hookManifest,
    '--target', triple, '--target-dir', hookTargetRoot,
  ]);
  const executable = process.platform === 'win32' ? 'scribe-hook.exe' : 'scribe-hook';
  const builtPath = join(hookTargetRoot, triple, 'release', executable);
  if (!statSync(builtPath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Hook build did not produce ${builtPath}`);
  }
  return builtPath;
}

export function stageMacTargetSidecars(built, plan, outputDir) {
  return plan.sidecars.map(({ filename }, index) => {
    const staged = join(outputDir, filename);
    copyFileSync(built[index], staged);
    chmodSync(staged, 0o755);
    return staged;
  });
}

export function prepareSidecar(platform) {
  const plan = createBuildPlan(platform);
  if (platform === 'windows' && (process.platform !== 'win32' || hostTriple() !== plan.target)) {
    throw new Error(`Windows preview must run on ${plan.target}`);
  }
  if (platform === 'linux' && (process.platform !== 'linux' || hostTriple() !== plan.target)) {
    throw new Error(`Linux preview must run on ${plan.target}`);
  }
  if (platform === 'macos' && process.platform !== 'darwin') {
    throw new Error('Universal macOS preview must run on macOS');
  }

  mkdirSync(binariesDir, { recursive: true });
  const built = plan.sidecars.map(({ triple }) => buildHook(triple));
  let staged;
  if (platform === 'macos') {
    stageMacTargetSidecars(built, plan, binariesDir);
    const sidecar = join(binariesDir, plan.stagedSidecar);
    run('lipo', ['-create', ...built, '-output', sidecar]);
    run('lipo', [sidecar, '-verify_arch', 'arm64', 'x86_64']);
    staged = join(binariesDir, plan.stagedSidecar);
  } else {
    staged = join(binariesDir, plan.stagedSidecar);
    copyFileSync(built[0], staged);
  }
  if (process.platform !== 'win32') chmodSync(staged, 0o755);
  return staged;
}

function appBundlesBelow(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (!entry.isDirectory()) return [];
    if (entry.name.toLowerCase().endsWith('.app')) return [child];
    return appBundlesBelow(child);
  });
}

export function verifyUniversalMacApp(bundleRoot, invoke = run) {
  const apps = appBundlesBelow(bundleRoot);
  if (apps.length !== 1) throw new Error(`Expected exactly one .app bundle in ${bundleRoot}`);
  const macosDir = join(apps[0], 'Contents', 'MacOS');
  const executables = [join(macosDir, 'scribe'), join(macosDir, 'scribe-hook')];
  for (const executable of executables) {
    if (!statSync(executable, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Universal macOS app is missing ${executable}`);
    }
  }
  for (const executable of executables) {
    invoke('lipo', [executable, '-verify_arch', 'arm64', 'x86_64']);
  }
  return executables;
}

function filesBelow(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return filesBelow(child);
    if (entry.isFile()) return [child];
    return [];
  });
}

function expectedArtifacts(platform, bundleRoot) {
  const files = filesBelow(bundleRoot);
  const byExtension = (extension) => files.filter((path) => extname(path).toLowerCase() === extension);
  const isNsis = (path) => /-setup\.exe$/i.test(path);
  const groups = {
    windows: [files.filter(isNsis), byExtension('.msi')],
    macos: [byExtension('.dmg')],
    linux: [byExtension('.deb'), byExtension('.appimage')],
  }[platform];
  const plan = platformPlans[platform];
  if (!groups || groups.some((group) => group.length !== 1)) {
    throw new Error(`Expected exactly one of each ${plan.artifacts.join(', ')} bundle in ${bundleRoot}`);
  }
  return groups.flat();
}

export function writeArtifactMetadata({ platform, bundleRoot, artifactDir, sourceSha, invoke = run }) {
  const plan = createBuildPlan(platform);
  if (!/^[0-9a-f]{40}$/i.test(sourceSha)) throw new Error('sourceSha must be a 40-character Git commit SHA');
  if (platform === 'macos') verifyUniversalMacApp(bundleRoot, invoke);
  const artifacts = expectedArtifacts(platform, bundleRoot);
  mkdirSync(artifactDir, { recursive: true });
  const hashes = [];
  for (const sourcePath of artifacts) {
    const destination = join(artifactDir, basename(sourcePath));
    copyFileSync(sourcePath, destination);
    const digest = createHash('sha256').update(readFileSync(destination)).digest('hex');
    hashes.push(`${digest}  ${basename(destination)}`);
  }
  hashes.sort((left, right) => left.localeCompare(right));
  writeFileSync(join(artifactDir, 'SHA256SUMS.txt'), `${hashes.join('\n')}\n`, 'utf8');
  const metadata = [
    `source_sha=${sourceSha.toLowerCase()}`,
    `platform=${platform}`,
    `target=${plan.target}`,
    `bundles=${plan.artifacts.join(',')}`,
    `version=${JSON.parse(readFileSync(join(packageRoot, 'src-tauri', 'tauri.conf.json'), 'utf8')).version}`,
    '',
  ].join('\n');
  writeFileSync(join(artifactDir, 'BUILD-METADATA.txt'), metadata, 'utf8');
  return { artifacts: artifacts.map((path) => basename(path)), checksumPath: join(artifactDir, 'SHA256SUMS.txt') };
}

function argsObject(args) {
  const values = {};
  for (let i = 0; i < args.length; i += 1) {
    const item = args[i];
    if (!item.startsWith('--')) throw new Error(`Unexpected argument: ${item}`);
    const equals = item.indexOf('=');
    if (equals >= 0) values[item.slice(2, equals)] = item.slice(equals + 1);
    else values[item.slice(2)] = args[++i];
  }
  return values;
}

async function main(argv) {
  const [command, ...rest] = argv;
  const args = argsObject(rest);
  const platform = args.platform;
  if (command === 'plan') {
    process.stdout.write(`${JSON.stringify(createBuildPlan(platform), null, 2)}\n`);
  } else if (command === 'prepare') {
    process.stdout.write(`${prepareSidecar(platform)}\n`);
  } else if (command === 'finalize') {
    const result = writeArtifactMetadata({
      platform,
      bundleRoot: resolve(args['bundle-root'] ?? defaultBundleRoot(platform)),
      artifactDir: resolve(args['artifact-dir'] ?? '.artifacts/distribution-preview'),
      sourceSha: args['source-sha'] ?? process.env.GITHUB_SHA ?? '',
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    throw new Error('Usage: build-distribution.mjs <plan|prepare|finalize> --platform <windows|macos|linux>');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
