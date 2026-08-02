"""
Iteration 34 - Batch of 4 features + regression:
- Job Cards CRUD (/api/job-cards)
- Compliance Docs CRUD (/api/compliance-docs)
- Operator financial/contact/bank fields persistence (/api/operator)
- Documents regression - doc_type retained (ComplianceDoc still used by /api/documents)
- Calendar VOR span (event per day)
- Viewer role write-guard on new endpoints
"""
import os
import uuid
import requests
import pytest
from datetime import date, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    from pathlib import Path
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
            break
API = f"{BASE_URL}/api"
MANAGER = ("manager@haulcheck.co.uk", "Test1234!")
TODAY = date.today().isoformat()


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": MANAGER[0], "password": MANAGER[1]}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Job Cards ----------
class TestJobCards:
    def test_crud_and_job_number_format(self, h):
        reg = f"TEST-JC{uuid.uuid4().hex[:4].upper()}"
        payload = {
            "vehicle_reg": reg,
            "status": "open",
            "work_requested": "TEST: replace brake pads",
            "technician": "TEST Tech",
            "cost": 150.5,
        }
        r = requests.post(f"{API}/job-cards", json=payload, headers=h, timeout=15)
        assert r.status_code == 200, r.text
        jc = r.json()
        jid = jc["id"]
        assert jc["vehicle_reg"] == reg
        assert jc["work_requested"] == payload["work_requested"]
        assert jc["technician"] == "TEST Tech"
        assert jc["cost"] == 150.5
        # Format JC-XXXX
        import re
        assert re.match(r"^JC-\d{4}$", jc["job_number"]), f"Bad job_number: {jc['job_number']}"

        # List / persistence
        r = requests.get(f"{API}/job-cards", headers=h, timeout=15)
        assert r.status_code == 200
        assert any(x["id"] == jid for x in r.json())

        # Edit
        edit = {**payload, "status": "in_progress", "work_carried_out": "Pads replaced"}
        r = requests.put(f"{API}/job-cards/{jid}", json=edit, headers=h, timeout=15)
        assert r.status_code == 200
        r = requests.get(f"{API}/job-cards", headers=h, timeout=15)
        got = next(x for x in r.json() if x["id"] == jid)
        assert got["status"] == "in_progress"
        assert got["work_carried_out"] == "Pads replaced"

        # Delete
        r = requests.delete(f"{API}/job-cards/{jid}", headers=h, timeout=15)
        assert r.status_code == 200
        r = requests.get(f"{API}/job-cards", headers=h, timeout=15)
        assert not any(x["id"] == jid for x in r.json())

    def test_update_missing_404(self, h):
        r = requests.put(f"{API}/job-cards/nonexistent", json={"vehicle_reg": "X"}, headers=h, timeout=15)
        assert r.status_code == 404

    def test_requires_auth(self):
        assert requests.get(f"{API}/job-cards", timeout=15).status_code == 401
        assert requests.post(f"{API}/job-cards", json={"vehicle_reg": "X"}, timeout=15).status_code == 401


# ---------- Compliance Docs ----------
class TestComplianceDocs:
    def test_crud(self, h):
        payload = {
            "title": f"TEST DVSA link {uuid.uuid4().hex[:5]}",
            "category": "DVSA",
            "reference": "REF-1",
            "expiry_date": (date.today() + timedelta(days=60)).isoformat(),
            "link_url": "https://www.gov.uk/guidance/driver-and-vehicle-standards-agency",
            "notes": "TEST compliance doc",
        }
        r = requests.post(f"{API}/compliance-docs", json=payload, headers=h, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        cid = d["id"]
        assert d["title"] == payload["title"]
        assert d["category"] == "DVSA"
        assert d["link_url"] == payload["link_url"]
        assert d["id"].startswith("cmp_")

        # List
        r = requests.get(f"{API}/compliance-docs", headers=h, timeout=15)
        assert r.status_code == 200
        assert any(x["id"] == cid for x in r.json())

        # Edit
        edit = {**payload, "category": "RSA", "notes": "Updated"}
        r = requests.put(f"{API}/compliance-docs/{cid}", json=edit, headers=h, timeout=15)
        assert r.status_code == 200
        r = requests.get(f"{API}/compliance-docs", headers=h, timeout=15)
        got = next(x for x in r.json() if x["id"] == cid)
        assert got["category"] == "RSA"
        assert got["notes"] == "Updated"

        # Delete
        r = requests.delete(f"{API}/compliance-docs/{cid}", headers=h, timeout=15)
        assert r.status_code == 200

    def test_update_missing_404(self, h):
        r = requests.put(f"{API}/compliance-docs/nonexistent", json={"title": "x"}, headers=h, timeout=15)
        assert r.status_code == 404

    def test_requires_auth(self):
        assert requests.get(f"{API}/compliance-docs", timeout=15).status_code == 401
        assert requests.post(f"{API}/compliance-docs", json={"title": "X"}, timeout=15).status_code == 401


# ---------- Operator Financial Fields ----------
class TestOperatorFinancial:
    def test_financial_and_bank_persist(self, h):
        # Fetch current to preserve non-financial fields
        r = requests.get(f"{API}/operator", headers=h, timeout=15)
        assert r.status_code == 200
        cur = r.json() or {}
        # Payload merged (only include the fields OperatorInput accepts)
        keys = ["company_name","company_number","operator_licence_number","licence_type",
                "address","authorised_vehicles","authorised_trailers","tm_name","tm_cpc_number",
                "tm_email","tm_phone","vat_number","eori_number","bank_sort_code",
                "bank_account_number","bank_swift","bank_iban","website","email","logo_file_id","notes"]
        payload = {k: cur.get(k, "" if k not in ("authorised_vehicles","authorised_trailers") else 0) for k in keys}
        payload.update({
            "vat_number": "GB123456789",
            "eori_number": "GB123456789000",
            "bank_sort_code": "12-34-56",
            "bank_account_number": "12345678",
            "bank_swift": "BUKBGB22",
            "bank_iban": "GB29NWBK60161331926819",
            "website": "https://haulcheck.example.co.uk",
            "email": "accounts@haulcheck.example.co.uk",
        })
        r = requests.put(f"{API}/operator", json=payload, headers=h, timeout=15)
        assert r.status_code == 200, r.text

        # GET verify persistence
        r = requests.get(f"{API}/operator", headers=h, timeout=15)
        assert r.status_code == 200
        got = r.json()
        for k in ["vat_number","eori_number","bank_sort_code","bank_account_number",
                  "bank_swift","bank_iban","website","email"]:
            assert got.get(k) == payload[k], f"{k}: expected {payload[k]!r} got {got.get(k)!r}"


# ---------- Documents regression (doc_type retained) ----------
class TestDocumentsRegression:
    def test_doc_type_retained(self, h):
        payload = {
            "title": f"TEST Insurance {uuid.uuid4().hex[:5]}",
            "doc_type": "Insurance",
            "reference": "POL-9999",
            "expiry_date": (date.today() + timedelta(days=180)).isoformat(),
            "notes": "TEST",
        }
        r = requests.post(f"{API}/documents", json=payload, headers=h, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        did = body["id"]
        assert body["doc_type"] == "Insurance"
        # Persistence
        r = requests.get(f"{API}/documents", headers=h, timeout=15)
        got = next(x for x in r.json() if x["id"] == did)
        assert got["doc_type"] == "Insurance"
        assert got["title"] == payload["title"]
        # Cleanup
        requests.delete(f"{API}/documents/{did}", headers=h, timeout=15)


# ---------- Calendar VOR span ----------
class TestCalendarVOR:
    def test_vor_spans_each_day(self, h):
        # Create a fresh vehicle to test in isolation
        reg = f"TEST-VOR{uuid.uuid4().hex[:4].upper()}"
        r = requests.post(f"{API}/vehicles",
                          json={"registration": reg, "make": "DAF", "model": "XF", "type": "HGV"},
                          headers=h, timeout=15)
        assert r.status_code == 200, r.text
        vid = r.json()["id"]
        try:
            off = date.today()
            ret = date.today() + timedelta(days=4)  # 5-day span
            r = requests.post(f"{API}/vehicles/{vid}/vor",
                              json={"reason": "TEST engine rebuild",
                                    "off_date": off.isoformat(),
                                    "expected_return": ret.isoformat()},
                              headers=h, timeout=15)
            assert r.status_code == 200, r.text

            r = requests.get(f"{API}/calendar", headers=h, timeout=15)
            assert r.status_code == 200
            events = r.json()
            vor_dates = sorted({e["date"] for e in events
                                if e.get("type") == "vor" and reg in e.get("title", "")})
            expected = [(off + timedelta(days=i)).isoformat() for i in range(5)]
            assert vor_dates == expected, f"Expected {expected}, got {vor_dates}"
        finally:
            # clear VOR then delete vehicle
            requests.post(f"{API}/vehicles/{vid}/vor/clear", headers=h, timeout=15)
            requests.delete(f"{API}/vehicles/{vid}", headers=h, timeout=15)


# ---------- Viewer role write-guard ----------
class TestViewerGuard:
    @pytest.fixture(scope="class")
    def viewer_token(self, h):
        # Invite a viewer via manager's invitation flow, accept via mongo-stored token
        from pymongo import MongoClient
        MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        DB_NAME = os.environ.get("DB_NAME", "test_database")
        email = f"test_viewer_{uuid.uuid4().hex[:6]}@haulcheck.co.uk"
        r = requests.post(f"{API}/invitations",
                          json={"email": email, "role": "viewer", "base_url": BASE_URL},
                          headers=h, timeout=15)
        assert r.status_code == 200, r.text
        inv = MongoClient(MONGO_URL)[DB_NAME].invitations.find_one({"email": email})
        assert inv and inv.get("role") == "viewer"
        r = requests.post(f"{API}/auth/accept-invite",
                          json={"token": inv["token"], "name": "TEST Viewer", "password": "Test1234!"},
                          timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["role"] == "viewer"
        return data["token"]

    def test_viewer_blocked_on_new_endpoints(self, viewer_token):
        vh = {"Authorization": f"Bearer {viewer_token}", "Content-Type": "application/json"}
        # GET should work
        assert requests.get(f"{API}/job-cards", headers=vh, timeout=15).status_code == 200
        assert requests.get(f"{API}/compliance-docs", headers=vh, timeout=15).status_code == 200
        # POST should be 403
        r = requests.post(f"{API}/job-cards", json={"vehicle_reg": "TEST"}, headers=vh, timeout=15)
        assert r.status_code == 403, r.text
        r = requests.post(f"{API}/compliance-docs", json={"title": "TEST"}, headers=vh, timeout=15)
        assert r.status_code == 403, r.text
        # PUT/DELETE should be 403
        assert requests.put(f"{API}/job-cards/x", json={"vehicle_reg": "y"}, headers=vh, timeout=15).status_code == 403
        assert requests.delete(f"{API}/job-cards/x", headers=vh, timeout=15).status_code == 403
        assert requests.put(f"{API}/compliance-docs/x", json={"title": "y"}, headers=vh, timeout=15).status_code == 403
        assert requests.delete(f"{API}/compliance-docs/x", headers=vh, timeout=15).status_code == 403
