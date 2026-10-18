import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function checkReferencePerformance(report, appTree, now = Date.now()) {
  const measured = Date.parse(report?.measuredAt);
  if (report?.schema !== 1 || report.mode !== 'reference-strict'
    || !/^[a-f0-9]{40}$/.test(appTree) || report.appTree !== appTree
    || report.exitCode !== 0 || !/^[a-f0-9]{64}$/.test(report.testBinarySha256 ?? '')
    || typeof report.measuredAt !== 'string' || !Number.isFinite(measured) || !Number.isFinite(now)
    || measured > now + 300_000 || now - measured > 7 * 86_400_000
    || report.environment?.platform !== 'win32'
    || !/i5-10300H/.test(report.environment.cpu ?? '')
    || !Number.isFinite(report.environment.ramGiB) || report.environment.ramGiB < 15 || report.environment.uninstrumented !== true
    || report.scope !== 'server-core-and-authenticated-http') {
    throw new Error('Missing, stale or mismatched Windows reference performance evidence.');
  }
  const phase2 = report.nfr01;
  if (phase2?.samples !== 32 || !Number.isFinite(phase2.p95Ms)
    || phase2.p95Ms < 0 || phase2.p95Ms >= 200) throw new Error('Reference NFR-01 exceeds 200 ms.');
  const groups = report.nfr02;
  const required = ['private-http/allow', 'private-http/deny', 'direct-core/allow', 'direct-core/deny'];
  if (!Array.isArray(groups) || groups.length !== 4
    || !required.every(key => groups.filter(group => `${group.transport}/${group.action}` === key).length === 1)) {
    throw new Error('Reference NFR-02 requires all four signed response groups.');
  }
  for (const group of groups) {
    if (group.samples !== 128 || !Number.isFinite(group.p95Ms) || group.p95Ms < 0 || group.p95Ms >= 100
      || !Number.isFinite(group.maxMs) || group.maxMs < group.p95Ms
      || !Number.isInteger(group.over100Ms) || group.over100Ms < 0 || group.over100Ms > 6
      || (group.over100Ms === 0) !== (group.maxMs < 100)) {
      throw new Error('Reference NFR-02 exceeds 100 ms or has incomplete samples.');
    }
  }
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]))) {
  try {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const appTree = execFileSync('git', ['rev-parse', 'HEAD:app'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    const report = JSON.parse(readFileSync(new URL('../../docs/evidence/reference-performance-windows.json', import.meta.url), 'utf8'));
    checkReferencePerformance(report, appTree);
    console.log('PASS: fresh strict Windows reference evidence matches the entire app source tree (100/200 ms).');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
