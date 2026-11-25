# Validation evidence for the original 1433 unit run

The manuscript reference is the v1.0.0 run recorded at **2026-08-14 06:03:58.408 UTC**, with **1,433/1,433 validation units passed across 11 suites**. This document clarifies that run without changing the application, benchmark code, historical reports, or total. It is an audit of retained evidence, not a new execution.

## What the counts measure

A validation unit is a suite-defined case, rule, channel-level result, or dataset acceptance/rejection decision. Units differ in granularity and can bundle numerical comparisons with file or input checks. The overall pass fraction measures success against those software checks, not experimental accuracy or 1,433 independent numerical calculations.

| Suite | Original units passed | Purpose and interpretation |
|---|---:|---|
| ZPE & TS — analytical reference | 12/12 | Numerical calculations and boundary or rejection checks. 6 positive-spectrum numerical cases; 3 numerical boundary cases; 3 temperature rejection cases. Original case-level report retained. |
| ZPE & TS — supplied workbook | 23/23 | Workbook calculation reproduction. 23 sheets; pass criterion concerns workbook reproduction, not agreement of application values with the workbook. |
| Real QE orbital metrics | 54/54 | Numerical comparisons with parsing and provenance checks. 54 channel-level units. Each unit can contain multiple numerical comparisons and file checks; do not count every scalar comparison as another unit. |
| QE & VASP Bader analysis | 4/4 | Charge arithmetic and dataset consistency with rejection control. 3 accepted datasets and 1 mismatched dataset control. The 696 atom records are not 696 additional validation units. |
| QE workflow generation | 76/76 | Workflow generation. Generated-file and workflow rules; no evidence here of QE execution or convergence. |
| Preset Intermediate Maker | 940/940 | Geometry operations with export and consistency checks. Geometry invariants, placement, finite coordinates, CIF round trips, pathway and export rules; not 940 independent physical accuracy determinations. |
| Custom Pathway Designer | 42/42 | Geometry operations with file portability and rejection checks. Placement, CIF/JSON/ZIP portability, ordering, controls and completion checks. |
| QE & VASP DOS/PDOS pipeline | 68/68 | Mixed file handling and numerical pipeline checks. Original total is 68. Later detailed report contains 83; historical category-level split is not recoverable from that replacement. |
| Free Energy Diagram Studio | 63/63 | File handling and plotting behaviour. Parsing, supplied-energy preservation, connectivity, rendering calls, style and export configuration; not validation of DFT reaction energies. |
| Crystal Structure pipeline | 82/82 | Mixed structure processing and file handling. Parsing, coordinate and cell invariants, bonding rules, editing and conversions. |
| QE Output Studio | 69/69 | Mixed output parsing and structure export. Original total is 69. Later detailed report contains 86; historical category-level split is not recoverable from that replacement. |
| **Total** | **1433/1433** | Each original suite-defined unit counted once. |


This is a purpose-labelled **suite inventory**, not an exact partition of all individual historical checks into mutually exclusive categories. Mixed suites remain mixed. The two geometry suites contribute 982 units, workflow generation contributes 76, and the four other file/plot/structure/pipeline suites contribute 282 (68 + 63 + 82 + 69). Those groups contain different checks; geometry and pipeline counts must not be relabelled as purely numerical or purely non-numerical. The remaining 93 units belong to analytical ZPE/TS (12), workbook reproduction (23), orbital metrics (54), and Bader analysis (4).

The original ZPE/TS case report permits an exact finer split: **6 positive-spectrum numerical cases**, **3 numerical boundary cases** (excluded modes, empty spectrum, nonfinite mode), and **3 invalid-temperature rejection cases**. All 9 non-rejection cases compare five returned quantities, but remain 9 original units rather than 45 new units. Even positive-spectrum cases also check the expected rejected-mode count. The 54 orbital units assess numerical channel metrics alongside parsing/provenance conditions. The Bader summary records 3 accepted datasets and 1 mismatch control. The 23 workbook units verify reproduction using workbook constants; they are not 23 strict application-versus-workbook accuracy passes.

## Representative numerical results from the original run

Each row below comes from the [original timestamped analytical report](../results/benchmark-0.1.0-zpe-pilot-2026-08-14T06-03-57-541Z.json). Multiple rows can belong to one validation unit. CSV values are unrounded stored numbers; displayed deviations are computed from the stored values, not rounded table entries. A zero deviation means equality at the precision recorded by this calculation, not proof of zero physical error.

| Case | Quantity | Reference | Padarthkhoj | Absolute deviation | Absolute tolerance |
|---|---|---:|---:|---:|---:|
| zpe-single-mode-300k | zpeEv (eV) | 0.020678338484619294 | 0.020678338484619294 | 0 | 1e-13 |
| zpe-single-mode-300k | tsEv (eV) | 0.016297037218588363 | 0.01629703721858836 | 3.46945e-18 | 1e-13 |
| zpe-single-mode-300k | entropyJMolK (J mol^-1 K^-1) | 5.2414168288714746 | 5.2414168288714738 | 8.88178e-16 | 1e-10 |
| zpe-reference-spectrum-298k | zpeEv (eV) | 0.68242942163679388 | 0.68242942163679388 | 0 | 1e-12 |
| zpe-reference-spectrum-298k | tsEv (eV) | 0.12098833031881037 | 0.12098833031881037 | 0 | 1e-12 |
| zpe-temperature-1000k | tsEv (eV) | 0.5247128857291451 | 0.52471288572914498 | 1.11022e-16 | 1e-12 |
| zpe-low-frequency-298k | tsEv (eV) | 0.47231082840320604 | 0.47231082840320648 | 4.44089e-16 | 1e-11 |
| zpe-high-frequency-298k | zpeEv (eV) | 13.440920015002542 | 13.44092001500254 | 1.77636e-15 | 1e-11 |


Inputs, in THz: single-mode case [10] at 300 K; seven-mode reference spectrum [1.5216, 1.9174, 24.8485, 36.1835, 43.8909, 110.7545, 110.905] at 298.15 K; elevated-temperature spectrum [2.5, 8, 25, 75] at 1000 K; low-frequency spectrum [0.01, 0.05, 0.1] at 298.15 K; high-frequency spectrum [500, 1000, 5000] at 298.15 K. The low- and high-frequency cases are numerical boundary/stability probes and do not establish the physical validity of the harmonic approximation in those regimes.

## Reference equations and comparison rules

For positive frequency ν in Hz, x = hν/(k_B T). The independent reference evaluates ZPE = Σhν/2 and TS = k_B T Σ[x/(exp(x) − 1) − ln(1 − exp(−x))], with conversion to eV. Molar entropy is S = N_A k_B Σ[x/(exp(x) − 1) − ln(1 − exp(−x))]. The implementation uses equivalent stable exponential expressions. Constants are h = 6.62607015 × 10⁻³⁴ J s, k_B = 1.380649 × 10⁻²³ J K⁻¹, 1 eV = 1.602176634 × 10⁻¹⁹ J, and N_A = 6.02214076 × 10²³ mol⁻¹.

The [reference implementation](../references/zpe-ts-reference.js) declares its constants separately and does not import the production calculator. The [case manifest](../manifest.json) specifies inputs and case-specific absolute tolerances. Acceptance is |returned − reference| ≤ tolerance for each quantity, with the expected rejected-mode count also required. No relative tolerance is used by this comparison. Energy tolerances range from 10⁻¹³ to 10⁻¹¹ eV for the nonempty valid cases; molar-entropy tolerances range from 10⁻¹⁰ to 10⁻⁸ J mol⁻¹ K⁻¹. The empty-spectrum case requires exactly zero totals. Invalid temperatures must produce the expected diagnostic. The original summary's scalar “0 declared analytical tolerances” is not a measured maximum error; the table above uses actual per-metric deviations from the detailed report.

The retained [orbital benchmark source](../scripts/run-orbital-real-benchmark.js) describes a raw-column reference reader for spin-resolved p/d channels. It applies the composite trapezoidal rule to D(E) and E D(E); the centre is their ratio. Occupied-state integration ends at the supplied Fermi energy, with linear interpolation when the endpoint falls between grid points. Absolute tolerances in the retained source are 10⁻¹¹ in the integrated DOS units and 10⁻¹¹ eV for centres. This checks the numerical algorithm on sampled input; it does not quantify the input calculation's convergence or quadrature error relative to a continuous spectrum.

The retained [Bader benchmark source](../scripts/run-bader-real-benchmark.js) checks q_i = Z_i − N_core,i − N_ACF,i, with a 10⁻⁸ e absolute per-atom arithmetic tolerance and a separate 2 × 10⁻⁴ e tolerance for the total-charge residual against the printed ACF footer. The latter allows printed-output rounding. The 696 atomic records are internal comparisons within the 3 accepted dataset units. This checks arithmetic and input consistency, not the accuracy of the density partitioning solver. The repository notes that the VASP neutral-reference counts require POTCAR ZVAL confirmation before a physical-charge claim. These retained source descriptions are not asserted to identify the unavailable historical source commit.

## Numerical acceptance thresholds and their interpretation

An absolute numerical acceptance threshold is the largest permitted difference between a returned value and its reference: a comparison passes when |Padarthkhoj − reference| ≤ threshold. The deviation is the measured difference; the threshold is the acceptance rule. These thresholds apply to complete test cases and quantities, not to individual vibrational modes. All energy-valued quantities in a case use its energy threshold; molar entropy uses a separate threshold because its units differ.

| Original test cases | Energy threshold in eV | Molar entropy threshold in J mol⁻¹ K⁻¹ |
|---|---:|---:|
| Single 10 THz mode; excluded-mode and nonfinite-mode controls | 10⁻¹³ | 10⁻¹⁰ |
| Seven-mode spectrum; 100 K and 1000 K spectra | 10⁻¹² | 10⁻⁹ |
| Low-frequency spectrum | 10⁻¹¹ | 10⁻⁸ |
| High-frequency spectrum | 10⁻¹¹ | 10⁻¹⁰ |
| Empty spectrum | 0 | 0 |
| Invalid-temperature rejection cases | Not applicable | Not applicable |

Floating-point arithmetic can give slightly different results for mathematically equivalent evaluations of the harmonic equations. Summation over modes, result magnitude, and evaluation of exponential and logarithmic terms affect the absolute rounding difference. At low frequencies, x = hν/(k_B T) is small, so direct expressions such as 1 − exp(−x) can subtract nearly equal numbers. At high frequencies, exponential terms can become extremely small or underflow; moreover, the larger ZPE scale can increase absolute rounding differences. These numerical considerations explain why different cases can reasonably have different absolute thresholds. They do not establish that each particular threshold is necessary or optimal.

The numbers in this table are the original case-specific acceptance thresholds retained in the archived report. The available records do not document a formal error bound, sensitivity analysis, or derivation for each choice. The numerical considerations above are an explanation of relevant floating-point behaviour, not a reconstructed account of how the original thresholds were selected. Energy and entropy thresholds must be read separately; for example, the high-frequency entropy threshold remains 10⁻¹⁰ J mol⁻¹ K⁻¹ even though its energy threshold is 10⁻¹¹ eV.

No threshold has been changed to prepare this report. The actual deviations are reported alongside the thresholds so that agreement can be assessed directly. These are software verification limits; they are not estimates of experimental uncertainty, DFT convergence, harmonic-model accuracy, or the reliability of treating very low-frequency motion as a harmonic oscillator. The empty-spectrum case checks exact zero totals, while invalid-temperature cases check rejection and its diagnostic rather than a numerical tolerance.

## Workbook agreement is a separate comparison

The [original workbook report](../results/zpe-excel-comparison-1.0.0-2026-08-14T06-03-57-605Z.json) verifies 23 stored worksheet results by recalculation using workbook constants, with an absolute tolerance of 10⁻¹² eV. Its pass/fail decision does **not** use the difference between Padarthkhoj and the workbook. Padarthkhoj values are separately reported at 298.15 K using exact SI constants. The workbook uses rounded constants and internally nonequivalent kT values and does not state a unique temperature in kelvin.

For COOH, workbook ZPE = 0.6892329897003745 eV and Padarthkhoj ZPE = 0.68874851509430868 eV (signed difference -0.00048447460606582116 eV). Workbook TS = 0.10734654355117641 eV and Padarthkhoj TS = 0.11063040168473569 eV (signed difference 0.0032838581335592754 eV). Across the 23 sheets, the maximum absolute application-versus-workbook differences are 0.0014867422627866667 eV for ZPE and 0.00639791502309911 eV for TS. These are descriptive differences, not deviations accepted under the 10⁻¹² eV workbook-reproduction tolerance.

## Historical traceability and scope

Use the [archived 1433-unit summary](../results/unified-benchmark-2026-08-14T06-03-58-408Z.json), not the mutable latest-unified report, for the manuscript total. The later run has 1,465 units: DOS/PDOS increased from 68 to 83 and QE Output from 69 to 86, adding 32 units. No later-run numerical values have been inserted into the original-run example table.

The original unified summary points to mutable latest filenames. Original per-rule reports for its 68-unit DOS/PDOS and 69-unit QE Output suites are not retained at those paths. Other latest detail reports have matching totals but later timestamps, which alone do not establish historical identity. Accordingly, an exact numerical-versus-file/interface allocation of all 1,433 original units cannot be claimed from the retained records. The original analytical report also records the source commit as unavailable and the working tree as dirty. A current commit must not be presented as that run's historical source version. Original detailed reports, if recovered, would permit a finer classification without changing the total.

Plotting checks exercise render calls, configuration and style handling; this benchmark does not establish comprehensive browser interaction or visual correctness. Structure-placement checks establish requested distances and invariants, not optimized adsorption structures. Agreement with an independently evaluated model is software verification, not experimental validation of that model.

## Separate supplementary verification for additional tools

The original 1,433-unit reference remains unchanged. A [separate fresh supplementary verification](supplementary-verification/README.md) provides 19 scalar comparisons for additional tools, including reference values, returned values, deviations, thresholds, inputs and source hashes. These checks are dated separately and are not added to the historical total or described as original-run records. The historical recovery audit and its search scope are included with that report.

## Supporting files

- [Original suite classification CSV](original-suite-classification.csv)
- [Original numerical examples CSV](original-numerical-examples.csv)
- [Source paths and SHA256 hashes](provenance.json)
