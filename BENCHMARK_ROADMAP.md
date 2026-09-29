# Padarthkhoj Tools — Research Benchmark Roadmap

## Purpose

This document converts the scientific claims of Padarthkhoj Tools into reproducible, measurable tests for a research-software paper. It is a working checklist: each phase must produce archived inputs, independently determined reference values, machine-readable results, and a short interpretation suitable for the manuscript.

## Current benchmark status

- The repository currently contains 60 automated tests.
- Existing tests cover QE workflow generation, QE/VASP PDOS parsing, Bader analysis, orbital metrics, ZPE/TS calculations, CIF processing, reaction intermediates, free-energy data, plotting templates, and bond generation.
- The reproducible publication benchmark now contains 11 suites and 1,465 validation units; the current reference run passes 1,465/1,465 units.
- Frozen real datasets include seven QE PDOS files, real VASP spin and non-spin DOSCAR/structure pairs, three valid QE/VASP Bader datasets, three production QE outputs, two real catalyst structures, and the curated 23-sheet ZPE/TS reference dataset.
- Numerical references, tolerances, provenance manifests, SHA-256 fixture protection, machine-readable reports, and supplementary validation text are implemented.
- The remaining publication-strengthening work is external reproduction, repeated multi-platform performance testing, usability evidence, and archival release/DOI preparation; these are not represented by the 100% software-rule pass rate.

## Responsibilities

### Work Codex can prepare

- Benchmark directory and manifest schema
- Reference parsers and independent numerical checks
- Automated benchmark runner
- Error, timing, and memory summaries
- CSV/JSON result files
- Statistical analysis scripts
- Manuscript tables and plots
- Reproducibility instructions
- Validation and limitation text for the paper

### Work requiring Sourav or another researcher

- Confirm scientifically intended settings in disputed cases
- Supply legally shareable QE/VASP example outputs where needed
- Run external QE/VASP calculations when executables are unavailable locally
- Recruit participants for the usability study
- Obtain consent/ethics approval if required by the institution or journal
- Arrange one independent reproduction by a researcher who did not develop the software

## Benchmark questions

| ID | Claim to test | Primary measurement | Reference |
|---|---|---|---|
| C1 | Generated QE workflows are syntactically and semantically consistent | Valid-file rate, normalized parameter agreement, executable order | Official QE documentation and manually verified inputs |
| C2 | QE and VASP PDOS data are parsed correctly | Maximum absolute error, RMSE, channel/species identification accuracy | Independently implemented parser and hand-checks |
| C3 | Bader charges preserve atom identity and charge convention | Atom mapping accuracy, MAE, charge-sum consistency | Hand-calculated ACF cases |
| C4 | Orbital occupancy and centres are numerically correct | Absolute and relative integration errors | Independent high-precision integration |
| C5 | ZPE and TS values are correct | Absolute error per mode and total | Analytical harmonic-oscillator calculation |
| C6 | Generated intermediates satisfy requested geometry constraints | Anchor-distance error, orientation error, collision count | Direct geometry calculation |
| C7 | Multiple-file workflows remain reliable and responsive | Runtime, peak memory, successful completion | Controlled scaling datasets |
| C8 | The interface reduces effort without reducing correctness | Completion time, error count, success rate, workload score | Randomized crossover user study |
| C9 | Results are reproducible across supported environments | Output hash/numerical agreement and reproduction success | Clean-machine/browser repetitions |

## Phased execution

### Phase 1 — Benchmark infrastructure

- [x] Create `benchmarks/` with reference, result, script, and schema areas; the fixtures area will be added with the first file-backed module.
- [x] Define a JSON manifest containing case ID, module, input data, provenance, expected outcome, and tolerance.
- [x] Add a benchmark command that does not replace the fast unit-test command.
- [x] Record environment metadata: application commit, Node version, OS, CPU, and memory. Browser metadata will be added for UI/performance phases.
- [x] Produce a one-row result for every case, including pass/fail, numerical error, runtime, and diagnostic message.

**Exit condition:** one example ZPE case runs end-to-end and creates JSON and CSV results. **Completed with a 12-case ZPE/TS pilot.**

### Phase 2 — Exact numerical modules

- [x] ZPE/TS analytical reference set: 12 cases, plus 23 curated workbook sheets.
- [x] Orbital occupancy/centre set: 54 real QE channel metrics.
- [x] Bader set: 696 per-atom records across three valid datasets plus a mismatched negative control.
- [x] PDOS pipeline set: four real QE groups and two real VASP datasets spanning spin and non-spin modes.

**Exit condition:** every numerical quantity has an independent reference and documented tolerance.

### Phase 3 — QE workflow generation

- [x] SCF and relaxation cases.
- [x] DOS workflow cases.
- [x] Band-structure workflow cases.
- [x] Charge-density and Bader workflow cases.
- [x] Vibrational workflow cases with and without DFT-D3 Hessian steps.
- [x] Compare parsed scientific content so formatting differences do not count as scientific errors.
- [ ] Where possible, perform QE parser or dry-run validation.

**Exit condition:** at least 25 workflows are assessed with parameter-level results.

### Phase 4 — Structures and intermediates

- [x] CIF parsing and round-trip cases across representative crystal systems and real structures.
- [x] Preset HER, ORR/OER, NRR, and CO2RR cases.
- [x] Custom-pathway cases with different binding atoms.
- [x] Measure distance, orientation, periodic-boundary collisions, and export validity.

**Exit condition:** at least 15 geometry cases with explicit geometric metrics and no unsupported energetic claims.

### Phase 5 — Robustness and scaling

- [x] Malformed, empty, inconsistent, and mismatched inputs.
- [x] Atom counts up to 336, real DOS grids up to 3,008 QE points and 2,001 VASP points, and multi-file workflows.
- [ ] Repeat each timing case sufficiently to report median and interquartile range.
- [ ] Test at least three browsers and two hardware classes for the final paper.

**Exit condition:** failure detection and scaling curves are ready for the manuscript.

### Phase 6 — User study

- [ ] Define 4–6 realistic computational-materials tasks.
- [ ] Prepare manual-workflow and Padarthkhoj instructions of comparable completeness.
- [ ] Randomize task order with a crossover design.
- [ ] Record completion time, correctness, errors, retries, documentation consultations, confidence, and workload.
- [ ] Predefine statistical tests and exclusions before collecting data.

**Exit condition:** anonymized raw data, analysis script, effect sizes, confidence intervals, and study limitations are archived.

### Phase 7 — Reproducibility package

- [ ] Clean-machine independent reproduction.
- [ ] Tagged release and archived dataset with persistent identifier.
- [ ] License, citation metadata, contribution guide, and versioned manual.
- [ ] Generate all manuscript benchmark tables and figures from archived results.

**Exit condition:** a reviewer can regenerate the reported benchmark results without editing the source code.

## Required reporting rules

1. Never use the production implementation itself as its only numerical reference.
2. Record failures as results; do not silently remove difficult cases.
3. Define tolerances before examining the final aggregate scores.
4. Separate syntax validity, numerical correctness, scientific appropriateness, and usability.
5. Do not describe unrelaxed intermediate geometries as stable adsorption structures.
6. Do not claim that existing tools are obsolete. Report measurable coverage, correctness, or efficiency differences.
7. Publish software version, dataset version, hardware, browser, and command used for every benchmark table.

## Initial target dataset

| Module | Valid cases | Invalid/boundary cases | Initial total |
|---|---:|---:|---:|
| ZPE/TS | 8 | 4 | 12 |
| Orbital metrics | 10 | 5 | 15 |
| Bader | 8 | 4 | 12 |
| QE/VASP PDOS | 14 | 6 | 20 |
| QE workflows | 20 | 5 | 25 |
| Structures/intermediates | 12 | 5 | 17 |
| Plot and export handling | 8 | 4 | 12 |
| **Total** | **80** | **33** | **113** |

## Immediate next step

Freeze a tagged software release and archive the benchmark fixtures/results with a persistent identifier. Then perform an independent clean-machine reproduction and repeated browser/hardware timing study. These external steps should remain separate from the completed deterministic software-validation result.
