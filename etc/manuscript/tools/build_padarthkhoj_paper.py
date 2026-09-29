from pathlib import Path
from datetime import date
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "Padarthkhoj_Tools_Research_Paper_Draft.docx"
NAVY = "173B57"
BLUE = "176FA8"
INK = "17232D"
MUTED = "607482"
PALE = "EAF2F7"
LIGHT = "F4F6F9"
WHITE = "FFFFFF"
GOLD = "A16C00"


def font(run, size=11, bold=False, italic=False, color=INK, name="Calibri"):
    run.font.name = name
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), name)
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    run.font.color.rgb = RGBColor.from_string(color)


def shade(cell, fill):
    pr = cell._tc.get_or_add_tcPr()
    shd = pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        pr.append(shd)
    shd.set(qn("w:fill"), fill)


def margins(cell, top=90, start=120, bottom=90, end=120):
    pr = cell._tc.get_or_add_tcPr()
    tc_mar = pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        pr.append(tc_mar)
    for side, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{side}"))
        if node is None:
            node = OxmlElement(f"w:{side}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value)); node.set(qn("w:type"), "dxa")


def table_geometry(table, widths):
    total = 9360
    scale = total / sum(widths)
    widths = [round(x * scale) for x in widths]
    widths[-1] += total - sum(widths)
    table.autofit = False
    pr = table._tbl.tblPr
    layout = pr.find(qn("w:tblLayout")) or OxmlElement("w:tblLayout")
    if layout.getparent() is None: pr.append(layout)
    layout.set(qn("w:type"), "fixed")
    tw = pr.find(qn("w:tblW")); tw.set(qn("w:w"), str(total)); tw.set(qn("w:type"), "dxa")
    ind = pr.find(qn("w:tblInd")) or OxmlElement("w:tblInd")
    if ind.getparent() is None: pr.append(ind)
    ind.set(qn("w:w"), "120"); ind.set(qn("w:type"), "dxa")
    grid = table._tbl.tblGrid
    for old in list(grid): grid.remove(old)
    for width in widths:
        col = OxmlElement("w:gridCol"); col.set(qn("w:w"), str(width)); grid.append(col)
    for row in table.rows:
        for cell, width in zip(row.cells, widths):
            tcw = cell._tc.get_or_add_tcPr().find(qn("w:tcW"))
            tcw.set(qn("w:w"), str(width)); tcw.set(qn("w:type"), "dxa")
            margins(cell); cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER


def repeat_header(row):
    pr = row._tr.get_or_add_trPr(); node = OxmlElement("w:tblHeader")
    node.set(qn("w:val"), "true"); pr.append(node)


def add_table(doc, headers, rows, widths, size=8.7):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"; table.alignment = WD_TABLE_ALIGNMENT.LEFT
    for i, value in enumerate(headers):
        table.rows[0].cells[i].text = value; shade(table.rows[0].cells[i], NAVY)
        for run in table.rows[0].cells[i].paragraphs[0].runs: font(run, size, True, color=WHITE)
    repeat_header(table.rows[0])
    for row in rows:
        cells = table.add_row().cells
        for i, value in enumerate(row):
            cells[i].text = str(value)
            for p in cells[i].paragraphs:
                p.paragraph_format.space_after = Pt(1); p.paragraph_format.line_spacing = 1.05
                for run in p.runs: font(run, size, color=INK)
    table_geometry(table, widths)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    return table


def add_p(doc, text, bold_lead=None):
    p = doc.add_paragraph()
    if bold_lead and text.startswith(bold_lead):
        font(p.add_run(bold_lead), 11, True)
        font(p.add_run(text[len(bold_lead):]), 11)
    else:
        font(p.add_run(text), 11)
    return p


def bullet(doc, text):
    p = doc.add_paragraph(style="List Bullet")
    font(p.add_run(text))
    return p


def equation(doc, text):
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(4); p.paragraph_format.space_after = Pt(6)
    font(p.add_run(text), 10.5, italic=True, color=NAVY, name="Cambria Math")


def callout(doc, title, text):
    table = doc.add_table(rows=1, cols=1); table.style = "Table Grid"
    cell = table.cell(0, 0); shade(cell, LIGHT); cell.text = ""
    p = cell.paragraphs[0]; font(p.add_run(title + "  "), 10, True, color=BLUE)
    font(p.add_run(text), 10, color=INK)
    table_geometry(table, [9360]); doc.add_paragraph().paragraph_format.space_after = Pt(1)


def setup(doc):
    sec = doc.sections[0]
    sec.page_width = Inches(8.5); sec.page_height = Inches(11)
    sec.top_margin = sec.bottom_margin = sec.left_margin = sec.right_margin = Inches(1)
    sec.header_distance = sec.footer_distance = Inches(.492)
    styles = doc.styles
    normal = styles["Normal"]; normal.font.name = "Calibri"; normal.font.size = Pt(11); normal.font.color.rgb = RGBColor.from_string(INK)
    normal.paragraph_format.space_after = Pt(8); normal.paragraph_format.line_spacing = 1.33
    for name, size, color, before, after in (("Title", 28, NAVY, 0, 8), ("Subtitle", 14, MUTED, 0, 18), ("Heading 1", 16, BLUE, 18, 10), ("Heading 2", 13, BLUE, 12, 6), ("Heading 3", 12, NAVY, 8, 4)):
        s = styles[name]; s.font.name = "Calibri"; s.font.size = Pt(size); s.font.color.rgb = RGBColor.from_string(color)
        s.font.bold = name != "Subtitle"; s.paragraph_format.space_before = Pt(before); s.paragraph_format.space_after = Pt(after); s.paragraph_format.keep_with_next = True
    for name in ("List Bullet", "List Number"):
        s = styles[name]; s.font.name = "Calibri"; s.font.size = Pt(11); s.paragraph_format.left_indent = Inches(.375); s.paragraph_format.first_line_indent = Inches(-.194); s.paragraph_format.space_after = Pt(4); s.paragraph_format.line_spacing = 1.208
    header = sec.header.paragraphs[0]; header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    font(header.add_run("PADARTHKHOJ TOOLS  /  MANUSCRIPT DRAFT"), 8.5, True, color=MUTED)
    footer = sec.footer.paragraphs[0]; footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    font(footer.add_run("EMat-AI Lab  •  "), 8.5, color=MUTED)
    fld = OxmlElement("w:fldSimple"); fld.set(qn("w:instr"), "PAGE"); footer._p.append(fld)


def build():
    doc = Document(); setup(doc)
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.space_before = Pt(78)
    font(p.add_run("SOFTWARE AND DATA PIPELINES"), 10, True, color=GOLD)
    p = doc.add_paragraph(style="Title"); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run("Padarthkhoj Tools: A Browser-Native, AI-Ready Environment for Integrated Computational Materials Workflows")
    p = doc.add_paragraph(style="Subtitle"); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run("Full research-paper draft for journal development")
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.space_before = Pt(22)
    font(p.add_run("Sourav Ghosh¹,* and co-authors to be added"), 12, True, color=NAVY)
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    font(p.add_run("¹ EMat-AI Lab — complete institutional affiliation required\n* Corresponding author email required"), 10, italic=True, color=MUTED)
    callout(doc, "Draft status", "This manuscript accurately describes implemented capabilities visible in the current repository. Quantitative performance, user-study and ML benchmark results are not invented; clearly marked validation work must be completed before journal submission.")
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    font(p.add_run(f"Prepared {date.today().strftime('%d %B %Y')}  •  Candidate journals: Digital Discovery; Computer Physics Communications; Computational Materials Science"), 9, color=MUTED)
    doc.add_page_break()

    doc.add_heading("Abstract", level=1)
    add_p(doc, "Computational materials research commonly relies on loosely connected programs for structure preparation, electronic-structure input generation, reaction-intermediate construction, charge and projected-density-of-states analysis, vibrational corrections, and figure production. This fragmentation introduces repeated file conversion, manual transcription and loss of scientific context precisely where emerging machine-learning and advanced artificial-intelligence workflows require structured, traceable and reusable data. We present Padarthkhoj Tools, a browser-native, client-side environment that unifies crystal manipulation, coordinated Quantum ESPRESSO input generation, preset and user-defined electrocatalytic pathways, Quantum ESPRESSO and VASP Bader-charge processing, projected-density-of-states analysis, reusable DOS visualization, orbital occupancy and centre metrics, harmonic zero-point-energy and vibrational-entropy calculations, and free-energy diagram construction. Scientific files are processed locally in the browser and can be exported as CIF, Quantum ESPRESSO input, JSON, CSV, spreadsheet and image artifacts. The platform therefore acts both as an interactive research workspace and as a human-in-the-loop data-preparation layer for ML and advanced AI pipelines. Unlike workflow engines that emphasize remote execution and provenance databases, Padarthkhoj targets lightweight preparation, inspection and conversion without requiring a backend. A comparison with established tools shows that individual capabilities are available elsewhere, but the particular combination of reaction design, multi-code analysis, descriptor calculation and machine-readable export is unusual in a single browser application. The current work establishes the architecture and scientific scope; rigorous numerical benchmarks, usability studies and an end-to-end predictive ML case study are specified as mandatory work before submission.")
    add_p(doc, "Keywords: computational materials science; Quantum ESPRESSO; electrocatalysis; projected density of states; Bader charge; scientific workflow; machine learning; artificial intelligence; browser-based software")

    doc.add_heading("1. Introduction", level=1)
    add_p(doc, "First-principles materials modelling has become simultaneously more capable and more operationally fragmented. Electronic-structure packages produce scientifically rich outputs, yet researchers frequently move between separate structure viewers, text editors, scripts, charge-analysis utilities, plotting programs and spreadsheets. Libraries such as ASE and pymatgen provide robust programmatic abstractions [1,2], while AiiDA, atomate and atomate2 address automated execution, provenance and high-throughput workflows [3–5]. Graphical systems—including PWgui, BURAI and the AiiDAlab Quantum ESPRESSO application—reduce barriers to input preparation and advanced calculations [6]. Specialized packages such as VESTA, PyProcar, sumo, CatKit and phonopy remain highly effective within their respective domains [7–11].")
    add_p(doc, "The remaining problem is not the absence of capable software, but the discontinuity between tasks. A catalytic study may require construction of several adsorbate configurations, coordinated self-consistent and post-processing inputs, charge partitioning, orbital-resolved electronic descriptors, vibrational corrections and a free-energy diagram. Each transfer can discard atom identity, units, energy references, spin conventions or the reasoning used to choose a structure. These losses are particularly consequential for data-driven research: ML models and scientific agents require consistent schemas and explicit metadata, not only human-readable figures.")
    add_p(doc, "Padarthkhoj Tools was developed around the premise that a modern scientific interface should generate both research artifacts and reusable data artifacts. It does not attempt to replace Quantum ESPRESSO, VASP, AiiDA, VESTA or established numerical methods. Instead, it connects frequently adjacent preparation and analysis operations in a browser-local workspace and exposes their outputs in machine-readable forms. In this sense, conventional single-purpose and manually connected tools are increasingly insufficient as complete interfaces for AI-assisted research, even though their underlying algorithms remain indispensable.")
    add_p(doc, "The contributions of this work are: (i) a browser-native materials workspace requiring no server-side scientific-file upload; (ii) coordinated Quantum ESPRESSO protocol generation; (iii) interactive preset and custom reaction-intermediate construction; (iv) cross-code Bader and PDOS handling for Quantum ESPRESSO and VASP; (v) reusable electronic descriptors and plotting templates; and (vi) an export layer designed to connect human-reviewed calculations to ML and advanced AI pipelines.")

    doc.add_heading("2. Related software and positioning", level=1)
    add_p(doc, "Padarthkhoj occupies a different point in the software landscape from both workflow engines and individual scientific utilities. AiiDA tracks calculations and data through provenance graphs and controls remote resources [3]. Atomate provides reusable, tested workflows on top of pymatgen, FireWorks and custodian [4], while atomate2 extends composability and code interoperability [5]. The AiiDAlab Quantum ESPRESSO app offers a web graphical interface, automated execution, plugins, provenance and HPC integration [6]. These systems are stronger than Padarthkhoj in execution management, durable provenance and automated recovery.")
    add_p(doc, "Padarthkhoj instead emphasizes immediate browser-local preparation and post-processing. VESTA remains a reference for crystallographic and volumetric visualization [7]; PyProcar and sumo provide mature electronic-structure plotting [8,9]; CatKit systematically enumerates adsorption sites and high-throughput catalytic structures [10]; and phonopy provides rigorous harmonic and quasi-harmonic lattice-dynamics analysis [11]. Padarthkhoj draws design lessons from this ecosystem but focuses on the continuity of a practical materials and electrocatalysis workflow.")
    add_table(doc,
        ["Capability", "Representative existing tools", "Padarthkhoj position"],
        [
            ("Structure representation/editing", "ASE, pymatgen, VESTA, J-ICE", "Interactive CIF handling, substitutions, bonds and export"),
            ("QE input and execution", "PWgui, BURAI, AiiDAlab-QE", "Coordinated input/script generation; does not execute DFT"),
            ("Workflow provenance", "AiiDA, atomate/atomate2", "File/session exports; full provenance graph not yet implemented"),
            ("Adsorption structures", "CatKit and research scripts", "Preset and user-defined pathways with interactive placement"),
            ("Bader analysis", "Henkelman-group Bader code and viewers", "ACF.dat-derived charge tables and CIF-linked visualization"),
            ("PDOS and plots", "PyProcar, sumo, VASPKIT", "QE/VASP parsing, CSV normalization, templates and orbital metrics"),
            ("Vibrational thermochemistry", "phonopy, ASE thermochemistry", "Transparent harmonic frequency-to-ZPE/TS calculator"),
            ("AI-ready export", "Framework-dependent", "CIF, JSON, CSV, XLSX and standardized feature tables"),
        ], [1800, 2700, 4860])
    add_p(doc, "To the best of our literature and software survey, no previously reported browser-local platform combines this complete set of structure preparation, reaction-pathway authoring, Quantum ESPRESSO input generation, QE/VASP charge and PDOS analysis, orbital metrics, vibrational corrections and free-energy visualization. This is a scoped combination claim—not a claim that the component methods are new or that competing platforms are obsolete.")

    doc.add_heading("3. Software architecture and design principles", level=1)
    add_p(doc, "Padarthkhoj is implemented as a static single-page application using vanilla JavaScript, Vite, Three.js and JSZip. Uploaded scientific files remain in the browser; the core application requires no backend service. Page controllers coordinate user interaction, while scientific logic is separated into libraries for CIF parsing and symmetry, bonding, Quantum ESPRESSO conversion and generation, reaction pathways, Bader analysis, PDOS parsing, orbital metrics, DOS plotting, free-energy processing and vibrational thermochemistry.")
    add_p(doc, "The architecture follows four principles. First, scientific transformations should be explicit and reversible where practical. Second, data parsing and numerical analysis should be separated from visualization. Third, multi-file workflows should preserve ordering and identity. Fourth, every analysis intended for downstream reuse should expose a machine-readable export rather than requiring extraction from a figure.")
    add_table(doc, ["Layer", "Responsibilities", "Representative implementation"], [
        ("Interface", "Navigation, upload, controls, responsive scientific workspaces", "Page classes and shared theme/comfort settings"),
        ("Scientific core", "Parsing, coordinate conversion, integration, thermochemistry", "Modules under src/lib"),
        ("Visualization", "Periodic structures, bonds, labels, charge encodings, plots", "Three.js and canvas/SVG rendering"),
        ("Interchange", "CIF, QE input, JSON, CSV, XLSX, SVG/PNG and ZIP", "Browser downloads and reusable templates"),
        ("Verification", "Regression tests, linting and production build", "Automated local and continuous-integration quality gate"),
    ], [1500, 3900, 3960])

    doc.add_heading("4. Integrated scientific modules", level=1)
    doc.add_heading("4.1 Crystal structures and Quantum ESPRESSO preparation", level=2)
    add_p(doc, "Structure-to-QE Studio parses CIF structures, presents an interactive periodic model, supports structure editing and forwards the reviewed system to a protocol generator. Bond display is optional and threshold-controlled. Crystal Variant Generator supports visual site selection and combinatorial substitutions. The coordinated generator produces calculation-specific input sets and sequential submission-script skeletons for structural relaxation, SCF, DOS, bands, charge density, Bader-density generation and vibrational-energy workflows. The generated scripts intentionally remain scheduler-neutral; users must add site-specific launchers, modules and resource directives.")
    doc.add_heading("4.2 Preset and custom reaction pathways", level=2)
    add_p(doc, "Preset Reaction Pathways provides curated intermediate sequences for selected NRR, nitrate reduction, HER, OER/ORR and CO2RR routes. The user selects an active site and controls outward placement of molecular intermediates relative to an anchor. Geometric clearance checks reduce obvious overlaps but do not constitute an energetic or mechanistic validation. Custom Pathway Designer accepts multiple molecular CIF files, records the binding atom and order, and exports a reusable JSON definition. This human-in-the-loop design preserves expert control while reducing repetitive coordinate manipulation.")
    doc.add_heading("4.3 Bader charge studio", level=2)
    add_p(doc, "The Bader module reads ACF.dat and derives atom identities from a Quantum ESPRESSO input or VASP POSCAR/CONTCAR. Users supply the relevant core- or valence-electron reference by chemical species. The calculated signed charge is appended to the source columns and exported to spreadsheet form. When structural coordinates are available, atom colours remain element-specific while charge loss or gain can be represented by rings, fading or charge-dependent colour. Labels can show charge, atom number, both or neither. The interface visualizes an already completed Bader partition; it does not reproduce the grid-based steepest-ascent decomposition algorithm [12].")
    doc.add_heading("4.4 PDOS, DOS figures and orbital metrics", level=2)
    add_p(doc, "The PDOS Analyzer accepts Quantum ESPRESSO projwfc.x-derived files and projected VASP DOSCAR data. POSCAR or CONTCAR enables species-resolved VASP selection. The parser identifies spin mode, atoms, species and orbital channels, validates energy grids and can shift the energy reference. Exports use recognizable material- and selection-aware filenames. A separately downloadable PKDOS command-line package supports Quantum ESPRESSO workflows on local and HPC systems.")
    add_p(doc, "DOS Plotter consumes standardized CSV exports, supports multiple datasets, editable curve labels, reusable JSON templates, axis and tick controls, legends, line and fill styling, and raster/vector output. Orbital Metrics Calculator integrates selected channels to calculate occupancies and energy centres over user-defined ranges and evaluates elementary user formulas over named columns. Templates are matched by semantic column identity; absent orbitals generate missing values rather than positional substitution.")
    equation(doc, "N = ∫ₐᵇ D(E) dE     and     εcentre = [∫ₐᵇ E D(E) dE] / [∫ₐᵇ D(E) dE]")
    doc.add_heading("4.5 Vibrational corrections and free-energy diagrams", level=2)
    add_p(doc, "ZPE & TS Calculator accepts positive vibrational frequencies in THz and reports mode-resolved and total zero-point energy, vibrational entropy, thermal vibrational energy, T S and a harmonic Helmholtz correction. Zero and imaginary modes are excluded and reported. The implementation uses exact physical constants and a single selected temperature. For a harmonic mode of frequency ν,")
    equation(doc, "ZPE = ½ Σᵢ hνᵢ")
    equation(doc, "Sᵥᵢᵦ = kB Σᵢ {xᵢ/[exp(xᵢ)−1] − ln[1−exp(−xᵢ)]},  xᵢ = hνᵢ/(kBT)")
    equation(doc, "Fᵥᵢᵦ,corr = ZPE + Uᵥᵢᵦ,thermal − T Sᵥᵢᵦ")
    add_p(doc, "This calculator is not a replacement for a Brillouin-zone phonon treatment of a periodic solid. Free Energy Diagram Studio then organizes reaction-coordinate data, branches and annotations into editable diagrams with controlled export.")

    doc.add_heading("5. Padarthkhoj as an ML and advanced-AI data pipeline", level=1)
    add_p(doc, "Padarthkhoj does not currently claim to train a machine-learning model or autonomously select a valid density-functional-theory methodology. Its AI relevance lies in the transformation of heterogeneous, researcher-facing files into reviewed, structured artifacts. This role is important because the reliability of a predictive or agentic system is bounded by the consistency of its input data and metadata.")
    add_p(doc, "The platform can supply three classes of ML-ready information:")
    bullet(doc, "Structure records: catalyst and intermediate CIF files, atom identities, cells, selected sites and portable pathway JSON.")
    bullet(doc, "Electronic descriptors: Bader charges, species/orbital-resolved PDOS, integrated occupancies, energy centres and formula-derived features.")
    bullet(doc, "Thermochemical records: ZPE, vibrational entropy terms, free-energy states and branch-aware diagram data.")
    add_p(doc, "A prospective pipeline begins with raw CIF, Quantum ESPRESSO and VASP artifacts; continues through human-reviewed parsing, selection and normalization; and produces feature tables suitable for regression, classification, clustering, active learning or retrieval by a scientific agent. Export schemas should carry source code, material label, atom/species identity, spin convention, orbital name, energy reference, integration range, units, formula definition and software version. These fields prevent physically different quantities from becoming deceptively identical matrix columns.")
    callout(doc, "AI claim boundary", "The present contribution is an AI-ready data and interaction layer. A claim of improved ML accuracy, autonomous discovery or agent reliability requires a separately designed benchmark and is not asserted here.")

    doc.add_heading("6. Verification and reproducibility", level=1)
    add_p(doc, "The repository contains automated tests for Bravais-lattice classification, non-orthogonal cells, CIF symmetry expansion, special-position deduplication, export/reparse round trips, reaction-intermediate constraints, ACF.dat parsing, signed Bader charge, QE coordinate conversion, vc-relax structure recovery, free-energy parsing, HTML escaping, spin and non-spin PDOS parsing, energy-grid validation, Fermi-level shifting, PDOS summation, standardized DOS CSV validation, plotting-template round trips and harmonic thermochemistry. A combined quality gate runs linting, scientific regression tests and a production build.")
    add_p(doc, "For a high-impact journal submission, software tests must be supplemented by independent scientific validation. Table 2 defines the required benchmark programme; the results column is intentionally not populated in this draft.")
    add_table(doc, ["Benchmark", "Reference/acceptance criterion", "Status before submission"], [
        ("CIF and QE conversion", "Independent structures across all supported lattice classes; coordinate and cell tolerances reported", "Required"),
        ("Generated QE protocols", "Line-by-line review against QE documentation and executable dry runs", "Required"),
        ("Bader charge", "Agreement with independently processed ACF.dat and explicit electron convention", "Required"),
        ("QE/VASP PDOS", "Spin/non-spin and orbital sums against established tools or reference scripts", "Required"),
        ("Orbital integration", "Analytical curves and high-resolution numerical references", "Required"),
        ("ZPE and entropy", "Comparison with analytical harmonic values and ASE/phonopy where applicable", "Partially covered by regression; external comparison required"),
        ("Intermediate geometry", "Collision, orientation and round-trip tests plus expert review", "Automated geometry tests present; expert set required"),
        ("Performance", "Runtime/memory versus atom and file count on named browsers/hardware", "Required"),
        ("Usability", "Task completion, error rate and workload versus a manual workflow", "Required"),
        ("ML demonstration", "One public dataset, fixed split, baseline and reproducible notebook", "Required for strong AI framing"),
    ], [2100, 4560, 2700])

    doc.add_heading("7. Proposed research case studies", level=1)
    doc.add_heading("7.1 Coordinated Quantum ESPRESSO workflow", level=2)
    add_p(doc, "A representative study should begin with a public CIF, generate relaxation and electronic-structure protocols, and compare every generated file with a manually reviewed reference. The study should report the decisions that remain user responsibilities: pseudopotential compatibility, cutoffs, k-point convergence, smearing, spin state, dispersion treatment and scheduler configuration.")
    doc.add_heading("7.2 Electrocatalytic intermediate series", level=2)
    add_p(doc, "A catalyst structure should be processed through active-site selection, a preset or custom pathway, geometric inspection and CIF export. A subset of intermediates should then be relaxed independently. The analysis must separate placement success from chemical stability: an intuitively oriented initial structure may reconstruct, dissociate or migrate during optimization.")
    doc.add_heading("7.3 AI-ready electronic-structure dataset", level=2)
    add_p(doc, "The most persuasive AI case study would assemble a modest, openly shareable set of chemically related systems. PDOS channels, orbital occupancies, energy centres and Bader charges would be exported with consistent metadata and used to predict a target such as adsorption energy. Baselines should include composition-only and structure-only models. Ablation should test whether Padarthkhoj-derived electronic descriptors improve held-out performance. The split must prevent near-duplicate structures from leaking between training and test sets.")

    doc.add_heading("8. Discussion", level=1)
    add_p(doc, "The central value of Padarthkhoj is workflow continuity. By keeping structure preparation, reaction design, electronic analysis, thermochemistry and visualization close to their exported data, the platform can reduce clerical friction and make scientific choices more inspectable. This breadth is also a risk: a unified interface can create unwarranted confidence if warnings and domain boundaries are hidden. Padarthkhoj therefore treats generated inputs and intermediates as starting points that require convergence testing, literature comparison and expert review.")
    add_p(doc, "The phrase ‘older tools will become obsolete’ is neither technically accurate nor scientifically productive. Foundational tools such as VESTA, AiiDA, ASE, pymatgen, phonopy and the Bader code embody mature methods that Padarthkhoj does not replace. What is likely to become inadequate is the unrecorded manual chaining of isolated tools when datasets must be reusable by humans and machines. The future research interface is therefore not a monolith but an interoperable layer that preserves identity, units, provenance and uncertainty across specialized methods.")
    add_p(doc, "Compared with full workflow engines, browser-local processing improves accessibility and data privacy but limits durable provenance, collaboration and automatic execution. Compared with specialized packages, a broad platform may lag the newest domain-specific analyses. A plugin or schema-driven architecture, versioned project manifests and stronger interoperability with AiiDA/OPTIMADE are natural directions.")

    doc.add_heading("9. Limitations", level=1)
    bullet(doc, "Padarthkhoj prepares and analyzes files but does not execute or converge DFT calculations.")
    bullet(doc, "Browser memory and rendering performance constrain very large structures and datasets.")
    bullet(doc, "Bonding and collision rules are geometric heuristics, not electronic-structure criteria.")
    bullet(doc, "Preset reaction sequences do not establish a unique or kinetically accessible mechanism.")
    bullet(doc, "Bader charges depend on the supplied density, grid and electron-reference convention.")
    bullet(doc, "PDOS centres and occupancies depend on projection method, energy reference, integration range and numerical resolution.")
    bullet(doc, "The harmonic ZPE/TS module does not include anharmonicity, configurational entropy or complete gas-phase translation/rotation by itself.")
    bullet(doc, "Full provenance graphs, collaborative projects and cryptographically stable artifact identities remain future work.")

    doc.add_heading("10. Conclusions and outlook", level=1)
    add_p(doc, "Padarthkhoj Tools demonstrates a browser-native approach to integrating practical computational-materials preparation and analysis tasks that are usually distributed across multiple interfaces. Its distinctive contribution is the combination of structure and reaction-pathway design, coordinated Quantum ESPRESSO inputs, QE/VASP charge and PDOS analysis, orbital descriptors, vibrational corrections, free-energy diagrams and machine-readable export in one client-side environment. This makes the platform a promising human-in-the-loop bridge between first-principles research and ML or advanced AI data pipelines.")
    add_p(doc, "The strongest future development is not the indiscriminate addition of more controls, but deeper traceability: versioned project manifests, explicit scientific metadata, benchmark datasets, reproducible notebooks and interoperable APIs. With the validation programme described here and a quantitative ML case study, Padarthkhoj could support a competitive submission to Digital Discovery, Computer Physics Communications or Computational Materials Science. A higher-risk submission to npj Computational Materials would require clear evidence of scientific impact beyond software integration.")

    doc.add_heading("Code and data availability", level=1)
    add_p(doc, "The source-code repository URL, release tag, software license, archived DOI and benchmark-data DOI must be inserted before submission. The manuscript should cite an immutable release rather than only a development branch. All structures and numerical reference outputs used in the final benchmarks should be deposited under terms permitting independent reproduction.")
    doc.add_heading("Author contributions", level=1)
    add_p(doc, "A CRediT statement must be completed after the author list is finalized. Suggested roles include conceptualization, methodology, software, validation, visualization, data curation, writing—original draft, writing—review and editing, supervision and funding acquisition.")
    doc.add_heading("Competing interests", level=1)
    add_p(doc, "The authors must provide the journal-specific competing-interests declaration.")

    doc.add_heading("References", level=1)
    refs = [
        "[1] A. H. Larsen et al., The Atomic Simulation Environment—a Python library for working with atoms, J. Phys.: Condens. Matter 29 (2017) 273002. https://doi.org/10.1088/1361-648X/aa680e.",
        "[2] S. P. Ong et al., Python Materials Genomics (pymatgen): A robust, open-source Python library for materials analysis, Comput. Mater. Sci. 68 (2013) 314–319. https://doi.org/10.1016/j.commatsci.2012.10.028.",
        "[3] G. Pizzi et al., AiiDA: automated interactive infrastructure and database for computational science, Comput. Mater. Sci. 111 (2016) 218–230. https://doi.org/10.1016/j.commatsci.2015.09.013.",
        "[4] K. Mathew et al., Atomate: A high-level interface to generate, execute, and analyze computational materials science workflows, Comput. Mater. Sci. 139 (2017) 140–152. https://doi.org/10.1016/j.commatsci.2017.07.030.",
        "[5] A. M. Ganose et al., Atomate2: modular workflows for materials science, Digital Discovery 4 (2025) 1944–1973. https://doi.org/10.1039/D5DD00019J.",
        "[6] X. Wang et al., Making atomistic materials calculations accessible with the AiiDAlab Quantum ESPRESSO app, npj Comput. Mater. 12 (2026) 72. https://doi.org/10.1038/s41524-025-01936-4.",
        "[7] K. Momma and F. Izumi, VESTA 3 for three-dimensional visualization of crystal, volumetric and morphology data, J. Appl. Crystallogr. 44 (2011) 1272–1276. https://doi.org/10.1107/S0021889811038970.",
        "[8] U. Herath et al., PyProcar: A Python library for electronic structure pre/post-processing, Comput. Phys. Commun. 251 (2020) 107080. https://doi.org/10.1016/j.cpc.2019.107080.",
        "[9] A. M. Ganose, A. J. Jackson and D. O. Scanlon, sumo: Command-line tools for plotting and analysis of periodic ab initio calculations, J. Open Source Softw. 3 (2018) 717. https://doi.org/10.21105/joss.00717.",
        "[10] J. H. Montoya and K. A. Persson, A high-throughput framework for determining adsorption energies on solid surfaces, npj Comput. Mater. 3 (2017) 14. https://doi.org/10.1038/s41524-017-0017-z.",
        "[11] A. Togo and I. Tanaka, First principles phonon calculations in materials science, Scr. Mater. 108 (2015) 1–5. https://doi.org/10.1016/j.scriptamat.2015.07.021.",
        "[12] G. Henkelman, A. Arnaldsson and H. Jónsson, A fast and robust algorithm for Bader decomposition of charge density, Comput. Mater. Sci. 36 (2006) 354–360. https://doi.org/10.1016/j.commatsci.2005.04.010.",
        "[13] P. Giannozzi et al., QUANTUM ESPRESSO: a modular and open-source software project for quantum simulations of materials, J. Phys.: Condens. Matter 21 (2009) 395502. https://doi.org/10.1088/0953-8984/21/39/395502.",
        "[14] P. Giannozzi et al., Advanced capabilities for materials modelling with Quantum ESPRESSO, J. Phys.: Condens. Matter 29 (2017) 465901. https://doi.org/10.1088/1361-648X/aa8f79.",
        "[15] N. Mounet et al., Developments and applications of the OPTIMADE API for materials discovery, design, and data exchange, Digital Discovery 3 (2024). https://doi.org/10.1039/D4DD00039K.",
        "[16] A. Sekihara and H. Shiroishi, A Web-Based User Interface for Efficient Construction and Editing of Slab Models for First-Principles Solid-State Calculations, J. Comput. Chem. Jpn. 25 (2026) 19–21. https://doi.org/10.2477/jccj.2026-0006.",
    ]
    for ref in refs:
        p = doc.add_paragraph(); p.paragraph_format.left_indent = Inches(.25); p.paragraph_format.first_line_indent = Inches(-.25); p.paragraph_format.space_after = Pt(5); p.paragraph_format.line_spacing = 1.1
        font(p.add_run(ref), 9.3, color=INK)

    doc.add_heading("Submission completion checklist", level=1)
    for item in [
        "Insert complete author names, affiliations, ORCIDs and corresponding-author email.",
        "Choose one target journal and conform title, abstract length, headings and reference style.",
        "Archive a licensed software release and add repository/DOI links.",
        "Complete all numerical benchmarks in Table 2 and report tolerances and hardware.",
        "Add architecture, workflow and representative interface figures with captions and permissions.",
        "Run a documented usability study or narrow the manuscript claims accordingly.",
        "Implement and report the reproducible ML case study if retaining strong AI language.",
        "Have domain experts verify reaction pathways, pseudopotential guidance and thermochemical limitations.",
        "Update the literature search immediately before submission and soften any priority claim if a closer platform appears.",
    ]: bullet(doc, item)
    doc.save(OUT); print(OUT)


if __name__ == "__main__":
    build()
