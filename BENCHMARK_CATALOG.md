# Padarthkhoj benchmark catalogue

This document explains the datasets, cases, reference values, tolerances, and pass criteria used by the Padarthkhoj benchmark suite. It is intended for developers, reviewers, and manuscript preparation.

## How to read the benchmark numbers

A **validation unit** is the smallest check reported by a suite. Depending on the module, it may be an analytical case, an Excel sheet, an orbital channel metric, a generated-file rule, a geometry invariant, or an expected rejection. Therefore, validation-unit counts show test coverage but should not be interpreted as equal-sized independent experiments.

The suite uses three evidence classes:

1. **User-supplied real data**: real QE PDOS files, ACF.dat files, SCF inputs, CIF/CONTCAR structures, and the ZPE/TS workbook supplied during development.
2. **Reference-derived structures**: intermediate geometries transcribed from the supplied relaxed structures and stored as molecular templates.
3. **Synthetic controls**: deliberately small transparent files used to isolate parser layouts, invalid inputs, branch logic, unit conversions, and error handling.

All retained external fixtures have SHA-256 hashes where provenance integrity matters.

## 1. Analytical ZPE and TS benchmark

Runner: `benchmarks/scripts/run-benchmarks.js`  
Manifest: `benchmarks/manifest.json`  
Reference implementation: `benchmarks/references/zpe-ts-reference.js`

The website implementation and the reference implementation independently evaluate the harmonic-oscillator expressions using exact SI constants. The compared outputs are ZPE, thermal vibrational energy, entropy, `T*S`, and the free-energy correction.

| Case | Input | Purpose |
|---|---|---|
| `zpe-reference-spectrum-298k` | 7 supplied frequencies at 298.15 K | Primary workbook-derived spectrum |
| `zpe-single-mode-300k` | 10 THz at 300 K | Transparent single-mode calculation |
| `zpe-temperature-100k` | 2.5, 8, 25, 75 THz | Low-temperature behaviour |
| `zpe-temperature-1000k` | Same spectrum | High-temperature behaviour |
| `zpe-low-frequency-298k` | 0.01, 0.05, 0.1 THz | Large-entropy numerical regime |
| `zpe-high-frequency-298k` | 500, 1000, 5000 THz | Exponential-underflow stability |
| `zpe-excluded-modes` | -2, 0, 10 THz | Zero/imaginary-mode exclusion |
| `zpe-empty-spectrum` | No modes | Auditable zero result |
| `zpe-nonfinite-mode` | Invalid text plus 12 THz | Invalid-mode reporting |
| `zpe-invalid-zero-temperature` | 0 K | Expected rejection |
| `zpe-invalid-negative-temperature` | -10 K | Expected rejection |
| `zpe-invalid-text-temperature` | `room` | Expected rejection |

Tolerances are case-specific: normally `1e-12 eV` for energy and `1e-9 J mol-1 K-1` for entropy, tightened or relaxed slightly for numerical-boundary cases.

## 2. Supplied Excel ZPE and TS benchmark

Fixture: `benchmarks/fixtures/zpe-ts/excel-reference-cases.json`  
Runner: `benchmarks/scripts/run-zpe-excel-benchmark.js`

The original workbook contained many sheets. Only the 23 sheets explicitly approved by the user were retained:

`COOH`, `CO`, `CHO`, `COH`, `2CO`, `COCOH`, `CCO`, `CHCO`, `CHCHO`, `CH2CHO`, `O`, `OH`, `CH3CHO`, `CH3CH2O`, `CH3CH2OH`, `CO_free`, `H2`, `O2`, `CO2_free`, `H2O`, `H2O2`, `C2H4`, and `CH4`.

Excluded sheets: `Sheet1`, `Sheet2`, `CH4_ads`, and `CO2_adsorbed`.

For every retained sheet the fixture stores:

- all positive vibrational frequencies in THz;
- the worksheet ZPE and TS values;
- results recalculated with the worksheet's own constants/formulas;
- results recalculated with the website constants.

`CH3CH2OH` uses all 22 modes, as explicitly requested. Its original incomplete worksheet result is retained only as provenance metadata. A case passes when the application reproduces the stored Excel-formula evaluation within `1e-12 eV`. The separately reported website-minus-workbook difference reflects rounded constants and worksheet choices; it is not the independent analytical error.

## 3. Real QE PDOS and orbital-metrics benchmark

Directory: `benchmarks/fixtures/orbital-metrics/qe-real/`  
Manifest: `benchmarks/fixtures/orbital-metrics/qe-real/manifest.json`

Seven user-supplied spin-polarized `projwfc.x` files are used:

| Group | Files | Atom/orbitals | Fermi energy |
|---|---|---|---:|
| C-p | `full.pdos_atm#2(C)_wfc#2(p)` | C atom 2, p | -3.162 eV |
| Cu-pd | `1D_relax.pdos_atm#1(Cu)_wfc#2(p)` and `wfc#3(d)` | Cu atom 1, p+d | -1.6468 eV |
| Ag-pd | `2NCB_Ag.pdos_atm#30(Ag)_wfc#2(p)` and `wfc#3(d)` | Ag atom 30, p+d | -1.894 eV |
| Fe-pd | `2NCB_Fe.pdos_atm#29(Fe)_wfc#2(p)` and `wfc#3(d)` | Fe atom 29, p+d | -1.746 eV |

Point counts are 2460, 2831, 3008, and 2986 respectively. The 54 channel metrics arise from spin-up and spin-down p/d components. Each channel is integrated independently with the trapezoidal rule over the complete grid and from the grid minimum to the supplied Fermi energy. Linear interpolation is used at a Fermi boundary between grid points. Occupancy and centre from the application must match the independent reference calculation within `1e-11`.

## 4. Real QE and VASP Bader benchmark

Directories: `benchmarks/fixtures/bader/`

### Valid VASP case

- Case: `bader-vasp-real-001`
- Files: `ACF.dat` and corrected `CONTCAR`
- 156 atoms: Cu10 S6 O13 F12 N3 C40 H72
- Density convention: valence-only ACF
- Core-electron subtraction: Cu 18, S 10, O 2, F 2, N 2, C 2, H 0
- Maximum coordinate mismatch tolerance: 0.001 Å
- Charge-conservation tolerance: `2e-4 e`

### First QE case

- Case: `bader-qe-real-001`
- Files: `ACF.dat`, `full_scf.in`, and `full.cif`
- 336 atoms: C200 N16 H120
- The benchmark validates SCF atom ordering, ACF mapping, per-atom charge arithmetic, and conservation arithmetic.
- The nonzero summed charge of about `+1.8661 e` is retained as a property of the supplied dataset. It is not presented as a neutral-system physical reference.

### Second QE case

- Case: `bader-qe-real-002`
- Files: `ACF.dat`, `halfc1_scf.in`, and `halfc1.cif`
- 204 atoms: C116 N8 H80
- Core subtraction: C 2, N 2, H 0
- Total charge is approximately `-0.0021 e`, making this the clean neutral QE reference.

### Negative control

`bader-vasp-mismatched-atom-count-001` pairs an ACF file containing 156 atoms with an older CONTCAR containing 152 atoms. Passing means the application rejects the pair before assigning charges to elements.

## 5. QE workflow-generation benchmark

Source structure: real 204-atom `halfc1.cif`.

Eight protocols generate 29 files:

| Protocol | Expected files |
|---|---|
| SCF | `halfc1_scf.in`, submit script |
| Structural relaxation | `halfc1_relax.in`, submit script |
| DOS | SCF, NSCF, `dos.x`, submit script |
| Bands | SCF, band-path NSCF, `bands.x`, submit script |
| Charge density | SCF, `pp.x`, submit script |
| Bader | SCF, all-electron `pp.x`, valence `pp.x`, submit script |
| Vibrational D3 | SCF, Hessian, `ph.x`, `dynmat.x`, submit script |
| Vibrational non-D3 | Same five-file package, with D3 Hessian execution skipped |

The 76 rules verify filenames, atom preservation, pseudopotentials, calculation modes, SCF/NSCF occupation defaults, band paths and warnings, `plot_num`, absence of `lsym`, executable order, strict shell behaviour, and absence of `NaN`/`undefined`. Structural relaxation currently means `vc-relax`, including `&IONS` and `&CELL`.

## 6. Preset Intermediate Maker benchmark

Catalyst: real 204-atom `halfc1.cif`. Each template is placed at 1.6, 1.8, and 2.2 Å along a controlled outward direction. This produces 162 placements.

Pathways and stored order:

- NO3 to NH3: `NO3 → NO3H → NO2 → NO2H → NO → NOH → NHO → NHOH → N → NH → NH2 → NH2OH → NH3`
- N2 to NH3: `NNH → NNH2 → NHNH → NHNH2 → NH2NH2 → N → NH → NH2 → NH3`
- CO2 to C2H4: `CO2 → COOH → CO → CO-CO → COH → COCOH → CCO → CHCO → CHCHO → CH2CHO → C2H4`
- CO2 to C2H5OH: the shared sequence through `CH2CHO`, then `CH3CHO → CH3CH2O → CH3CH2OH`
- Alternative C1 route: `CO2 → COOH → CO → CHO`
- HER: `H`
- OER/ORR: `O → OH → OOH`

For every placement the benchmark checks binding distance, rigid preservation of every internal pair distance, outward-axis alignment, finite coordinates, element ordering, and CIF export/reparse. Collision and clearance detectors are tested with deliberate negative controls. Collision counts for a fixed benchmark anchor are recorded but are not interpreted as chemical validity because the user controls site and direction.

## 7. Custom Pathway Designer benchmark

Three synthetic molecule-only CIF uploads are used to simulate multi-file input:

- `CO.cif`: 2 atoms, binding atom 1;
- `OOH.cif`: 3 atoms, binding atom 2;
- `NH3.cif`: 4 atoms, binding atom 1.

The ordered pathway is exported to JSON, imported, re-exported, and required to be byte-for-byte deterministic. It is then applied to two real catalysts: `halfc1` (204 atoms) and `full` (336 atoms), creating six structures. Generated CIFs and the two JSON metadata files are placed into ZIP archives, which are reopened and audited.

For deterministic automation, the benchmark chooses the atom with the largest Cartesian z coordinate as the anchor; in these two fixtures that happens to be H. This choice tests software geometry and portability only and is **not** a claim that H is the chemically correct active site.

Negative controls cover malformed JSON, incorrect format, empty pathway, duplicate labels, invalid binding index, and missing intermediate name.

## 8. End-to-end DOS/PDOS pipeline benchmark

The complete tested chain is raw input → selection → Fermi shift → sum → CSV → DOS Plotter → occupancy/centre.

### QE datasets

The four real QE groups and Fermi energies listed in Section 3 are reused.

### Real VASP datasets

- `VASP-real-spin-001`: real 152-atom lm-resolved DOSCAR plus matching CONTCAR; composition Cu10 S6 O10 F12 N2 C40 H72; 2,001 energy points; Fermi energy -3.3484874 eV. The total-DOS block has five columns and each projected row has 19 columns, establishing a collinear spin-polarized layout.
- `VASP-real-nonspin-001`: real 18-atom lm-resolved DOSCAR plus matching POSCAR; composition Mo12 C6; 2,000 energy points; Fermi energy 12.3955736 eV. The total-DOS block has three columns and each projected row has 10 columns, establishing a non-spin-polarized layout.

Both DOSCAR/structure pairs are stored with SHA-256 checksums. The benchmark verifies spin detection, NEDOS, Fermi-energy extraction, atom count, POSCAR/CONTCAR species mapping, species selection, Fermi subtraction, CSV transfer, plotting, and downstream orbital metrics.

For all six datasets the exported CSV must reproduce every channel exactly in the DOS Plotter and orbital-metrics parser. The benchmark also verifies reusable styles, finite-range fill interpolation, recognizable filenames, and rejection of mixed spin modes or descending energy grids.

## 9. Free Energy Diagram Studio benchmark

Four synthetic, auditable datasets contain 21 energy states:

| Case | Format | Purpose |
|---|---|---|
| `single-comma` | CSV | Four-step single path |
| `branched-tab` | TSV | Main and alternative branches |
| `split-merge-semicolon` | Semicolon | Three-way split and merge |
| `unordered-whitespace` | Spaces | Sorting and ignored malformed/header lines |

The 63 rules cover row and energy preservation, branch grouping, sorting, Y padding, tick intervals, automatic connections, canonical connection keys, continuity connectors, legacy configuration migration, multi-plot style propagation, annotation deep-copying, light/dark renderer execution, and PNG dimensions. A 6 x 4 inch export at 300 DPI must equal 1800 x 1200 pixels.

## 10. Crystal Structure pipeline benchmark

Four CIFs containing 545 atoms in total are used:

- `triclinic.cif`: two-atom P1 non-orthogonal reference;
- `nacl-symmetry.cif`: symmetry expansion/deduplication reference, producing two Na and one Cl;
- real `halfc1.cif`: 204 atoms;
- real `full.cif`: 336 atoms.

Each structure undergoes a deterministic edit sequence: replace the first element, displace its fractional coordinates by `(0.001, 0.002, 0.003)`, delete the last atom, and add a displaced H atom. Therefore, the final atom count must equal the original while all four edit operations remain observable.

The suite verifies fractional/Cartesian finiteness, cell preservation, lattice and `ibrav` inference, positive k mesh, automatic bond-threshold monotonicity, custom pair rules, periodic minimum-image bonding, CIF round-trip, QE crystal/angstrom conversion, edited species propagation, invalid-input rejection, and timing up to 336 atoms.

## 11. QE Output Studio benchmark

Five output scenarios are used. Three are user-supplied production QE outputs protected by SHA-256 checksums:

- `full_scf.out`: real 352-atom SCF output with 31 SCF iterations and final energy -4296.74159793 Ry;
- `full_relax.out`: real 336-atom fixed-cell relaxation with 171 energy/coordinate records, 2,158 SCF iterations, final energy -4278.31286654 Ry, and final force 0.005299 Ry/Bohr;
- `2NCB_Ag_vcrelax.out`: real 49-atom variable-cell relaxation with 14 ionic snapshots, 134 SCF iterations, 15 energy points, final energy -690.36319702 Ry, final force 0.003586 Ry/Bohr, and final pressure -2.49 kbar;
- `controlled-interrupted-latest`: incomplete vc-relax using Bohr units, a nonconvergence message, and a QE error;
- `controlled-malformed`: text that is not a QE output.

The parser records energy, force, pressure, SCF iterations, convergence, `JOB DONE`, and errors with line numbers. Structure cases test correct selection of `initial`, `latest`, or `final` coordinates, Bohr-to-angstrom conversion, CIF and ATOMIC_POSITIONS export, and invalid-output handling.

The interrupted-run fixer is tested separately: final coordinates and cell replace their original-input blocks while `ecutwfc` and `K_POINTS` remain unchanged. Output-only reconstruction must produce a clean QE input without `NaN` or `undefined`.

## Reproducing and inspecting the results

Run every suite:

```bash
npm run benchmark
```

Primary consolidated reports:

- `benchmarks/results/latest-unified.md`
- `benchmarks/results/latest-unified.csv`
- `benchmarks/results/latest-unified.json`

Every module also writes a detailed `latest-*.json` report containing individual rules or cases. CSV reports provide spreadsheet-friendly numerical tables. Benchmark fixtures are stored under `benchmarks/fixtures/`, while synthetic controls are declared directly in their runner scripts so their expected values remain visible beside the test logic.

## What the present benchmark does not yet establish

- It is not a blinded external inter-laboratory validation.
- The real VASP datasets validate the supported spin and non-spin DOSCAR layouts and downstream numerical preservation, but no claim is made that the integrated orbital populations are unique physical observables independent of VASP projection settings.
- Fixed geometric placement validates rigid transformations, distances, collision detection, and export—not the energetic stability of an adsorbate. DFT relaxation remains required.
- Single-run timings are development diagnostics. Formal performance claims require repeated trials, uncertainty intervals, and controlled hardware conditions.
- A 100% software-rule pass rate does not mean every automatically generated scientific input is physically appropriate for every material; convergence, pseudopotentials, magnetic states, k meshes, pathways, and active sites still require expert judgement.
