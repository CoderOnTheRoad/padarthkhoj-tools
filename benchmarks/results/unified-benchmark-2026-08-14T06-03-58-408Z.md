# Padarthkhoj unified benchmark summary

Generated: 2026-08-14T06:03:58.408Z  
Application: v1.0.0  
Environment: darwin arm64, Node v24.15.0

## Overall result

**1433/1433 validation units passed (100.00%) across 11 benchmark suites.**

| Module | Workload | Scale | Passed | Pass rate | Reported error | Runtime (ms) |
|---|---|---|---:|---:|---|---:|
| ZPE & TS — analytical reference | 12 analytical cases | frequency spectra | 12/12 | 100.00% | 0 declared analytical tolerances (maximum analytical error) | 64.569 |
| ZPE & TS — supplied workbook | 23 workbook sheets | user-supplied reference | 23/23 | 100.00% | 0.00639792 eV (maximum workbook deviation) | 62.666 |
| Real QE orbital metrics | 7 real QE files | 54 channel metrics | 54/54 | 100.00% | 0 mixed integral/eV (maximum numerical error) | 127.065 |
| QE & VASP Bader analysis | 3 valid + mismatch control | 696 atoms | 4/4 | 100.00% | 0.0001 e (maximum charge residual) | 61.622 |
| QE workflow generation | 8 workflows | 29 generated files | 76/76 | 100.00% | —  (structural/rule validation) | 47.019 |
| Preset Intermediate Maker | 7 pathways | 162 placements | 940/940 | 100.00% | 1.332e-15 Å (maximum binding-distance error) | 125.693 |
| Custom Pathway Designer | 3 molecules × 2 catalysts | 6 structures | 42/42 | 100.00% | 6.661e-16 Å (maximum binding-distance error) | 59.078 |
| QE & VASP DOS/PDOS pipeline | 6 QE/VASP datasets | 5 spin + 1 non-spin | 68/68 | 100.00% | 0 mixed occupancy/eV (maximum downstream error) | 144.237 |
| Free Energy Diagram Studio | 4 input formats | 21 energy states | 63/63 | 100.00% | —  (structural/rule validation) | 39.020 |
| Crystal Structure pipeline | 4 structures | 545 atoms; largest 336 | 82/82 | 100.00% | —  (structural/rule validation) | 132.967 |
| QE Output Studio | 5 output scenarios | 6 energy points | 69/69 | 100.00% | —  (structural/rule validation) | 39.440 |

## Interpretation notes

- A validation unit is a suite-defined independent rule, analytical case, channel metric, or dataset acceptance/rejection check.
- The workbook deviation is a comparison with the supplied Excel workbook and includes differences caused by rounded constants. The analytical ZPE reference is reported separately.
- Runtime values are single-run wall-clock measurements on the recorded machine; use repeated trials for formal performance claims.
- Every module-specific JSON report contains its detailed provenance, tolerances, cases, and diagnostics.
