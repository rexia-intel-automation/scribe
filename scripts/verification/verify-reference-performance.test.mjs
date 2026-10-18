import test from 'node:test';
import assert from 'node:assert/strict';
import { checkReferencePerformance } from './verify-reference-performance.mjs';

const now = Date.parse('2026-10-18T03:00:00Z'), tree = 'a'.repeat(40);
function evidence() {
  return {
    schema: 1, mode: 'reference-strict', measuredAt: new Date(now).toISOString(), appTree: tree,
    exitCode: 0, testBinarySha256: 'b'.repeat(64), scope: 'server-core-and-authenticated-http',
    environment: { platform: 'win32', cpu: 'Intel i5-10300H', ramGiB: 16, uninstrumented: true },
    nfr01: { samples: 32, p95Ms: 5 },
    nfr02: ['private-http', 'direct-core'].flatMap(transport => ['allow', 'deny'].map(action =>
      ({ transport, action, samples: 128, p95Ms: 4, maxMs: 9, over100Ms: 0 }))),
  };
}
test('fresh strict reference evidence covers the exact app source tree and four signed groups', () => {
  assert.doesNotThrow(() => checkReferencePerformance(evidence(), tree, now));
});
test('latency boundaries, missing samples, duplicates and shared-host measurements block', () => {
  for (const mutate of [
    r => { r.nfr01.p95Ms = 200; }, r => { r.nfr02[0].p95Ms = 100; },
    r => { r.nfr02[0].samples = 127; }, r => { r.nfr02.pop(); },
    r => { r.nfr02[1] = r.nfr02[0]; }, r => { r.mode = 'shared-ci'; },
    r => { r.nfr02[0].p95Ms = NaN; }, r => { r.nfr02[0].over100Ms = 7; },
  ]) { const report = evidence(); mutate(report); assert.throws(() => checkReferencePerformance(report, tree, now)); }
});
test('changed source, failed tests, old/future evidence and another machine block publication', () => {
  for (const mutate of [
    r => { r.appTree = 'c'.repeat(40); }, r => { r.exitCode = 1; },
    r => { r.measuredAt = new Date(now - 8 * 86_400_000).toISOString(); },
    r => { r.measuredAt = new Date(now + 3600_000).toISOString(); },
    r => { r.environment.cpu = 'hosted CI'; }, r => { r.environment.uninstrumented = false; },
  ]) { const report = evidence(); mutate(report); assert.throws(() => checkReferencePerformance(report, tree, now)); }
});
