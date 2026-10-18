import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const existingExceptions = ['RUSTSEC-2024-0370', 'RUSTSEC-2024-0429'];
const maintenance = new Map([
  ['RUSTSEC-2026-0370', ['zvariant', '5.15.0']],
  ['RUSTSEC-2026-0371', ['zbus_names', '4.3.4']],
  ['RUSTSEC-2026-0372', ['zvariant_derive', '5.15.0']],
]);
const expires = Date.parse('2026-11-01T00:00:00Z');

export function checkMaintenanceWindow(at = Date.now()) {
  if (!Number.isFinite(at) || at >= expires) throw new Error('Temporary desktop maintenance exceptions expired.');
}

export function checkDesktopAudit(report, at = Date.now()) {
  const settings = report?.settings;
  if (!settings || settings.severity !== null || settings.target_arch?.length !== 0
    || settings.target_os?.length !== 0 || !Array.isArray(settings.ignore)
    || settings.ignore.length !== existingExceptions.length
    || !existingExceptions.every(id => settings.ignore.includes(id))
    || !Array.isArray(settings.informational_warnings)
    || !['unmaintained', 'unsound', 'notice'].every(kind => settings.informational_warnings.includes(kind))) {
    throw new Error('Desktop audit settings were filtered or changed.');
  }
  const vulnerabilities = report.vulnerabilities;
  if (vulnerabilities?.found !== false || vulnerabilities.count !== 0
    || !Array.isArray(vulnerabilities.list) || vulnerabilities.list.length !== 0
    || !report.warnings || typeof report.warnings !== 'object' || Array.isArray(report.warnings)) {
    throw new Error('Desktop audit contains vulnerabilities or an invalid report.');
  }
  const accepted = [];
  for (const [kind, warnings] of Object.entries(report.warnings)) {
    if (!Array.isArray(warnings)) throw new Error('Invalid desktop audit warning list.');
    for (const warning of warnings) {
      const advisory = warning?.advisory, pkg = warning?.package;
      const expected = maintenance.get(advisory?.id);
      checkMaintenanceWindow(at);
      if (kind !== 'unmaintained'
        || warning.kind !== kind || advisory?.informational !== kind
        || !expected || pkg?.name !== expected[0] || pkg?.version !== expected[1]
        || advisory.package !== pkg.name || advisory.cvss !== null
        || !Array.isArray(advisory.aliases) || advisory.aliases.length !== 0) {
        throw new Error('Unapproved, reclassified or expired desktop dependency advisory.');
      }
      accepted.push(advisory.id);
    }
  }
  return accepted;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length === 3 && process.argv[2] === '--check-expiry') {
      checkMaintenanceWindow();
      console.log('Temporary desktop maintenance policy expires 2026-11-01.');
    } else {
      if (process.argv.length !== 2) throw new Error('Unsupported desktop audit arguments.');
      const result = spawnSync('cargo', ['audit', '--file', 'app/src-tauri/Cargo.lock',
        '--deny', 'warnings', ...existingExceptions.flatMap(id => ['--ignore', id]), '--json'],
      { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, windowsHide: true });
      if (result.error || result.signal || ![0, 1].includes(result.status)
        || /(?:error|fatal):/i.test(result.stderr ?? '')) throw new Error('Cargo audit did not complete successfully.');
      const accepted = checkDesktopAudit(JSON.parse(result.stdout));
      console.log(`Desktop audit: no vulnerabilities; temporary maintenance advisories: ${accepted.join(', ') || 'none'} (expires 2026-11-01).`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
