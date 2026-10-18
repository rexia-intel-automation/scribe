import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDesktopAudit, checkMaintenanceWindow } from './audit-desktop-dependencies.mjs';

const now = Date.parse('2026-10-18T00:00:00Z');
const warning = {
  kind: 'unmaintained', package: { name: 'zvariant', version: '5.15.0' },
  advisory: { id: 'RUSTSEC-2026-0370', package: 'zvariant', informational: 'unmaintained', cvss: null, aliases: [] },
};
function report() {
  return {
    settings: { severity: null, target_arch: [], target_os: [], ignore: ['RUSTSEC-2024-0370', 'RUSTSEC-2024-0429'], informational_warnings: ['unmaintained', 'unsound', 'notice'] },
    vulnerabilities: { found: false, count: 0, list: [] },
    warnings: { unmaintained: [structuredClone(warning)] },
  };
}
test('only the exact temporary maintenance advisory is accepted before expiry', () => {
  assert.doesNotThrow(() => checkMaintenanceWindow(now));
  assert.throws(() => checkMaintenanceWindow(Date.parse('2026-11-01')), /expired/);
  assert.deepEqual(checkDesktopAudit(report(), now), ['RUSTSEC-2026-0370']);
  const clean = report(); clean.warnings = {};
  assert.deepEqual(checkDesktopAudit(clean, Date.parse('2026-12-01')), []);
  assert.throws(() => checkDesktopAudit(report(), Date.parse('2026-11-01')), /expired/);
  assert.throws(() => checkDesktopAudit(report(), NaN), /expired/);
});
test('vulnerabilities, changed filters and malformed reports always block', () => {
  for (const mutate of [
    r => { r.vulnerabilities = { found: true, count: 1, list: [{}] }; },
    r => { r.settings.ignore.push('RUSTSEC-2099-0001'); },
    r => { r.settings.severity = 'high'; },
    r => { r.settings.target_os = ['windows']; },
    r => { r.settings.informational_warnings = ['unmaintained']; },
    r => { delete r.vulnerabilities.list; },
    r => { r.warnings = []; },
  ]) { const value = report(); mutate(value); assert.throws(() => checkDesktopAudit(value, now)); }
  assert.throws(() => checkDesktopAudit(null, now));
});
test('new IDs, versions, packages, CVEs and classifications cannot reuse the exception', () => {
  for (const mutate of [
    w => { w.advisory.id = 'RUSTSEC-2099-0001'; },
    w => { w.package.version = '5.15.1'; },
    w => { w.package.name = 'other'; },
    w => { w.advisory.informational = 'unsound'; },
    w => { w.advisory.aliases = ['CVE-2099-0001']; },
    w => { w.advisory.cvss = 'CVSS:3.1/AV:N'; },
  ]) { const value = report(); mutate(value.warnings.unmaintained[0]); assert.throws(() => checkDesktopAudit(value, now), /advisory/); }
  const other = report(); other.warnings.notice = [structuredClone(warning)];
  assert.throws(() => checkDesktopAudit(other, now));
});
