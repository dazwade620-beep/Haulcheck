"""Single-entry (per-record) branded PDF formatters.

Each formatter takes a raw record dict + region and returns
(title, subtitle, meta_pairs, sections) ready for build_report_pdf.
This lets EVERY individual entry (a daily check, one defect, one service, etc.)
be printed as its own formal, audit-ready document.
"""
from reports import _terms


def _d(v):
    """Display value — never blank on a printed record."""
    if v is None or v == "":
        return "—"
    return str(v)


def _money(cur, v):
    try:
        if v in (None, "", 0, 0.0):
            return "—"
        return f"{cur}{float(v):,.2f}"
    except (ValueError, TypeError):
        return _d(v)


def _yn(v):
    return "Yes" if v else "No"


def _checklist_section(rec):
    items = rec.get("checklist") or []
    if not items:
        return None
    rows = []
    for c in items:
        name = c.get("item") or c.get("name") or "—"
        ok = c.get("ok", True)
        note = c.get("note") or c.get("notes") or ""
        rows.append({"cells": [name, "OK" if ok else "DEFECT", note or "—"]})
    return {"heading": f"Inspection checklist ({len(items)} items)",
            "columns": ["Item", "Condition", "Notes / defect"], "rows": rows}


# ---------- Per-kind formatters ----------
def walkaround(rec, region):
    result = "Defects found" if rec.get("result") == "defects_found" else "Nil defect — all OK"
    title = "Daily Walkaround Check"
    subtitle = f"{rec.get('vehicle_reg', '—')} · {rec.get('check_date') or (rec.get('created_at') or '')[:10]}"
    meta = [
        ("Vehicle", rec.get("vehicle_reg")),
        ("Driver", rec.get("driver_name")),
        ("Date", rec.get("check_date") or (rec.get("created_at") or "")[:10]),
        ("Result", result),
        ("Mileage / odometer", rec.get("mileage")),
    ]
    sections = [{"heading": "Check summary", "type": "kv", "pairs": [
        ("Result", result),
        ("Defects noted", rec.get("defects_noted") or "None"),
        ("Rectified", _yn(rec.get("rectified"))),
        ("Rectified date", rec.get("rectified_date")),
        ("Rectification notes", rec.get("rectified_notes")),
    ]}]
    cl = _checklist_section(rec)
    if cl:
        sections.append(cl)
    return title, subtitle, meta, sections


def defect(rec, region):
    title = "Defect Report"
    subtitle = f"{rec.get('vehicle_reg', '—')} · {rec.get('defect_date') or (rec.get('created_at') or '')[:10]}"
    meta = [
        ("Vehicle", rec.get("vehicle_reg")),
        ("Reported by", rec.get("reported_by")),
        ("Date", rec.get("defect_date") or (rec.get("created_at") or "")[:10]),
        ("Severity", (rec.get("severity") or "").replace("_", " ").title()),
        ("Status", (rec.get("status") or "open").title()),
    ]
    sections = [{"heading": "Defect detail", "type": "kv", "pairs": [
        ("Category", rec.get("category")),
        ("Severity", (rec.get("severity") or "").replace("_", " ").title()),
        ("Odometer", rec.get("odometer")),
        ("Description", rec.get("description")),
        ("AI summary", rec.get("ai_summary")),
    ]}, {"heading": "Rectification", "type": "kv", "pairs": [
        ("Status", (rec.get("status") or "open").title()),
        ("Rectified date", rec.get("rectified_date")),
        ("Rectified by", rec.get("rectified_by")),
        ("Notes", rec.get("rectification_notes")),
    ]}]
    return title, subtitle, meta, sections


def service(rec, region):
    t = _terms(region)
    title = "Service Record"
    subtitle = f"{rec.get('vehicle_reg', '—')} · {rec.get('service_date') or ''}"
    meta = [("Vehicle", rec.get("vehicle_reg")), ("Service date", rec.get("service_date")),
            ("Type", rec.get("service_type"))]
    sections = [{"heading": "Service detail", "type": "kv", "pairs": [
        ("Service type", rec.get("service_type")),
        ("Service date", rec.get("service_date")),
        ("Odometer", rec.get("odometer")),
        ("Provider / garage", rec.get("provider")),
        ("Cost", _money(t["currency"], rec.get("cost"))),
        ("Next service due", rec.get("next_service_due")),
        ("Notes", rec.get("notes")),
    ]}]
    return title, subtitle, meta, sections


def repair(rec, region):
    t = _terms(region)
    title = "Repair / Major Work Record"
    subtitle = f"{rec.get('vehicle_reg', '—')} · {rec.get('repair_date') or ''}"
    meta = [("Vehicle", rec.get("vehicle_reg")), ("Repair date", rec.get("repair_date")),
            ("Category", rec.get("category"))]
    sections = [{"heading": "Repair detail", "type": "kv", "pairs": [
        ("Category", rec.get("category")),
        ("Repair date", rec.get("repair_date")),
        ("Description", rec.get("description")),
        ("Provider / garage", rec.get("provider")),
        ("Odometer", rec.get("odometer")),
        ("Cost", _money(t["currency"], rec.get("cost"))),
        ("Notes", rec.get("notes")),
    ]}]
    return title, subtitle, meta, sections


def wheel(rec, region):
    title = "Wheel Security Audit"
    subtitle = f"{rec.get('vehicle_reg', '—')} · {rec.get('audit_date') or ''}"
    meta = [("Vehicle", rec.get("vehicle_reg")), ("Audit date", rec.get("audit_date")),
            ("Result", (rec.get("result") or "").title())]
    sections = [{"heading": "Audit detail", "type": "kv", "pairs": [
        ("Audit date", rec.get("audit_date")),
        ("Result", (rec.get("result") or "").title()),
        ("Torque setting", rec.get("torque_setting")),
        ("Checked by", rec.get("checked_by")),
        ("Next due", rec.get("next_due")),
        ("Notes", rec.get("notes")),
    ]}]
    return title, subtitle, meta, sections


def training(rec, region):
    title = "Driver Training / CPC Record"
    subtitle = f"{rec.get('driver_name', '—')} · {rec.get('course_name') or ''}"
    meta = [("Driver", rec.get("driver_name")), ("Course", rec.get("course_name")),
            ("Category", rec.get("category"))]
    sections = [{"heading": "Training detail", "type": "kv", "pairs": [
        ("Course / training", rec.get("course_name")),
        ("Category", rec.get("category")),
        ("Completed date", rec.get("completed_date")),
        ("Expiry date", rec.get("expiry_date")),
        ("Hours", rec.get("hours")),
        ("Provider", rec.get("provider")),
        ("Notes", rec.get("notes")),
    ]}]
    return title, subtitle, meta, sections


def insurance(rec, region):
    t = _terms(region)
    title = "Insurance Policy Record"
    subtitle = f"{rec.get('policy_type', '—')} · {rec.get('insurer') or ''}"
    meta = [("Policy type", rec.get("policy_type")), ("Insurer", rec.get("insurer")),
            ("Policy number", rec.get("policy_number"))]
    sections = [{"heading": "Policy detail", "type": "kv", "pairs": [
        ("Policy type", rec.get("policy_type")),
        ("Insurer", rec.get("insurer")),
        ("Policy number", rec.get("policy_number")),
        ("Cover amount", rec.get("cover_amount")),
        ("Start date", rec.get("start_date")),
        ("Expiry date", rec.get("expiry_date")),
        ("Notes", rec.get("notes")),
    ]}]
    return title, subtitle, meta, sections


def tacho(rec, region):
    title = "Tachograph Download Log"
    subtitle = f"{rec.get('source_type', '—')} · {rec.get('reference') or ''}"
    meta = [("Source", rec.get("source_type")), ("Reference", rec.get("reference")),
            ("Last download", rec.get("last_download"))]
    sections = [{"heading": "Download detail", "type": "kv", "pairs": [
        ("Source type", rec.get("source_type")),
        ("Reference (driver / vehicle)", rec.get("reference")),
        ("Last download", rec.get("last_download")),
        ("Next due", rec.get("next_due")),
        ("Download frequency (days)", rec.get("frequency_days")),
        ("Infringements", rec.get("infringements")),
        ("Notes", rec.get("notes")),
    ]}]
    return title, subtitle, meta, sections


def recall(rec, region):
    title = "Vehicle Safety Recall"
    subtitle = f"{rec.get('vehicle_reg', '—')} · {rec.get('reference') or ''}"
    meta = [("Vehicle", rec.get("vehicle_reg")), ("Reference", rec.get("reference")),
            ("Status", (rec.get("status") or "").title())]
    sections = [{"heading": "Recall detail", "type": "kv", "pairs": [
        ("Title", rec.get("title")),
        ("Reference", rec.get("reference")),
        ("Vehicle", rec.get("vehicle_reg")),
        ("Issued date", rec.get("issued_date")),
        ("Status", (rec.get("status") or "").title()),
        ("Actioned date", rec.get("actioned_date")),
        ("Notes", rec.get("notes")),
    ]}]
    return title, subtitle, meta, sections


def prohibition(rec, region):
    t = _terms(region)
    title = "Roadside Prohibition (PG9)"
    subtitle = f"{rec.get('vehicle_reg', '—')} · {rec.get('encounter_date') or ''}"
    meta = [("Vehicle", rec.get("vehicle_reg")), ("Date", rec.get("encounter_date")),
            ("Authority", rec.get("authority"))]
    sections = [{"heading": "Encounter", "type": "kv", "pairs": [
        ("Vehicle", rec.get("vehicle_reg")),
        ("Driver", rec.get("driver_name")),
        ("Encounter date", rec.get("encounter_date")),
        ("Location", rec.get("location")),
        ("Authority", rec.get("authority")),
        ("Encounter type", rec.get("encounter_type")),
    ]}, {"heading": "Prohibition", "type": "kv", "pairs": [
        ("Prohibition type", rec.get("prohibition_type")),
        ("Category", rec.get("category")),
        ("Reference", rec.get("reference")),
        ("Details", rec.get("details")),
        ("Fixed penalty", _yn(rec.get("fixed_penalty"))),
        ("Penalty amount", _money(t["currency"], rec.get("penalty_amount"))),
        ("Points", rec.get("points")),
        ("Status", (rec.get("status") or "").title()),
        ("Cleared date", rec.get("cleared_date")),
        ("Notes", rec.get("notes")),
    ]}]
    return title, subtitle, meta, sections


def compliance_doc(rec, region):
    title = "Compliance Document"
    subtitle = f"{rec.get('title', '—')} · {rec.get('category') or ''}"
    meta = [("Document", rec.get("title")), ("Category", rec.get("category"))]
    sections = [{"heading": "Document detail", "type": "kv", "pairs": [
        ("Title", rec.get("title")),
        ("Category", rec.get("category")),
        ("Reference", rec.get("reference")),
        ("Expiry / review date", rec.get("expiry_date")),
        ("Web link", rec.get("link_url")),
        ("Notes", rec.get("notes")),
    ]}]
    return title, subtitle, meta, sections


def document(rec, region):
    title = rec.get("title") or "Office Document"
    subtitle = rec.get("doc_type") or ""
    meta = [("Document", rec.get("title")), ("Type", rec.get("doc_type"))]
    sections = [{"heading": "Document detail", "type": "kv", "pairs": [
        ("Title", rec.get("title")),
        ("Type", rec.get("doc_type")),
        ("Reference", rec.get("reference")),
        ("Expiry date", rec.get("expiry_date")),
        ("Driver", rec.get("driver_name")),
        ("Web link", rec.get("link_url")),
        ("Notes", rec.get("notes")),
    ]}]
    return title, subtitle, meta, sections


def fuel(rec, region):
    t = _terms(region)
    title = "Fuel / AdBlue Fill"
    subtitle = f"{rec.get('vehicle_reg', '—')} · {rec.get('fill_date') or ''}"
    meta = [("Vehicle", rec.get("vehicle_reg")), ("Fill date", rec.get("fill_date")),
            ("Type", (rec.get("fill_type") or "").title())]
    sections = [{"heading": "Fill detail", "type": "kv", "pairs": [
        ("Fill type", (rec.get("fill_type") or "").title()),
        ("Fill date", rec.get("fill_date")),
        ("Litres", rec.get("litres")),
        ("Cost", _money(t["currency"], rec.get("cost"))),
        ("Odometer", rec.get("odometer")),
        ("Notes", rec.get("notes")),
    ]}]
    return title, subtitle, meta, sections


# kind -> (collection name, formatter, filename slug)
ENTRY_SPECS = {
    "walkaround": ("walkaround_checks", walkaround, "daily-check"),
    "defect": ("defects", defect, "defect"),
    "service": ("service_records", service, "service"),
    "repair": ("repairs", repair, "repair"),
    "wheel": ("wheel_audits", wheel, "wheel-audit"),
    "training": ("training", training, "training"),
    "insurance": ("insurance", insurance, "insurance"),
    "tacho": ("tacho", tacho, "tacho-download"),
    "recall": ("recalls", recall, "recall"),
    "prohibition": ("prohibitions", prohibition, "prohibition"),
    "compliance-doc": ("compliance_docs", compliance_doc, "compliance-doc"),
    "document": ("documents", document, "document"),
    "fuel": ("fuel", fuel, "fuel"),
}
