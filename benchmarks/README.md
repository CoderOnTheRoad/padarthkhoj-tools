# Padarthkhoj benchmark suite

## Run everything and create paper-ready tables

Run `npm run benchmark` to execute every benchmark suite and regenerate the consolidated reports. The master runner stops if any suite fails and writes `benchmarks/results/latest-unified.json`, `latest-unified.csv`, and `latest-unified.md`, together with timestamped archival copies. The Markdown report is formatted for direct use while preparing the validation section of a manuscript.

This directory contains the reproducible validation evidence used for the Padarthkhoj Tools research paper. It is separate from `test/`: unit tests protect implementation behaviour, while these cases measure scientific agreement, rejected-input behaviour, runtime, and provenance against frozen references.

## Run

```bash
npm run benchmark
```

The runner writes timestamped JSON and CSV reports to `benchmarks/results/` and updates `latest.json` and `latest.csv`. Generated reports include the application version, Git commit, Node version, operating system, CPU, memory, case provenance, tolerances, errors, timing, and pass/fail status.

## Pilot module: ZPE and TS

The ZPE/TS reference implementation in `references/zpe-ts-reference.js` is intentionally independent of `src/lib/zpeTs.js`. It declares exact SI constants separately and evaluates the harmonic-oscillator equations directly. Cases include ordinary molecular spectra, temperature variation, high-frequency modes, low-frequency modes, rejected zero/imaginary modes, invalid temperature, and an invalid non-finite frequency.

This is software verification of the documented harmonic model. It is not experimental validation of the harmonic approximation for a particular material.

### User-calculated Excel reference set

`fixtures/zpe-ts/excel-reference-cases.json` preserves the 23 workbook sheets explicitly approved by Sourav Ghosh. Each record contains its sheet name, positive frequencies used by the worksheet, and the worksheet-reported ZPE and TS values. The workbook's working constants are stored once at dataset level. `Sheet1`, `Sheet2`, `CH4_ads`, and `CO2_adsorbed` are explicitly recorded as excluded. The original workbook remains outside the repository because it may contain unpublished supporting data.

Run the dual-reference comparison with:

```bash
npm run benchmark:zpe-excel
```

This first verifies the stored Excel values by independently recalculating them with the workbook constants. It then compares them descriptively with the website result obtained from exact SI constants at 298.15 K. The expected constants-related difference is reported, not incorrectly classified as application failure.

The `CH3CH2OH` source worksheet originally summed only 9 of its 22 modes for TS (`Q12:Q20`). Following confirmation from the dataset owner that all 22 modes must be included, the fixture stores the corrected 22-mode TS result and retains the original worksheet value plus the correction reason in `referenceCorrection` for provenance.

## Result interpretation

- `expected-valid`: the production result must agree with the independent reference within the manifest tolerances.
- `expected-rejection`: the application must reject the complete calculation with the expected diagnostic.
- A mode-level zero or negative frequency can be an accepted case when the manifest expects the mode to be excluded and reported.
- Timing values are descriptive for this pilot and must not yet be presented as cross-machine performance results.

## Real QE orbital-metrics set

Seven user-supplied spin-polarized `projwfc.x` files are stored under `fixtures/orbital-metrics/qe-real/` with SHA-256 provenance. Run `npm run benchmark:orbital-real` to verify (p/d) channel parsing, compatible energy grids, full-grid metrics, and occupied-state trapezoidal integrals and centres against a raw-column reference reader. The occupied range ends at the user-supplied Fermi energy for each calculation group, with linear interpolation where it lies between sampled grid points.

## Directory contract

- `fixtures/`: frozen input data where a module requires files.
- `references/`: independent reference implementations or archived trusted values.
- `schema/`: benchmark manifest schema.
- `scripts/`: runners and report generators.
- `results/`: generated reports; retain the exact report used in a manuscript release.

## Bader robustness fixtures

`fixtures/bader/vasp-mismatch-001/` preserves a user-supplied real VASP pair in which `ACF.dat` contains 156 atomic records but `CONTCAR` contains 152 atoms. It is intentionally retained as a negative benchmark: the files must be rejected before charge values are assigned to elements.

For that VASP case, provisional neutral-reference electron counts are Cu 11, S 6, O 6, F 7, N 5, C 4, and H 1. The corresponding frozen-core inputs for the current interface formula are Cu 18, S 10, O 2, F 2, N 2, C 2, and H 0. These must be checked against POTCAR `ZVAL` before publication.

`fixtures/bader/vasp-real-001/` contains the corrected matching 156-atom CONTCAR. Its atom order and coordinates agree with ACF.dat within 0.0000192 Å, so it is the first valid real VASP Bader benchmark. The earlier mismatched files remain separately archived as the negative robustness case.

`fixtures/bader/qe-real-001/` contains a valid 336-atom QE set with ACF.dat, SCF input, and CIF. Its composition is C200N16H120. Its ACF total demonstrates reconstructed all-electron density, so the current interface must use zero core subtraction for C, N, and H. This differs from a valence-density VASP ACF and is explicitly documented in the manifest.

`fixtures/bader/qe-real-002/` contains a 204-atom C116N8H80 QE set whose SCF and CIF coordinates agree to numerical precision. Its ACF total is 584.0022 electrons versus an expected 584 valence electrons, so it is a clean neutral valence-density reference using core subtractions C 2, N 2, and H 0.

Run `npm run benchmark:bader-real` to generate per-atom and dataset-level validation reports. The runner checks hashes, atom mapping, density convention, independent charge calculation, element summaries, total charge, and charge conservation for both valid sets, while also confirming rejection of the mismatched VASP pair.

Per-atom arithmetic is checked at strict floating-point tolerance. Total-charge conservation against the ACF footer uses a separate 0.0002-electron tolerance because the footer is printed with fewer decimal places than the individual atomic rows and rounding accumulates across hundreds of atoms.

## Real-CIF QE workflow generation

Run `npm run benchmark:qe-workflows` to generate SCF, relaxation, DOS, bands, charge-density, Bader, DFT-D3 vibrational, and non-D3 vibrational workflows from the real 204-atom halfc1 CIF. The report records every generated filename and independently checks protocol-specific cards, defaults, postprocessors, executable order, atom preservation, pseudopotentials, and cross-file cleanliness.

## Intermediate Maker geometry and export

Run `npm run benchmark:intermediates` to exercise every built-in reaction pathway against the real 204-atom `halfc1.cif` catalyst. The benchmark checks pathway order, binding-atom placement at three requested distances, outward molecular-axis alignment, rigid preservation of every internal pair distance, finite coordinates, CIF export/reparse integrity, unique filenames, sphere suggestions, collision detection, clearance detection, and deterministic generation timing. Results are written to `benchmarks/results/latest-intermediate-maker.json`, `latest-intermediate-geometries.csv`, and `latest-intermediate-performance.csv`.

## Custom Pathway Designer

Run `npm run benchmark:custom-pathways` to simulate a multi-CIF user pathway, explicit attachment-atom choices, JSON export/import, reuse on two real catalysts, complete CIF/JSON ZIP packaging, and malformed-input rejection. Reports are written to `benchmarks/results/latest-custom-pathways.json` and `latest-custom-pathway-placements.csv`.

## End-to-end QE and VASP DOS/PDOS pipeline

Run `npm run benchmark:dos-pipeline` to validate raw QE PDOS and VASP DOSCAR/POSCAR ingestion, atom/species/orbital selection, Fermi-level shifting, summed CSV export, DOS Plotter parsing and reusable styling, fill-range interpolation, and downstream orbital occupancy/centre calculations. The VASP coverage uses two user-supplied real datasets stored under `fixtures/dos-pipeline/vasp-real/`: a 152-atom spin-polarized DOSCAR/CONTCAR pair with 2,001 energy points and an 18-atom non-spin-polarized DOSCAR/POSCAR pair with 2,000 energy points. SHA-256 manifests protect both pairs, and the runner verifies spin layout, Fermi energy, atom count, composition mapping, species selection, and downstream numerical preservation. Reports are written to `benchmarks/results/latest-dos-pipeline.json` and `latest-dos-pipeline-metrics.csv`.

## Free Energy Diagram Studio

Run `npm run benchmark:free-energy` to test comma/tab/semicolon/whitespace ingestion, single and branched pathways, energy and order preservation, automatic connectivity, branch continuity, connection-key round trips, axis migration, multi-plot style templates, light/dark canvas rendering, and inch/pixel PNG export dimensions. Reports are written to `benchmarks/results/latest-free-energy.json` and `latest-free-energy-cases.csv`.

## Crystal Structure pipeline

Run `npm run benchmark:crystal-pipeline` to validate CIF parsing, symmetry expansion, deterministic atom replacement/displacement/deletion/addition, bond generation with periodic and custom thresholds, CIF export/re-import, QE coordinate conversion, lattice/ibrav/k-mesh inference, invalid-CIF rejection, and performance on structures up to 336 atoms. Reports are written to `benchmarks/results/latest-crystal-pipeline.json` and `latest-crystal-pipeline-cases.csv`.

## QE Output Studio

Run `npm run benchmark:qe-output` to validate SCF, relax, vc-relax, interrupted, unit-conversion, and malformed output handling; energy/force/pressure/iteration histories; convergence and error diagnostics; latest/final structure selection; CIF and ATOMIC_POSITIONS export; and interrupted-run input patching. The primary fixtures are three user-supplied production outputs stored under `fixtures/qe-output/real/`: a 352-atom SCF output, a 336-atom fixed-cell relaxation, and a 49-atom variable-cell relaxation. Controlled interrupted and malformed cases remain solely for failure handling. Reports are written to `benchmarks/results/latest-qe-output.json` and `latest-qe-output-cases.csv`.
