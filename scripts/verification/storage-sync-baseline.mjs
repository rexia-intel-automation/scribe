import { closeSync, fsyncSync, mkdtempSync, openSync, rmdirSync, unlinkSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import { performance } from 'node:perf_hooks';

// A finite environment diagnostic, not a substitute for the SQLite/HTTP gates.
// Report after all writes so console I/O cannot enter any measured interval.
const directory = mkdtempSync(join(tmpdir(), 'scribe-sync-baseline-'));
const file = join(directory, 'public-synthetic.bin');
const bytes = Buffer.alloc(4096);
const samples = [];
let descriptor;
try {
  descriptor = openSync(file, 'wx', 0o600);
  for (let index = 0; index < 128; index++) {
    bytes.writeUInt32LE(index);
    const started = performance.now();
    if (writeSync(descriptor, bytes, 0, bytes.length, 0) !== bytes.length) {
      throw new Error('Incomplete synthetic storage write');
    }
    fsyncSync(descriptor);
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  console.log(JSON.stringify({
    diagnostic: 'public-4KiB-write-and-fsync', platform: process.platform,
    node: process.version, volume: parse(directory).root,
    samples: samples.length, p95Ms: samples[121], maxMs: samples[127],
    samplesAtLeast100Ms: samples.filter(value => value >= 100).length,
    replacesProductGate: false,
  }));
} finally {
  if (descriptor !== undefined) closeSync(descriptor);
  if (descriptor !== undefined) unlinkSync(file);
  rmdirSync(directory);
}
