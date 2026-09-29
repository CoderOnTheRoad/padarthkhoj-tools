from pathlib import Path

from docx import Document


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "Padarthkhoj_Tools_Research_Paper_Draft.docx"
doc = Document(PATH)

replacements = {
    "The current work establishes the architecture and scientific scope; rigorous numerical benchmarks, usability studies and an end-to-end predictive ML case study are specified as mandatory work before submission.":
        "A reproducible 11-suite validation programme comprising 1,465 validation units achieved 1,465/1,465 passes. It covers structure and workflow generation, reaction geometry, Bader analysis, real QE and VASP PDOS datasets, orbital integration, harmonic thermochemistry, free-energy data transfer and production QE output parsing. These results establish deterministic software correctness within declared tolerances; they do not replace user studies, inter-laboratory validation or material-specific scientific judgement.",
    "For a high-impact journal submission, software tests must be supplemented by independent scientific validation. Table 2 defines the required benchmark programme; the results column is intentionally not populated in this draft.":
        "The released benchmark package evaluates deterministic scientific behaviour through 11 independently reported suites. In total, 1,465/1,465 validation units passed. The evidence includes analytical references, preserved workbook values, real QE and VASP PDOS files, real QE and VASP Bader datasets, three production-scale QE outputs, controlled negative cases and explicit geometry invariants. Table 2 summarizes the achieved evidence and the remaining external-validation boundary.",
    "The strongest future development is not the indiscriminate addition of more controls, but deeper traceability: versioned project manifests, explicit scientific metadata, benchmark datasets, reproducible notebooks and interoperable APIs. With the validation programme described here and a quantitative ML case study, Padarthkhoj could support a competitive submission to Digital Discovery, Computer Physics Communications or Computational Materials Science. A higher-risk submission to npj Computational Materials would require clear evidence of scientific impact beyond software integration.":
        "The strongest future development is not the indiscriminate addition of more controls, but deeper traceability: versioned project manifests, explicit scientific metadata, independently archived benchmark datasets, reproducible notebooks and interoperable APIs. The completed deterministic validation programme supports software-oriented evaluation; a quantitative ML case study, external reproduction and a structured user study would be required for broader claims of scientific impact or productivity improvement.",
    "The source-code repository URL, release tag, software license, archived DOI and benchmark-data DOI must be inserted before submission. The manuscript should cite an immutable release rather than only a development branch. All structures and numerical reference outputs used in the final benchmarks should be deposited under terms permitting independent reproduction.":
        "The repository contains the executable benchmark runners, fixture manifests, checksums, machine-readable reports and Supplementary Note S1. Before submission, the source-code URL, immutable release tag, software license, archived software DOI and benchmark-data DOI should be inserted here. The archived dataset should retain the real scientific fixtures and their provenance under terms permitting independent reproduction.",
    "Complete all numerical benchmarks in Table 2 and report tolerances and hardware.":
        "Archive the completed 1,465-unit benchmark release and report the execution environment, tolerances and hardware.",
}

for paragraph in doc.paragraphs:
    for old, new in replacements.items():
        if old in paragraph.text:
            paragraph.text = paragraph.text.replace(old, new)

# Opening draft-status callout.
status_table = doc.tables[0]
status_table.cell(0, 0).text = (
    "Validation status  The manuscript reports a completed deterministic benchmark suite: "
    "1,465/1,465 validation units passed across 11 suites. Quantitative usability, "
    "inter-laboratory and predictive-ML claims remain outside the present evidence boundary."
)

# Benchmark programme table.
benchmark_table = doc.tables[4]
updates = {
    "CIF and QE conversion": "82/82 crystal-structure rules passed across all 14 Bravais classes, including non-orthogonal cells, symmetry expansion and round trips",
    "Generated QE protocols": "76/76 workflow rules passed for eight protocols and 29 generated files",
    "Bader charge": "4/4 datasets passed: two real QE cases, one real VASP case and one explicit mismatch control",
    "QE/VASP PDOS": "83/83 rules passed across six real datasets: five spin-polarized and one non-spin-polarized",
    "Orbital integration": "54/54 analytical and real-PDOS checks passed",
    "ZPE and entropy": "35/35 checks passed: 12 analytical cases plus 23 preserved workbook cases",
    "Intermediate geometry": "982/982 preset and custom-pathway checks passed, including orientation, clearance, identity and export round trips",
    "Performance": "Parser-scale production fixtures included; formal browser/hardware scaling study remains external work",
    "Usability": "Not claimed; structured comparative user study remains external work",
    "ML demonstration": "Not claimed; exports are AI-ready, but predictive improvement requires a separate dataset and benchmark",
}
for row in benchmark_table.rows[1:]:
    key = row.cells[0].text.strip()
    if key in updates:
        row.cells[2].text = updates[key]

doc.save(PATH)
