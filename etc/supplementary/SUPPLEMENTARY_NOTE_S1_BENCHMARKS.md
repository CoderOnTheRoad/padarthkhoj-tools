# Supplementary Note S1: Benchmark datasets, validation protocols, and acceptance criteria

## S1.1 Scope and validation philosophy

Padarthkhoj Tools was evaluated using a modular benchmark suite designed to test numerical calculations, scientific-file parsing, structure manipulation, workflow generation, visualization data transfer, and failure handling. The benchmark reported here corresponds to Padarthkhoj Tools v1.0.0 and contains 11 suites. In the recorded reference run, 1,465 of 1,465 validation units passed. A *validation unit* denotes the smallest independently evaluated item in a suite, such as an analytical case, an orbital-channel metric, a generated-file rule, a geometry invariant, or an expected input rejection. Consequently, the validation-unit count quantifies software-test coverage and must not be interpreted as 1,465 statistically independent scientific experiments.

Three evidence classes were used. **Real project data** comprise user-supplied Quantum ESPRESSO (QE) projected-density-of-states files, Bader `ACF.dat` files, QE input files, CIF/POSCAR-family structures, and the supplied ZPE–TS workbook. **Reference-derived data** comprise molecular templates extracted from supplied relaxed adsorbate structures. **Synthetic controls** are deliberately small and transparent inputs used to isolate parser layouts, spin conventions, numerical boundary conditions, branching logic, and expected failures. Synthetic controls are explicitly identified below and were not used as evidence of real-material accuracy. Where provenance integrity is important, retained external fixtures are associated with SHA-256 hashes in the machine-readable benchmark manifests.

### Table S1. Summary of the benchmark suites

| Suite | Workload | Validation units | Principal quantity or rule | Reference-run result |
|---|---:|---:|---|---:|
| Analytical ZPE and TS | 12 cases | 12 | Harmonic thermochemistry and invalid-input handling | 12/12 |
| Supplied ZPE–TS workbook | 23 sheets | 23 | Worksheet-formula reproduction | 23/23 |
| Real QE orbital metrics | 7 files, 54 channels | 54 | Occupancy and DOS-centre integration | 54/54 |
| QE and VASP Bader analysis | 3 valid datasets and 1 negative control | 4 | Atom mapping and charge arithmetic | 4/4 |
| QE workflow generation | 8 protocols, 29 files | 76 | Content and executable-order rules | 76/76 |
| Preset Intermediate Maker | 7 pathways, 162 placements | 940 | Rigid placement and export invariants | 940/940 |
| Custom Pathway Designer | 3 molecules × 2 catalysts | 42 | Pathway persistence, placement, and ZIP export | 42/42 |
| QE and VASP DOS/PDOS pipeline | 4 real QE groups and 2 real VASP datasets | 83 | End-to-end channel preservation | 83/83 |
| Free Energy Diagram Studio | 4 datasets, 21 states | 63 | Parsing, topology, style, and export rules | 63/63 |
| Crystal Structure pipeline | 4 structures, 545 atoms | 82 | Editing, bonding, conversion, and round-trip rules | 82/82 |
| QE Output Studio | 3 real outputs and 2 controlled failure cases | 86 | Output parsing, structure recovery, and restart generation | 86/86 |

The reference run was executed on macOS/ARM64 with Node.js v24.15.0. Reported runtimes are single-run development diagnostics and are not used to support formal performance or scalability claims.

## S1.2 Zero-point-energy and vibrational-entropy validation

For a set of positive harmonic frequencies \(\nu_i\), the implementation evaluates the zero-point energy (ZPE), vibrational internal energy, entropy, and free-energy correction using

\[
E_{\mathrm{ZPE}}=\frac{1}{2}\sum_i h\nu_i,
\]

\[
U_{\mathrm{vib}}=\sum_i h\nu_i\left[\frac{1}{2}+\frac{1}{\exp(x_i)-1}\right], \qquad x_i=\frac{h\nu_i}{k_{\mathrm B}T},
\]

\[
S_{\mathrm{vib}}=k_{\mathrm B}\sum_i\left[\frac{x_i}{\exp(x_i)-1}-\ln\left(1-\exp(-x_i)\right)\right],
\]

and \(G_{\mathrm{vib}}=U_{\mathrm{vib}}-TS_{\mathrm{vib}}\). Frequencies entered in THz are converted to Hz before evaluation. Zero, negative, non-numeric, or non-finite modes are excluded and reported according to the input-validation rules; a non-positive or non-numeric temperature is rejected.

The application implementation was compared with an independently coded reference implementation using exact SI constants. The 12 analytical cases included a supplied seven-frequency spectrum at 298.15 K; a transparent single-mode 10 THz case at 300 K; a common four-mode spectrum at 100 and 1,000 K; low-frequency (0.01–0.1 THz) and high-frequency (500–5,000 THz) numerical regimes; excluded-mode, empty-spectrum, and non-finite-mode cases; and invalid zero, negative, and textual temperatures. The normal acceptance tolerances were \(10^{-12}\) eV for energy quantities and \(10^{-9}\) J mol\(^{-1}\) K\(^{-1}\) for entropy, with case-specific adjustments only at documented numerical boundaries.

### Table S2. Workbook-derived ZPE–TS dataset

| Category | Retained worksheet names |
|---|---|
| Adsorbed or reaction intermediates | COOH, CO, CHO, COH, 2CO, COCOH, CCO, CHCO, CHCHO, CH2CHO, O, OH, CH3CHO, CH3CH2O, CH3CH2OH |
| Free molecules | CO_free, H2, O2, CO2_free, H2O, H2O2, C2H4, CH4 |

For each of the 23 curated sheets, the benchmark fixture stores all accepted positive frequencies, the worksheet-reported ZPE and \(TS\), a result recalculated with the worksheet’s own constants and formulas, and a result calculated with the constants used by the website. Worksheets outside this curated set were not incorporated into the benchmark fixture or used in the reported validation statistics. The application was required to reproduce the stored worksheet-formula evaluation within \(10^{-12}\) eV. The largest website–workbook difference in the reference run was 0.00639792 eV; this difference includes rounded constants and worksheet-specific choices and is therefore reported separately from the zero-error analytical-reference comparison. For the `CH3CH2OH` sheet, all 22 vibrational modes were used.

## S1.3 QE PDOS and orbital-metric validation

Seven real, spin-polarized QE `projwfc.x` files were used to test orbital selection, Fermi-level alignment, numerical integration, and transfer into downstream tools. For a selected density-of-states channel \(D(E)\), the integrated occupancy within \([E_a,E_b]\) was calculated as

\[
N(E_a,E_b)=\int_{E_a}^{E_b}D(E)\,dE,
\]

and the corresponding DOS centre as

\[
\varepsilon_c(E_a,E_b)=\frac{\int_{E_a}^{E_b}E D(E)\,dE}{\int_{E_a}^{E_b}D(E)\,dE}.
\]

Numerical integration used the trapezoidal rule. When a requested Fermi boundary fell between tabulated energy points, the DOS at the boundary was obtained by linear interpolation. Spin-up and spin-down channels were integrated independently. Occupancy and centre values were compared with an independent reference calculation using a tolerance of \(10^{-11}\).

### Table S3. Real QE PDOS fixtures

| Dataset group | Atom and orbital files | Fermi level (eV) | Energy-grid points |
|---|---|---:|---:|
| C–p | `full.pdos_atm#2(C)_wfc#2(p)` | −3.1620 | 2,460 |
| Cu–p,d | `1D_relax.pdos_atm#1(Cu)_wfc#2(p)`; `1D_relax.pdos_atm#1(Cu)_wfc#3(d)` | −1.6468 | 2,831 |
| Ag–p,d | `2NCB_Ag.pdos_atm#30(Ag)_wfc#2(p)`; `2NCB_Ag.pdos_atm#30(Ag)_wfc#3(d)` | −1.8940 | 3,008 |
| Fe–p,d | `2NCB_Fe.pdos_atm#29(Fe)_wfc#2(p)`; `2NCB_Fe.pdos_atm#29(Fe)_wfc#3(d)` | −1.7460 | 2,986 |

The complete p- and d-channel decomposition produced 54 spin-resolved channel metrics. The reference run reproduced all 54 independent occupancy and centre values within the declared tolerance.

## S1.4 Bader-charge validation

The Bader module was evaluated with one real VASP dataset, two real QE datasets, and one deliberately mismatched negative control. The sign convention was defined consistently as electron loss being positive and electron gain being negative. Depending on whether the density and `ACF.dat` values represented valence-only or all-electron populations, the configured pseudopotential core-electron count was included in the electron-count conversion before the Bader charge was assigned. Atom-to-charge mapping was accepted only after atom counts, species ordering, and coordinate consistency had been verified.

### Table S4. Bader-analysis fixtures and acceptance criteria

| Case | Code/files | Composition | Core-electron setting | Principal criterion |
|---|---|---|---|---|
| VASP real 001 | `ACF.dat` + corrected `CONTCAR` | Cu10 S6 O13 F12 N3 C40 H72; 156 atoms | Cu 18, S 10, O 2, F 2, N 2, C 2, H 0 | Coordinate mismatch ≤0.001 Å; charge residual ≤2×10−4 e |
| QE real 001 | `ACF.dat` + `full_scf.in` + `full.cif` | C200 N16 H120; 336 atoms | Dataset-specific valence/core convention | Ordering, mapping, per-atom arithmetic, and conservation arithmetic |
| QE real 002 | `ACF.dat` + `halfc1_scf.in` + `halfc1.cif` | C116 N8 H80; 204 atoms | C 2, N 2, H 0 | Neutral-reference residual approximately −0.0021 e |
| Negative control | 156-entry ACF + older 152-atom CONTCAR | Deliberate mismatch | Not applicable | Must reject before charge assignment |

The summed charge of the first QE dataset was approximately +1.8661 e. This value was retained as a property of the supplied files and was used to test arithmetic consistency; it was not interpreted as a neutral-system physical reference. The second QE dataset provided the clean neutral comparison. The maximum reported charge residual for the accepted reference cases was 0.0001 e.

## S1.5 QE input-workflow generation

A real 204-atom `halfc1.cif` structure was used as the common input to eight QE workflow protocols. The benchmark generated 29 files and applied 76 content and consistency rules.

### Table S5. QE workflow packages

| Protocol | Generated package and execution logic |
|---|---|
| SCF | `halfc1_scf.in` and submission script; `pw.x` execution |
| Structural relaxation | `halfc1_relax.in` and submission script; `vc-relax` with `&IONS` and `&CELL` |
| DOS | SCF, NSCF, `dos.x` input, and submission script in execution order |
| Bands | SCF, band-path NSCF, `bands.x` input, and submission script |
| Charge density | SCF, `pp.x` input, and submission script |
| Bader charge | SCF, all-electron `pp.x`, valence-electron `pp.x`, and submission script |
| Vibrational, D3 | SCF, D3 Hessian, `ph.x`, `dynmat.x`, and submission script |
| Vibrational, non-D3 | Equivalent package with the D3 Hessian execution omitted |

Acceptance rules covered filename consistency, preservation of all 204 atoms, pseudopotential assignment, QE calculation modes, SCF/NSCF occupation defaults, k-point paths and user warnings, `plot_num`, removal of the `lsym` keyword, executable order, strict shell behaviour, and the absence of unresolved `NaN` or `undefined` values. These tests verify syntactic and workflow consistency; material-specific convergence, magnetic state, pseudopotential suitability, cutoffs, and k-point density remain the responsibility of the researcher.

## S1.6 Preset reaction-intermediate generation

The preset Intermediate Maker was tested using the real 204-atom `halfc1.cif` catalyst and seven stored reaction pathways. Every molecular template was placed at binding distances of 1.6, 1.8, and 2.2 Å along a controlled outward direction, yielding 162 generated placements.

### Table S6. Preset reaction pathways and stored intermediate order

| Pathway | Ordered intermediates |
|---|---|
| NO3 → NH3 | NO3 → NO3H → NO2 → NO2H → NO → NOH → NHO → NHOH → N → NH → NH2 → NH2OH → NH3 |
| N2 → NH3 | NNH → NNH2 → NHNH → NHNH2 → NH2NH2 → N → NH → NH2 → NH3 |
| CO2 → C2H4 | CO2 → COOH → CO → CO–CO → COH → COCOH → CCO → CHCO → CHCHO → CH2CHO → C2H4 |
| CO2 → C2H5OH | Shared sequence through CH2CHO, followed by CH3CHO → CH3CH2O → CH3CH2OH |
| Alternative C1 route | CO2 → COOH → CO → CHO |
| HER | H |
| OER/ORR | O → OH → OOH |

For each placement, the suite checked the requested binding distance, preservation of every intramolecular pair distance, alignment with the outward axis, finite coordinates, element ordering, and successful CIF export and re-parsing. Deliberate collision and clearance controls evaluated the warning logic. The maximum binding-distance error in the reference run was \(1.332\times10^{-15}\) Å. These checks establish correctness of rigid geometric transformation and file generation, not the thermodynamic or kinetic stability of the adsorption configuration. All generated structures require appropriate DFT relaxation and scientific inspection.

## S1.7 Custom pathway validation

The Custom Pathway Designer was tested with synthetic molecule-only CIF files for CO (two atoms; binding atom 1), OOH (three atoms; binding atom 2), and NH3 (four atoms; binding atom 1). The ordered pathway was exported to JSON, imported, and re-exported; deterministic serialization was required to be byte-for-byte reproducible. The pathway was then applied to two real catalysts, `halfc1` (204 atoms) and `full` (336 atoms), producing six catalyst–intermediate structures. The resulting CIF files and JSON metadata were packaged as ZIP archives, reopened, and audited.

For deterministic automation only, the atom with the largest Cartesian z coordinate was selected as the benchmark anchor. In both fixtures this atom was H. This automated choice is a software-test convention and does not assert that H is the chemically appropriate catalytic site. Negative controls covered malformed JSON, incorrect format identifiers, empty pathways, duplicate labels, invalid binding indices, and missing intermediate names. All 42 validation rules passed; the maximum binding-distance error was \(6.661\times10^{-16}\) Å.

## S1.8 End-to-end QE and VASP DOS/PDOS pipeline

The tested pipeline was raw PDOS input → atom/species/orbital selection → Fermi-level shift → channel summation → CSV export → DOS Plotter import → occupancy/centre calculation. The four real QE groups in Table S3 were reused. Two user-supplied real VASP datasets were added. The spin-polarized dataset contains 152 atoms (Cu10 S6 O10 F12 N2 C40 H72), 2,001 energy points, and a Fermi energy of −3.3484874 eV; its total and projected rows contain five and 19 columns, respectively. The non-spin-polarized dataset contains 18 atoms (Mo12 C6), 2,000 energy points, and a Fermi energy of 12.3955736 eV; its total and projected rows contain three and 10 columns, respectively. Each DOSCAR was paired with its matching CONTCAR or POSCAR for species mapping, and both pairs were protected by SHA-256 checksums.

The real VASP datasets verify DOSCAR-layout handling, spin classification, Fermi subtraction, atom counting, structure-based species mapping, and species selection. For all six QE/VASP datasets, exported CSV channels were required to be reproduced exactly by the DOS Plotter and Orbital Metrics Calculator. Additional checks covered reusable plotting styles, interpolation at finite fill boundaries, recognizable filenames, and rejection of mixed spin modes or descending energy grids. All 83 pipeline rules passed with zero reported downstream numerical error.

## S1.9 Free-energy-diagram validation

Four small, auditable synthetic datasets containing 21 energy states were used to isolate delimiter recognition, branch construction, connection logic, style propagation, and raster export.

### Table S7. Free-energy input controls

| Case | Input format | Tested behaviour |
|---|---|---|
| `single-comma` | Comma-separated | Four-step single pathway |
| `branched-tab` | Tab-separated | Main and alternative branches |
| `split-merge-semicolon` | Semicolon-separated | Three-way split and merge |
| `unordered-whitespace` | Whitespace-separated | Sorting and rejection of malformed/header lines |

The 63 acceptance rules evaluated row and energy preservation, branch grouping and sorting, y-axis padding, tick intervals, automatic and continuity connections, canonical connection keys, migration of legacy configuration, propagation of a plot template to multiple plots, deep copying of annotations, successful light/dark rendering, and PNG dimensions. A 6 × 4 inch export at 300 dpi was required to contain exactly 1,800 × 1,200 pixels.

## S1.10 Crystal-structure pipeline validation

Four CIF structures containing 545 atoms in total were used: a two-atom triclinic P1 non-orthogonal reference, a NaCl symmetry-expansion and deduplication fixture yielding two Na and one Cl atoms, the real 204-atom `halfc1.cif`, and the real 336-atom `full.cif`. Each structure underwent the same deterministic edit sequence: replacement of the first element, displacement of its fractional coordinates by (0.001, 0.002, 0.003), deletion of the final atom, and addition of a displaced H atom. The final count was therefore required to equal the starting count while all four operations remained detectable.

The 82 validation rules covered finite fractional and Cartesian coordinates; preservation of cell parameters; lattice and `ibrav` inference; positive automatic k meshes; monotonic response of automatic bond thresholds; custom element-pair rules; periodic minimum-image bonding; CIF export/re-import; conversion between QE crystal and ångström coordinates; propagation of edited species; invalid-input rejection; and development timing up to 336 atoms. The bond checks validate the implemented geometric threshold rules and are not a substitute for bond-order analysis.

## S1.11 QE-output parsing and recovery

Five output scenarios were used. Three were user-supplied production QE outputs: `full_scf.out`, containing 352 atoms; `full_relax.out`, containing 336 atoms; and `2NCB_Ag_vcrelax.out`, containing 49 atoms. Two controlled negative cases represented an interrupted `vc-relax` with Bohr coordinates, non-convergence, and a QE error, and malformed text that was not a QE output. The real files were protected by SHA-256 checksums, while the expected final scalar values were independently transcribed from their final matching records.

The parser was required to record energies, forces, pressures, SCF-iteration counts, convergence markers, `JOB DONE`, and errors with their source line numbers. Structure cases tested correct selection of initial, latest, or final coordinates, Bohr-to-ångström conversion, CIF and `ATOMIC_POSITIONS` export, and invalid-output handling. The interrupted-run recovery procedure was tested by replacing the original coordinate and cell blocks with the latest available values while retaining settings such as `ecutwfc` and `K_POINTS`. Output-only reconstruction was required to produce a clean QE input without unresolved `NaN` or `undefined` fields. All 86 validation rules passed across 188 extracted energy points.

## S1.12 Worked benchmark examples

This section provides one traceable, practical result from every benchmarked module. Numerical examples report the independently calculated or directly inspectable expectation beside the Padarthkhoj result. Rule-based examples state the expected transformation or file content and the observed output. These examples illustrate how the aggregate pass counts in Table S1 were obtained.

### S1.12.1 ZPE and TS Calculator

A seven-mode molecular spectrum containing 1.5216, 1.9174, 24.8485, 36.1835, 43.8909, 110.7545, and 110.9050 THz was evaluated at 298.15 K. Direct substitution into the harmonic-oscillator equations in Section S1.2 gave the reference values shown in Table S8.

### Table S8. Worked ZPE–TS calculation for the seven-mode molecular spectrum

| Quantity | Independent/manual reference | Padarthkhoj result | Absolute difference |
|---|---:|---:|---:|
| ZPE (eV) | 0.6824294216367939 | 0.6824294216367939 | 0 |
| Thermal vibrational energy (eV) | 0.04712225143683679 | 0.047122251436836786 | 6.94 × 10−18 |
| Vibrational entropy (J mol−1 K−1) | 39.153443682224236 | 39.15344368222425 | 1.42 × 10−14 |
| TS (eV) | 0.12098833031881037 | 0.12098833031881037 | 0 |
| Vibrational free-energy correction (eV) | 0.6085633427548203 | 0.6085633427548202 | 1.11 × 10−16 |

As a second, workbook-facing example, the 12 COOH frequencies were 4.7581, 7.3579, 8.5698, 12.4484, 13.8811, 18.4227, 21.7035, 22.2163, 33.0672, 38.7491, 46.5140, and 105.3892 THz. The workbook reported ZPE = 0.6892329897 eV and TS = 0.1073465436 eV. Padarthkhoj, using the website constants at 298.15 K, returned ZPE = 0.6887485151 eV and TS = 0.1106304017 eV. The differences, −0.0004844746 eV for ZPE and +0.0032838581 eV for TS, arise from the documented difference between worksheet-specific constants/formulas and the website formulation. When the worksheet constants were used independently, the stored worksheet values were reproduced to better than 3 × 10−16 eV.

### S1.12.2 QE PDOS and Orbital Metrics Calculator

The real file `full.pdos_atm#2(C)_wfc#2(p)` contains 2,460 energy points from −23.442 to 1.148 eV. For the C atom 2 `pz_up` channel and a Fermi energy of −3.162 eV, independent trapezoidal integration gave a full-range occupancy of 0.6794099554218257 and a full-range DOS centre of −7.935164657212043 eV. Padarthkhoj returned the same values, giving absolute errors of zero at the stored numerical precision. Integration only up to the Fermi level gave an occupied contribution of 0.5278730901298307 and an occupied DOS centre of −9.848413959102388 eV; these values were also reproduced exactly.

### S1.12.3 Bader Charge Studio

For the real 156-atom VASP example, the independently summed reference-electron count was 555.0000 e, whereas the `ACF.dat` population summed to 555.0001 e. Padarthkhoj calculated a total Bader charge of −0.000072 e. The independently expected total was −0.000100 e, producing a charge-conservation residual of 0.000028 e, below the acceptance tolerance of 0.0002 e. The maximum difference between independently calculated and Padarthkhoj per-atom charges was zero. The coordinate cross-check between `CONTCAR` and `ACF.dat` gave a maximum displacement of 0.0000192 Å, below the 0.001 Å mapping tolerance.

### S1.12.4 QE workflow generation

For the DOS protocol applied to the 204-atom `halfc1.cif` structure, the manually specified package consisted of `halfc1_scf.in`, `halfc1_nscf.in`, `halfc1_dos.in`, and `halfc1_submit.sh`. Padarthkhoj generated exactly these four files. Re-parsing the SCF and NSCF inputs recovered all 204 `ATOMIC_POSITIONS` rows. The submission script contained `set -euo pipefail` and executed the SCF, NSCF, and DOS stages sequentially. No filename collision or unresolved `NaN`/`undefined` value was found.

### S1.12.5 Preset Intermediate Maker

For the NO3 intermediate in the NO3 → NH3 pathway, the requested catalyst-to-binding-atom distance was 1.600000 Å. Padarthkhoj generated a distance differing from this target by only 1.332 × 10−15 Å. The root-mean-square change among all internal NO3 pair distances was 1.326 × 10−15 Å, the adsorption-axis deviation was 0°, and the closest catalyst contact was 2.685677 Å. The exported CIF was successfully re-parsed without changing its atom ordering or geometry.

### S1.12.6 Custom Pathway Designer

A two-atom CO molecule was uploaded with atom 1 designated as the binding atom and was placed on the real 204-atom `halfc1` catalyst. The expected exported structure contained 206 atoms. Padarthkhoj produced 206 atoms, with a binding-distance error of 6.661 × 10−16 Å, and the resulting CIF passed export/re-import validation. The same stored pathway was also serialized to JSON, re-imported, and reproduced deterministically before ZIP packaging.

### S1.12.7 End-to-end DOS/PDOS pipeline

For the QE C–p dataset, subtracting the supplied Fermi energy from the first energy point gives −23.442 − (−3.162) = −20.280 eV. Padarthkhoj produced a shifted energy range of −20.280 to 4.310 eV and exported `full_species_C_p_pdos.csv` with 2,460 rows and eight spin-resolved channels. After import into the DOS Plotter and Orbital Metrics Calculator, the `pz_up` occupancy was 0.6794099554218257 and its Fermi-shifted centre was −4.7731646572120425 eV, identical to the independent downstream reference. The selected plotting template—line width 3, Times New Roman font, and bottom-left legend—was also retained.

For the real VASP spin-polarized dataset, the parser identified 152 atoms, 2,001 energy points, and a Fermi energy of −3.3484874 eV from the five-column total-DOS and 19-column projected-DOS layouts. CONTCAR mapping selected ten Cu atoms represented by 30 s/p/d records. Their summed `s_up` contribution had an occupancy of 3.8656693355725755 and a Fermi-shifted centre of −0.5674262083705763 eV. The real non-spin dataset was independently identified from its three-column total-DOS and 10-column projected rows; POSCAR mapping recovered Mo12 C6, and the selected 12 Mo atoms were represented by 36 s/p/d records. Both real datasets reproduced their independently integrated downstream values with zero stored numerical error.

### S1.12.8 Free Energy Diagram Studio

The practical single-path CSV contained the four energies 0.000, −0.420, +0.180, and −0.760 eV at successive reaction steps. Manual inspection therefore gives a minimum of −0.760 eV, a maximum of +0.180 eV, and three adjacent connections. Padarthkhoj preserved all four values, generated exactly three connections (1→2, 2→3, and 3→4), selected a padded y range of −0.901 to +0.321 eV, and used a 0.2 eV tick interval. Both light and dark renderers completed the same 313 drawing operations.

### S1.12.9 Crystal Structure pipeline

The two-atom triclinic CIF was manually expected to remain triclinic and to map to QE `ibrav = 14`. Padarthkhoj classified it as triclinic, assigned `ibrav = 14`, and suggested a positive 3 × 3 × 2 k mesh. The deterministic edit replaced the first element C with O, displaced its fractional coordinates by (0.001, 0.002, 0.003), deleted the final atom, and added H. The expected final count was therefore two atoms with species H and O; Padarthkhoj reproduced this result in CIF, QE crystal-coordinate, and QE Cartesian-coordinate exports while preserving all six cell parameters.

### S1.12.10 QE Output Studio

In the real `2NCB_Ag_vcrelax.out` production output, direct inspection identified 49 atoms, 14 ionic coordinate snapshots, 134 SCF iterations, and 15 total-energy records. The final values were −690.36319702 Ry for energy, 0.003586 Ry Bohr−1 for force, and −2.49 kbar for pressure, followed by `JOB DONE` with no reported QE error. Padarthkhoj recovered each value, classified the calculation as `vc-relax`, selected the final relaxed structure, and exported both a 49-atom CIF and a 49-row `ATOMIC_POSITIONS` block with finite numerical values. The real `full_scf.out` and `full_relax.out` cases additionally verified 352- and 336-atom outputs, respectively.

### S1.12.11 Invalid-input and failure-handling examples

Failure handling was exercised throughout the modules rather than treated as a separate success-only test. For example, the Bader analyser rejected a 156-entry `ACF.dat` paired with a 152-atom structure before assigning elemental charges; the ZPE–TS calculator rejected zero, negative, and textual temperatures; the Custom Pathway Designer rejected malformed JSON and invalid binding indices; the DOS pipeline rejected descending energy grids and incompatible spin modes; and QE Output Studio rejected malformed non-QE text. These expected rejections contributed validation units only when the application produced the specified error state rather than silently generating a result.

## S1.13 Reproducibility and machine-readable records

The full benchmark suite can be reproduced from the repository root using:

```bash
npm run benchmark
```

The consolidated outputs are stored as `benchmarks/results/latest-unified.md`, `latest-unified.csv`, and `latest-unified.json`. Module-specific JSON reports retain individual case identifiers, expected and observed values, tolerances, provenance, and diagnostic messages. Spreadsheet-compatible CSV files contain the principal numerical results. Fixtures are stored below `benchmarks/fixtures/`; transparent synthetic controls are declared in the relevant runner scripts so that their inputs and expected outputs can be inspected beside the validation logic.

## S1.14 Interpretation and limitations

The benchmark establishes reproducible numerical agreement, parser behaviour, transformation invariants, workflow consistency, downstream data preservation, and explicit rejection of selected invalid inputs. It does not constitute blinded inter-laboratory validation. The real VASP datasets validate supported spin and non-spin DOSCAR layouts and numerical preservation through the analysis pipeline; the resulting integrated orbital populations remain dependent on VASP projection settings and are not asserted to be unique experimental observables. Intermediate-placement tests establish distances, rigid transformations, collision warnings, and valid exports; they do not demonstrate adsorption stability or identify a physically optimal active site. Single-run timings are diagnostic rather than statistically characterized performance measurements.

Finally, a complete software-rule pass does not imply that every automatically generated scientific input is physically appropriate for every material. Pseudopotential selection, basis-set and k-point convergence, magnetic initialization, smearing, charge state, active-site selection, reaction pathway choice, and interpretation of Bader or PDOS results continue to require domain expertise and, where appropriate, comparison with experiment or independent calculations.
