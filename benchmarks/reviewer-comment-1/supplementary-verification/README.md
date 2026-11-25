# Separate supplementary verification for additional tools

A fresh verification on 25 November 2026 evaluated **19 scalar numerical comparisons, all of which passed**. These results supplement the original manuscript evidence; they are not recovered historical records. The original **1,433/1,433** validation units remain unchanged, and **zero** supplementary checks are added to that total.

The new comparisons exercise Orbital Metrics, the DOS/PDOS pipeline, Bader Analysis, Intermediate Maker, Crystal Structure operations, and CIF-to-QE conversion. They verify selected calculations, geometric operations and numerical data transfer, with separate stated purposes rather than implying experimental validation.

## Representative comparisons

| Tool and quantity | Reference | Padarthkhoj | Absolute deviation | Absolute threshold | Unit |
|---|---:|---:|---:|---:|---|
| Orbital Metrics: full pz_up integral | 0.679409955422 | 0.679409955422 | 0 | 1e-11 | integrated PDOS units |
| Orbital Metrics: occupied pz_up centre | -9.8484139591 | -9.8484139591 | 0 | 1e-11 | eV |
| DOS PDOS pipeline: Fermi-shifted CSV pz_up centre | -4.77316465721 | -4.77316465721 | 0 | 1e-10 | eV |
| Bader Analysis: charge of first C atom | 0.0074 | 0.0074 | 0 | 1e-08 | e |
| Bader Analysis: total charge against ACF footer | -0.00220000000002 | -0.0021 | 0.0001 | 0.0002 | e |
| Intermediate Maker: NO3 binding distance | 1.8 | 1.8 | 6.66134e-16 | 1e-09 | angstrom |
| Intermediate Maker: NO3 atom 1 to atom 2 distance | 1.25261550098 | 1.25261550098 | 1.77636e-15 | 1e-09 | angstrom |
| CIF to QE conversion: C1 exported Cartesian x | 1.25920857837 | 1.25920857837 | 3.99902e-13 | 1e-10 | angstrom |
| Crystal Structure: orthogonal periodic H H distance | 0.2 | 0.2 | 1.66533e-16 | 1e-12 | angstrom |


The table shows selected comparisons; the [complete report](2026-11-25T06-28-54-695Z/README.md), [all 19 CSV rows](2026-11-25T06-28-54-695Z/numerical-comparisons.csv), and [full inputs, methods, thresholds and source hashes](2026-11-25T06-28-54-695Z/report.json) provide the full evidence. Displayed values above are rounded; deviations are calculated from the unrounded values, so two values that appear identical after rounding can have a nonzero deviation.

## Reference methods and thresholds

| Comparison | Reference and method | Absolute threshold | Basis and limits |
|---|---|---|---|
| Orbital integrals and centres | Raw spin-resolved pz column; independent trapezoidal area and first moment; occupied range clipped at the supplied Fermi energy with linear interpolation | 10⁻¹¹ in integrated PDOS units; 10⁻¹¹ eV for centres | Inherited orbital benchmark limits. Measures agreement on the same sampled grid, not continuous-spectrum quadrature or DFT convergence error. |
| DOS/PDOS CSV pipeline | Raw-column reference after E becomes E minus the supplied Fermi energy, compared with production parsing, export and CSV reload | 10⁻¹⁰ in integrated PDOS units; 10⁻¹⁰ eV for centres | Inherited pipeline limits. This representative one-record check establishes transfer and energy alignment, not multi-record summation correctness. |
| Individual Bader charges | Independent raw ACF count subtracted from C, N or H valence reference under the explicit valence-only convention | 10⁻⁸ e | Inherited arithmetic threshold. Does not validate the external density partitioning solver. |
| Total Bader charge | 584 reference valence electrons minus the ACF footer, compared with the sum of returned atomic charges | 2 × 10⁻⁴ e | Inherited printed-data consistency threshold. The observed approximately 10⁻⁴ e residual reflects rounding between the printed atomic rows and footer, not per-atom arithmetic error. |
| Intermediate geometry | Requested binding distance and Euclidean template pair distance compared with distances measured from returned coordinates | 10⁻⁹ Å | Inherited placement threshold. Checks rigid geometry, not physical relaxation or adsorption stability. |
| Crystal coordinates and QE export | Independent triclinic lattice-vector construction times specified fractional coordinates | 10⁻¹⁰ Å | New supplementary engineering threshold. Export uses 12 decimal places, allowing 0.5 × 10⁻¹² Å decimal rounding plus conversion rounding. No formal floating-point bound is claimed. |
| Periodic distance | Analytical 0.2 Å distance across a 10 Å orthogonal periodic cell | 10⁻¹² Å | Inherited synthetic crystal control. Does not establish correct nearest-image selection for arbitrary skew cells. |

Every threshold was specified in the runner before execution. These are engineering acceptance limits; the retained older thresholds lack a documented formal derivation. They must not be interpreted as experimental uncertainty or physical-model accuracy. Each scalar row passes when its absolute deviation is less than or equal to its stated threshold.

## Historical recovery outcome

The current checkout, a local backup, a sibling copy, another development checkout, and available repository history were checked. The original 68-unit DOS/PDOS and 69-unit QE Output detailed reports were not recovered within those locations. Retained replacements contain 83/86 units in the August copies and 105/86 in the alternate November checkout. The [recovery audit](recovery-audit.json) records the examined report timestamps, counts and hashes without treating those later files as original-run evidence. The historical classification limitation therefore remains explicit.

## Reproduce the separate verification

From the repository root, with project dependencies already installed, run:

```bash
node benchmarks/scripts/run-supplementary-verification.js
```

The [supplementary runner](../../scripts/run-supplementary-verification.js) imports the production calculations and compares them with independently evaluated reference arithmetic and geometry. It writes a new timestamped report directory and does not overwrite the original or mutable latest benchmark reports. No production application source or original benchmark script was changed. The published report records the base commit and SHA256 hashes of all application source files, selected input files, the lockfile and the verifier, so the evaluated bytes can be identified independently of when the documentation commit was made.
