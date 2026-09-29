from pathlib import Path
from datetime import date
import re
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "Padarthkhoj_Tools_User_Manual.docx"
LOGO = ROOT.parent / "ematai_lab_logo.png"

BLUE = "176FA8"
DARK_BLUE = "234A62"
INK = "17232D"
MUTED = "607482"
PALE = "EAF2F7"
PALE_GREEN = "EAF5F1"
PALE_GOLD = "FFF5D9"
PALE_RED = "FCECEC"
BORDER = "B9CAD5"
WHITE = "FFFFFF"


def reorder_chapters_to_match_website(doc):
    """Keep the manual's tool chapters in the same order as the website sidebar."""
    desired = [
        "Contents",
        "Before you begin",
        "Interface, appearance, and common controls",
        "Crystal Variant Generator",
        "Preset Reaction Pathways",
        "Custom Pathway Designer",
        "Bader Charge Studio",
        "QE & VASP PDOS Analyzer and PKDOS CLI",
        "DOS Plotter",
        "Orbital Metrics Calculator",
        "ZPE & TS Calculator",
        "Free Energy Diagram Studio",
        "Structure-to-QE Studio",
        "Selecting a Quantum ESPRESSO protocol",
        "Input Editor",
        "Self-consistent and structural-relaxation workflows",
        "Density of States workflow",
        "Band-structure workflow",
        "Charge-density and Bader-generation protocols",
        "Vibrational-energy workflow",
        "QE Output Studio",
        "End-to-end computational workflows",
        "Validation checklist",
        "Troubleshooting",
        "Installation and local operation",
        "Glossary",
        "Closing guidance",
    ]
    body = doc._element.body
    children = list(body)
    section = next((node for node in children if node.tag == qn("w:sectPr")), None)
    paragraph_by_element = {paragraph._p: paragraph for paragraph in doc.paragraphs}
    heading_indexes = []
    for index, node in enumerate(children):
        paragraph = paragraph_by_element.get(node)
        if paragraph is not None and paragraph.style.name == "Heading 1":
            text = paragraph.text.strip()
            key = re.sub(r"^\d+\.\s*", "", text)
            heading_indexes.append((index, key, node))

    if not heading_indexes:
        return
    first_heading = heading_indexes[0][0]
    prefix = children[:first_heading]
    groups = {}
    for position, (start, key, heading) in enumerate(heading_indexes):
        end = heading_indexes[position + 1][0] if position + 1 < len(heading_indexes) else len(children)
        groups[key] = children[start:end]

    missing = [name for name in desired if name not in groups]
    if missing:
        raise RuntimeError(f"Cannot reorder manual; missing chapters: {missing}")

    for node in list(body):
        body.remove(node)
    for node in prefix:
        body.append(node)
    chapter_number = 0
    for key in desired:
        group = groups[key]
        if key not in {"Contents", "Closing guidance"}:
            chapter_number += 1
            heading = group[0]
            for child in list(heading):
                if child.tag != qn("w:pPr"):
                    heading.remove(child)
            run = OxmlElement("w:r")
            text = OxmlElement("w:t")
            text.text = f"{chapter_number}. {key}"
            run.append(text)
            heading.append(run)
        for node in group:
            if node is not section:
                body.append(node)
    if section is not None:
        body.append(section)


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=90, start=120, bottom=90, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for name, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{name}"))
        if node is None:
            node = OxmlElement(f"w:{name}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    repeat = OxmlElement("w:tblHeader")
    repeat.set(qn("w:val"), "true")
    tr_pr.append(repeat)


def prevent_row_split(row):
    tr_pr = row._tr.get_or_add_trPr()
    cant_split = OxmlElement("w:cantSplit")
    cant_split.set(qn("w:val"), "true")
    tr_pr.append(cant_split)


def set_fixed_table_geometry(table, widths_dxa):
    # compact_reference_guide preset: every table uses the full 9360-DXA content width.
    source_total = sum(widths_dxa)
    widths_dxa = [round(width * 9360 / source_total) for width in widths_dxa]
    widths_dxa[-1] += 9360 - sum(widths_dxa)
    table.autofit = False
    tbl_pr = table._tbl.tblPr
    layout = tbl_pr.find(qn("w:tblLayout"))
    if layout is None:
        layout = OxmlElement("w:tblLayout")
        tbl_pr.append(layout)
    layout.set(qn("w:type"), "fixed")
    tbl_w = tbl_pr.find(qn("w:tblW"))
    tbl_w.set(qn("w:w"), str(sum(widths_dxa)))
    tbl_w.set(qn("w:type"), "dxa")
    tbl_ind = tbl_pr.find(qn("w:tblInd"))
    if tbl_ind is None:
        tbl_ind = OxmlElement("w:tblInd")
        tbl_pr.append(tbl_ind)
    tbl_ind.set(qn("w:w"), "120")
    tbl_ind.set(qn("w:type"), "dxa")
    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths_dxa:
        col = OxmlElement("w:gridCol")
        col.set(qn("w:w"), str(width))
        grid.append(col)
    for row in table.rows:
        for idx, cell in enumerate(row.cells):
            tc_w = cell._tc.get_or_add_tcPr().find(qn("w:tcW"))
            tc_w.set(qn("w:w"), str(widths_dxa[idx]))
            tc_w.set(qn("w:type"), "dxa")
            set_cell_margins(cell)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER


def set_font(run, size=None, bold=None, italic=None, color=None, name="Calibri"):
    run.font.name = name
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), name)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic
    if color:
        run.font.color.rgb = RGBColor.from_string(color)


def add_field(paragraph, instruction):
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = instruction
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.extend([begin, instr, separate, end])


def configure_styles(doc):
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    normal.font.size = Pt(11)
    normal.font.color.rgb = RGBColor.from_string(INK)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.25

    specs = {
        "Title": (29, DARK_BLUE, 0, 8),
        "Subtitle": (13, MUTED, 0, 8),
        "Heading 1": (16, BLUE, 18, 10),
        "Heading 2": (13, BLUE, 14, 7),
        "Heading 3": (12, DARK_BLUE, 10, 5),
    }
    for name, (size, color, before, after) in specs.items():
        style = doc.styles[name]
        style.font.name = "Calibri"
        style._element.rPr.rFonts.set(qn("w:ascii"), style.font.name)
        style._element.rPr.rFonts.set(qn("w:hAnsi"), style.font.name)
        style.font.size = Pt(size)
        style.font.bold = name != "Subtitle"
        style.font.color.rgb = RGBColor.from_string(color)
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True

    for style_name in ("List Bullet", "List Number"):
        style = doc.styles[style_name]
        style.font.name = "Calibri"
        style.font.size = Pt(11)
        style.paragraph_format.left_indent = Inches(.375)
        style.paragraph_format.first_line_indent = Inches(-.188)
        style.paragraph_format.space_after = Pt(4)
        style.paragraph_format.line_spacing = 1.25

    code = doc.styles.add_style("Code Block", 1)
    code.font.name = "Courier New"
    code._element.rPr.rFonts.set(qn("w:ascii"), "Courier New")
    code._element.rPr.rFonts.set(qn("w:hAnsi"), "Courier New")
    code.font.size = Pt(8.6)
    code.font.color.rgb = RGBColor.from_string(DARK_BLUE)
    code.paragraph_format.left_indent = Inches(.2)
    code.paragraph_format.right_indent = Inches(.2)
    code.paragraph_format.space_before = Pt(4)
    code.paragraph_format.space_after = Pt(7)
    code.paragraph_format.line_spacing = 1.0


def setup_page(doc):
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(1)
    section.bottom_margin = Inches(1)
    section.left_margin = Inches(1)
    section.right_margin = Inches(1)
    section.header_distance = Inches(.492)
    section.footer_distance = Inches(.492)

    header = section.header
    p = header.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = p.add_run("PADARTHKHOJ TOOLS  /  USER MANUAL")
    set_font(run, 7.5, True, color=MUTED)
    p.paragraph_format.space_after = Pt(0)

    footer = section.footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("EMat-AI Lab   •   ")
    set_font(run, 8, color=MUTED)
    add_field(p, "PAGE")


def add_title(doc, text, subtitle=None, page_break=True):
    p = doc.add_paragraph(style="Heading 1")
    p.paragraph_format.page_break_before = page_break
    p.add_run(text)
    if subtitle:
        q = doc.add_paragraph()
        q.paragraph_format.space_after = Pt(12)
        r = q.add_run(subtitle)
        set_font(r, 10.5, italic=True, color=MUTED)


def add_h2(doc, text):
    doc.add_paragraph(text, style="Heading 2")


def add_h3(doc, text):
    doc.add_paragraph(text, style="Heading 3")


def add_p(doc, text, bold_lead=None):
    p = doc.add_paragraph()
    if bold_lead and text.startswith(bold_lead):
        r = p.add_run(bold_lead)
        r.bold = True
        p.add_run(text[len(bold_lead):])
    else:
        p.add_run(text)
    return p


def add_bullets(doc, items):
    num_id = make_numbering(doc, "bullet", "•")
    for item in items:
        p = doc.add_paragraph()
        apply_numbering(p, num_id)
        p.add_run(item)


def add_steps(doc, items):
    num_id = make_numbering(doc, "decimal", "%1.")
    for item in items:
        p = doc.add_paragraph()
        apply_numbering(p, num_id)
        p.add_run(item)


def make_numbering(doc, num_format, marker):
    numbering = doc.part.numbering_part.element
    abstract_ids = [int(x.get(qn("w:abstractNumId"))) for x in numbering.findall(qn("w:abstractNum"))]
    num_ids = [int(x.get(qn("w:numId"))) for x in numbering.findall(qn("w:num"))]
    abstract_id = max(abstract_ids, default=0) + 1
    num_id = max(num_ids, default=0) + 1

    abstract = OxmlElement("w:abstractNum")
    abstract.set(qn("w:abstractNumId"), str(abstract_id))
    multi = OxmlElement("w:multiLevelType")
    multi.set(qn("w:val"), "singleLevel")
    abstract.append(multi)
    level = OxmlElement("w:lvl")
    level.set(qn("w:ilvl"), "0")
    start = OxmlElement("w:start")
    start.set(qn("w:val"), "1")
    level.append(start)
    fmt = OxmlElement("w:numFmt")
    fmt.set(qn("w:val"), num_format)
    level.append(fmt)
    lvl_text = OxmlElement("w:lvlText")
    lvl_text.set(qn("w:val"), marker)
    level.append(lvl_text)
    suff = OxmlElement("w:suff")
    suff.set(qn("w:val"), "tab")
    level.append(suff)
    p_pr = OxmlElement("w:pPr")
    tabs = OxmlElement("w:tabs")
    tab = OxmlElement("w:tab")
    tab.set(qn("w:val"), "num")
    tab.set(qn("w:pos"), "540")
    tabs.append(tab)
    p_pr.append(tabs)
    ind = OxmlElement("w:ind")
    ind.set(qn("w:left"), "540")
    ind.set(qn("w:hanging"), "270")
    p_pr.append(ind)
    spacing = OxmlElement("w:spacing")
    spacing.set(qn("w:after"), "80")
    spacing.set(qn("w:line"), "280")
    spacing.set(qn("w:lineRule"), "auto")
    p_pr.append(spacing)
    level.append(p_pr)
    abstract.append(level)
    numbering.append(abstract)

    num = OxmlElement("w:num")
    num.set(qn("w:numId"), str(num_id))
    abstract_ref = OxmlElement("w:abstractNumId")
    abstract_ref.set(qn("w:val"), str(abstract_id))
    num.append(abstract_ref)
    numbering.append(num)
    return num_id


def apply_numbering(paragraph, num_id):
    p_pr = paragraph._p.get_or_add_pPr()
    num_pr = OxmlElement("w:numPr")
    ilvl = OxmlElement("w:ilvl")
    ilvl.set(qn("w:val"), "0")
    num = OxmlElement("w:numId")
    num.set(qn("w:val"), str(num_id))
    num_pr.extend([ilvl, num])
    p_pr.append(num_pr)


def add_callout(doc, label, text, kind="note"):
    fills = {"note": PALE, "good": PALE_GREEN, "warn": PALE_GOLD, "risk": PALE_RED}
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    prevent_row_split(table.rows[0])
    set_fixed_table_geometry(table, [9120])
    cell = table.cell(0, 0)
    set_cell_shading(cell, fills[kind])
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run(f"{label.upper()}  ")
    set_font(r, 9.5, True, color=DARK_BLUE)
    r = p.add_run(text)
    set_font(r, 9.5, color=INK)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)


def add_table(doc, headers, rows, widths):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    for idx, header in enumerate(headers):
        cell = table.rows[0].cells[idx]
        set_cell_shading(cell, DARK_BLUE)
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(header)
        set_font(r, 8.8, True, color=WHITE)
    set_repeat_table_header(table.rows[0])
    for row_data in rows:
        cells = table.add_row().cells
        prevent_row_split(table.rows[-1])
        for idx, value in enumerate(row_data):
            if len(table.rows) % 2 == 1:
                set_cell_shading(cells[idx], "F5F8FA")
            p = cells[idx].paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            r = p.add_run(str(value))
            set_font(r, 8.8, color=INK)
    set_fixed_table_geometry(table, widths)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    return table


def add_code(doc, text):
    p = doc.add_paragraph(style="Code Block")
    p.add_run(text)
    p_pr = p._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), "EDF3F6")
    p_pr.append(shd)


def build():
    doc = Document()
    configure_styles(doc)
    setup_page(doc)
    props = doc.core_properties
    props.title = "Padarthkhoj Tools — Complete User Manual"
    props.subject = "Quantum ESPRESSO and computational materials workflow guide"
    props.author = "EMat-AI Lab"
    props.keywords = "Quantum ESPRESSO, CIF, DFT, Bader, DOS, bands, intermediates, ZPE, vibrational entropy"

    # Cover — editorial manual pattern.
    for _ in range(3):
        doc.add_paragraph()
    if LOGO.exists():
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        logo_shape = p.add_run().add_picture(str(LOGO), width=Inches(3.2))
        logo_shape._inline.docPr.set("descr", "EMat-AI Lab logo")
        logo_shape._inline.docPr.set("title", "EMat-AI Lab")
    p = doc.add_paragraph("PADARTHKHOJ TOOLS", style="Title")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p = doc.add_paragraph("Complete User Manual", style="Subtitle")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p = doc.add_paragraph("A practical guide for Quantum ESPRESSO, crystallographic structures, reaction intermediates, Bader charge analysis, and free-energy diagrams")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.left_indent = Inches(.65)
    p.paragraph_format.right_indent = Inches(.65)
    for run in p.runs:
        set_font(run, 12, color=DARK_BLUE)
    doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(f"EMat-AI Lab  •  Version 1.0  •  {date.today().strftime('%B %Y')}")
    set_font(r, 9.5, True, color=MUTED)
    add_callout(doc, "Scope", "This manual explains what the browser application does and how to use it responsibly. It does not replace the Quantum ESPRESSO manuals, pseudopotential documentation, convergence testing, or literature validation.", "note")

    doc.add_page_break()
    doc.add_paragraph("Contents", style="Heading 1")
    contents = [
        ("1", "Before you begin", "3"), ("2", "Interface, appearance, and common controls", "4"),
        ("3", "Crystal Variant Generator", "6"), ("4", "Preset Reaction Pathways", "7"),
        ("5", "Custom Pathway Designer", "11"), ("6", "Bader Charge Studio", "13"),
        ("7", "QE & VASP PDOS Analyzer and PKDOS CLI", "15"), ("8", "DOS Plotter", "17"),
        ("9", "Orbital Metrics Calculator", "19"), ("10", "ZPE & TS Calculator", "21"),
        ("11", "Free Energy Diagram Studio", "25"), ("12", "Structure-to-QE Studio", "26"),
        ("13", "Selecting a Quantum ESPRESSO protocol", "27"), ("14", "QE Input Studio", "28"),
        ("15", "SCF and structural relaxation", "29"), ("16", "Density of States", "30"),
        ("17", "Band structure", "31"), ("18", "Charge density and Bader generation", "32"),
        ("19", "Vibrational energy", "33"), ("20", "QE Output Studio", "34"),
        ("21", "End-to-end workflows", "35"), ("22", "Validation checklist", "36"),
        ("23", "Troubleshooting", "37"), ("24", "Installation and local operation", "38"),
        ("25", "Glossary", "39"), ("", "Closing guidance", "40"),
    ]
    toc = doc.add_table(rows=0, cols=3)
    toc.alignment = WD_TABLE_ALIGNMENT.LEFT
    for number, title, page in contents:
        cells = toc.add_row().cells
        cells[0].text = number
        cells[1].text = title
        cells[2].text = page
        cells[2].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
        for cell in cells:
            for run in cell.paragraphs[0].runs:
                set_font(run, 9, bold=bool(number), color=DARK_BLUE if number else MUTED)
            cell.paragraphs[0].paragraph_format.space_after = Pt(0)
    set_fixed_table_geometry(toc, [600, 7440, 1080])
    # Remove visible borders while retaining explicit table geometry.
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = OxmlElement(f"w:{edge}")
        tag.set(qn("w:val"), "nil")
        borders.append(tag)
    toc._tbl.tblPr.append(borders)

    add_title(doc, "1. Before you begin", "What the application is—and what scientific responsibility remains with the user")
    add_p(doc, "Padarthkhoj Tools is a browser-based scientific workflow assistant for crystallography and Quantum ESPRESSO. It can prepare, reorganize, visualize, and export files. It does not run density-functional-theory calculations in the browser and it cannot decide whether a model is physically adequate.")
    add_p(doc, "A useful way to think about the application is as a careful laboratory notebook assistant: it reduces repetitive file preparation, keeps coordinated workflows consistent, and helps you inspect structures. You remain responsible for the Hamiltonian, convergence, boundary conditions, spin state, charge state, pseudopotential suitability, and interpretation.")
    add_h2(doc, "What happens to uploaded files")
    add_bullets(doc, [
        "CIF, QE input/output, ACF.dat, and CSV files are processed locally in the browser.",
        "The application has no scientific-computation backend, database, or user account system.",
        "Downloads are generated in the browser as CIF, text, shell script, PNG, XLSX, or ZIP files.",
        "Closing or refreshing the page can clear in-memory work. Download important results before leaving a module.",
    ])
    add_h2(doc, "Recommended browser and hardware")
    add_p(doc, "Use a current desktop version of Chrome, Edge, Firefox, or Safari with WebGL and hardware acceleration enabled. Large unit cells, many labels, or high-DPI image exports can consume substantial GPU memory. For very large structures, hide bonds and labels until they are needed.")
    add_callout(doc, "Scientific rule", "Treat every generated input and geometry as a reviewed starting point. Read it before submission, compare it with a trusted reference, and perform convergence tests appropriate to the material and observable.", "warn")

    add_title(doc, "2. Interface, appearance, and common controls", "Navigation, reversible comfort settings, file handling, 3D movement, and bonds")
    add_h2(doc, "Application shell")
    add_p(doc, "The left sidebar groups the application into Materials Analysis & Design and Quantum ESPRESSO Workbench. The first group contains Crystal Variant Generator, Preset Reaction Pathways, Custom Pathway Designer, Bader Charge Studio, QE & VASP PDOS Analyzer, DOS Plotter, Orbital Metrics Calculator, ZPE & TS Calculator, and Free Energy Diagram Studio. The workbench contains Structure-to-QE Studio, QE Input Studio, and QE Output Studio. The top bar reports the active page and current file.")
    add_h2(doc, "Appearance & Comfort")
    add_p(doc, "Open the gear button in the sidebar footer. If the sidebar is hidden or focus mode is active, use the floating gear. Appearance controls are deliberately reversible and do not change any structure, parsed data, scientific setting, or exported numerical result.")
    add_table(doc, ["Control", "What it changes", "How to reverse it"], [
        ("Theme", "Dark or light colour scheme", "Choose the previous theme"),
        ("Interface style", "Classic application or Scientific Notebook appearance", "Switch back to Classic"),
        ("Text scale", "Compact, Standard, Large, or Adaptive global scale", "Choose Standard or the former scale"),
        ("Interface density", "Spacing between controls and panels", "Choose Standard"),
        ("Upload-box text", "Small, Standard, Large, or Adaptive uploader instructions", "Choose Standard"),
        ("Sidebar", "Full, Compact, or Hidden navigation", "Choose Full; Ctrl/Cmd+B also toggles it"),
        ("Contrast / motion", "Readability and animation preference", "Return each selector to Standard/reduced"),
        ("Focus mode", "Temporarily hides surrounding interface", "Press Escape or leave focus mode"),
    ], [1800, 4300, 3020])
    add_h3(doc, "Detailed typography")
    add_p(doc, "Detailed typography is opt-in. Enable it to choose a preset or independently adjust page titles, panel titles, section headings, labels, inputs, buttons, helper text, tables, filenames, badges, editors, and toolbars. Editing an individual size changes the preset to Custom. Uncheck Enable detailed typography to restore the original interface sizes exactly, or use Reset typography. The settings are saved locally in the browser and survive a refresh.")
    add_callout(doc, "Scope of typography", "Interface typography is independent from fonts and sizes inside DOS, free-energy, Bader PNG, or other scientific exports. Configure export typography inside the relevant plotting module.", "note")
    add_h2(doc, "Multiple-file upload lists")
    add_p(doc, "Modules that accept many files use a compact summary rather than placing every filename permanently in the panel. Open the file-list control to inspect, select, or remove individual uploads. A badge such as 10+ or 20+ reports the collection size without consuming the scientific workspace.")
    add_h2(doc, "How to operate a 3D structure")
    add_table(doc, ["Action", "Mouse/trackpad", "Result"], [
        ("Rotate", "Left-click and drag", "Orbit the camera around the structure"),
        ("Pan", "Right-click and drag", "Translate the camera view"),
        ("Zoom", "Mouse wheel or trackpad scroll", "Move nearer to or farther from the structure"),
        ("Select", "Click an atom", "Select the atom or toggle it in a multi-selection viewer"),
        ("Multiple selection", "Shift/Ctrl/Cmd where offered", "Keep earlier selections while adding another atom"),
    ], [1500, 2800, 4820])
    add_h2(doc, "Shared bond controls")
    add_p(doc, "All CIF-based viewers provide a compact Bonds control. Automatic bonds are lightweight, single-colour line segments. A pair is accepted when its periodic minimum-image distance is above 0.1 Å and below a percentage of the sum of the two covalent radii. The default scale is 115%.")
    add_bullets(doc, [
        "Turn Bonds off when the structure is large or when connectivity obscures the active site.",
        "Change the threshold percentage to make automatic bonding more or less permissive.",
        "Add an element-pair rule, such as Cu–N with an explicit minimum and maximum distance, to override the automatic cutoff for that pair.",
        "A displayed line is a geometric suggestion, not proof of a chemical bond or bond order.",
    ])
    add_callout(doc, "Periodic systems", "A bond may cross a cell boundary because the detector uses a minimum-image convention. This is expected for periodic crystals, but a very small cell or incorrect lattice can create misleading connectivity.", "note")

    add_title(doc, "3. Structure-to-QE Studio", "Inspecting, modifying, and forwarding a crystal structure")
    add_steps(doc, [
        "Open Structure-to-QE Studio and upload or drop a .cif file.",
        "Inspect the unit cell, atom count, lattice parameters, symmetry information, and 3D structure.",
        "Rotate the model and click an atom. Its list entry and structure control become active.",
        "Use Change Element for a substitution, Delete Atom to remove a site, or the right-click menu to freeze/unfreeze, change, or delete an atom.",
        "Use the horizontal and vertical splitters to allocate space between the viewer, atom list, and controls.",
        "When the edited structure is ready, choose Create Input File and select a QE protocol.",
    ])
    add_h2(doc, "Frozen atoms")
    add_p(doc, "Frozen atoms are visually marked and are intended to carry positional constraints into supported generated inputs. Use constraints deliberately—for example, to keep deeper slab layers fixed while relaxing an adsorbate and surface layers. Over-constraining a model can suppress physically important reconstruction.")
    add_h2(doc, "Symmetry and lattice warnings")
    add_p(doc, "CIF symmetry operations may expand the asymmetric unit. Special positions are deduplicated. Always compare the displayed atom count with a trusted crystallographic program when the CIF contains unusual symmetry expressions, partial occupancies, disorder, or nonstandard settings.")

    add_title(doc, "4. Selecting a Quantum ESPRESSO protocol", "Generated files, executables, and run order")
    add_p(doc, "After leaving the CIF Editor, the Protocol Selector offers seven workflows. It also shows detected symmetry and allows an ibrav override. Keep the detected choice unless you understand how the selected Bravais-lattice convention changes CELL_PARAMETERS or celldm values.")
    add_table(doc, ["Protocol", "Generated artifacts", "Execution order"], [
        ("Structural Relaxation", "*_relax.in, *_submit.sh", "pw.x"),
        ("Self-Consistent Field", "*_scf.in, *_submit.sh", "pw.x"),
        ("Density of States", "*_scf.in, *_nscf.in, *_dos.in, *_submit.sh", "pw.x → pw.x → dos.x"),
        ("Band Structure", "*_scf.in, *_nscf.in, *_bands.in, *_submit.sh", "pw.x → pw.x → bands.x"),
        ("Charge Density", "*_scf.in, *_charge.in, *_submit.sh", "pw.x → pp.x"),
        ("Bader Charge Calculation", "*_scf.in, *_allelectron.in, *_valenceelectron.in, *_submit.sh", "pw.x → pp.x → pp.x"),
        ("Vibrational Energy", "*_scf.in, *_hess.in, *_ph.in, *_dyn.in, *_submit.sh", "pw.x → d3hess.x if DFT-D3 → ph.x → dynmat.x"),
    ], [2100, 4100, 2920])
    add_h2(doc, "Coordinate and lattice choices")
    add_bullets(doc, [
        "ibrav=0 writes explicit CELL_PARAMETERS and is the safest transparent choice for an arbitrary CIF.",
        "A nonzero ibrav is compact but requires exact agreement between the cell convention and QE's definition.",
        "ATOMIC_POSITIONS may be written in angstrom or crystal coordinates. Fractional coordinates are often easier to compare across cell changes.",
        "Never change ibrav without checking the generated lattice and visualizing or reparsing the resulting structure.",
    ])

    add_title(doc, "5. Input Editor", "Reading and controlling coordinated QE files")
    add_p(doc, "The Input Editor combines a plain-text editor with a stage-specific Protocol Settings panel. In a multi-file workflow, clicking a file tab changes the settings panel so that it shows only controls relevant to that file. Drag the divider to resize the editor and settings area; arrow keys work when the divider has keyboard focus, Shift makes larger steps, and double-click restores the default.")
    add_h2(doc, "Parameters that deserve deliberate checking")
    add_table(doc, ["Parameter", "Meaning", "What to verify"], [
        ("prefix / outdir", "Identity and scratch directory shared by linked stages", "Must match throughout SCF, NSCF, and post-processing files"),
        ("pseudo_dir / UPF", "Location and filenames of pseudopotentials", "Functional, valence configuration, relativistic treatment, and file availability"),
        ("ecutwfc / ecutrho", "Wavefunction and charge-density cutoffs", "Converge for the hardest species and pseudopotential type"),
        ("occupations", "Electronic occupation method", "Metal, insulator, or integration calculation"),
        ("smearing / degauss", "Broadening method and width", "Converge total energies and avoid excessive broadening"),
        ("K_POINTS", "Brillouin-zone sampling", "Dimensionality, cell size, symmetry, and target observable"),
        ("nspin / magnetization", "Spin-polarized treatment", "Magnetic species, initial states, and possible metastability"),
        ("conv_thr", "Electronic self-consistency threshold", "Tight enough for forces, phonons, energy differences, or charge analysis"),
        ("vdw_corr", "Dispersion correction", "Consistency with the chosen functional and scientific protocol"),
    ], [1600, 3400, 4120])
    add_h2(doc, "Pseudopotential dropdown")
    add_p(doc, "The dropdown is intentionally restricted to the UPF inventory bundled with the project. The application does not upload or validate the files on your compute system. Confirm that each generated filename exists under pseudo_dir and that all species use a scientifically consistent pseudopotential family.")
    add_h2(doc, "Submit scripts")
    add_p(doc, "Generated shell scripts use sequential commands, tee, and pipefail so output is visible and saved while failures stop later stages. They are portable workflow skeletons, not scheduler scripts. Add SLURM/PBS directives, modules, environment variables, MPI launchers, pool parallelism, and executable paths required by your facility.")
    add_code(doc, "pw.x -i sample_scf.in | tee sample_scf.out")

    add_title(doc, "6. Self-consistent and structural-relaxation workflows", page_break=False)
    add_h2(doc, "SCF")
    add_p(doc, "Use SCF to obtain a self-consistent ground-state density and total energy for a fixed geometry. The default occupation is smearing because it is robust for metals and unknown systems; an insulating material may be better represented by fixed occupations once the electronic character is established.")
    add_h2(doc, "Structural relaxation")
    add_p(doc, "Relaxation optimizes atomic positions subject to the selected constraints. Inspect force and energy convergence in the output rather than assuming that process completion means physical convergence. For slabs, check vacuum thickness, dipole treatment where needed, and whether fixed layers are appropriate. For molecular crystals and porous materials, dispersion treatment may be decisive.")
    add_callout(doc, "Comparison energies", "Use the same functional, pseudopotentials, cutoffs, k-point philosophy, smearing treatment, and convergence criteria when comparing structures or adsorption energies.", "warn")

    add_title(doc, "7. Density of States workflow")
    add_steps(doc, [
        "Run *_scf.in with pw.x to establish the self-consistent density.",
        "Run *_nscf.in with pw.x on the denser uniform k-grid and enough empty bands.",
        "Run *_dos.in with dos.x using the same prefix and outdir.",
        "Inspect the DOS output and confirm the energy reference before plotting or comparing systems.",
    ])
    add_p(doc, "SCF defaults to occupations='smearing'. DOS NSCF defaults to Blöchl occupations='tetrahedra', which requires a uniform automatic k-grid. The initial NSCF mesh is three times the SCF grid in each direction and nbnd starts at four times the atom count. These are convenience estimates, not convergence guarantees.")
    add_bullets(doc, [
        "Increase nbnd until the requested unoccupied-energy window is covered.",
        "Converge the dense k-grid against the spectral features of interest.",
        "Emin, Emax, and DeltaE are optional sampling controls; choose them to resolve the needed energy window without false precision.",
        "For low-dimensional systems, do not blindly densify vacuum directions.",
    ])

    add_title(doc, "8. Band-structure workflow")
    add_p(doc, "The workflow creates SCF, path calculation, bands.x, and submit files. The path input uses calculation='bands', Gaussian smearing by default, and K_POINTS crystal_b. The generator suggests a path from detected ibrav and offers presets for common lattice families.")
    add_table(doc, ["Lattice family", "Starter path"], [
        ("Hexagonal / trigonal", "Γ–M–K–Γ–A–L–H–A"),
        ("Simple cubic", "Γ–X–M–Γ–R–X"),
        ("FCC", "Γ–X–W–K–Γ–L–U–W–L–K"),
        ("BCC", "Γ–H–N–Γ–P–H–P–N"),
        ("Tetragonal", "Γ–X–M–Γ–Z–R–A–Z"),
        ("Orthorhombic", "Γ–X–S–Y–Γ–Z–U–R–T–Z"),
        ("Monoclinic/triclinic starter", "Γ–X–Y–Γ–Z"),
    ], [3100, 6020])
    add_p(doc, "In the path builder, each row contains a high-symmetry label, reciprocal coordinates, and the interpolation count to the next point. Add, remove, reorder, or replace vertices as needed.")
    add_callout(doc, "Mandatory cross-check", "High-symmetry labels and reciprocal coordinates depend on the primitive-cell convention. Verify the complete path with the literature, SeeK-path, Bilbao Crystallographic Server, or another trusted source for the exact cell used in the calculation.", "risk")

    add_title(doc, "9. Charge-density and Bader-generation protocols")
    add_h2(doc, "Charge density")
    add_p(doc, "The charge-density workflow runs pw.x and then pp.x. Defaults select total electron density with plot_num=0 and a three-dimensional Gaussian cube using iflag=3 and output_format=6. Keep a .cube extension for this format. Change plot_num only after consulting the pp.x documentation for the desired physical quantity.")
    add_h2(doc, "Bader density preparation")
    add_p(doc, "The Bader generation workflow creates an SCF input plus all-electron and valence-density pp.x inputs. The all-electron reconstruction uses plot_num=21; the valence density uses plot_num=0. Both default to 3D cube output. The workflow prepares files for an external Bader executable but does not run the Henkelman analysis itself.")
    add_bullets(doc, [
        "Keep prefix and outdir identical across all three QE inputs.",
        "Verify that the pseudopotential and all-electron reconstruction are suitable for the intended charge analysis.",
        "Use a sufficiently converged charge-density grid; Bader partitioning can be sensitive to grid resolution.",
        "Retain consistent atom order for later ACF/SCF/CIF mapping in the Bader Analysis page.",
    ])

    add_title(doc, "10. Vibrational-energy workflow")
    add_p(doc, "The workflow generates SCF, Hessian, phonon, dynmat, and submit files. The default phonon q point is Γ, tr2_ph is 1.0d-14, and dynmat uses asr='crystal'.")
    add_table(doc, ["Stage", "Executable", "Purpose"], [
        ("SCF", "pw.x", "Converged reference density"),
        ("DFT-D3 Hessian", "d3hess.x", "Dispersion Hessian; required only for the implemented DFT-D3 branch"),
        ("Phonon", "ph.x", "Density-functional perturbation calculation"),
        ("Dynamical matrix", "dynmat.x", "Frequencies/eigenvectors and acoustic-sum-rule processing"),
    ], [1600, 1800, 5720])
    add_p(doc, "If the SCF uses vdw_corr='dft-d3', the Hessian input is active, dftd3_threebody defaults to .false., and the phonon input receives dftd3_hess. For a non-D3 choice, the submit script skips d3hess.x and the phonon input omits the Hessian tag.")
    add_callout(doc, "Interpretation", "A frequency is not automatically a zero-point-energy correction. Confirm mode selection, translational/rotational treatment, imaginary modes, dimensionality, adsorbate constraints, and the thermochemical convention used in your study.", "warn")

    add_title(doc, "11. QE Output Studio", "Recovering structures, extracting coordinates, and repairing inputs")
    add_h2(doc, "QE output to CIF or positions")
    add_steps(doc, [
        "Upload one or more relax or vc-relax output files (.out, .log, or .pwout).",
        "Inspect calculation type, convergence indication, number of steps, cell changes, lattice parameters, volume, and final coordinates.",
        "Download the final structure as CIF or an ATOMIC_POSITIONS text block.",
        "Use ZIP export for multiple successfully parsed files.",
    ])
    add_h2(doc, "Extract coordinates from CIF")
    add_p(doc, "Upload multiple CIF files, choose angstrom or crystal coordinates, set decimal precision, then convert. Copy or download an individual block, or export all results in a ZIP.")
    add_h2(doc, "Input Fixer")
    add_p(doc, "Combine .in + .out is the recommended mode. It preserves the original input and replaces only final ATOMIC_POSITIONS and, for vc-relax, CELL_PARAMETERS. Reconstruct from .out only attempts to rebuild a complete input from printed output information and therefore deserves closer review.")
    add_callout(doc, "Convergence is separate", "Successfully extracting the last coordinates does not establish that a relaxation converged. Read the final forces, stresses, stopping reason, and error messages in the original output.", "risk")

    add_title(doc, "12. Crystal Variant Generator", "Graphical multi-site substitution and combinatorial export")
    add_steps(doc, [
        "Upload a template CIF.",
        "Select substitution sites directly in the 3D viewer. Use Select All or Clear when useful.",
        "Assign one or more replacement elements to each selected site.",
        "Review the Cartesian-product configuration count before generation.",
        "Generate the structures, preview the list, and download the complete ZIP.",
    ])
    add_p(doc, "The generator preserves unrelated CIF text where possible and changes the selected atom tokens. A large number of sites and alternatives grows combinatorially. For example, five independently selected sites with three choices each produce 3⁵ = 243 configurations.")
    add_bullets(doc, [
        "Confirm that sites intended to be symmetry equivalent are treated consistently.",
        "Remove duplicate structures using symmetry-aware tools when the combinatorial construction produces equivalent configurations.",
        "Relax every substituted structure before comparing energies.",
        "Check oxidation states, charge balance, spin states, and local coordination after substitution.",
    ])

    add_title(doc, "13. Preset Reaction Pathways", "Building NRR, HER, OER/ORR, and CO2RR adsorbate starting geometries")
    add_p(doc, "The Intermediate Maker is a geometric placement tool for adsorbate starting structures. NRR offers the supplied NO₃→NH₃ and Ni-site-derived N₂→NH₃ sequences. HER provides H*. OER/ORR provides O*, OH*, and OOH*. CO₂RR provides suggested CO₂-to-C₂H₄ and CO₂-to-C₂H₅OH branches derived from supplied Co single-atom-catalyst structures, with a separate CHO alternative.")
    add_h2(doc, "Implemented pathway")
    add_table(doc, ["Order", "Intermediate", "Practical reading"], [
        (1, "NO₃", "Adsorbed nitrate starting state"),
        (2, "NO₃H", "First hydrogenated nitrate template"),
        (3, "NO₂", "Nitrite-like template"),
        (4, "NO₂H", "Hydrogenated nitrite template"),
        (5, "NO", "Nitrosyl-like template"),
        (6, "NOH", "N-bound/OH-containing template orientation"),
        (7, "NHO", "Alternative N–H–O connectivity/orientation template"),
        (8, "NHOH", "Further hydrogenated N–O template"),
        (9, "N", "Adsorbed nitrogen atom"),
        (10, "NH", "Adsorbed imide-like fragment"),
        (11, "NH₂", "Adsorbed amide-like fragment"),
        (12, "NH₂OH", "Hydroxylamine-like template"),
        (13, "NH₃", "Ammonia endpoint template"),
    ], [800, 1600, 6720])
    add_callout(doc, "Pathway meaning", "The listed sequence is a library of supplied starting geometries, not a claim that every elementary step is thermodynamically or kinetically preferred on every catalyst. Compare alternative mechanisms and literature for the system under study.", "warn")
    add_h2(doc, "NRR — N₂ to NH₃")
    add_p(doc, "Keep NRR selected and use the Reaction dropdown to choose N₂ → NH₃. The nine supplied relaxed Ni-site structures yield NNH, NNH₂, NHNH, NHNH₂, NH₂NH₂, N, NH, NH₂, and NH₃ templates. The identical 57-atom surface was removed during extraction; the first adsorbate N—the atom bonded to Ni in each example—is placed at the new catalyst anchor. No separate adsorbed N₂ CIF was supplied, so the generated library begins at NNH. Internal N–N and N–H geometry is preserved while the whole adsorbate is aligned with the user-selected outward direction.")
    add_h2(doc, "HER — single H adsorption")
    add_p(doc, "Choose HER in the family selector, then choose Generate H adsorption. The pathway contains one H atom. That H atom is the binding atom and is placed exactly at the cyan anchor, so the site-to-anchor distance is the initial active-site–H distance. Twist and tilt do not alter a single atom. Adjust the anchor direction and distance, inspect neighbouring and periodic atoms, and download the preview CIF or HER ZIP as a starting geometry for relaxation.")
    add_h2(doc, "OER/ORR — O, OH, and OOH")
    add_p(doc, "Choose OER/ORR and generate all three intermediates. Atomic O is placed directly at the anchor. OH binds through O and retains the supplied relaxed O–H distance of approximately 0.987 Å. OOH binds through the non-protonated oxygen and retains the supplied relaxed O–O and O–H distances of approximately 1.202 Å and 1.000 Å. Preview and adjust O, OH, and OOH independently; use Apply placement to all only when a common adsorption direction is a sensible starting assumption.")
    add_h2(doc, "CO₂RR — C₂H₄ and C₂H₅OH branches")
    add_p(doc, "The two C₂ pathways share the supplied sequence CO₂, COOH, CO, co-adsorbed CO–CO, COH, COCOH, CCO, CHCO, CHCHO, and CH₂CHO. The ethylene branch terminates at C₂H₄. The ethanol branch continues through CH₃CHO and CH₃CH₂O to C₂H₅OH. A separate CHO alternative is also available where the pathway definition offers it.")
    add_bullets(doc, [
        "Adsorption orientation follows the supplied Co single-atom-catalyst input structures rather than filename guessing.",
        "CO₂ is O-bound in the supplied example; CCO uses its second carbon as the declared binding atom.",
        "CHCHO, CH₂CHO, CH₃CHO, and CH₃CH₂O are O-bound in the supplied examples.",
        "C₂H₄ and ethanol endpoints remain provisional molecule-derived placements where matching adsorbed Co-SAC inputs were not supplied.",
        "Cross-check the mechanistic order, binding mode, coverage, and proton–electron bookkeeping against literature for the actual catalyst.",
    ])
    add_h2(doc, "Stage 1 — Surface and active site")
    add_steps(doc, [
        "Upload the clean or prepared catalyst CIF.",
        "Rotate, pan, and zoom to expose the intended adsorption region.",
        "Click exactly one active-site atom. Confirm its label and element in the viewer heads-up display.",
        "Choose Lock view. Camera and base-atom interaction are frozen so later dragging controls placement instead of the structure.",
        "If the wrong site was selected, choose Reset site, interact with the CIF again, then select and lock the correct site.",
    ])
    add_h2(doc, "Stage 2 — Adsorption anchor and outward normal")
    add_p(doc, "The cyan anchor marks the binding atom position. Its vector from the selected active-site atom defines the outward surface-normal direction. The intermediate's adsorption axis is rotated to point along this vector, so the adsorbate initially stands perpendicular and outward from the active site.")
    add_table(doc, ["Control", "Default", "Meaning"], [
        ("Site-to-anchor distance", "1.80 Å", "Distance from active-site atom centre to the template binding atom"),
        ("Clearance bubble radius", "1.20 Å", "Visual region used to warn about nearby catalyst atoms"),
        ("Azimuth", "0°", "Rotation of the outward direction around the view/reference axis"),
        ("Elevation", "60°", "Up/down inclination of the outward direction"),
    ], [2500, 1300, 5320])
    add_p(doc, "With the view locked, drag the cyan anchor around the active site. The distance label updates. Enter numerical values when reproducible placement matters. Unlock view at any time to inspect another angle; lock again before dragging the anchor.")
    add_h2(doc, "Stage 3 — Generate and refine all intermediates")
    add_steps(doc, [
        "Choose Generate all. The button reports the number of states in the selected reaction, and the application creates an independent saved placement for every state.",
        "Use pathway buttons or the Preview dropdown to display one intermediate at a time. Earlier generated states remain stored; they are not deleted when the preview changes.",
        "Keep the view locked and drag the glowing intermediate/anchor to move only the selected state.",
        "Use Twist around normal to rotate the adsorbate about its outward adsorption axis.",
        "Use Tilt from normal only when you deliberately want to move the molecular axis away from perpendicular.",
        "Set the atom-collision warning distance (default 1.60 Å) and respond to warnings by moving or rotating the adsorbate.",
        "Choose Apply placement to all only when a common anchor direction, distance, twist, and tilt is scientifically sensible for all states.",
        "Hide clearance to inspect the final atom arrangement without the sphere; this does not change coordinates.",
    ])
    add_h3(doc, "What is saved independently")
    add_p(doc, "Each intermediate stores its own anchor distance, direction, twist, and tilt. This matters because nitrate, atomic N, hydroxylamine, and ammonia generally require different steric accommodations. A single placement copied to every state is convenient for a first scan, not necessarily chemically reasonable.")
    add_h2(doc, "Collision and periodic-image checks")
    add_bullets(doc, [
        "Inspect the binding atom–active site distance against chemically plausible values for that element pair.",
        "Check every adsorbate atom against nearby catalyst atoms, not only the binding atom.",
        "Rotate the cell and inspect periodic images; an adsorbate may collide with the next slab or framework image.",
        "The clearance sphere and 1.60 Å warning are geometric aids. Van der Waals radii, covalent radii, and acceptable distances depend on the elements and bonding environment.",
        "For a slab, confirm that the outward vector points into vacuum rather than through the slab.",
    ])
    add_h2(doc, "Download and calculation handoff")
    add_p(doc, "Download preview CIF exports the selected state. Download all ZIP exports numbered CIF files plus placement.json, which records the active-site index and saved placement parameters. Every exported CIF is a P1 starting geometry with coordinates wrapped into the unit cell.")
    add_callout(doc, "Before calculating", "Visualize each exported CIF in an independent structure program, check stoichiometry and periodic contacts, then relax it using a physically justified constraint strategy. Do not use unrelaxed generator coordinates for adsorption or reaction energies.", "risk")

    add_title(doc, "14. Custom Pathway Designer", "Creating portable user-defined intermediate libraries from molecular CIF files")
    add_p(doc, "Custom Pathway Builder is the user-defined counterpart to Intermediate Maker. Use it when the required reaction states are not present in the preset NRR, HER, or OER/ORR libraries. Each uploaded CIF should contain one intermediate molecule or fragment. The builder does not extract an adsorbate from a catalyst slab automatically.")
    add_h2(doc, "Create the pathway")
    add_steps(doc, [
        "Enter a clear pathway name, including the reaction or mechanistic branch when useful.",
        "Choose one or several molecule-only CIF files together, or drag multiple CIF files onto the upload area.",
        "For each queued CIF, inspect the molecule in the 3D viewer and click exactly one atom as its catalyst-binding atom.",
        "Give the intermediate a concise unique name, such as COOH*, CHO*, or HCOO*, and choose Add intermediate to pathway.",
        "Continue until the upload queue is empty. The next CIF opens automatically after the current binding atom is confirmed.",
        "Use the up and down controls to establish the intended reaction order; delete and re-upload an incorrect entry when necessary.",
    ])
    add_callout(doc, "Why files open one at a time", "Multiple CIFs can be uploaded or dropped together, but binding-atom selection cannot be safely inferred from the filename. The queue therefore pauses on every molecule so the user explicitly confirms how it attaches to the catalyst.", "note")
    add_h2(doc, "Binding atom and stored geometry")
    add_p(doc, "The selected binding atom becomes the coordinate origin of that intermediate. Every other atom is stored as a Cartesian offset from it. During catalyst placement, the binding atom is placed at the adsorption anchor and the remaining molecular geometry is carried with it. Confirm the highlighted atom carefully: selecting the wrong O, N, C, or S site changes the entire adsorption orientation.")
    add_bullets(doc, [
        "Use a molecule-only CIF with sensible intramolecular distances and no unintended periodic copy of the molecule.",
        "Choose the atom expected to form the direct surface bond, not merely the atom nearest the centre of the CIF box.",
        "For multidentate adsorption, the present workflow still requires one primary anchor. Treat secondary contacts as geometry to inspect and optimize.",
        "Intermediate names must be unique within one pathway.",
    ])
    add_h2(doc, "Save, export, and restore")
    add_p(doc, "The pathway under construction is temporary browser state. Export Pathway JSON is the durable save operation. The downloaded .pathway.json file records the pathway name, ordered intermediates, original CIF filenames, elements, relative Cartesian coordinates, and selected binding-atom indices. Import Pathway JSON restores that definition later.")
    add_callout(doc, "Save before leaving", "Export the pathway JSON before refreshing or closing the tab. The page displays this warning continuously and the browser may show an unsaved-work prompt, but browser recovery is not a substitute for a downloaded JSON file.", "warn")
    add_bullets(doc, [
        "JSON import validates the format version, pathway name, intermediate list, coordinates, elements, and binding indices.",
        "Malformed, empty, or incompatible files are rejected instead of being partially imported.",
        "Export a new JSON after changing names, ordering, geometry sources, or binding atoms.",
        "Keep the JSON with the source molecular CIFs and calculation notes so the pathway remains auditable.",
    ])
    add_h2(doc, "Place the custom pathway on a catalyst")
    add_steps(doc, [
        "Wait until the multi-CIF queue is complete, then choose Use with catalyst.",
        "Upload the catalyst CIF and click the active-site atom.",
        "Lock the view and set the site-to-anchor distance, outward direction, and clearance radius.",
        "Generate all intermediates. Preview each state independently and adjust twist, tilt, anchor direction, and collision threshold.",
        "Download the preview CIF or the complete ZIP. The ZIP includes numbered CIF files, the custom pathway JSON, and placement metadata.",
    ])
    add_p(doc, "Placement controls have the same interpretation as Intermediate Maker: the active-site-to-anchor vector is the outward adsorption direction, and the molecular adsorption axis is initially aligned along it. Collision and clearance messages are geometric warnings only.")
    add_callout(doc, "Scientific handoff", "A custom pathway records user-supplied molecular geometries and attachment choices; it does not validate a reaction mechanism. Cross-check intermediates, protonation, charge, spin, denticity, solvation, and surface coverage against literature and the intended computational model, then optimize every generated structure.", "risk")

    add_title(doc, "15. Bader Charge Studio", "From ACF.dat to an auditable spreadsheet and structure visualization", page_break=False)
    add_p(doc, "ACF.dat contains basin-integrated electron counts but does not identify elements. The page therefore requires the matching SCF input. Atom identities are read in order from ATOMIC_POSITIONS, regardless of whether coordinates are angstrom, crystal, bohr, or alat.")
    add_h2(doc, "Charge convention")
    add_code(doc, "Bader charge = atomic number − pseudopotential core electrons − integrated Bader electrons")
    add_p(doc, "With this convention, positive charge means electron loss and negative charge means electron gain. This signed ionic charge should not be confused with the raw CHARGE column in ACF.dat.")
    add_steps(doc, [
        "Upload ACF.dat.",
        "Upload the exact matching SCF input. Atom-count mismatch stops the workflow.",
        "For each detected element type, enter the number of frozen-core electrons in the pseudopotential. The value is propagated to all atoms of that type.",
        "Choose Excel only, or Visualize + Excel.",
        "For visualization, upload a CIF with the same atom count and element order as the SCF input.",
        "Choose the representation, label mode, text size, image dimensions, and DPI; then download XLSX and optionally PNG.",
    ])
    add_h2(doc, "Choosing core-electron counts")
    add_p(doc, "Read the UPF header or pseudopotential documentation. The core count is not guessed from the element alone because semicore states may be included in the valence. If Z is the atomic number and Zval is the pseudopotential valence charge, the frozen-core count is commonly Z − Zval; verify this for the exact file.")
    add_h2(doc, "Visualization modes")
    add_bullets(doc, [
        "Element colours + charge rings preserves conventional atom colours and uses red rings for loss and green rings for gain.",
        "Ring appearance may be sharp or faded; fade strength controls the softness of the glow.",
        "Colour atoms by charge replaces element colours with the charge sign colours.",
        "Labels can show atom number and element, signed charge, both, or none; text size ranges from 50% to 200%.",
        "The PNG captures the current view and legend at the requested width, height, and 72–600 DPI, subject to a 10,000-pixel limit.",
    ])
    add_h2(doc, "Excel output")
    add_p(doc, "The Results sheet retains the ACF columns, adds ATOM TYPE, and adds formula-derived BADER CHARGE. A Metadata sheet stores atomic numbers, core-electron inputs, the equation, and ACF footer totals. This structure makes the result easier to audit than a pasted list of final charges.")
    add_callout(doc, "Ordering requirement", "ACF row 1, SCF ATOMIC_POSITIONS row 1, and CIF atom 1 must describe the same atom. Matching atom counts are necessary but not sufficient; the element sequence is also checked for visualization.", "risk")

    add_title(doc, "16. QE & VASP PDOS Analyzer and PKDOS CLI", "Processing Quantum ESPRESSO and VASP projected densities of states")
    add_p(doc, "QE & VASP PDOS Analyzer reads orbital-resolved density-of-states data, sums selected contributions, shifts the energy reference, previews the result, and exports a standardized CSV for the DOS Plotter and Orbital Metrics Calculator. All parsing and summation occur in the browser.")
    add_h2(doc, "Quantum ESPRESSO workflow")
    add_steps(doc, [
        "Run a converged SCF calculation and the required NSCF calculation with a suitable k-point grid and sufficient bands.",
        "Run projwfc.x and collect its per-atom, per-wavefunction PDOS files.",
        "Open PDOS Analysis and upload all compatible QE PDOS files required for the intended sum.",
        "Select all atoms, one or more detected species, explicit atom numbers such as 1,4,7-12, or individual detected atoms.",
        "Select the s, p, d, or f orbital channels to include, enter the Fermi/reference energy, and generate the PDOS.",
        "Review spin convention, curve colours, numerical preview, and energy range; then download CSV or PNG.",
    ])
    add_p(doc, "QE atom numbers and species are obtained from the projwfc.x filenames. Files must share a compatible energy grid before they can be summed. Non-spin and spin-polarized datasets are both supported; spin-down can be drawn below zero for the conventional mirrored presentation.")
    add_h2(doc, "VASP DOSCAR workflow")
    add_steps(doc, [
        "Upload DOSCAR. The parser reads the Fermi energy and projected blocks and detects spin-polarized or non-spin-polarized layout.",
        "Optionally enter a material name. It is used in recognizable CSV and PNG filenames.",
        "Upload the matching POSCAR or CONTCAR when species-based selection is needed. The structure file maps ordered ion numbers to chemical species.",
        "Choose all ions, a species, manually typed ion numbers, or detected ions; select orbital contributions and generate the result.",
        "Confirm that the displayed energy is E − E_F. DOSCAR energies are not assumed to be pre-shifted; the detected Fermi energy is subtracted.",
    ])
    add_callout(doc, "VASP ordering", "Species selection is reliable only when DOSCAR and POSCAR/CONTCAR describe the same calculation and ion order. An atom-count mismatch or stale structure file invalidates the mapping.", "risk")
    add_h2(doc, "Fermi-level shift")
    add_code(doc, "plotted energy = raw energy − entered Fermi/reference energy")
    add_p(doc, "After the shift, zero eV represents the chosen reference. For VASP, DOSCAR supplies E_F automatically. For QE projwfc.x files, enter the reference appropriate to the parent calculation. Record the reference used whenever spectra from different calculations are compared.")
    add_h2(doc, "Curves, colours, and exports")
    add_bullets(doc, [
        "Click or use the legend controls to show or hide channels and assign individual line colours.",
        "Palette templates include scientific, colourblind-friendly, high-contrast, warm/cool, and monochrome sets.",
        "Mouse-wheel zoom and pointer dragging change the visible energy window; Reset view restores the full range.",
        "CSV filenames include source, material when supplied, atom/species selection, and orbital selection so multiple exports remain distinguishable.",
        "Use the CSV—not a screenshot—as the handoff to DOS Plotter or Orbital Metrics Calculator.",
    ])
    add_h2(doc, "PKDOS command-line companion — QE only")
    add_p(doc, "PKDOS is a downloadable Python 3.10+ command-line package for researchers working locally or on an HPC login node. It supports Quantum ESPRESSO projwfc.x PDOS files only; VASP DOSCAR/POSCAR support remains in the browser module.")
    add_code(doc, "python -m pip install .\npkdos summary\npkdos sum")
    add_bullets(doc, [
        "pkdos summary scans the working directory and writes pkdos_summary.txt with detected atoms, species, and orbitals.",
        "pkdos sum opens the interactive summation workflow for s, p, d, and f contributions.",
        "Selections may cover all files, chosen atoms, or chosen species, with a user-entered Fermi shift.",
        "The CLI validates energy-grid compatibility and writes processed CSV tables such as tot_dos_s.csv.",
    ])

    add_title(doc, "17. DOS Plotter", "Reusable styling for one or many processed PDOS CSV files")
    add_p(doc, "DOS Plotter consumes standardized CSV files exported by the PDOS Analyzer or compatible tables containing one energy column and at least one DOS channel. It separates data preparation from figure preparation: the PDOS Analyzer creates scientifically selected curves; DOS Plotter controls presentation and reusable styles.")
    add_h2(doc, "Load and organize datasets")
    add_steps(doc, [
        "Upload or drag one or multiple CSV files. Every file becomes an independent dataset.",
        "Select the active dataset for editing and tick the datasets that should participate in overlay or multipanel output.",
        "Choose Individual, Overlay selected, or Multipanel layout from the toolbar.",
        "In Curves & legend text, show or hide each channel, change its colour and line style, and type the exact text that should appear in the legend.",
    ])
    add_h2(doc, "Typography and core figure style")
    add_table(doc, ["Control", "Purpose", "Publication advice"], [
        ("Figure title", "Editable dataset/plot title", "Use a concise title or omit it when the journal caption carries the description"),
        ("Font family, weight, style", "Global typeface treatment", "Match the target journal or manuscript style"),
        ("Figure title size", "Top title only", "Keep subordinate to the scientific content"),
        ("Axis title size", "X and Y axis labels", "Use consistent sizing across a figure set"),
        ("Axis value size", "Numerical tick labels", "Ensure readability at final printed dimensions"),
        ("Legend text size", "Curve labels", "Reduce only enough to avoid crowding"),
        ("Line width and style", "Curve visibility and distinction", "Use solid/dashed/dotted differences in addition to colour when useful"),
        ("Background and grid", "Canvas and major grid", "White or transparent is usually appropriate for manuscripts"),
    ], [1900, 3000, 4460])
    add_h2(doc, "Axes, ticks, and numerical formatting")
    add_p(doc, "X and Y limits may be entered explicitly or returned to automatic ranges. Axis labels are editable. X and Y tick systems are independent so a dense energy axis does not force the same density on the DOS axis.")
    add_table(doc, ["Independent X/Y control", "Meaning"], [
        ("Major intervals", "Number of equal labelled intervals across that axis"),
        ("Minor ticks per interval", "Unlabelled subdivisions between adjacent major values"),
        ("Value decimals", "Fixed decimal places shown on that axis, independently from the other axis"),
        ("Major/minor visibility", "Show or hide each tick class separately"),
        ("Direction", "Outward, inward, or centred in–out ticks"),
        ("Major/minor length", "Independent mark lengths for hierarchy"),
        ("Line width", "Tick stroke thickness for that axis"),
    ], [3150, 6210])
    add_callout(doc, "Decimal precision", "Displayed decimals control label formatting, not the precision of the uploaded data. Avoid more decimal places than the calculation and sampling justify.", "warn")
    add_h2(doc, "Legend editing and positioning")
    add_p(doc, "Legend text is edited curve by curve in the Data tab. The Style tab controls top-right, top-left, bottom-right, bottom-left, outside-right, or custom placement. Custom X and Y positions are percentages of the plot area. Check that the legend does not cover a chemically important feature.")
    add_h2(doc, "Templates across figures")
    add_p(doc, "A DOS template means the complete visual specification created on one figure can be reused on another. Save the current style with a clear name, then Apply current or Apply all. Templates preserve axis ranges, independent X/Y ticks and decimal choices, typography sizes, font family/style/weight, palette, line treatment, background, grid, spin convention, legend position, physical dimensions, and export resolution.")
    add_bullets(doc, [
        "Apply current changes only the active dataset.",
        "Apply all applies the template to every loaded dataset, enabling consistent figure series.",
        "Export template JSON creates a portable style file; Import template restores it later.",
        "Template styling cannot make different calculations scientifically comparable. Confirm identical energy reference, units, orbital definitions, normalization, and selection logic first.",
    ])
    add_h2(doc, "Export")
    add_p(doc, "Set width and height in inches and choose DPI for PNG. SVG is a true scalable vector output. Export selected plots ZIP creates batch PNG figures and includes the style template. Always inspect exported files at their intended physical size before submission.")

    add_h2(doc, "Optional area filling")
    add_p(doc, "Each curve can optionally be filled vertically to y=0. By default the fill uses the line colour at 70% transparency, but both fill colour and opacity are editable. Leave the fill-range control disabled to cover the complete available energy range (−∞ to +∞ in the interface); enable it to enter explicit lower and upper X limits. The tool clips the fill at the requested bounds and interpolates boundary points where needed.")

    add_title(doc, "18. Orbital Metrics Calculator", "Occupancy, DOS-centre, and user-defined metrics from PDOS CSV files", page_break=False)
    add_p(doc, "Orbital Metrics Calculator accepts one or many standardized CSV files exported by QE & VASP PDOS Analyzer. Every file is treated as a separate sheet/dataset, while the final summary contains one row per file. This is useful for comparing the same orbital quantity across catalysts, adsorption states, spin channels, or structures.")
    add_h2(doc, "Load and inspect columns")
    add_steps(doc, [
        "Upload or drag one or multiple PDOS CSV files. Use the active-sheet selector and compact file manager to move through large collections.",
        "Inspect the lettered columns. Column A is energy; B, C, and later letters are named DOS channels from that specific CSV.",
        "Review the automatically suggested occupancy and DOS-centre metrics. Suggestions follow the actual orbital names in the active sheet, so a p-orbital file and a d-orbital file receive different defaults.",
        "Remove unneeded metrics, add new occupancy or centre calculations, and give every metric a unique descriptive name.",
        "Choose the source by its orbital name and optionally enable a finite energy interval. With the interval disabled, the full uploaded range is used.",
        "Press Calculate, inspect missing-value warnings, then download the combined CSV or Excel workbook.",
    ])
    add_h2(doc, "Definitions used by the calculator")
    add_code(doc, "Occupancy-like integral:  N = ∫ DOS(E) dE\nDOS centre:            E_c = [∫ E·DOS(E) dE] / [∫ DOS(E) dE]")
    add_p(doc, "The integrals are evaluated numerically with the trapezoidal rule over the selected energy interval. The occupancy result is an integrated spectral weight; whether it represents a literal electron count depends on normalization, spin convention, orbital projection, energy window, and the source calculation. The DOS centre is undefined when the integrated weight is zero.")
    add_h2(doc, "Formula columns")
    add_p(doc, "Create a derived column by naming it and entering an expression using column letters, numeric constants, parentheses, and +, −, ×, or ÷. For example, B + C + D can form a combined t2g-like channel when those letters truly correspond to the intended orbitals in the active file. Division by zero or unavailable input values produces an empty result rather than an invented number.")
    add_h2(doc, "Templates and unlike datasets")
    add_p(doc, "Templates store metric definitions and formula columns by semantic column name, not merely by spreadsheet position. When a p-orbital template is applied to a d-orbital sheet, the calculator does not silently replace pxy with whichever d orbital happens to occupy the same letter. If the named source column is absent, the interface warns that the source is missing and the output remains blank/None until the user explicitly selects another source.")
    add_bullets(doc, [
        "Apply Current modifies only the active dataset; Apply All attempts the same semantic definitions across every uploaded dataset.",
        "Export template JSON to preserve a reusable setup outside browser storage; Import JSON restores it later.",
        "Use clear custom metric names because they become output-column headings in CSV and Excel.",
        "The Excel Definitions sheet records metric type, source column, range, and derived formulas for auditability.",
    ])
    add_callout(doc, "Comparability", "Do not compare occupancies or centres across files until the energy references, units, spin convention, normalization, projection method, and selected orbital definitions are compatible.", "warn")

    add_title(doc, "19. ZPE & TS Calculator", "Transparent harmonic vibrational thermochemistry from frequencies in THz")
    add_p(doc, "ZPE & TS Calculator converts one or more ordinary vibrational frequencies into zero-point energy, vibrational entropy, the energy term T S_vib, and a harmonic vibrational Helmholtz free-energy correction. It uses exact SI constants and derives k_B T from the selected temperature so joule and electron-volt calculations cannot silently use different temperatures.")
    add_callout(doc, "Meaning of TS", "The reported TS is T multiplied by vibrational entropy only. It is not the complete entropy term of a molecule, solid, surface, adsorbate, or reaction.", "warn")
    add_h2(doc, "Input and calculation workflow")
    add_steps(doc, [
        "Open ZPE & TS Calculator under Materials Analysis & Design.",
        "Paste or type ordinary frequencies f in THz. Separate values with spaces, commas, semicolons, or new lines. Do not enter angular frequencies.",
        "Enter the temperature in kelvin. The default is 298.15 K; shortcut buttons provide 273.15, 298.15, and 300 K.",
        "Choose Calculate ZPE & vibrational TS.",
        "Inspect the accepted-mode count and any excluded zero, negative, imaginary, or non-numeric inputs.",
        "Review the summary cards and scroll through the per-mode table before downloading CSV or Excel.",
    ])
    add_h2(doc, "Per-mode quantities")
    add_table(doc, ["Displayed quantity", "Definition", "Interpretation"], [
        ("f (THz)", "User input", "Ordinary frequency in 10^12 cycles per second"),
        ("wavenumber (cm^-1)", "nu / c", "Spectroscopic representation of the same frequency"),
        ("h nu (eV)", "h multiplied by nu", "Energy spacing between adjacent harmonic levels"),
        ("x", "h nu / (k_B T)", "Dimensionless vibrational energy relative to thermal energy"),
        ("ZPE", "one-half h nu", "Zero-point contribution of that mode"),
        ("U_thermal", "h nu / [exp(x) - 1]", "Thermal vibrational energy above the zero-point level"),
        ("S_vib", "Harmonic-oscillator entropy", "Per-mode contribution in J mol^-1 K^-1"),
        ("T S_vib", "Temperature multiplied by S_vib", "Entropy contribution expressed as an energy"),
        ("F_vib correction", "ZPE + U_thermal - T S_vib", "Harmonic vibrational Helmholtz correction"),
    ], [2100, 3000, 4020])
    add_h2(doc, "Equations")
    add_code(doc, "nu = f_THz x 10^12 Hz\nepsilon = h nu\nx = h nu / (k_B T)\nZPE = (1/2) sum_i h nu_i")
    add_p(doc, "The zero-point energy is present even at 0 K in the quantum harmonic model. It is summed only over accepted positive modes.")
    add_code(doc, "nbar_i = 1 / [exp(x_i) - 1]\nU_vib,thermal = sum_i h nu_i / [exp(x_i) - 1]")
    add_p(doc, "nbar is the mean thermal occupation. U_vib,thermal excludes ZPE, so the two terms can be displayed and combined without double counting.")
    add_code(doc, "S_vib = k_B sum_i { x_i/[exp(x_i)-1] - ln[1-exp(-x_i)] }\nT S_vib = T x S_vib\nF_vib,corr = ZPE + U_vib,thermal - T S_vib")
    add_p(doc, "The entropy expression is the canonical quantum harmonic-oscillator result. The calculator evaluates it with numerically stable exponential and logarithmic functions, including the large-x limit where high-frequency thermal contributions approach zero.")
    add_h2(doc, "Summary values and units")
    add_table(doc, ["Result", "Reported units", "Use"], [
        ("Total ZPE", "eV and kJ mol^-1", "Zero-point correction for the supplied modes"),
        ("S_vib", "eV K^-1 and J mol^-1 K^-1", "Vibrational entropy at the selected temperature"),
        ("T S_vib", "eV and kJ mol^-1", "Energy-form vibrational entropy contribution"),
        ("Thermal vibrational energy", "eV", "Excitation energy above the zero-point level"),
        ("F_vib correction", "eV and kJ mol^-1", "ZPE + U_thermal - T S_vib"),
    ], [2300, 2300, 4520])
    add_h2(doc, "Exact constants")
    add_table(doc, ["Constant", "Value", "Unit"], [
        ("Planck constant, h", "6.62607015 x 10^-34", "J s"),
        ("Boltzmann constant, k_B", "1.380649 x 10^-23", "J K^-1"),
        ("Electron-volt conversion", "1.602176634 x 10^-19", "J eV^-1"),
        ("Avogadro constant, N_A", "6.02214076 x 10^23", "mol^-1"),
    ], [2700, 3900, 2520])
    add_h2(doc, "Excluded and special modes")
    add_bullets(doc, [
        "Non-numeric tokens are rejected and listed rather than interpreted as zero.",
        "Exactly zero frequencies are excluded because the harmonic entropy expression diverges at zero.",
        "Negative frequencies are treated as imaginary modes and excluded from every total.",
        "A genuine minimum should normally have no imaginary frequency; a transition state normally has one reaction-coordinate imaginary mode, which must not be included as an ordinary stable vibration.",
        "Very low positive frequencies may represent hindered rotation, translation, soft lattice motion, or adsorbate motion. Their harmonic entropy can be unrealistically large.",
    ])
    add_h2(doc, "Choosing the correct mode set")
    add_p(doc, "The calculator cannot determine whether the supplied frequencies form a complete or physically appropriate mode set. A nonlinear isolated molecule generally has 3N-6 vibrations and a linear molecule 3N-5. A periodic solid may require a phonon-density-of-states or Brillouin-zone treatment rather than a short Gamma-point list. Adsorbate studies sometimes use only selected adsorbate modes; that approximation must be reported explicitly and applied consistently to every compared state.")
    add_callout(doc, "Low-frequency warning", "For soft modes, consider a quasi-harmonic, hindered-rotor, or anharmonic treatment when required by the system and target accuracy. The web calculator intentionally reports the unmodified harmonic result and does not hide this modelling choice.", "risk")
    add_h2(doc, "Downloads")
    add_p(doc, "Download CSV writes the per-mode values, temperature, total quantities, and excluded inputs in a machine-readable table. Download Excel creates a Summary & formulas sheet and a Per-mode calculations sheet. Use the temperature-bearing filename to distinguish calculations performed under different conditions.")
    add_h2(doc, "Worked example from the supplied sheet")
    add_p(doc, "For 1.5216, 1.9174, 24.8485, 36.1835, 43.8909, 110.7545, and 110.905 THz at 298.15 K, the exact-constant implementation returns the following values:")
    add_table(doc, ["Quantity", "Calculated value"], [
        ("ZPE", "0.682429422 eV"),
        ("S_vib", "39.1534437 J mol^-1 K^-1"),
        ("T S_vib", "0.120988330 eV"),
        ("F_vib correction", "0.608563343 eV"),
    ], [3900, 5220])
    add_p(doc, "These values differ slightly from the original spreadsheet because that sheet mixed rounded k_B T values corresponding to different temperatures. The website derives all temperature-dependent terms from one user-selected T.")

    add_title(doc, "20. Free Energy Diagram Studio", "Constructing and exporting reaction-coordinate diagrams")
    add_h2(doc, "Data format")
    add_p(doc, "Upload one or several CSV files, or paste/edit data in the Data tab. The essential columns are branch index, sub-branch name, and free-energy value. Comment lines beginning with # are ignored.")
    add_code(doc, "branch_index,sub_branch_name,free_energy_value\n1,Path_A,0.00\n2,Path_A,-0.42\n3,Path_A,0.18")
    add_h2(doc, "Interactive editing")
    add_bullets(doc, [
        "Single-click a line or element to change its colour and local style.",
        "Double-click a state bar to edit its individual appearance.",
        "Drag from one state bar to another to create a custom connection.",
        "Right-click a custom connection when you need to delete it.",
        "Add draggable text labels for annotations and explanatory notes.",
        "Use style templates to apply selected categories across chosen plot tabs.",
    ])
    add_h2(doc, "Style and export")
    add_p(doc, "The plotter controls axes, limits, ticks, decimals, line types, point shapes, branch-specific styles, typography, legend position, annotations, and canvas appearance. Export dimensions can be specified in inches or pixels at 72, 150, 300, 600, or custom DPI.")
    add_bullets(doc, [
        "Export Current View creates a PNG for the active plot.",
        "Bulk Export packages branch views in a ZIP.",
        "When several CSV tabs are open, Export All creates a ZIP containing all plots.",
        "For a journal figure, choose final physical dimensions first, then 300–600 DPI; avoid enlarging a low-resolution image later.",
    ])
    add_callout(doc, "Thermodynamic consistency", "State clearly whether values are electronic energies, zero-point-corrected energies, enthalpies, or Gibbs free energies; specify temperature, pressure, solvation, potential, pH, and reference conventions where applicable.", "warn")

    add_title(doc, "21. End-to-end computational workflows")
    add_h2(doc, "A surface reaction study")
    add_steps(doc, [
        "Prepare and validate the clean catalyst CIF in the CIF Editor.",
        "Generate a relaxation workflow and converge the slab/model settings.",
        "Use Intermediate Maker to create each adsorbate starting structure at the selected active site.",
        "Inspect every exported structure and relax it with consistent settings.",
        "Run tighter SCF calculations on the relaxed structures for comparable energies and densities.",
        "Generate DOS, bands, charge density, vibrational, or Bader inputs as required by the scientific question.",
        "Use positive vibrational frequencies in ZPE & TS Calculator when harmonic vibrational corrections are part of the chosen thermodynamic model.",
        "Use Bader Analysis for an auditable charge table and visualization after external Bader partitioning.",
        "Assemble consistently corrected energies in Free Energy Plotter and export a publication figure.",
    ])
    add_h2(doc, "A high-throughput substitution study")
    add_steps(doc, [
        "Select chemically meaningful substitution sites in Visual CIF Generator.",
        "Generate the combinatorial CIF set and remove duplicates using symmetry-aware analysis.",
        "Apply a consistent staged relaxation and convergence protocol.",
        "Use Output Processor to recover final structures and repair follow-up inputs.",
        "Compare properties only after checking identical numerical settings and equivalent physical models.",
    ])

    add_title(doc, "22. Validation checklist")
    add_h2(doc, "Before submitting a QE job")
    add_bullets(doc, [
        "Cell, vacuum, dimensionality, atom order, stoichiometry, total charge, and spin state are correct.",
        "Pseudopotential files exist and are consistent with the exchange-correlation functional.",
        "ecutwfc, ecutrho, k-points, smearing, nbnd, and convergence thresholds have been tested.",
        "prefix and outdir match across coordinated stages.",
        "Constraints, occupations, dispersion, magnetization, and symmetry treatment are intentional.",
        "The submit script contains the correct executable paths, modules, scheduler directives, and MPI launcher.",
    ])
    add_h2(doc, "Before publishing a structure or figure")
    add_bullets(doc, [
        "The final structure—not the initial generated geometry—is used.",
        "Relaxation and SCF outputs are converged without hidden errors.",
        "Band paths and reciprocal coordinates match the exact primitive-cell convention.",
        "Bader atom ordering and core-electron counts are documented.",
        "Free-energy reference states and corrections are explicitly stated.",
        "Axes, units, sign conventions, legends, labels, and image resolution are unambiguous.",
    ])
    add_h2(doc, "Before using ZPE or vibrational entropy")
    add_bullets(doc, [
        "The frequency unit is THz and values are ordinary frequencies, not angular frequencies.",
        "The temperature is recorded and identical across every compared state.",
        "Imaginary and zero modes have been identified and treated according to the physical stationary point.",
        "The supplied mode set is complete for the declared approximation and consistently selected across reactants, products, and transition states.",
        "Low-frequency, anharmonic, hindered-rotor, adsorbate, and phonon-dispersion limitations have been assessed.",
        "ZPE, U_thermal, and T S_vib are combined without double counting, and the reported correction convention is stated.",
    ])

    add_title(doc, "23. Troubleshooting")
    add_table(doc, ["Symptom", "Likely cause", "Practical response"], [
        ("3D canvas is blank or slow", "WebGL/hardware acceleration disabled; model too large", "Enable acceleration, reload, hide bonds/labels, reduce other GPU load"),
        ("Unexpected bonds", "Automatic radius threshold or periodic image", "Lower threshold or add an explicit pair rule; verify the cell"),
        ("Generated QE stage cannot find data", "prefix/outdir mismatch or earlier stage failed", "Compare all workflow files and inspect preceding output"),
        ("DOS is truncated", "Too few bands or narrow energy range", "Increase nbnd and adjust Emin/Emax after convergence"),
        ("Band path looks wrong", "Cell convention does not match preset", "Regenerate a path for the exact primitive cell and verify coordinates"),
        ("Intermediate overlaps catalyst", "Anchor direction/radius unsuitable", "Lock view, drag placement, change twist/tilt, inspect periodic images"),
        ("Custom catalyst uploader appears unavailable", "Intermediate queue is unfinished", "Finish binding-atom selection for every queued CIF, then choose Use with catalyst"),
        ("Custom pathway disappears after refresh", "Pathway JSON was not exported", "Import the last .pathway.json backup; export again after edits"),
        ("Bader atom-count mismatch", "ACF and SCF/CIF come from different structures", "Use files from the same calculation and preserve ordering"),
        ("Bader charges seem shifted", "Incorrect frozen-core electron count", "Read the exact UPF valence configuration and recalculate"),
        ("ZPE/TS calculator excludes a mode", "Zero, negative, imaginary, or non-numeric input", "Inspect the excluded-input list and verify the frequency calculation"),
        ("TS is unexpectedly large", "Very low positive harmonic frequencies", "Check units and soft modes; consider an appropriate quasi-harmonic or hindered-motion treatment"),
        ("ZPE differs from an older sheet", "Rounded constants or inconsistent temperature", "Use exact constants and one recorded temperature for every term"),
        ("Theme/viewer appears stale", "Cached assets", "Hard refresh the browser and reopen the module"),
        ("Download blocked", "Browser download permission", "Allow downloads for the local/site address and retry"),
    ], [2450, 2930, 3740])

    add_title(doc, "24. Installation and local operation")
    add_p(doc, "For users running the project locally, install Node.js 18 or newer, open a terminal in the project directory, and run:")
    add_code(doc, "npm install\nnpm run dev")
    add_p(doc, "Open the local URL printed by Vite, usually http://localhost:5173. For a production bundle:")
    add_code(doc, "npm run build\nnpm run preview")
    add_p(doc, "The production files are written to dist/. Because the application is browser-only, it can be hosted as a static website when the host is configured to serve the generated assets correctly.")

    add_title(doc, "25. Glossary")
    add_table(doc, ["Term", "Meaning in this manual"], [
        ("CIF", "Crystallographic Information File describing cell and atomic sites"),
        ("SCF", "Self-consistent-field electronic-structure calculation"),
        ("NSCF", "Non-self-consistent calculation using an existing density"),
        ("DFPT", "Density-functional perturbation theory"),
        ("UPF", "Quantum ESPRESSO pseudopotential file format"),
        ("ibrav", "QE integer identifying a Bravais-lattice convention"),
        ("Smearing", "Fractional-occupation broadening used especially for metals"),
        ("Bader basin", "Real-space region bounded by zero-flux surfaces in the density gradient"),
        ("Anchor", "Intermediate Maker position assigned to the adsorbate binding atom"),
        ("Binding atom", "Custom-intermediate atom placed directly at the catalyst adsorption anchor"),
        ("Pathway JSON", "Portable versioned file storing a reusable custom pathway definition"),
        ("Outward normal", "Vector from active-site atom to anchor used to orient the adsorbate"),
        ("Clearance", "Geometric warning region; not a complete chemical validity test"),
        ("ZPE", "One-half h nu summed over accepted positive harmonic vibrational modes"),
        ("S_vib", "Vibrational entropy calculated from the quantum harmonic-oscillator model"),
        ("T S_vib", "Temperature multiplied by vibrational entropy; not the total entropy contribution"),
        ("Imaginary mode", "Negative Hessian eigenvalue reported as a negative frequency; characteristic of an unstable direction"),
        ("F_vib correction", "ZPE plus thermal vibrational energy minus T S_vib"),
        ("DPI", "Pixels per inch used when raster images are exported"),
    ], [1900, 7220])

    add_title(doc, "Closing guidance")
    add_p(doc, "Padarthkhoj Tools is most valuable when it makes a careful workflow easier to reproduce. Use its automation to remove clerical mistakes, not scientific scrutiny. Keep generated inputs, output logs, pseudopotential identities, convergence tests, structural decisions, and post-processing conventions together as one traceable calculation record.")
    add_callout(doc, "Good practice", "If another researcher cannot reconstruct why a parameter, pathway, charge convention, or geometry was chosen, the workflow is not yet fully documented.", "good")

    reorder_chapters_to_match_website(doc)
    doc.save(OUT)
    print(OUT)


if __name__ == "__main__":
    build()
