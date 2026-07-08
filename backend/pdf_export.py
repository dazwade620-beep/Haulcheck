"""PDF export: compliance summary reports + merging uploaded files into one pack."""
import io
from datetime import datetime, timezone

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image as RLImage,
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


def _logo_flowable(logo_bytes, max_w_mm=48, max_h_mm=24):
    try:
        im = Image.open(io.BytesIO(logo_bytes))
        iw, ih = im.size
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGBA")
        lb = io.BytesIO()
        im.save(lb, format="PNG")
        lb.seek(0)
        ratio = min((max_w_mm * mm) / iw, (max_h_mm * mm) / ih)
        logo = RLImage(lb, width=iw * ratio, height=ih * ratio)
        logo.hAlign = "LEFT"
        return logo
    except Exception:
        return None


def build_report_pdf(title, subtitle, meta_pairs, sections, logo_bytes=None, authority=None):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=18 * mm, bottomMargin=16 * mm,
                            leftMargin=16 * mm, rightMargin=16 * mm, title=title)
    ss = _styles()
    story = []
    if logo_bytes:
        lf = _logo_flowable(logo_bytes)
        if lf:
            story.append(lf)
            story.append(Spacer(1, 8))
    brand = "HAULCHECK · COMPLIANCE" + (f" · {authority}" if authority else "")
    story.append(Paragraph(brand, ss["Brand"]))
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


def build_letter_pdf(company, recipient_name, recipient_address, subject, body, date_str, doc_type, signoff_name="", signoff_role="", logo_bytes=None):
    """Formal company letter. company: dict from operator details. body: plain text, \n\n = paragraphs."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=18 * mm,
                            leftMargin=22 * mm, rightMargin=22 * mm, title=subject or doc_type)
    ss = _styles()
    if "Letter" not in ss:
        ss.add(ParagraphStyle("Letter", fontName="Helvetica", fontSize=10.5, textColor=DARK, leading=15, spaceAfter=10))
        ss.add(ParagraphStyle("LetterHead", fontName="Helvetica-Bold", fontSize=15, textColor=DARK, leading=18, spaceAfter=1))
        ss.add(ParagraphStyle("LetterMeta", fontName="Helvetica", fontSize=9, textColor=SLATE, leading=12))
        ss.add(ParagraphStyle("LetterSubject", fontName="Helvetica-Bold", fontSize=11, textColor=DARK, leading=14, spaceBefore=6, spaceAfter=10))
    story = []
    if logo_bytes:
        lf = _logo_flowable(logo_bytes)
        if lf:
            story.append(lf)
            story.append(Spacer(1, 8))
    cname = (company or {}).get("company_name") or "Company Name"
    story.append(Paragraph(cname, ss["LetterHead"]))
    head_bits = []
    if (company or {}).get("address"):
        head_bits.append(company["address"].replace("\n", ", "))
    if (company or {}).get("operator_licence_number"):
        head_bits.append(f"O-Licence {company['operator_licence_number']}")
    if (company or {}).get("company_number"):
        head_bits.append(f"Co. No. {company['company_number']}")
    if head_bits:
        story.append(Paragraph(" &nbsp;·&nbsp; ".join(head_bits), ss["LetterMeta"]))
    story.append(Spacer(1, 4))
    story.append(Table([[""]], colWidths=[166 * mm], style=TableStyle([("LINEBELOW", (0, 0), (-1, -1), 1, DARK)])))
    story.append(Spacer(1, 12))
    story.append(Paragraph(date_str, ss["LetterMeta"]))
    story.append(Spacer(1, 10))
    if recipient_name:
        story.append(Paragraph(f"<b>{recipient_name}</b>", ss["Letter"]))
    if recipient_address:
        for line in recipient_address.split("\n"):
            if line.strip():
                story.append(Paragraph(line.strip(), ss["LetterMeta"]))
    story.append(Spacer(1, 8))
    if subject:
        story.append(Paragraph(f"Re: {subject}", ss["LetterSubject"]))
    story.append(Paragraph(f"Dear {recipient_name or 'Sir/Madam'},", ss["Letter"]))
    for para in (body or "").split("\n\n"):
        p = para.strip().replace("\n", "<br/>")
        if p:
            story.append(Paragraph(p, ss["Letter"]))
    story.append(Spacer(1, 16))
    story.append(Paragraph("Yours sincerely,", ss["Letter"]))
    story.append(Spacer(1, 18))
    if signoff_name:
        story.append(Paragraph(f"<b>{signoff_name}</b>", ss["Letter"]))
    if signoff_role:
        story.append(Paragraph(signoff_role, ss["LetterMeta"]))
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
