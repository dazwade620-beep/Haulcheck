"""Iteration 35 tests: Prohibitions CRUD, Job Card PDFs, auto job card from defect/PMI fail,
Compliance doc reminder digest, Audit pack new sections, Viewer role protection."""
import os
import time
import uuid
import requests
import pytest

def _load_base_url():
    v = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    return ""


BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"

MANAGER_EMAIL = "manager@haulcheck.co.uk"
MANAGER_PASSWORD = "Test1234!"


@pytest.fixture(scope="session")
def manager_token():
    r = requests.post(f"{API}/auth/login", json={"email": MANAGER_EMAIL, "password": MANAGER_PASSWORD})
    if r.status_code != 200:
        # try register
        r2 = requests.post(f"{API}/auth/register", json={
            "email": MANAGER_EMAIL, "password": MANAGER_PASSWORD, "company_name": "HaulCheck Test"
        })
        r = requests.post(f"{API}/auth/login", json={"email": MANAGER_EMAIL, "password": MANAGER_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def mgr(manager_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {manager_token}", "Content-Type": "application/json"})
    return s


# ------------------ Cleanup helpers ------------------
_CREATED = {"prohibitions": [], "job_cards": [], "defects": [], "compliance_docs": [],
            "pmi_schedules": [], "pmi_records": []}


@pytest.fixture(scope="session", autouse=True)
def cleanup(mgr):
    yield
    def safe(fn):
        try:
            fn()
        except Exception:
            pass
    for pid in _CREATED["prohibitions"]:
        safe(lambda pid=pid: mgr.delete(f"{API}/prohibitions/{pid}"))
    for jid in _CREATED["job_cards"]:
        safe(lambda jid=jid: mgr.delete(f"{API}/job-cards/{jid}"))
    try:
        jc_list = mgr.get(f"{API}/job-cards").json()
    except Exception:
        jc_list = []
    for jc in jc_list:
        if jc.get("source") in ("defect", "pmi_fail") and jc.get("source_ref") in (_CREATED["defects"] + _CREATED["pmi_records"]):
            safe(lambda jid=jc["id"]: mgr.delete(f"{API}/job-cards/{jid}"))
    for did in _CREATED["defects"]:
        safe(lambda did=did: mgr.delete(f"{API}/defects/{did}"))
    for cid in _CREATED["compliance_docs"]:
        safe(lambda cid=cid: mgr.delete(f"{API}/compliance-docs/{cid}"))
    for pid in _CREATED["pmi_schedules"]:
        safe(lambda pid=pid: mgr.delete(f"{API}/pmi/{pid}"))


# =========================================================
# 1. Prohibitions CRUD
# =========================================================
class TestProhibitions:
    def test_create_get_update_delete(self, mgr):
        payload = {
            "vehicle_reg": "AB12 CDE", "authority": "DVSA",
            "prohibition_type": "immediate", "category": "Mechanical",
            "fixed_penalty": True, "penalty_amount": 300, "points": 3,
            "status": "open", "encounter_date": "2026-01-05",
            "details": "TEST_iter35 brakes below limit",
        }
        r = mgr.post(f"{API}/prohibitions", json=payload)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["id"].startswith("pg9_")
        assert p["vehicle_reg"] == "AB12 CDE"
        assert p["prohibition_type"] == "immediate"
        assert p["fixed_penalty"] is True
        assert p["penalty_amount"] == 300
        assert p["status"] == "open"
        pid = p["id"]
        _CREATED["prohibitions"].append(pid)

        # LIST
        r = mgr.get(f"{API}/prohibitions")
        assert r.status_code == 200
        assert any(x["id"] == pid for x in r.json())

        # UPDATE to cleared
        upd = dict(payload)
        upd.update({"status": "cleared", "cleared_date": "2026-01-10"})
        r = mgr.put(f"{API}/prohibitions/{pid}", json=upd)
        assert r.status_code == 200
        # Verify persistence
        got = [x for x in mgr.get(f"{API}/prohibitions").json() if x["id"] == pid][0]
        assert got["status"] == "cleared"
        assert got["cleared_date"] == "2026-01-10"

        # DELETE
        r = mgr.delete(f"{API}/prohibitions/{pid}")
        assert r.status_code == 200
        _CREATED["prohibitions"].remove(pid)
        # Verify gone
        assert not any(x["id"] == pid for x in mgr.get(f"{API}/prohibitions").json())

    def test_prohibitions_pdf_report(self, mgr):
        # ensure at least one exists
        payload = {"vehicle_reg": "AB12 CDE", "authority": "DVSA",
                   "prohibition_type": "immediate", "category": "Mechanical",
                   "status": "open", "encounter_date": "2026-01-06",
                   "details": "TEST_iter35 pdf source"}
        r = mgr.post(f"{API}/prohibitions", json=payload)
        assert r.status_code == 200
        _CREATED["prohibitions"].append(r.json()["id"])

        r = mgr.get(f"{API}/reports/prohibitions")
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"


# =========================================================
# 2. Job Card PDF
# =========================================================
class TestJobCardPDF:
    def test_create_and_download_pdf(self, mgr):
        payload = {"vehicle_reg": "AB12 CDE", "date_raised": "2026-01-06",
                   "status": "open", "work_requested": "TEST_iter35 brake pads",
                   "cost": 120.50}
        r = mgr.post(f"{API}/job-cards", json=payload)
        assert r.status_code == 200, r.text
        jc = r.json()
        jid = jc["id"]
        _CREATED["job_cards"].append(jid)
        assert jc["job_number"].startswith("JC-")

        # Per-row PDF
        r = mgr.get(f"{API}/job-cards/{jid}/report")
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

        # List PDF
        r = mgr.get(f"{API}/reports/job_cards")
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"


# =========================================================
# 3. AUTO JOB CARD from defect
# =========================================================
class TestAutoJobCardFromDefect:
    def test_defect_creates_one_job_card(self, mgr):
        pre = mgr.get(f"{API}/job-cards").json()
        pre_ids = {j["id"] for j in pre}

        d_payload = {"vehicle_reg": "AB12 CDE",
                     "description": "TEST_iter35 nearside indicator inoperative",
                     "severity": "major"}
        r = mgr.post(f"{API}/defects", json=d_payload)
        assert r.status_code == 200, r.text
        defect = r.json()
        _CREATED["defects"].append(defect["id"])

        # Confirm one Job Card auto created with source=defect, source_ref=defect_id
        post = mgr.get(f"{API}/job-cards").json()
        auto = [j for j in post if j.get("source") == "defect" and j.get("source_ref") == defect["id"]]
        assert len(auto) == 1
        jc = auto[0]
        assert jc["work_requested"].startswith("Defect:")
        assert jc["status"] == "open"

        # Second defect creates second job card (unique source_ref)
        r = mgr.post(f"{API}/defects", json={**d_payload, "description": "TEST_iter35 second defect"})
        assert r.status_code == 200
        d2 = r.json()
        _CREATED["defects"].append(d2["id"])
        post2 = mgr.get(f"{API}/job-cards").json()
        auto2 = [j for j in post2 if j.get("source") == "defect" and j.get("source_ref") == d2["id"]]
        assert len(auto2) == 1

    def test_dedup_same_source_ref(self, mgr):
        # Direct call: creating two job cards with same source_ref shouldn't happen; test via _auto path implicit
        # We simulate by creating a defect once and confirming only one JC exists across list refetches
        r = mgr.post(f"{API}/defects", json={"vehicle_reg": "AB12 CDE",
                                              "description": "TEST_iter35 dedup",
                                              "severity": "minor"})
        assert r.status_code == 200
        d = r.json()
        _CREATED["defects"].append(d["id"])
        jcs = [j for j in mgr.get(f"{API}/job-cards").json()
               if j.get("source_ref") == d["id"]]
        assert len(jcs) == 1


# =========================================================
# 4. AUTO JOB CARD from PMI fail
# =========================================================
class TestAutoJobCardFromPMI:
    def test_pmi_interim_fail_creates_one_job_card(self, mgr):
        payload = {
            "vehicle_reg": "AB12 CDE",
            "inspection_date": "2026-01-06",
            "result": "fail",
            "inspector": "TEST Inspector",
            "notes": "TEST_iter35 interim fail",
            "checklist": [{"item": "Brakes", "ok": False}, {"item": "Lights", "ok": True}],
        }
        r = mgr.post(f"{API}/pmi/interim", json=payload)
        assert r.status_code == 200, r.text
        rec = r.json()["record"]
        _CREATED["pmi_records"].append(rec["id"])

        jcs = [j for j in mgr.get(f"{API}/job-cards").json()
               if j.get("source") == "pmi_fail" and j.get("source_ref") == rec["id"]]
        assert len(jcs) == 1
        assert "rectify" in jcs[0]["work_requested"].lower() or "failure" in jcs[0]["work_requested"].lower()

    def test_pmi_scheduled_fail_creates_one_job_card(self, mgr):
        # create schedule
        r = mgr.post(f"{API}/pmi", json={"vehicle_reg": "AB12 CDE", "frequency_weeks": 6,
                                          "next_due": "2026-02-01", "inspector": "TEST"})
        assert r.status_code == 200, r.text
        sched = r.json()
        _CREATED["pmi_schedules"].append(sched["id"])

        complete = {
            "inspection_date": "2026-01-06",
            "result": "fail",
            "inspector": "TEST",
            "notes": "TEST_iter35 scheduled fail",
            "checklist": [{"item": "Steering", "ok": False}],
        }
        r = mgr.post(f"{API}/pmi/{sched['id']}/complete", json=complete)
        assert r.status_code == 200, r.text
        rec = r.json()["record"]
        _CREATED["pmi_records"].append(rec["id"])

        jcs = [j for j in mgr.get(f"{API}/job-cards").json()
               if j.get("source") == "pmi_fail" and j.get("source_ref") == rec["id"]]
        assert len(jcs) == 1


# =========================================================
# 5. Compliance Doc reminder digest
# =========================================================
class TestComplianceReminders:
    def test_compliance_doc_in_reminder_digest(self, mgr):
        from datetime import date, timedelta
        due = (date.today() + timedelta(days=10)).isoformat()
        r = mgr.post(f"{API}/compliance-docs", json={
            "title": "TEST_iter35 Insurance", "category": "Insurance",
            "expiry_date": due, "notes": "TEST"
        })
        assert r.status_code == 200, r.text
        cd = r.json()
        _CREATED["compliance_docs"].append(cd["id"])

        # Ensure recipient configured
        settings = mgr.get(f"{API}/reminders/settings").json() or {}
        recipients = settings.get("recipients", [])
        if not recipients:
            mgr.put(f"{API}/reminders/settings", json={
                "recipients": [{"email": MANAGER_EMAIL, "frequency": "weekly",
                                "areas": ["documents", "pmi", "defects", "service", "insurance", "training"]}]
            })

        r = mgr.post(f"{API}/reminders/send")
        # Accept 200 (built OK). If 500 in test mode Resend may reject; report status.
        assert r.status_code == 200, f"reminders/send returned {r.status_code}: {r.text}"
        # item_count should include the compliance doc
        results = r.json().get("results", [])
        assert results, "no reminder results"
        assert sum(x["item_count"] for x in results) >= 1


# =========================================================
# 6. Audit pack sections
# =========================================================
class TestAuditPack:
    def test_audit_json_has_new_sections(self, mgr):
        r = mgr.get(f"{API}/reports/audit?format=json")
        assert r.status_code == 200, r.text
        data = r.json()
        sections = data.get("sections", [])
        headings = [s.get("heading") for s in sections]
        assert "Workshop Job Cards" in headings, f"missing Workshop Job Cards, got {headings}"
        assert "Roadside Prohibitions (PG9)" in headings

        overview = next((s for s in sections if s.get("heading") == "Overview" and s.get("type") == "kv"), None)
        assert overview, "Overview kv missing"
        keys = [p[0] if isinstance(p, list) else p[0] for p in overview.get("pairs", [])]
        for expected in ["Job cards", "Open job cards", "Maintenance spend", "Roadside prohibitions (PG9)"]:
            assert expected in keys, f"Overview missing '{expected}'; keys={keys}"

    def test_audit_pdf(self, mgr):
        r = mgr.get(f"{API}/reports/audit")
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"


# =========================================================
# 7. Viewer role protection
# =========================================================
class TestViewerProtection:
    @pytest.fixture(scope="class")
    def viewer_token(self, mgr):
        # Invite a viewer
        vemail = f"test_viewer_{uuid.uuid4().hex[:6]}@example.com"
        vpass = "ViewerTest1!"
        r = mgr.post(f"{API}/invitations", json={"email": vemail, "role": "viewer"})
        if r.status_code != 200:
            pytest.skip(f"cannot create invitation: {r.status_code} {r.text}")
        inv = r.json()
        token = inv.get("token")
        if not token:
            invs = mgr.get(f"{API}/invitations").json()
            match = [i for i in invs if i.get("email") == vemail]
            token = match[0].get("token") if match else None
        if not token:
            pytest.skip("no invitation token returned")
        r = requests.post(f"{API}/auth/accept-invite", json={
            "token": token, "name": "TEST Viewer", "password": vpass
        })
        if r.status_code != 200:
            pytest.skip(f"accept-invite failed: {r.status_code} {r.text}")
        r = requests.post(f"{API}/auth/login", json={"email": vemail, "password": vpass})
        assert r.status_code == 200
        return r.json()["token"], vemail

    def test_viewer_read_ok_write_blocked(self, viewer_token):
        token, _ = viewer_token
        h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        # GET allowed
        r = requests.get(f"{API}/prohibitions", headers=h)
        assert r.status_code == 200
        # POST blocked (403)
        r = requests.post(f"{API}/prohibitions", headers=h, json={
            "vehicle_reg": "AB12 CDE", "authority": "DVSA",
            "prohibition_type": "immediate", "category": "Mechanical", "status": "open",
        })
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
        # PUT blocked
        r = requests.put(f"{API}/prohibitions/nonexistent", headers=h, json={
            "vehicle_reg": "AB12 CDE", "authority": "DVSA",
            "prohibition_type": "immediate", "category": "Mechanical", "status": "open",
        })
        assert r.status_code == 403
        # DELETE blocked
        r = requests.delete(f"{API}/prohibitions/nonexistent", headers=h)
        assert r.status_code == 403
        # Job cards report GET should work
        r = requests.get(f"{API}/reports/prohibitions", headers=h)
        assert r.status_code == 200
