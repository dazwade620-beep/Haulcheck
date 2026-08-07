"""Backend tests for Movement Pack, Shared Doc Alerts, and Fuel Leaderboard features."""
import os
import io
import pytest
import requests
from datetime import date, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

MANAGER_EMAIL = "manager@haulcheck.co.uk"
MANAGER_PASSWORD = "Test1234!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": MANAGER_EMAIL, "password": MANAGER_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"] if "access_token" in r.json() else r.json().get("token")


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------- MOVEMENT PACK ----------------
class TestMovementPack:
    seeded_ids = []

    def test_seed_movements(self, headers):
        today = date.today()
        payloads = [
            {"movement_date": (today - timedelta(days=2)).isoformat(), "direction": "export",
             "vehicle_reg": "TEST-MV1", "driver_name": "John Test", "gmr_reference": "GMR-T1",
             "route": "Dover-Calais", "ferry_operator": "P&O", "status": "completed"},
            {"movement_date": (today - timedelta(days=1)).isoformat(), "direction": "import",
             "vehicle_reg": "TEST-MV2", "driver_name": "Jane Test", "gmr_reference": "GMR-T2",
             "route": "Calais-Dover", "ferry_operator": "DFDS", "status": "completed"},
            {"movement_date": today.isoformat(), "direction": "export",
             "vehicle_reg": "TEST-MV1", "driver_name": "John Test", "gmr_reference": "GMR-T3",
             "route": "Holyhead-Dublin", "ferry_operator": "Irish Ferries", "status": "planned"},
        ]
        for p in payloads:
            r = requests.post(f"{API}/movements", json=p, headers=headers)
            assert r.status_code in (200, 201), f"seed movement failed: {r.status_code} {r.text}"
            data = r.json()
            TestMovementPack.seeded_ids.append(data.get("id") or data.get("_id"))
        assert len(TestMovementPack.seeded_ids) == 3

    def test_pack_json(self, headers):
        r = requests.get(f"{API}/movements/pack?format=json", headers=headers)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("count", "period", "exports", "imports", "completed"):
            assert k in data, f"missing {k} in {data}"
        assert data["count"] >= 3
        assert data["exports"] >= 2
        assert data["imports"] >= 1
        assert data["completed"] >= 2

    def test_pack_pdf(self, headers):
        r = requests.get(f"{API}/movements/pack", headers=headers)
        assert r.status_code == 200, r.text
        ct = r.headers.get("content-type", "")
        assert "pdf" in ct.lower(), f"expected pdf, got {ct}"
        assert r.content[:4] == b"%PDF", "response is not a PDF file"
        assert len(r.content) > 500

    def test_pack_date_filter(self, headers):
        today = date.today()
        # narrow to today only
        r = requests.get(f"{API}/movements/pack?format=json&from_date={today.isoformat()}&to_date={today.isoformat()}", headers=headers)
        assert r.status_code == 200
        data = r.json()
        # narrower window count should be <= full count
        r_full = requests.get(f"{API}/movements/pack?format=json", headers=headers).json()
        assert data["count"] <= r_full["count"]


# ---------------- SHARED DOC ALERTS ----------------
class TestSharedDocs:
    def test_mark_seen_first(self, headers):
        r = requests.post(f"{API}/global-docs/mark-seen", headers=headers)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_unseen_after_mark(self, headers):
        r = requests.get(f"{API}/global-docs/unseen-count", headers=headers)
        assert r.status_code == 200
        assert r.json().get("count", 0) == 0

    def test_publish_admin_doc_then_unseen(self, headers):
        import time
        time.sleep(1)
        payload = {
            "title": "TEST_SharedDoc",
            "category": "compliance",
            "link_url": "https://example.com/test",
            "notes": "test doc from automated test",
        }
        r = requests.post(f"{API}/admin/global-docs", json=payload, headers=headers)
        assert r.status_code in (200, 201), f"admin publish failed: {r.status_code} {r.text}"

        r2 = requests.get(f"{API}/global-docs/unseen-count", headers=headers)
        assert r2.status_code == 200
        assert r2.json().get("count", 0) >= 1, f"expected unseen >=1 got {r2.json()}"

    def test_mark_seen_clears_count(self, headers):
        requests.post(f"{API}/global-docs/mark-seen", headers=headers)
        r = requests.get(f"{API}/global-docs/unseen-count", headers=headers)
        assert r.status_code == 200
        assert r.json().get("count", 0) == 0


# ---------------- FUEL LEADERBOARD ----------------
class TestFuelLeaderboard:
    veh_ids = []

    def test_seed_vehicles_and_fuel(self, headers):
        # create 2 vehicles
        for reg in ("TEST-FV1", "TEST-FV2"):
            r = requests.post(f"{API}/vehicles", json={"registration": reg, "make": "Volvo", "model": "FH"}, headers=headers)
            # if exists it may 400; ignore
            if r.status_code in (200, 201):
                TestFuelLeaderboard.veh_ids.append(r.json().get("id"))

        # Fuel fills — vehicle 1 more efficient (higher MPG)
        # MPG UK = miles / gallons; 1 UK gallon = 4.54609 L; miles = km * 0.621371
        # fill1 baseline, fill2 with distance
        today = date.today()
        fills_v1 = [
            {"fill_date": (today - timedelta(days=10)).isoformat(), "vehicle_reg": "TEST-FV1",
             "fill_type": "diesel", "litres": 100, "odometer": 100000, "cost": 150},
            {"fill_date": (today - timedelta(days=5)).isoformat(), "vehicle_reg": "TEST-FV1",
             "fill_type": "diesel", "litres": 50, "odometer": 100800, "cost": 75},
        ]
        fills_v2 = [
            {"fill_date": (today - timedelta(days=10)).isoformat(), "vehicle_reg": "TEST-FV2",
             "fill_type": "diesel", "litres": 100, "odometer": 200000, "cost": 150},
            {"fill_date": (today - timedelta(days=5)).isoformat(), "vehicle_reg": "TEST-FV2",
             "fill_type": "diesel", "litres": 100, "odometer": 200400, "cost": 150},
        ]
        for p in fills_v1 + fills_v2:
            r = requests.post(f"{API}/fuel", json=p, headers=headers)
            assert r.status_code in (200, 201), f"fuel seed failed: {r.status_code} {r.text} for {p}"

    def test_fuel_summary_returns_vehicles(self, headers):
        r = requests.get(f"{API}/fuel/summary", headers=headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "vehicles" in data
        regs = {v["vehicle_reg"]: v for v in data["vehicles"]}
        assert "TEST-FV1" in regs and "TEST-FV2" in regs
        v1 = regs["TEST-FV1"]
        v2 = regs["TEST-FV2"]
        # Both should have avg_mpg
        assert v1.get("avg_mpg") is not None, f"v1 no mpg: {v1}"
        assert v2.get("avg_mpg") is not None, f"v2 no mpg: {v2}"
        # v1 traveled 800 km / 50 L, v2 traveled 400 km / 100 L → v1 has higher mpg
        assert v1["avg_mpg"] > v2["avg_mpg"], f"expected v1>v2 mpg, got v1={v1['avg_mpg']} v2={v2['avg_mpg']}"

    def test_fuel_summary_date_filter(self, headers):
        today = date.today()
        r = requests.get(
            f"{API}/fuel/summary?from_date={(today - timedelta(days=30)).isoformat()}&to_date={today.isoformat()}",
            headers=headers,
        )
        assert r.status_code == 200
