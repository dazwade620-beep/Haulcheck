"""Tests for HaulCheck new features:
   - Vehicle purchase_odometer persistence + fuel MPG/L100km enrichment
   - Fuel summary date range filter + avg_l_per_100km
   - Operator gmr_reference save/load
   - Shared docs (global-docs) admin CRUD + file download
"""
import os, io, uuid, pytest, requests
from pathlib import Path

def _load_frontend_env():
    p = Path("/app/frontend/.env")
    if p.exists():
        for line in p.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return None

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env() or "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL not set"
API = f"{BASE}/api"
EMAIL = "manager@haulcheck.co.uk"
PASSWORD = "Test1234!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}"}


# --- Vehicle purchase odometer --------------------------------------------
class TestVehiclePurchaseOdometer:
    def test_create_vehicle_with_purchase_fields(self, h):
        reg = f"TEST{uuid.uuid4().hex[:4].upper()}"
        payload = {
            "registration": reg,
            "make": "TestMake",
            "model": "TestModel",
            "purchase_date": "2024-01-15",
            "purchase_odometer": 100000,
        }
        r = requests.post(f"{API}/vehicles", json=payload, headers=h, timeout=30)
        assert r.status_code in (200, 201), r.text
        pytest.veh_id = r.json().get("id")
        pytest.veh_reg = reg

        lst = requests.get(f"{API}/vehicles", headers=h, timeout=30).json()
        v = next((x for x in lst if x.get("registration") == reg), None)
        assert v is not None
        assert v.get("purchase_odometer") == 100000
        assert v.get("purchase_date") == "2024-01-15"

    def test_first_diesel_fill_computes_mpg_from_purchase(self, h):
        # Add first diesel fill at odo 100600 -> 600 miles from purchase baseline
        payload = {
            "vehicle_reg": pytest.veh_reg,
            "fill_date": "2024-02-10",
            "fill_type": "diesel",
            "litres": 150,
            "cost": 200,
            "odometer": 100600,
        }
        r = requests.post(f"{API}/fuel", json=payload, headers=h, timeout=30)
        assert r.status_code in (200, 201), r.text
        pytest.fuel_id = r.json().get("id")

        recs = requests.get(f"{API}/fuel", headers=h, timeout=30).json()
        mine = [x for x in recs if x.get("vehicle_reg") == pytest.veh_reg]
        assert mine, "no fuel records"
        first = next(x for x in mine if x.get("id") == pytest.fuel_id)
        # miles = 600, mpg = 600 / (150/4.546) ~ 18.2, l/100km = 150*100/(600*1.60934)~15.5
        assert first.get("miles") == 600 or (first.get("miles") and 500 <= first["miles"] <= 700)
        assert first.get("mpg") is not None
        assert first.get("l_per_100km") is not None
        assert 15 <= first["l_per_100km"] <= 16

    def test_fuel_summary_has_avg_l_per_100km_and_date_range(self, h):
        r = requests.get(f"{API}/fuel/summary", headers=h, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "totals" in data and "vehicles" in data
        assert "avg_l_per_100km" in data["totals"]
        # Filter to a range that excludes 2024
        r2 = requests.get(f"{API}/fuel/summary?from_date=2099-01-01&to_date=2099-12-31",
                          headers=h, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["totals"]["diesel_fills"] == 0

        # Range that includes 2024-02-10
        r3 = requests.get(f"{API}/fuel/summary?from_date=2024-01-01&to_date=2024-12-31",
                          headers=h, timeout=30)
        assert r3.status_code == 200
        vehs = r3.json()["vehicles"]
        row = next((v for v in vehs if v["vehicle_reg"] == pytest.veh_reg), None)
        assert row is not None
        assert row.get("avg_l_per_100km") is not None
        assert row.get("avg_mpg") is not None

    def test_cleanup_fuel_and_vehicle(self, h):
        if getattr(pytest, "fuel_id", None):
            requests.delete(f"{API}/fuel/{pytest.fuel_id}", headers=h, timeout=30)
        if getattr(pytest, "veh_id", None):
            requests.delete(f"{API}/vehicles/{pytest.veh_id}", headers=h, timeout=30)


# --- Operator GMR reference -----------------------------------------------
class TestOperatorGMR:
    def test_get_operator(self, h):
        r = requests.get(f"{API}/operator", headers=h, timeout=30)
        assert r.status_code == 200
        pytest.op_original = r.json()

    def test_save_gmr_reference(self, h):
        current = dict(pytest.op_original or {})
        current["gmr_reference"] = "GMR-TEST-XYZ-001"
        # Strip server-managed fields if any
        for k in ("id", "user_id", "_id", "created_at", "updated_at"):
            current.pop(k, None)
        r = requests.put(f"{API}/operator", json=current, headers=h, timeout=30)
        assert r.status_code in (200, 201), r.text
        r2 = requests.get(f"{API}/operator", headers=h, timeout=30)
        assert r2.status_code == 200
        assert r2.json().get("gmr_reference") == "GMR-TEST-XYZ-001"


# --- Global docs (shared library) -----------------------------------------
class TestGlobalDocs:
    def test_admin_create_global_doc_link_normalized(self, h):
        payload = {
            "title": "TEST Shared Guidance",
            "category": "Guidance",
            "link_url": "gov.uk/dvsa",  # no scheme -> should be prefixed
            "notes": "auto test",
            "attachments": [],
        }
        r = requests.post(f"{API}/admin/global-docs", json=payload, headers=h, timeout=30)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        assert d["link_url"].startswith("https://")
        pytest.gdoc_id = d["id"]

    def test_list_global_docs_visible(self, h):
        r = requests.get(f"{API}/global-docs", headers=h, timeout=30)
        assert r.status_code == 200
        assert any(x["id"] == pytest.gdoc_id for x in r.json())

    def test_upload_and_download_attached_file(self, h):
        # Upload a small PDF via /api/files
        pdf = b"%PDF-1.4\n%test\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
        files = {"file": ("test.pdf", io.BytesIO(pdf), "application/pdf")}
        r = requests.post(f"{API}/upload", files=files, headers=h, timeout=30)
        if r.status_code == 404:
            pytest.skip("no /api/files upload endpoint in this build")
        assert r.status_code in (200, 201), r.text
        fdata = r.json()
        file_id = fdata.get("file_id") or fdata.get("id")
        assert file_id
        # Attach to global doc: create a new one with attachment
        att = {
            "file_id": file_id,
            "original_filename": fdata.get("original_filename", "test.pdf"),
            "content_type": "application/pdf",
            "size": len(pdf),
        }
        payload = {"title": "TEST With File", "category": "Guidance",
                   "link_url": "", "notes": "", "attachments": [att]}
        rc = requests.post(f"{API}/admin/global-docs", json=payload, headers=h, timeout=30)
        assert rc.status_code in (200, 201), rc.text
        pytest.gdoc_id2 = rc.json()["id"]

        # Fetch file
        rf = requests.get(f"{API}/global-docs/files/{file_id}", headers=h, timeout=30)
        assert rf.status_code == 200, f"{rf.status_code} {rf.text[:200]}"
        assert rf.content.startswith(b"%PDF")

    def test_download_requires_auth(self, h):
        # Grab any file_id if we have one
        fid = None
        docs = requests.get(f"{API}/global-docs", headers=h, timeout=30).json()
        for d in docs:
            if d.get("attachments"):
                fid = d["attachments"][0].get("file_id")
                break
        if not fid:
            pytest.skip("no file to test auth")
        r = requests.get(f"{API}/global-docs/files/{fid}", timeout=30)
        assert r.status_code in (401, 403)

    def test_admin_delete_global_docs(self, h):
        for attr in ("gdoc_id", "gdoc_id2"):
            gid = getattr(pytest, attr, None)
            if gid:
                r = requests.delete(f"{API}/admin/global-docs/{gid}", headers=h, timeout=30)
                assert r.status_code in (200, 204)
