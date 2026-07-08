"""PDF export: compliance summary reports + merging uploaded files into one pack."""
import io
from datetime import datetime, timezone

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)
from pypdf import PdfWriter, PdfReader
from PIL import Image

STATUS_COLORS = {
    "valid": colors.HexColor("#16a34a"),
    "due_soon": colors.HexColor("#d97706"),
    "expired": colors.HexColor("#dc2626"),
    "unknown": colors.HexColor("#94a3b8"),
}
STATUS_LABEL = {"valid": "Valid", "due_soon": "Due soon", "expired": "Expired", "unknown": "—"}

DARK = colors.HexColor("#0f172a")
SLATE = colors.HexColor("#475569")
LINE = colors.HexColor("#e2e8f0")


def _styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("Brand", fontName="Helvetica-Bold", fontSize=9, textColor=SLATE, spaceAfter=2, leading=11))
    ss.add(ParagraphStyle("BigTitle", fontName="Helvetica-Bold", fontSize=24, textColor=DARK, spaceAfter=4, leading=27))
    ss.add(ParagraphStyle("Sub", fontName="Helvetica", fontSize=10, textColor=SLATE, spaceAfter=2, leading=13))
    ss.add(ParagraphStyle("Heading", fontName="Helvetica-Bold", fontSize=13, textColor=DARK, spaceBefore=16, spaceAfter=8, leading=16))
    ss.add(ParagraphStyle("Cell", fontName="Helvetica", fontSize=8.5, textColor=DARK, leading=11))
    ss.add(ParagraphStyle("CellHead", fontName="Helvetica-Bold", fontSize=8, textColor=colors.white, leading=10))
    return ss


def build_report_pdf(title, subtitle, meta_pairs, sections):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=18 * mm, bottomMargin=16 * mm,
                            leftMargin=16 * mm, rightMargin=16 * mm, title=title)
    ss = _styles()
    story = []
    story.append(Paragraph("HAULCHECK · COMPLIANCE", ss["Brand"]))
    story.append(Paragraph(title, ss["BigTitle"]))
    if subtitle:
        story.append(Paragraph(subtitle, ss["Sub"]))
    gen = datetime.now(timezone.utc).strftime("%d %b %Y %H:%M UTC")
    story.append(Paragraph(f"Generated {gen}", ss["Sub"]))
    if meta_pairs:
        story.append(Spacer(1, 6))
        rows = [[Paragraph(f"<b>{k}</b>", ss["Cell"]), Paragraph(str(v or "—"), ss["Cell"])] for k, v in meta_pairs]
        t = Table(rows, colWidths=[45 * mm, 133 * mm])
        t.setStyle(TableStyle([
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(t)

    for sec in sections:
        story.append(Paragraph(sec["heading"], ss["Heading"]))
        if sec.get("type") == "kv":
            pairs = sec.get("pairs", [])
            if not pairs:
                story.append(Paragraph("No data recorded.", ss["Sub"]))
                continue
            rows = [[Paragraph(f"<b>{k}</b>", ss["Cell"]), Paragraph(str(v or "—"), ss["Cell"])] for k, v in pairs]
            t = Table(rows, colWidths=[50 * mm, 128 * mm])
            t.setStyle(TableStyle([
                ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            story.append(t)
            continue

        cols = sec["columns"]
        rows = sec.get("rows", [])
        if not rows:
            story.append(Paragraph("No records.", ss["Sub"]))
            continue
        head = [Paragraph(c, ss["CellHead"]) for c in cols]
        data = [head]
        status_styles = []
        for i, r in enumerate(rows, start=1):
            cells = [Paragraph(str(c if c not in (None, "") else "—"), ss["Cell"]) for c in r["cells"]]
            st = r.get("status")
            if st:
                cells.append(Paragraph(f'<font color="#{STATUS_COLORS.get(st, SLATE).hexval()[2:]}"><b>{STATUS_LABEL.get(st, st)}</b></font>', ss["Cell"]))
            data.append(cells)
        ncols = len(data[0])
        avail = 178 * mm
        col_widths = [avail / ncols] * ncols
        t = Table(data, colWidths=col_widths, repeatRows=1)
        style = [
            ("BACKGROUND", (0, 0), (-1, 0), DARK),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ]
        t.setStyle(TableStyle(style + status_styles))
        story.append(t)

    doc.build(story)
    return buf.getvalue()


def _divider_pdf(title):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=40 * mm, leftMargin=16 * mm, rightMargin=16 * mm)
    ss = _styles()
    doc.build([Paragraph("ATTACHED DOCUMENT", ss["Brand"]), Paragraph(title, ss["BigTitle"])])
    return buf.getvalue()


def _image_to_pdf(data):
    img = Image.open(io.BytesIO(data))
    if img.mode in ("RGBA", "P", "LA"):
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PDF")
    return buf.getvalue()


def merge_pack(summary_bytes, files):
    """files: list of (data_bytes, content_type, filename). Returns merged PDF bytes."""
    writer = PdfWriter()
    for page in PdfReader(io.BytesIO(summary_bytes)).pages:
        writer.add_page(page)
    for data, ctype, fname in files:
        pdf_bytes = None
        ct = (ctype or "").lower()
        try:
            if "pdf" in ct or (fname or "").lower().endswith(".pdf"):
                pdf_bytes = data
            elif ct.startswith("image/") or (fname or "").lower().rsplit(".", 1)[-1] in ("png", "jpg", "jpeg", "webp", "gif", "bmp"):
                pdf_bytes = _image_to_pdf(data)
            else:
                continue  # skip non-mergeable (txt, ddd, etc.)
            for page in PdfReader(io.BytesIO(_divider_pdf(fname or "Document"))).pages:
                writer.add_page(page)
            for page in PdfReader(io.BytesIO(pdf_bytes)).pages:
                writer.add_page(page)
        except Exception:
            continue
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
