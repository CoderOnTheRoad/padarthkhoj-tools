# Separate supplementary numerical verification

Executed at 2026-11-25T06:28:54.695Z. **19/19 supplementary scalar comparisons passed.** The historical reference remains **1,433/1,433**, with zero supplementary checks added to that total. These are fresh results from the source bytes identified in report.json, not recovered original-run results.

| Tool and quantity | Reference value | Padarthkhoj value | Absolute deviation | Acceptance threshold | Unit | Result |
|---|---:|---:|---:|---:|---|---|
| Orbital Metrics: full pz_up integral | 0.67940995542182570 | 0.67940995542182570 | 0.00000e+0 | 1.0e-11 | integrated PDOS units | pass |
| Orbital Metrics: full pz_up centre | -7.9351646572120433 | -7.9351646572120433 | 0.00000e+0 | 1.0e-11 | eV | pass |
| Orbital Metrics: occupied pz_up integral | 0.52787309012983075 | 0.52787309012983075 | 0.00000e+0 | 1.0e-11 | integrated PDOS units | pass |
| Orbital Metrics: occupied pz_up centre | -9.8484139591023876 | -9.8484139591023876 | 0.00000e+0 | 1.0e-11 | eV | pass |
| DOS PDOS pipeline: Fermi-shifted CSV pz_up integral | 0.67940995542182570 | 0.67940995542182570 | 0.00000e+0 | 1.0e-10 | integrated PDOS units | pass |
| DOS PDOS pipeline: Fermi-shifted CSV pz_up centre | -4.7731646572120425 | -4.7731646572120425 | 0.00000e+0 | 1.0e-10 | eV | pass |
| Bader Analysis: charge of first C atom | 0.0074000000000000732 | 0.0074000000000000732 | 0.00000e+0 | 1.0e-8 | e | pass |
| Bader Analysis: charge of first N atom | -1.2542999999999997 | -1.2542999999999997 | 0.00000e+0 | 1.0e-8 | e | pass |
| Bader Analysis: charge of first H atom | 0.025200000000000000 | 0.025200000000000000 | 0.00000e+0 | 1.0e-8 | e | pass |
| Bader Analysis: total charge against ACF footer | -0.0022000000000161890 | -0.0020999999999982144 | 1.00000e-4 | 2.0e-4 | e | pass |
| Intermediate Maker: NO3 binding distance | 1.8000000000000000 | 1.8000000000000007 | 6.66134e-16 | 1.0e-9 | angstrom | pass |
| Intermediate Maker: NO3 atom 1 to atom 2 distance | 1.2526155009818454 | 1.2526155009818436 | 1.77636e-15 | 1.0e-9 | angstrom | pass |
| Crystal Structure: C1 Cartesian x | 1.2592085783714000 | 1.2592085783714000 | 0.00000e+0 | 1.0e-10 | angstrom | pass |
| CIF to QE conversion: C1 exported Cartesian x | 1.2592085783714000 | 1.2592085783710001 | 3.99902e-13 | 1.0e-10 | angstrom | pass |
| Crystal Structure: C1 Cartesian y | 1.9823056131951113 | 1.9823056131951113 | 0.00000e+0 | 1.0e-10 | angstrom | pass |
| CIF to QE conversion: C1 exported Cartesian y | 1.9823056131951113 | 1.9823056131950001 | 1.11244e-13 | 1.0e-10 | angstrom | pass |
| Crystal Structure: C1 Cartesian z | 2.2102388412250011 | 2.2102388412250011 | 0.00000e+0 | 1.0e-10 | angstrom | pass |
| CIF to QE conversion: C1 exported Cartesian z | 2.2102388412250011 | 2.2102388412249998 | 1.33227e-15 | 1.0e-10 | angstrom | pass |
| Crystal Structure: orthogonal periodic H H distance | 0.20000000000000001 | 0.20000000000000018 | 1.66533e-16 | 1.0e-12 | angstrom | pass |

## Methods and interpretation

Reference methods, full inputs, case-specific limits, threshold rationale and SHA256 hashes are recorded in [report.json](report.json). [numerical-comparisons.csv](numerical-comparisons.csv) contains the tabulated values. Numerical limits are absolute and use deviation ≤ threshold. The coordinate and coordinate-export thresholds are new supplementary engineering limits; output rounding is included in the export threshold. The remaining limits are inherited engineering acceptance thresholds. No formal error-bound derivation is claimed.

Full-grid PDOS integrals are not labelled physical occupied populations. The occupied cases end at the supplied Fermi energy and interpolate the boundary. PDOS normalization follows the source file, so integral units are recorded as integrated PDOS units. The DOS pipeline example uses one input record; it tests transfer and energy alignment rather than multi-record summation. Bader values use the stated valence-only convention. Geometry and conversion results verify operations, not physically optimized structures. No experimental validation claim is made.

The original benchmark scripts and historical reports are unmodified. These supplementary comparisons have their own counting rule and must not be combined with the historical suite-defined unit count.
