from pathlib import Path
import re

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "SUPPLEMENTARY_NOTE_S1_BENCHMARKS.md"
OUTPUT = ROOT / "Padarthkhoj_Supplementary_Note_S1_Benchmarks.docx"

BLUE = "1F4E79"
DARK_BLUE = "17365D"
LIGHT_BLUE = "DCE6F1"
PALE_BLUE = "EEF4F8"
LIGHT_GRAY = "F2F4F7"
MID_GRAY = "65758B"
GRID = "AAB7C4"
INK = "17212B"
WHITE = "FFFFFF"


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=90, start=110, bottom=90, end=110):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_table_borders(table, color=GRID, size="4"):
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.find(qn("w:tblBorders"))
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = borders.find(qn(f"w:{edge}"))
        if tag is None:
            tag = OxmlElement(f"w:{edge}")
            borders.append(tag)
        tag.set(qn("w:val"), "single")
        tag.set(qn("w:sz"), size)
        tag.set(qn("w:color"), color)


def set_fixed_table_geometry(table, widths_dxa):
    table.autofit = False
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
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
        for cell, width in zip(row.cells, widths_dxa):
            tc_pr = cell._tc.get_or_add_tcPr()
            tc_w = tc_pr.find(qn("w:tcW"))
            if tc_w is None:
                tc_w = OxmlElement("w:tcW")
                tc_pr.append(tc_w)
            tc_w.set(qn("w:w"), str(width))
            tc_w.set(qn("w:type"), "dxa")
            cell.width = Inches(width / 1440)


def set_run_font(run, name="Aptos", size=None, bold=None, italic=None, color=None):
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


def add_inline_markdown(paragraph, text, size=10.5, color=INK):
    math_replacements = {
        r"\(\nu_i\)": "νᵢ",
        r"\(G_{\mathrm{vib}}=U_{\mathrm{vib}}-TS_{\mathrm{vib}}\)": "G_vib = U_vib − TS_vib",
        r"\(TS\)": "TS",
        r"\(D(E)\)": "D(E)",
        r"\([E_a,E_b]\)": "[Eₐ, Eᵦ]",
        r"\(10^{-12}\)": "10⁻¹²",
        r"\(10^{-11}\)": "10⁻¹¹",
        r"\(10^{-9}\)": "10⁻⁹",
        r"\(^{-1}\)": "⁻¹",
        r"\(1.332\times10^{-15}\)": "1.332 × 10⁻¹⁵",
        r"\(6.661\times10^{-16}\)": "6.661 × 10⁻¹⁶",
    }
    for source, target in math_replacements.items():
        text = text.replace(source, target)
    pattern = re.compile(r"(\*\*.*?\*\*|`.*?`|\*.*?\*)")
    pos = 0
    for match in pattern.finditer(text):
        if match.start() > pos:
            set_run_font(paragraph.add_run(text[pos:match.start()]), size=size, color=color)
        token = match.group(0)
        if token.startswith("**"):
            set_run_font(paragraph.add_run(token[2:-2]), size=size, bold=True, color=color)
        elif token.startswith("`"):
            set_run_font(paragraph.add_run(token[1:-1]), name="Courier New", size=max(8.5, size - 1), color=DARK_BLUE)
        else:
            set_run_font(paragraph.add_run(token[1:-1]), size=size, italic=True, color=color)
        pos = match.end()
    if pos < len(text):
        set_run_font(paragraph.add_run(text[pos:]), size=size, color=color)


def clean_markdown(text):
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"`(.*?)`", r"\1", text)
    text = re.sub(r"\*(.*?)\*", r"\1", text)
    return text.replace("\\( ", "").replace(" \\)", "")


def equation_text(lines):
    raw = " ".join(line.strip() for line in lines)
    if raw.startswith(r"E_{\mathrm{ZPE}}"):
        return "E_ZPE = ½ Σᵢ hνᵢ"
    if raw.startswith(r"U_{\mathrm{vib}}"):
        return "U_vib = Σᵢ hνᵢ [½ + 1/(exp(xᵢ) − 1)],    xᵢ = hνᵢ/(k_B T)"
    if raw.startswith(r"S_{\mathrm{vib}}"):
        return "S_vib = k_B Σᵢ [xᵢ/(exp(xᵢ) − 1) − ln(1 − exp(−xᵢ))]"
    if raw.startswith("N(E_a,E_b)"):
        return "N(Eₐ,Eᵦ) = ∫[Eₐ→Eᵦ] D(E) dE"
    if raw.startswith(r"\varepsilon_c"):
        return "ε_c(Eₐ,Eᵦ) = ∫[Eₐ→Eᵦ] E D(E) dE / ∫[Eₐ→Eᵦ] D(E) dE"
    return raw.replace("\\", "")


def add_equation(doc, text):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(5)
    p.paragraph_format.space_after = Pt(7)
    p.paragraph_format.keep_together = True
    set_run_font(p.add_run(text), name="Cambria Math", size=11.5, color=INK)


def widths_for(columns):
    presets = {
        2: [2600, 6760],
        3: [2000, 2100, 5260],
        4: [1900, 3100, 1500, 2860],
        5: [2100, 1900, 1200, 2700, 1460],
    }
    return presets.get(columns, [9360 // columns] * columns)


def add_table(doc, rows):
    table = doc.add_table(rows=len(rows), cols=len(rows[0]))
    table.style = "Table Grid"
    set_fixed_table_geometry(table, widths_for(len(rows[0])))
    set_table_borders(table)
    set_repeat_table_header(table.rows[0])
    for r_idx, row in enumerate(rows):
        for c_idx, value in enumerate(row):
            cell = table.cell(r_idx, c_idx)
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            set_cell_margins(cell)
            if r_idx == 0:
                set_cell_shading(cell, BLUE)
            elif r_idx % 2 == 0:
                set_cell_shading(cell, PALE_BLUE)
            p = cell.paragraphs[0]
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.05
            align_center = c_idx > 0 and len(value) < 22
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if align_center else WD_ALIGN_PARAGRAPH.LEFT
            add_inline_markdown(p, value, size=8.6 if len(rows[0]) >= 4 else 9.1, color=WHITE if r_idx == 0 else INK)
            if r_idx == 0:
                for run in p.runs:
                    run.bold = True
    doc.add_paragraph().paragraph_format.space_after = Pt(0)


def configure_styles(doc):
    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Aptos"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Aptos")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Aptos")
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = RGBColor.from_string(INK)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.17
    normal.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    for name, size, before, after, color in (
        ("Heading 1", 16, 16, 8, BLUE),
        ("Heading 2", 13, 13, 6, BLUE),
        ("Heading 3", 11, 9, 5, DARK_BLUE),
    ):
        style = styles[name]
        style.font.name = "Aptos Display"
        style._element.rPr.rFonts.set(qn("w:ascii"), "Aptos Display")
        style._element.rPr.rFonts.set(qn("w:hAnsi"), "Aptos Display")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor.from_string(color)
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True


def add_header_footer(section):
    header = section.header
    p = header.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    set_run_font(p.add_run("PADARTHKHOJ TOOLS  |  SUPPLEMENTARY INFORMATION"), size=8, bold=True, color=MID_GRAY)
    footer = section.footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("Supplementary Note S1  •  Benchmark datasets and validation")
    set_run_font(run, size=8, color=MID_GRAY)


def build():
    doc = Document()
    section = doc.sections[0]
    section.top_margin = Inches(0.8)
    section.bottom_margin = Inches(0.75)
    section.left_margin = Inches(0.9)
    section.right_margin = Inches(0.9)
    section.header_distance = Inches(0.35)
    section.footer_distance = Inches(0.35)
    configure_styles(doc)
    add_header_footer(section)

    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    title = lines[0][2:]
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after = Pt(5)
    set_run_font(p.add_run("SUPPLEMENTARY NOTE S1"), size=10, bold=True, color=BLUE)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(8)
    set_run_font(p.add_run(title.split(":", 1)[1].strip()), name="Aptos Display", size=23, bold=True, color=DARK_BLUE)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(14)
    set_run_font(p.add_run("Padarthkhoj Tools v1.0.0  |  Reproducible numerical, structural, and workflow validation"), size=10.5, italic=True, color=MID_GRAY)

    i = 1
    while i < len(lines):
        line = lines[i].rstrip()
        if not line:
            i += 1
            continue
        if line.startswith("## "):
            doc.add_heading(line[3:], level=1)
            i += 1
            continue
        if line.startswith("### "):
            doc.add_heading(line[4:], level=2)
            i += 1
            continue
        if line.startswith("| "):
            table_lines = []
            while i < len(lines) and lines[i].startswith("|"):
                table_lines.append(lines[i])
                i += 1
            data = []
            for idx, row in enumerate(table_lines):
                cells = [c.strip() for c in row.strip().strip("|").split("|")]
                if idx == 1 and all(re.fullmatch(r":?-+:?", c) for c in cells):
                    continue
                data.append(cells)
            add_table(doc, data)
            continue
        if line == "\\[":
            eq_lines = []
            i += 1
            while i < len(lines) and lines[i] != "\\]":
                eq_lines.append(lines[i])
                i += 1
            add_equation(doc, equation_text(eq_lines))
            i += 1
            continue
        if line.startswith("```"):
            i += 1
            code = []
            while i < len(lines) and not lines[i].startswith("```"):
                code.append(lines[i])
                i += 1
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.25)
            p.paragraph_format.right_indent = Inches(0.25)
            p.paragraph_format.space_before = Pt(3)
            p.paragraph_format.space_after = Pt(8)
            set_run_font(p.add_run("\n".join(code)), name="Courier New", size=9.5, color=DARK_BLUE)
            i += 1
            continue
        if line.startswith("- "):
            p = doc.add_paragraph(style="List Bullet")
            p.paragraph_format.left_indent = Inches(0.38)
            p.paragraph_format.first_line_indent = Inches(-0.18)
            p.paragraph_format.space_after = Pt(4)
            add_inline_markdown(p, line[2:])
            i += 1
            continue
        paragraph_lines = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#{2,3} |\| |\\\[|```|- )", lines[i]):
            paragraph_lines.append(lines[i].strip())
            i += 1
        p = doc.add_paragraph()
        add_inline_markdown(p, " ".join(paragraph_lines))

    props = doc.core_properties
    props.title = "Supplementary Note S1: Benchmark datasets, validation protocols, and acceptance criteria"
    props.subject = "Padarthkhoj Tools benchmark validation"
    props.author = "Sourav Ghosh"
    props.keywords = "Padarthkhoj, benchmark, Quantum ESPRESSO, VASP, validation, supplementary information"
    doc.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    build()
