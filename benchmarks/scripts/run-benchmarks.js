import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { calculateZpeTs } from '../../src/lib/zpeTs.js';
import { referenceZpeTs } from '../references/zpe-ts-reference.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const benchmarkDirectory = path.resolve(scriptDirectory, '..');
const projectDirectory = path.resolve(benchmarkDirectory, '..');
const manifest = JSON.parse(await readFile(path.join(benchmarkDirectory, 'manifest.json'), 'utf8'));
const moduleFlag = process.argv.indexOf('--module');
const selectedModule = moduleFlag >= 0 ? process.argv[moduleFlag + 1] : null;
const cases = selectedModule ? manifest.cases.filter(item => item.module === selectedModule) : manifest.cases;

if (!cases.length) throw new Error(`No benchmark cases found${selectedModule ? ` for module ${selectedModule}` : ''}.`);

const git = (...args) => {
  try { return execFileSync('git', args, { cwd: projectDirectory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return 'unavailable'; }
};

const application = JSON.parse(await readFile(path.join(projectDirectory, 'package.json'), 'utf8'));
const cpu = os.cpus()[0];
const environment = {
  timestampUtc: new Date().toISOString(),
  applicationVersion: application.version,
  gitCommit: git('rev-parse', 'HEAD'),
  gitDirty: git('status', '--porcelain') !== '',
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  osRelease: os.release(),
  cpu: cpu?.model ?? 'unavailable',
  logicalCpus: os.cpus().length,
  totalMemoryBytes: os.totalmem(),
};

const metricNames = ['zpeEv', 'thermalEv', 'entropyJMolK', 'tsEv', 'freeEnergyCorrectionEv'];
const rows = [];

for (const benchmarkCase of cases) {
  const started = process.hrtime.bigint();
  let status = 'fail';
  let diagnostic;
  let metrics = {};
  try {
    if (benchmarkCase.module !== 'zpe-ts') throw new Error(`No runner registered for ${benchmarkCase.module}.`);
    if (benchmarkCase.expectation === 'expected-rejection') {
      let thrown = null;
      try { calculateZpeTs(benchmarkCase.input.frequenciesThz, benchmarkCase.input.temperatureK); }
      catch (error) { thrown = error; }
      if (!thrown) throw new Error('Application accepted an input that should have been rejected.');
      const pattern = new RegExp(benchmarkCase.expectedErrorPattern);
      if (!pattern.test(thrown.message)) throw new Error(`Unexpected diagnostic: ${thrown.message}`);
      status = 'pass';
      diagnostic = thrown.message;
    } else {
      const actual = calculateZpeTs(benchmarkCase.input.frequenciesThz, benchmarkCase.input.temperatureK);
      const expected = referenceZpeTs(benchmarkCase.input.frequenciesThz, benchmarkCase.input.temperatureK);
      const errors = {};
      for (const name of metricNames) errors[name] = Math.abs(actual.totals[name] - expected.totals[name]);
      metrics = { actual: actual.totals, reference: expected.totals, absoluteError: errors };
      const evTolerance = benchmarkCase.tolerances.absoluteEv;
      const entropyTolerance = benchmarkCase.tolerances.absoluteEntropyJMolK;
      const numericalPass = metricNames.every(name => errors[name] <= (name === 'entropyJMolK' ? entropyTolerance : evTolerance));
      const rejectedPass = actual.rejected.length === benchmarkCase.expectedRejectedModes && expected.rejected.length === benchmarkCase.expectedRejectedModes;
      status = numericalPass && rejectedPass ? 'pass' : 'fail';
      diagnostic = status === 'pass' ? 'Independent reference agreement within declared tolerances.' : `Agreement=${numericalPass}; rejected-mode count=${rejectedPass}.`;
      metrics.acceptedModes = actual.modes.length;
      metrics.rejectedModes = actual.rejected.length;
    }
  } catch (error) {
    diagnostic = error instanceof Error ? error.message : String(error);
  }
  const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
  rows.push({ id: benchmarkCase.id, module: benchmarkCase.module, expectation: benchmarkCase.expectation, status, durationMs, diagnostic, provenance: benchmarkCase.provenance, tolerances: benchmarkCase.tolerances ?? null, metrics });
}

const passed = rows.filter(row => row.status === 'pass').length;
const report = {
  schemaVersion: 1,
  benchmarkDatasetVersion: manifest.datasetVersion,
  selectedModule: selectedModule ?? 'all',
  environment,
  summary: { total: rows.length, passed, failed: rows.length - passed, passRate: passed / rows.length },
  cases: rows,
};

const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const csvHeader = ['case_id', 'module', 'expectation', 'status', 'duration_ms', 'max_absolute_error', 'diagnostic', 'provenance'];
const csvRows = rows.map(row => {
  const errors = Object.values(row.metrics.absoluteError ?? {});
  return [row.id, row.module, row.expectation, row.status, row.durationMs, errors.length ? Math.max(...errors) : '', row.diagnostic, row.provenance];
});
const csv = [csvHeader, ...csvRows].map(row => row.map(csvCell).join(',')).join('\n') + '\n';
const resultsDirectory = path.join(benchmarkDirectory, 'results');
await mkdir(resultsDirectory, { recursive: true });
const stamp = environment.timestampUtc.replaceAll(':', '-').replaceAll('.', '-');
const baseName = `benchmark-${manifest.datasetVersion}-${stamp}`;
const json = JSON.stringify(report, null, 2) + '\n';
await Promise.all([
  writeFile(path.join(resultsDirectory, `${baseName}.json`), json),
  writeFile(path.join(resultsDirectory, `${baseName}.csv`), csv),
  writeFile(path.join(resultsDirectory, 'latest.json'), json),
  writeFile(path.join(resultsDirectory, 'latest.csv'), csv),
]);

console.log(`Padarthkhoj benchmark ${manifest.datasetVersion}`);
for (const row of rows) console.log(`${row.status === 'pass' ? 'PASS' : 'FAIL'}  ${row.id}  ${row.durationMs.toFixed(3)} ms`);
console.log(`\n${passed}/${rows.length} cases passed. Reports: benchmarks/results/${baseName}.{json,csv}`);
if (passed !== rows.length) process.exitCode = 1;
