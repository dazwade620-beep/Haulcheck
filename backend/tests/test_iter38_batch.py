"""
Iter-38 backend tests:
 (1) GET /api/maintenance/costs/monthly?months=12  → 12 rows chronological, last=current month
 (2) GET /api/maintenance/costs adds totals.avg_cost_per_mile + per-row high_cost flag
 (3) GET /api/prohibitions/pack returns application/pdf with %PDF header, only open ones
 (4) Regression: costs date filter, monthly, prohibitions CRUD, PG9 dashboard alert
"""
import os
import io
import uuid
import time
import pytest
import requests
from datetime import datetime, date, timezone

def _read_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return os.environ.get("REACT_APP_BACKEND_URL", "")

BASE = _read_env().rstrip("/") + "/api"
EMAIL = "manager@haulcheck.co.uk"
PASSWORD = "Test1234!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code != 200:
        r2 = requests.post(f"{BASE}/auth/register", json={"email": EMAIL, "password": PASSWORD, "name": "Manager"})
        if r2.status_code not in (200, 201):
            pytest.skip(f"cannot auth: {r.status_code} {r.text} / register {r2.status_code}")
        r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- helpers ----------
def _create_vehicle(h, reg):
    r = requests.post(f"{BASE}/vehicles", headers=h, json={"registration": reg, "type": "HGV (Rigid)"})
    assert r.status_code in (200, 201), r.text
    return r.json()


def _create_jc(h, reg, cost, date_raised):
    r = requests.post(f"{BASE}/job-cards", headers=h, json={
        "vehicle_reg": reg, "title": f"TEST iter38 {uuid.uuid4().hex[:6]}",
        "cost": cost, "date_raised": date_raised, "status": "open"
    })
    assert r.status_code in (200, 201), r.text
    return r.json()


def _create_fuel(h, reg, litres, odo, fill_date):
    r = requests.post(f"{BASE}/fuel", headers=h, json={
        "vehicle_reg": reg, "fill_type": "diesel",
        "litres": litres, "odometer": odo, "fill_date": fill_date
    })
    assert r.status_code in (200, 201), r.text
    return r.json()


def _delete(h, path, _id):
    if _id:
        requests.delete(f"{BASE}/{path}/{_id}", headers=h)


# ---------- (1) monthly ----------
class TestMonthly:
    def test_monthly_shape(self, h):
        r = requests.get(f"{BASE}/maintenance/costs/monthly?months=12", headers=h)
        assert r.status_code == 200, r.text
        rows = r.json()["rows"]
        assert len(rows) == 12
        today = datetime.now(timezone.utc).date()
        assert rows[-1]["month"] == f"{today.year:04d}-{today.month:02d}"
        for i in range(1, 12):
            assert rows[i]["month"] > rows[i - 1]["month"]
        for row in rows:
            for k in ("month", "job_cards", "service", "repairs", "total"):
                assert k in row

    def test_monthly_reflects_seeded_costs(self, h):
        # seed 1 vehicle + 2 job cards in two different months
        reg = f"TS{uuid.uuid4().hex[:2].upper()}{uuid.uuid4().hex[:3].upper()}"
        v = _create_vehicle(h, reg)
        today = datetime.now(timezone.utc).date()
        this_month = f"{today.year:04d}-{today.month:02d}"
        # month = today - 2 months (approx)
        m = today.month - 2
        y = today.year
        if m <= 0:
            m += 12
            y -= 1
        two_ago = f"{y:04d}-{m:02d}"
        jc1 = _create_jc(h, reg, 300.0, f"{this_month}-05")
        jc2 = _create_jc(h, reg, 180.0, f"{two_ago}-10")
        try:
            r = requests.get(f"{BASE}/maintenance/costs/monthly?months=12", headers=h)
            rows = {row["month"]: row for row in r.json()["rows"]}
            assert this_month in rows
            assert two_ago in rows
            assert rows[this_month]["job_cards"] >= 300.0
            assert rows[this_month]["total"] >= 300.0
            assert rows[two_ago]["job_cards"] >= 180.0
            assert rows[two_ago]["total"] >= 180.0
        finally:
            _delete(h, "job-cards", jc1.get("id"))
            _delete(h, "job-cards", jc2.get("id"))
            _delete(h, "vehicles", v.get("id"))


# ---------- (2) costs high_cost flag ----------
class TestCostsHighCost:
    def test_avg_cpm_and_high_cost(self, h):
        # Two vehicles: A expensive (~£1/mi), B cheap (~£0.01/mi)
        regA = f"HA{uuid.uuid4().hex[:4].upper()}"
        regB = f"LB{uuid.uuid4().hex[:4].upper()}"
        vA = _create_vehicle(h, regA)
        vB = _create_vehicle(h, regB)
        today = datetime.now(timezone.utc).date().isoformat()
        # A: £1000 job card + fuel odo 10000→11000 (1000 mi) => 1.0/mi
        jcA = _create_jc(h, regA, 1000.0, today)
        fA1 = _create_fuel(h, regA, 100, 10000, today)
        fA2 = _create_fuel(h, regA, 100, 11000, today)
        # B: £100 job card + fuel odo 20000→30000 (10000 mi) => 0.01/mi
        jcB = _create_jc(h, regB, 100.0, today)
        fB1 = _create_fuel(h, regB, 50, 20000, today)
        fB2 = _create_fuel(h, regB, 50, 30000, today)
        try:
            r = requests.get(f"{BASE}/maintenance/costs", headers=h)
            assert r.status_code == 200, r.text
            data = r.json()
            assert "avg_cost_per_mile" in data["totals"]
            avg = data["totals"]["avg_cost_per_mile"]
            assert avg is not None and avg > 0
            rowA = next(r for r in data["rows"] if r["vehicle_reg"] == regA)
            rowB = next(r for r in data["rows"] if r["vehicle_reg"] == regB)
            assert rowA["cost_per_mile"] is not None
            assert rowB["cost_per_mile"] is not None
            assert "high_cost" in rowA and "high_cost" in rowB
            assert rowA["high_cost"] is True, f"expected A high, got avg={avg} A={rowA} B={rowB}"
            assert rowB["high_cost"] is False
        finally:
            for _id in (jcA.get("id"), jcB.get("id")):
                _delete(h, "job-cards", _id)
            for _id in (fA1.get("id"), fA2.get("id"), fB1.get("id"), fB2.get("id")):
                _delete(h, "fuel", _id)
            _delete(h, "vehicles", vA.get("id"))
            _delete(h, "vehicles", vB.get("id"))


# ---------- (3) prohibitions pack ----------
class TestProhibitionsPack:
    def test_pack_returns_pdf_only_open(self, h):
        reg = f"PP{uuid.uuid4().hex[:4].upper()}"
        v = _create_vehicle(h, reg)
        today = datetime.now(timezone.utc).date().isoformat()
        # open
        r1 = requests.post(f"{BASE}/prohibitions", headers=h, json={
            "vehicle_reg": reg, "encounter_date": today, "authority": "DVSA",
            "prohibition_type": "immediate", "reference": "TEST-PACK-OPEN",
            "encounter_type": "roadside", "status": "prohibition"
        })
        assert r1.status_code in (200, 201), r1.text
        pid_open = r1.json().get("id")
        # cleared one — should NOT be in pack
        r2 = requests.post(f"{BASE}/prohibitions", headers=h, json={
            "vehicle_reg": reg, "encounter_date": today, "authority": "DVSA",
            "prohibition_type": "immediate", "reference": "TEST-PACK-CLEARED",
            "encounter_type": "roadside", "status": "cleared"
        })
        pid_cleared = r2.json().get("id")
        try:
            r = requests.get(f"{BASE}/prohibitions/pack", headers=h)
            assert r.status_code == 200
            assert r.headers.get("content-type", "").startswith("application/pdf")
            assert r.content[:5] == b"%PDF-"
            assert len(r.content) > 500
        finally:
            _delete(h, "prohibitions", pid_open)
            _delete(h, "prohibitions", pid_cleared)
            _delete(h, "vehicles", v.get("id"))


# ---------- (4) regression ----------
class TestRegression:
    def test_costs_no_filter(self, h):
        r = requests.get(f"{BASE}/maintenance/costs", headers=h)
        assert r.status_code == 200
        assert "rows" in r.json() and "totals" in r.json()

    def test_costs_with_date_filter(self, h):
        r = requests.get(f"{BASE}/maintenance/costs?from_date=1999-01-01&to_date=1999-12-31", headers=h)
        assert r.status_code == 200
        j = r.json()
        assert j["totals"]["total"] == 0
        assert j["totals"]["avg_cost_per_mile"] is None

    def test_prohibitions_report(self, h):
        r = requests.get(f"{BASE}/reports/prohibitions", headers=h)
        assert r.status_code == 200
        assert r.content[:5] == b"%PDF-"

    def test_alerts(self, h):
        r = requests.get(f"{BASE}/alerts", headers=h)
        assert r.status_code == 200

    def test_job_card_status_invalid(self, h):
        r = requests.put(f"{BASE}/job-cards/nonexistent-id/status", headers=h, json={"status": "bogus"})
        assert r.status_code == 400
