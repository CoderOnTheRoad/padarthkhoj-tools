// Supplementary evidence only: never rewrites the historical benchmark reports.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { calculateOrbitalMetric, columnLetter, parseOrbitalMetricsCsv } from '../../src/lib/orbitalMetrics.js';
import { parsePdosFile, pdosResultToCsv, sumPdosRecords } from '../../src/lib/pdosAnalysis.js';
import { calculateBaderCharge, parseACF, parseQEInputAtoms } from '../../src/lib/baderAnalysis.js';
import { INTERMEDIATE_PATHWAYS } from '../../src/data/reactionPathways.js';
import { parseCIF as parseCatalyst } from '../../src/lib/cifGenerator.js';
import { placeAnchoredIntermediate } from '../../src/lib/intermediateMaker.js';
import { parseCIF } from '../../src/lib/cifParser.js';
import { cifToQE } from '../../src/lib/cifToQE.js';
import { findBonds } from '../../src/lib/bonding.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const digest = content => createHash('sha256').update(content).digest('hex');
const inputFiles = new Map();
const readInput = async relative => {
  const bytes = await readFile(path.join(root, relative));
  inputFiles.set(relative, digest(bytes));
  return bytes.toString('utf8');
};
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const referenceRun = 'benchmarks/results/unified-benchmark-2026-08-14T06-03-58-408Z.json';
const original = JSON.parse(await readInput(referenceRun));
if (original.summary.validationUnits !== 1433 || original.summary.passed !== 1433) {
  throw new Error('The historical 1433-unit reference must be preserved.');
}

// Limits are fixed before evaluating results. Retained legacy runner limits are
// reused except for the explicitly new coordinate and coordinate-export checks.
const thresholds = {
  orbitalIntegral: { value: 1e-11, unit: 'integrated PDOS units', basis: 'Retained orbital runner; absolute floating-point agreement on the same sampled grid.' },
  orbitalCentre: { value: 1e-11, unit: 'eV', basis: 'Retained orbital runner; absolute agreement of first-moment/area ratios.' },
  pipelineIntegral: { value: 1e-10, unit: 'integrated PDOS units', basis: 'Retained DOS pipeline runner; absolute agreement after summation and CSV transfer.' },
  pipelineCentre: { value: 1e-10, unit: 'eV', basis: 'Retained DOS pipeline runner; absolute agreement after summation and CSV transfer.' },
  charge: { value: 1e-8, unit: 'e', basis: 'Retained Bader runner; arithmetic agreement under a fixed electron-count convention.' },
  chargeFooter: { value: 2e-4, unit: 'e', basis: 'Retained Bader runner; printed atomic rows and footer can accumulate different rounding.' },
  placement: { value: 1e-9, unit: 'angstrom', basis: 'Retained Intermediate Maker runner; absolute rigid-geometry agreement.' },
  coordinate: { value: 1e-10, unit: 'angstrom', basis: 'New supplementary parser check; conservative absolute threshold for double-precision cell conversion on this fixture.' },
  coordinateExport: { value: 1e-10, unit: 'angstrom', basis: 'New supplementary check using 12 decimal places; permits 0.5e-12 angstrom output rounding plus numerical conversion rounding.' },
  periodicDistance: { value: 1e-12, unit: 'angstrom', basis: 'Retained crystal runner minimum-image control for the specified orthogonal cell only.' },
};
const rows = [];
const check = (id, tool, purpose, quantity, expected, returned, threshold, input, method) => {
  const t = thresholds[threshold];
  const deviation = Math.abs(returned - expected);
  rows.push({ id, tool, purpose, quantity, expected, returned, absoluteDeviation: deviation,
    absoluteTolerance: t.value, unit: t.unit, comparison: '<=', input, referenceMethod: method,
    status: Number.isFinite(expected) && Number.isFinite(returned) && deviation <= t.value ? 'pass' : 'fail' });
};

// The oracle reads numeric columns directly, without the application's parser.
const rawNumericRows = text => text.split(/\r?\n/).map(line => line.trim())
  .filter(line => line && !line.startsWith('#')).map(line => line.split(/\s+/).map(Number));
const integral = points => {
  let area = 0, moment = 0;
  for (let i = 1; i < points.length; i++) {
    const [a, fa] = points[i - 1], [b, fb] = points[i];
    area += (b - a) * (fa + fb) / 2;
    moment += (b - a) * (a * fa + b * fb) / 2;
  }
  return { area, centre: moment / area };
};
const clipAt = (points, end) => {
  const result = points.filter(([energy]) => energy <= end);
  const next = points.findIndex(([energy]) => energy > end);
  if (next > 0 && points[next - 1][0] < end) {
    const [a, fa] = points[next - 1], [b, fb] = points[next];
    result.push([end, fa + (end - a) * (fb - fa) / (b - a)]);
  }
  return result;
};
const orbitalDirectory = 'benchmarks/fixtures/orbital-metrics/qe-real';
const orbitalManifest = JSON.parse(await readInput(`${orbitalDirectory}/manifest.json`));
const source = orbitalManifest.files.find(item => item.group === 'C-p');
const sourcePath = `${orbitalDirectory}/${source.filename}`;
const pdosText = await readInput(sourcePath);
if (digest(pdosText) !== source.sha256) throw new Error('PDOS fixture hash mismatch.');
const numeric = rawNumericRows(pdosText);
const fullPoints = numeric.map(row => [row[0], row[3]]); // raw pz spin-up
const fermi = orbitalManifest.fermiEnergiesEv[source.group];
const full = integral(fullPoints), occupied = integral(clipAt(fullPoints, fermi));
const record = parsePdosFile(source.filename, pdosText);
const dataset = { energy: record.energy, columns: [
  { letter: 'A', name: 'Energy_eV', values: record.energy, energy: true },
  ...Object.entries(record.channels).map(([name, values], index) => ({ letter: columnLetter(index + 1), name, values })),
] };
for (const [range, reference] of [['full', full], ['occupied', occupied]]) {
  const options = { sourceName: 'pz_up', rangeEnabled: range === 'occupied', xMin: numeric[0][0], xMax: fermi };
  for (const [type, field, limit] of [['occupancy', 'area', 'orbitalIntegral'], ['centre', 'centre', 'orbitalCentre']]) {
    const result = calculateOrbitalMetric(dataset, { ...options, type });
    if (result.status !== 'ok') throw new Error(`Orbital metric failed: ${result.status}`);
    check(`orbital-${range}-${type}`, 'Orbital Metrics', 'scientific numerical', `${range} pz_up ${type === 'occupancy' ? 'integral' : type}`,
      reference[field], result.value, limit, { path: sourcePath, channel: 'pz_up', rawColumnOneBased: 4, fermiEnergyEv: fermi, range: range === 'full' ? [numeric[0][0], numeric.at(-1)[0]] : [numeric[0][0], fermi] },
      'Independent raw-column composite trapezoidal area and first moment; occupied endpoint linearly interpolated at the supplied Fermi energy.');
  }
}

// Check a selected component through the production summation and CSV pipeline
// against the independent raw-column reference.
const summed = sumPdosRecords([record], { fermiEnergy: fermi });
const pipelineData = parseOrbitalMetricsCsv(pdosResultToCsv(summed), 'supplementary-pdos.csv');
const componentNames = ['pz_up', 'px_up', 'py_up'];
// The production export retains the orbital components. Select pz_up explicitly
// so the oracle is independent of any generated LDOS or total column.
if (!Object.hasOwn(summed.channels, componentNames[0])) throw new Error('Expected pz_up export channel missing.');
const shifted = integral(fullPoints.map(([energy, value]) => [energy - fermi, value]));
for (const [type, field, limit] of [['occupancy', 'area', 'pipelineIntegral'], ['centre', 'centre', 'pipelineCentre']]) {
  const result = calculateOrbitalMetric(pipelineData, { type, sourceName: 'pz_up', rangeEnabled: false });
  if (result.status !== 'ok') throw new Error(`Pipeline metric failed: ${result.status}`);
  check(`pipeline-${type}`, 'DOS PDOS pipeline', 'numerical data transfer', `Fermi-shifted CSV pz_up ${type === 'occupancy' ? 'integral' : type}`, shifted[field], result.value,
    limit, { path: sourcePath, channel: 'pz_up', fermiEnergyEv: fermi },
    'Raw pz_up column integrated independently after E becomes E minus Fermi energy; compare with parse, summation-stage export, CSV reload and metric calculation. This one-record case does not test addition across multiple records.');
}

const baderDirectory = 'benchmarks/fixtures/bader/qe-real-002';
const baderManifest = JSON.parse(await readInput(`${baderDirectory}/manifest.json`));
const acfPath = `${baderDirectory}/ACF.dat`, scfPath = `${baderDirectory}/${baderManifest.referenceFilename}`;
const acfText = await readInput(acfPath), scfText = await readInput(scfPath);
for (const [name, text] of [['ACF.dat', acfText], [baderManifest.referenceFilename, scfText]]) {
  if (digest(text) !== baderManifest.files[name].sha256) throw new Error(`Bader fixture hash mismatch: ${name}`);
}
const rawAcf = acfText.split(/\r?\n/).map(line => line.trim().split(/\s+/))
  .filter(tokens => tokens.length === 7 && /^\d+$/.test(tokens[0])).map(tokens => tokens.map(Number));
const positionBlock = scfText.split(/ATOMIC_POSITIONS[^\n]*\n/i)[1];
const rawSpecies = positionBlock.split(/\r?\n/).map(line => line.trim().split(/\s+/))
  .filter(tokens => tokens.length >= 4 && /^[CNH]$/.test(tokens[0]) && tokens.slice(1, 4).every(value => Number.isFinite(Number(value))))
  .slice(0, 204).map(tokens => tokens[0]);
const expectedComposition = { C: 116, N: 8, H: 80 };
for (const [element, count] of Object.entries(expectedComposition)) {
  if (rawSpecies.filter(value => value === element).length !== count) throw new Error('Independent SCF species reader mismatch.');
}
const parsedAcf = parseACF(acfText), parsedSpecies = parseQEInputAtoms(scfText);
if (rawAcf.length !== 204 || parsedAcf.rows.length !== 204 || parsedSpecies.length !== 204) throw new Error('Bader atom count mismatch.');
const valence = { C: 4, N: 5, H: 1 }, core = { C: 2, N: 2, H: 0 };
for (const element of ['C', 'N', 'H']) {
  const index = rawSpecies.indexOf(element);
  if (parsedSpecies[index].element !== element) throw new Error('Bader atom ordering mismatch.');
  check(`bader-first-${element}`, 'Bader Analysis', 'scientific arithmetic', `charge of first ${element} atom`,
    valence[element] - rawAcf[index][4], calculateBaderCharge(parsedAcf.rows[index], element, core[element]), 'charge',
    { path: acfPath, structure: scfPath, atomIndexOneBased: index + 1, element, referenceValenceElectrons: valence[element], acfElectrons: rawAcf[index][4], frozenCoreElectrons: core[element] },
    'Independent raw ACF electron count subtracted from declared valence reference; compare with production charge arithmetic under the same valence-only convention.');
}
const footer = Number(acfText.match(/NUMBER OF ELECTRONS:\s*([-+\d.Ee]+)/i)[1]);
const referenceCharge = rawSpecies.reduce((sum, element) => sum + valence[element], 0) - footer;
const returnedCharge = parsedAcf.rows.reduce((sum, row, index) => sum + calculateBaderCharge(row, parsedSpecies[index].element, core[parsedSpecies[index].element]), 0);
check('bader-charge-total', 'Bader Analysis', 'printed data consistency', 'total charge against ACF footer',
  referenceCharge, returnedCharge, 'chargeFooter', { path: acfPath, structure: scfPath, atoms: 204, expectedValenceElectrons: 584, footerElectrons: footer },
  'Total reference valence count minus independently read ACF footer, compared with sum of production atomic charges; permits printed-row/footer rounding.');

const catalystPath = `${baderDirectory}/halfc1.cif`;
const catalystText = await readInput(catalystPath);
if (digest(catalystText) !== baderManifest.files['halfc1.cif'].sha256) throw new Error('Catalyst fixture hash mismatch.');
const catalyst = parseCatalyst(catalystText);
const activeIndex = catalyst.atoms.reduce((best, atom, index, atoms) => atom.cz > atoms[best].cz ? index : best, 0);
const active = catalyst.atoms[activeIndex];
const template = INTERMEDIATE_PATHWAYS.find(item => item.id === 'nrr-no3-nh3').templates.find(item => item.id === 'NO3');
const options = { distance: 1.8, direction: { x: 0, y: 0, z: 1 }, twist: 31, tilt: 0 };
const placed = placeAnchoredIntermediate(template, active, options);
const distance = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
const placementInput = { path: catalystPath, activeAtomOneBased: activeIndex + 1,
  activeCartesianAngstrom: { x: active.cx, y: active.cy, z: active.cz }, pathway: 'nrr-no3-nh3', template: 'NO3', options,
  templateAtoms: template.atoms, bindingAtomZeroBased: template.bindingAtom };
check('intermediate-binding', 'Intermediate Maker', 'geometric numerical', 'NO3 binding distance', options.distance,
  distance(placed[template.bindingAtom], { x: active.cx, y: active.cy, z: active.cz }), 'placement', placementInput,
  'Euclidean distance of returned binding atom from the selected catalyst atom, compared with requested distance.');
check('intermediate-internal', 'Intermediate Maker', 'geometric numerical', 'NO3 atom 1 to atom 2 distance',
  distance(template.atoms[0], template.atoms[1]), distance(placed[0], placed[1]), 'placement', placementInput,
  'Independent Euclidean pair distance in the original template compared with the corresponding returned pair after rigid placement.');

const crystalPath = 'test/fixtures/triclinic.cif';
const crystalText = await readInput(crystalPath);
const cell = { a: 4.1, b: 5.2, c: 6.3, alphaDegrees: 70, betaDegrees: 80, gammaDegrees: 75 };
const fractional = [0.125, 0.250, 0.375];
const radians = degrees => degrees * Math.PI / 180;
const ca = Math.cos(radians(cell.alphaDegrees)), cb = Math.cos(radians(cell.betaDegrees)), cg = Math.cos(radians(cell.gammaDegrees)), sg = Math.sin(radians(cell.gammaDegrees));
const cY = cell.c * (ca - cb * cg) / sg;
const cartesian = [cell.a * fractional[0] + cell.b * cg * fractional[1] + cell.c * cb * fractional[2],
  cell.b * sg * fractional[1] + cY * fractional[2], Math.sqrt(cell.c ** 2 - (cell.c * cb) ** 2 - cY ** 2) * fractional[2]];
const crystal = parseCIF(crystalText);
const exported = cifToQE(crystalText, 'angstrom', 12).text.split(/\r?\n/).find(line => /^C\s/.test(line)).trim().split(/\s+/).slice(1).map(Number);
for (const [index, axis] of ['x', 'y', 'z'].entries()) {
  const input = { path: crystalPath, cell, fractional, atom: 'C1', exportDecimals: 12 };
  check(`crystal-cartesian-${axis}`, 'Crystal Structure', 'geometric numerical', `C1 Cartesian ${axis}`, cartesian[index], crystal.atoms[0][axis], 'coordinate', input,
    'Independent triclinic cell-vector construction from specified lengths and angles, multiplied by specified fractional coordinates.');
  check(`crystal-qe-export-${axis}`, 'CIF to QE conversion', 'numerical format conversion', `C1 exported Cartesian ${axis}`, cartesian[index], exported[index], 'coordinateExport', input,
    'Same independent triclinic reference compared with numeric coordinates read from the 12-decimal ATOMIC_POSITIONS export.');
}
const periodicAtoms = [{ element: 'H', cart: { x: 0.1, y: 0, z: 0 }, frac: { x: 0.01, y: 0, z: 0 } },
  { element: 'H', cart: { x: 9.9, y: 0, z: 0 }, frac: { x: 0.99, y: 0, z: 0 } }];
const lattice = [[10, 0, 0], [0, 10, 0], [0, 0, 10]];
const bonds = findBonds(periodicAtoms, lattice, { rules: [{ a: 'H', b: 'H', min: 0.1, max: 0.3 }] });
if (bonds.length !== 1) throw new Error('Expected one minimum-image control bond.');
check('crystal-minimum-image', 'Crystal Structure', 'geometric numerical', 'orthogonal periodic H H distance', 0.2, bonds[0].distance, 'periodicDistance',
  { atoms: periodicAtoms, latticeAngstrom: lattice }, 'Analytical minimum image distance 10 minus (9.9 minus 0.1), equal to 0.2 angstrom; orthogonal synthetic control.');

// Hash every application source, selected fixture, lockfile, and verification
// runner to identify the exact evaluated bytes even before this addition commits.
const walk = async directory => {
  const result = [];
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await walk(relative));
    else result.push(relative);
  }
  return result;
};
const provenancePaths = [...new Set([...await walk('src'), ...inputFiles.keys(), 'package.json', 'package-lock.json',
  'benchmarks/scripts/run-supplementary-verification.js', 'benchmarks/scripts/run-orbital-real-benchmark.js',
  'benchmarks/scripts/run-bader-real-benchmark.js', 'benchmarks/scripts/run-intermediate-maker-benchmark.js',
  'benchmarks/scripts/run-crystal-pipeline-benchmark.js', 'benchmarks/scripts/run-dos-pipeline-benchmark.js'])].sort();
const files = [];
for (const relative of provenancePaths) files.push({ path: relative, sha256: digest(await readFile(path.join(root, relative))) });
const timestamp = new Date().toISOString();
const name = timestamp.replaceAll(':', '-').replaceAll('.', '-');
const outputRelative = `benchmarks/reviewer-comment-1/supplementary-verification/${name}`;
const output = path.join(root, outputRelative);
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output, { recursive: false });
const report = {
  schemaVersion: 1, evidenceClass: 'separate supplementary verification', timestampUtc: timestamp,
  historicalReference: { report: referenceRun, units: 1433, passed: 1433, unchanged: true, supplementaryChecksAddedToHistoricalTotal: 0 },
  scope: 'Fresh scalar numerical comparisons for selected tools. Not recovery or re-execution of the original 1433-unit run; not a new complete application benchmark.',
  environment: { node: process.version, platform: process.platform, architecture: process.arch, osRelease: os.release(), cpu: os.cpus()[0]?.model },
  provenance: { baseCommit: git('rev-parse', 'HEAD'), trackedApplicationSourceChanges: git('diff', 'HEAD', '--name-only', '--', 'src'), files },
  thresholds, summary: { scalarComparisons: rows.length, passed: rows.filter(row => row.status === 'pass').length,
    failed: rows.filter(row => row.status === 'fail').length, countingRule: 'Each reported scalar comparison is one supplementary check; these are not the historical suite-defined units.' },
  limitations: ['No experimental accuracy or electronic-structure convergence claim.', 'Trapezoidal checks compare algorithms on the same sampled grid, not quadrature error against a continuous spectrum.',
    'Bader checks assume the explicitly stated valence-only convention; they do not validate the upstream density partitioning solver.',
    'Rigid placement and periodic geometry checks do not establish relaxed structures or arbitrary-cell minimum-image correctness.',
    'Fresh thresholds include inherited engineering acceptance limits and two new coordinate limits; no formal floating-point error bound is asserted.'],
  cases: rows,
};
const csvHeaders = ['id', 'tool', 'purpose', 'quantity', 'expected', 'returned', 'absoluteDeviation', 'absoluteTolerance', 'unit', 'status', 'referenceMethod'];
const csvCell = value => `"${String(value).replaceAll('"', '""')}"`;
const csv = [csvHeaders, ...rows.map(row => csvHeaders.map(key => row[key]))].map(row => row.map(csvCell).join(',')).join('\n') + '\n';
const table = '| Tool and quantity | Reference value | Padarthkhoj value | Absolute deviation | Acceptance threshold | Unit | Result |\n|---|---:|---:|---:|---:|---|---|\n'
  + rows.map(row => `| ${row.tool}: ${row.quantity} | ${row.expected.toPrecision(17)} | ${row.returned.toPrecision(17)} | ${row.absoluteDeviation.toExponential(5)} | ${row.absoluteTolerance.toExponential(1)} | ${row.unit} | ${row.status} |`).join('\n');
const markdown = `# Separate supplementary numerical verification\n\nExecuted at ${timestamp}. **${report.summary.passed}/${rows.length} supplementary scalar comparisons passed.** The historical reference remains **1,433/1,433**, with zero supplementary checks added to that total. These are fresh results from the source bytes identified in report.json, not recovered original-run results.\n\n${table}\n\n## Methods and interpretation\n\nReference methods, full inputs, case-specific limits, threshold rationale and SHA256 hashes are recorded in [report.json](report.json). [numerical-comparisons.csv](numerical-comparisons.csv) contains the tabulated values. Numerical limits are absolute and use deviation ≤ threshold. The coordinate and coordinate-export thresholds are new supplementary engineering limits; output rounding is included in the export threshold. The remaining limits are inherited engineering acceptance thresholds. No formal error-bound derivation is claimed.\n\nFull-grid PDOS integrals are not labelled physical occupied populations. The occupied cases end at the supplied Fermi energy and interpolate the boundary. PDOS normalization follows the source file, so integral units are recorded as integrated PDOS units. The DOS pipeline example uses one input record; it tests transfer and energy alignment rather than multi-record summation. Bader values use the stated valence-only convention. Geometry and conversion results verify operations, not physically optimized structures. No experimental validation claim is made.\n\nThe original benchmark scripts and historical reports are unmodified. These supplementary comparisons have their own counting rule and must not be combined with the historical suite-defined unit count.\n`;
await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(path.join(output, 'numerical-comparisons.csv'), csv);
await writeFile(path.join(output, 'README.md'), markdown);
console.log(`${report.summary.passed}/${rows.length} separate supplementary comparisons passed. Historical total unchanged: 1433/1433.`);
console.log(`Reports: ${outputRelative}`);
if (report.summary.failed) process.exitCode = 1;
