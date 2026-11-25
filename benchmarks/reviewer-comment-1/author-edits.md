# Reviewer comment 1 author edits and response

Repository documentation and evidence tables have been prepared for the original 1,433-unit run. The text below is for the authors to insert manually; the supplied manuscript and supplementary Word files have not been modified. Table and section numbers must be assigned after insertion. Do not submit the response as a claim of completed document edits until those edits are actually made.

## Manuscript edits

In the abstract replace the sentence beginning “The accuracy of the code has been thoroughly checked” with:

“The recorded software verification run passed all 1,433 suite-defined validation units across numerical calculations, data handling, geometry operations, plotting behaviour, and workflow generation. Selected scientific calculations agreed with independently evaluated reference equations within stated numerical tolerances.”

In the introduction replace the two sentences beginning “The scientific accuracy of our platform” and “All tests passed” with:

“The platform was evaluated using 1,433 suite-defined software validation units. These include numerical comparisons, geometry and file-processing checks, workflow rules, and expected input failures; the numerical reference methods, example results, and acceptance tolerances are reported separately in the Validation section and supplementary information.”

In Section 5 retain the original 1,433/1,433 total and definition of a validation unit. Add the following paragraph and the suite table from the accompanying evidence document:

“The validation suites assess different purposes and use different counting granularities. The 12 analytical ZPE/TS units comprise six positive-spectrum numerical cases, three numerical boundary cases, and three invalid-temperature rejection cases. The 54 orbital-channel units assess numerical metrics together with parsing and provenance conditions, while the Bader suite counts three accepted datasets and one mismatch control. The 23 workbook units verify worksheet reproduction with workbook constants; differences between the application and workbook are reported separately. The geometry, file-processing, plotting and workflow suites include mixed checks and must not be interpreted as independent scientific accuracy determinations. The archived suite counts are retained without subdividing mixed historical units where the original detailed records are unavailable.”

Use this caption for the revised suite inventory:

“Table 1. Purpose and counting basis of the 11 suites in the original Padarthkhoj Tools v1.0.0 verification run. All 1,433 original validation units passed their suite-defined criteria. Mixed-purpose suites are explicitly labelled; their counts do not represent exclusively scientific numerical calculations. The exact original ZPE/TS case split is stated separately.”

Add a compact numerical table using the eight rows below, or select six rows and retain all eight in the supplementary information. Keep the distinction between multiple reported quantities and the original case count.

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


Suggested caption: “Representative numerical comparisons from the original ZPE/TS verification run. Absolute deviations and tolerances refer to the stored unrounded values. Several quantities can belong to the same validation unit. Zero recorded deviation indicates agreement at the precision of the recorded calculation.”

In the discussion replace the claim “Numerical results are in exact agreement with analytical predictions and reference implementations” with:

“Selected numerical outputs agree with independently evaluated reference calculations within the stated tolerances. The full 1,433-unit pass count additionally includes geometry operations, data handling, plotting behaviour, workflow generation, and failure controls, and is not an experimental accuracy measure.”

Where the surrounding discussion says that the complete validation suite establishes integration “without loss of accuracy”, replace that phrase with “with numerical agreement and software behaviour assessed by the checks described in Section 5”. Avoid attributing experimental validation to these software checks.

## Supplementary information addition

Add a section titled “Reference methods and numerical tolerances for software verification”. Include the suite inventory and the numerical table from [the evidence document](README.md), the full inputs recorded in original-numerical-examples.csv, the harmonic reference equations and constants, and the workbook comparison explanation. Include the following traceability paragraph:

“The manuscript total refers to the archived run at 2026-08-14 06:03:58.408 UTC and remains 1,433 units. Later repository reports contain 1,465 units and are not substituted for this reference run. The retained timestamped ZPE/TS and workbook reports support the numerical examples given here. Because the original detailed reports for some mixed suites are not retained, an exact numerical-versus-file/interface partition of every historical unit is not asserted. The original suite totals and mixed purposes are reported explicitly.”

For orbital and Bader calculations, reproduce the methods and tolerances in the evidence document with its qualification that these descriptions come from retained benchmark source. Do not label later latest-report case values as values from the original run. Report the application-versus-workbook deviations separately from worksheet reproduction, with no claim that they meet the worksheet-reproduction tolerance.

## Reviewer response draft before author document edits

“We thank the reviewer for requesting a clearer distinction between numerical verification and other software checks. We agree that the overall pass count should not be interpreted as 1,433 independent numerical accuracy tests. We have retained the original 1,433-unit reference run and added a purpose-labelled suite inventory, machine-readable numerical examples, reference methods, tolerances, and provenance information to the GitHub repository under benchmarks/reviewer-comment-1/.

“The original analytical ZPE/TS report distinguishes six positive-spectrum numerical cases, three numerical boundary cases, and three invalid-temperature rejection cases. We also distinguish the 23 workbook-reproduction units, 54 orbital-channel units, three accepted Bader datasets and one mismatch control, geometry/export checks, workflow-generation rules, and mixed file/plotting suites. We have preserved mixed labels where the original records do not permit a reliable finer partition.

“The added numerical table reports expected values, values returned by Padarthkhoj, absolute deviations, units, and case-specific absolute tolerances for representative harmonic calculations, including temperature and frequency boundary cases. It also explains that the workbook pass criterion concerns reproduction with workbook constants; differences between the workbook and application are reported separately. The full pass count is therefore presented as software verification coverage rather than experimental validation.”

This response reports completed repository work only. After the authors insert the text and tables, add: “In the manuscript, we revised the abstract, introduction, Validation section, Table 1 and discussion to clarify the scope of the 1,433 checks and added representative numerical comparisons. In the supplementary information, we added the reference equations, inputs, constants, comparison rules, tolerances, and historical traceability details.” Use this final sentence only after those edits are completed and supply the actual section/table numbers.

## Remaining evidence needed for a complete historical partition

If available, supply the original 68-unit DOS/PDOS and 69-unit QE Output detailed reports and any original per-rule logs for the other mixed suites. Their absence does not change the archived total, but prevents a fully audited mutually exclusive classification of all historical checks. This package provides a conservative clarification and numerical examples; the full historical categorization remains pending recovery of those records.
