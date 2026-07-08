"""
HaulCheck Road Haulage Compliance - Backend API tests.
Covers auth (register/login/me/logout), CRUD for vehicles/drivers/documents/defects,
dashboard, AI risk insight, and data isolation between users.
"""
import os
import uuid
import time
import requests
import pytest
from datetime import date, timedelta

FUTURE_VALID = (date.today() + timedelta(days=120)).isoformat()   # > 30 days -> valid
FUTURE_DUE_SOON = (date.today() + timedelta(days=15)).isoformat()  # <= 30 days -> due_soon
PAST_EXPIRED = (date.today() - timedelta(days=30)).isoformat()     # < 0 -> expired

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    # Fallback to reading frontend/.env directly if env var not present
    from pathlib import Path
    env_path = Path("/app/frontend/.env")
    for line in env_path.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
            break

API = f"{BASE_URL}/api"

SEED_EMAIL = "manager@haulcheck.co.uk"
SEED_PASSWORD = "Test1234!"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def token(s):
    """Get token for the seeded manager account (create if missing)."""
    r = s.post(f"{API}/auth/login", json={"email": SEED_EMAIL, "password": SEED_PASSWORD}, timeout=15)
    if r.status_code == 200:
        return r.json()["token"]
    # try to register
    r = s.post(f"{API}/auth/register", json={"email": SEED_EMAIL, "password": SEED_PASSWORD, "name": "Fleet Manager"}, timeout=15)
    assert r.status_code == 200, f"Seed register failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Auth ----------
class TestAuth:
    def test_register_new_user(self):
        email = f"TEST_{uuid.uuid4().hex[:8]}@haulcheck.co.uk"
        r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Password1!", "name": "TEST User"}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "token" in body and isinstance(body["token"], str) and len(body["token"]) > 20
        assert body["user"]["email"] == email
        assert body["user"]["name"] == "TEST User"

    def test_register_duplicate_email(self):
        email = f"TEST_{uuid.uuid4().hex[:8]}@haulcheck.co.uk"
        r1 = requests.post(f"{API}/auth/register", json={"email": email, "password": "Password1!", "name": "Dup"}, timeout=15)
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/auth/register", json={"email": email, "password": "Password1!", "name": "Dup"}, timeout=15)
        assert r2.status_code == 400

    def test_login_seed_account(self, token):
        assert token and isinstance(token, str)

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": SEED_EMAIL, "password": "wrongpass"}, timeout=15)
        assert r.status_code == 401

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_returns_user(self, auth_headers):
        r = requests.get(f"{API}/auth/me", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["email"] == SEED_EMAIL
        assert "user_id" in body

    def test_logout(self, auth_headers):
        r = requests.post(f"{API}/auth/logout", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True


# ---------- Vehicles ----------
class TestVehicles:
    def test_create_list_edit_delete(self, auth_headers):
        payload = {
            "registration": f"TEST{uuid.uuid4().hex[:4].upper()}",
            "make": "DAF", "model": "XF 480", "type": "HGV",
            "mot_due": FUTURE_VALID,       # future -> valid
            "service_due": FUTURE_DUE_SOON,  # ~15d -> due_soon
            "tax_due": PAST_EXPIRED,        # past -> expired
        }
        r = requests.post(f"{API}/vehicles", json=payload, headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        v = r.json()
        assert v["registration"] == payload["registration"]
        assert "id" in v
        vid = v["id"]

        # List and verify with statuses
        r = requests.get(f"{API}/vehicles", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()
        item = next((x for x in items if x["id"] == vid), None)
        assert item is not None
        assert item["mot_status"] == "valid"
        assert item["tax_status"] == "expired"
        assert item["service_status"] == "due_soon"

        # Edit
        payload2 = {**payload, "make": "Volvo"}
        r = requests.put(f"{API}/vehicles/{vid}", json=payload2, headers=auth_headers, timeout=15)
        assert r.status_code == 200
        r = requests.get(f"{API}/vehicles", headers=auth_headers, timeout=15)
        item = next(x for x in r.json() if x["id"] == vid)
        assert item["make"] == "Volvo"

        # Delete
        r = requests.delete(f"{API}/vehicles/{vid}", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        r = requests.get(f"{API}/vehicles", headers=auth_headers, timeout=15)
        assert not any(x["id"] == vid for x in r.json())

    def test_edit_missing_returns_404(self, auth_headers):
        payload = {"registration": "TEST-404", "make": "", "model": "", "type": "HGV"}
        r = requests.put(f"{API}/vehicles/nonexistent_id", json=payload, headers=auth_headers, timeout=15)
        assert r.status_code == 404

    def test_requires_auth(self):
        r = requests.get(f"{API}/vehicles", timeout=15)
        assert r.status_code == 401


# ---------- Drivers ----------
class TestDrivers:
    def test_create_list_edit_delete(self, auth_headers):
        payload = {
            "name": f"TEST Driver {uuid.uuid4().hex[:4]}",
            "licence_number": "SMITH123",
            "licence_expiry": FUTURE_VALID,
            "cpc_expiry": PAST_EXPIRED,  # expired
            "tacho_card_expiry": FUTURE_DUE_SOON,  # due_soon
            "weekly_hours": 60,
            "max_weekly_hours": 56,
        }
        r = requests.post(f"{API}/drivers", json=payload, headers=auth_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        did = d["id"]

        r = requests.get(f"{API}/drivers", headers=auth_headers, timeout=15)
        item = next(x for x in r.json() if x["id"] == did)
        assert item["cpc_status"] == "expired"
        assert item["hours_status"] == "expired"

        # Edit
        r = requests.put(f"{API}/drivers/{did}", json={**payload, "weekly_hours": 40}, headers=auth_headers, timeout=15)
        assert r.status_code == 200
        r = requests.get(f"{API}/drivers", headers=auth_headers, timeout=15)
        item = next(x for x in r.json() if x["id"] == did)
        assert item["hours_status"] == "valid"

        # Delete
        r = requests.delete(f"{API}/drivers/{did}", headers=auth_headers, timeout=15)
        assert r.status_code == 200


# ---------- Documents ----------
class TestDocuments:
    def test_create_list_edit_delete(self, auth_headers):
        payload = {
            "title": f"TEST Op-Licence {uuid.uuid4().hex[:4]}",
            "doc_type": "Operator Licence",
            "reference": "OB1234567",
            "expiry_date": PAST_EXPIRED,  # expired
        }
        r = requests.post(f"{API}/documents", json=payload, headers=auth_headers, timeout=15)
        assert r.status_code == 200
        doc = r.json()
        did = doc["id"]

        r = requests.get(f"{API}/documents", headers=auth_headers, timeout=15)
        item = next(x for x in r.json() if x["id"] == did)
        assert item["status"] == "expired"
        assert item["days_left"] is not None and item["days_left"] < 0

        # Edit type & expiry
        r = requests.put(f"{API}/documents/{did}", json={**payload, "doc_type": "Insurance", "expiry_date": FUTURE_VALID}, headers=auth_headers, timeout=15)
        assert r.status_code == 200
        r = requests.get(f"{API}/documents", headers=auth_headers, timeout=15)
        item = next(x for x in r.json() if x["id"] == did)
        assert item["doc_type"] == "Insurance"
        assert item["status"] == "valid"

        # Delete
        r = requests.delete(f"{API}/documents/{did}", headers=auth_headers, timeout=15)
        assert r.status_code == 200


# ---------- Defects ----------
class TestDefects:
    def test_create_list_status_delete(self, auth_headers):
        payload = {
            "vehicle_reg": "TEST-DEF01",
            "reported_by": "TEST Driver",
            "category": "Brakes",
            "severity": "safety_critical",
            "description": "Brake warning light on, pedal soft on descent.",
        }
        r = requests.post(f"{API}/defects", json=payload, headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        did = d["id"]
        assert d["vehicle_reg"] == payload["vehicle_reg"]
        assert d["status"] == "open"
        # ai_summary may be empty (zero budget) - just check field exists
        assert "ai_summary" in d

        r = requests.get(f"{API}/defects", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert any(x["id"] == did for x in r.json())

        # Change status via query param
        r = requests.put(f"{API}/defects/{did}/status?status=resolved", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        r = requests.get(f"{API}/defects", headers=auth_headers, timeout=15)
        item = next(x for x in r.json() if x["id"] == did)
        assert item["status"] == "resolved"

        # Delete
        r = requests.delete(f"{API}/defects/{did}", headers=auth_headers, timeout=15)
        assert r.status_code == 200


# ---------- Dashboard + AI ----------
class TestDashboard:
    def test_dashboard_shape(self, auth_headers):
        r = requests.get(f"{API}/dashboard", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "risk_score" in body and isinstance(body["risk_score"], int)
        assert 0 <= body["risk_score"] <= 100
        assert "risk_band" in body
        assert "counts" in body
        for k in ("vehicles", "drivers", "documents", "open_defects", "expired", "due_soon"):
            assert k in body["counts"]
        assert "alerts" in body and isinstance(body["alerts"], list)

    def test_ai_risk_insight_returns_text(self, auth_headers):
        # AI may fail due to zero LLM budget -> fallback text expected
        r = requests.post(f"{API}/ai/risk-insight", headers=auth_headers, timeout=45)
        assert r.status_code == 200
        body = r.json()
        assert "insight" in body and isinstance(body["insight"], str) and len(body["insight"]) > 0
        assert "score" in body


# ---------- PMI Inspections + Calendar ----------
class TestPMI:
    def test_pmi_create_auto_next_due(self, auth_headers):
        """Create a PMI schedule with no next_due; server should auto-calc from today + frequency."""
        reg = f"TEST-P{uuid.uuid4().hex[:4].upper()}"
        r = requests.post(f"{API}/pmi", json={"vehicle_reg": reg, "frequency_weeks": 6, "inspector": "TEST Insp"}, headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["vehicle_reg"] == reg
        assert p["frequency_weeks"] == 6
        assert p["next_due"], "next_due should have been auto-populated"
        # next_due should be ~42 days ahead (6 weeks)
        expected = (date.today() + timedelta(weeks=6))
        got = date.fromisoformat(p["next_due"])
        assert abs((got - expected).days) <= 1
        # Cleanup
        requests.delete(f"{API}/pmi/{p['id']}", headers=auth_headers, timeout=15)

    def test_pmi_full_lifecycle_and_complete(self, auth_headers):
        """Create -> list -> edit -> record inspection (advance next_due) -> record persisted -> delete."""
        reg = f"TEST-P{uuid.uuid4().hex[:4].upper()}"
        r = requests.post(f"{API}/pmi", json={
            "vehicle_reg": reg, "frequency_weeks": 4,
            "next_due": FUTURE_DUE_SOON, "inspector": "TEST"
        }, headers=auth_headers, timeout=15)
        assert r.status_code == 200
        p = r.json(); pid = p["id"]
        assert p["next_due"] == FUTURE_DUE_SOON

        # List and verify status/days_left populated
        r = requests.get(f"{API}/pmi", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        found = next((x for x in r.json() if x["id"] == pid), None)
        assert found is not None
        assert found["status"] in ("due_soon", "valid", "expired")
        assert "days_left" in found

        # Edit
        r = requests.put(f"{API}/pmi/{pid}", json={
            "vehicle_reg": reg, "frequency_weeks": 8,
            "next_due": FUTURE_VALID, "inspector": "TEST Edited", "notes": "edited"
        }, headers=auth_headers, timeout=15)
        assert r.status_code == 200
        r = requests.get(f"{API}/pmi", headers=auth_headers, timeout=15)
        found = next(x for x in r.json() if x["id"] == pid)
        assert found["frequency_weeks"] == 8
        assert found["inspector"] == "TEST Edited"

        # Complete inspection
        insp_date = date.today().isoformat()
        r = requests.post(f"{API}/pmi/{pid}/complete", json={
            "inspection_date": insp_date, "result": "advisory",
            "inspector": "TEST Inspector", "notes": "advisory - tyre wear"
        }, headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        expected_next = (date.today() + timedelta(weeks=8)).isoformat()
        assert body["next_due"] == expected_next
        assert body["record"]["result"] == "advisory"

        # Confirm schedule's next_due advanced (persisted)
        r = requests.get(f"{API}/pmi", headers=auth_headers, timeout=15)
        found = next(x for x in r.json() if x["id"] == pid)
        assert found["next_due"] == expected_next

        # Records endpoint contains new record
        r = requests.get(f"{API}/pmi/records", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        recs = r.json()
        assert any(rr["pmi_id"] == pid and rr["inspection_date"] == insp_date and rr["result"] == "advisory" for rr in recs)

        # Delete schedule
        r = requests.delete(f"{API}/pmi/{pid}", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        r = requests.get(f"{API}/pmi", headers=auth_headers, timeout=15)
        assert not any(x["id"] == pid for x in r.json())

    def test_pmi_complete_missing_schedule_returns_404(self, auth_headers):
        r = requests.post(f"{API}/pmi/nonexistent/complete", json={"inspection_date": date.today().isoformat(), "result": "pass"}, headers=auth_headers, timeout=15)
        assert r.status_code == 404

    def test_pmi_edit_missing_returns_404(self, auth_headers):
        r = requests.put(f"{API}/pmi/nonexistent", json={"vehicle_reg": "X", "frequency_weeks": 6}, headers=auth_headers, timeout=15)
        assert r.status_code == 404

    def test_pmi_requires_auth(self):
        assert requests.get(f"{API}/pmi", timeout=15).status_code == 401
        assert requests.get(f"{API}/pmi/records", timeout=15).status_code == 401


class TestCalendar:
    def test_calendar_returns_events_and_shape(self, auth_headers):
        # Ensure at least one PMI schedule to produce a pmi_due event
        reg = f"TEST-C{uuid.uuid4().hex[:4].upper()}"
        r = requests.post(f"{API}/pmi", json={
            "vehicle_reg": reg, "frequency_weeks": 6,
            "next_due": FUTURE_VALID, "inspector": "TEST"
        }, headers=auth_headers, timeout=15)
        assert r.status_code == 200
        pid = r.json()["id"]

        r = requests.get(f"{API}/calendar", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        events = r.json()
        assert isinstance(events, list)
        # Should contain the pmi_due event we just created
        due_events = [e for e in events if e.get("type") == "pmi_due" and e.get("date") == FUTURE_VALID]
        assert any(reg in (e.get("title") or "") for e in due_events)
        # All events must have required keys
        for e in events:
            assert "date" in e and "type" in e and "title" in e and "status" in e

        requests.delete(f"{API}/pmi/{pid}", headers=auth_headers, timeout=15)

    def test_calendar_requires_auth(self):
        assert requests.get(f"{API}/calendar", timeout=15).status_code == 401


class TestDashboardPMI:
    def test_dashboard_counts_include_pmi_and_alerts(self, auth_headers):
        # Create an expired PMI schedule -> should appear in alerts and counts['pmi']
        reg = f"TEST-D{uuid.uuid4().hex[:4].upper()}"
        r = requests.post(f"{API}/pmi", json={
            "vehicle_reg": reg, "frequency_weeks": 6,
            "next_due": PAST_EXPIRED, "inspector": "TEST"
        }, headers=auth_headers, timeout=15)
        assert r.status_code == 200
        pid = r.json()["id"]

        r = requests.get(f"{API}/dashboard", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "pmi" in body["counts"]
        assert isinstance(body["counts"]["pmi"], int) and body["counts"]["pmi"] >= 1
        # PMI alert should be present for the expired schedule
        pmi_alerts = [a for a in body["alerts"] if a.get("type") == "pmi" and a.get("name") == reg]
        assert pmi_alerts, "Expected an expired PMI alert in dashboard alerts"
        assert pmi_alerts[0]["status"] == "expired"

        requests.delete(f"{API}/pmi/{pid}", headers=auth_headers, timeout=15)


# ---------- Data isolation ----------
class TestIsolation:
    def test_data_scoped_per_user(self):
        # Create two fresh users; user A creates a vehicle; user B should not see it.
        emailA = f"TEST_iso_a_{uuid.uuid4().hex[:6]}@haulcheck.co.uk"
        emailB = f"TEST_iso_b_{uuid.uuid4().hex[:6]}@haulcheck.co.uk"
        rA = requests.post(f"{API}/auth/register", json={"email": emailA, "password": "Password1!", "name": "A"}, timeout=15)
        rB = requests.post(f"{API}/auth/register", json={"email": emailB, "password": "Password1!", "name": "B"}, timeout=15)
        assert rA.status_code == 200 and rB.status_code == 200
        hA = {"Authorization": f"Bearer {rA.json()['token']}"}
        hB = {"Authorization": f"Bearer {rB.json()['token']}"}

        reg = f"ISO{uuid.uuid4().hex[:5].upper()}"
        r = requests.post(f"{API}/vehicles", json={"registration": reg, "make": "DAF", "model": "XF", "type": "HGV"}, headers=hA, timeout=15)
        assert r.status_code == 200

        listA = requests.get(f"{API}/vehicles", headers=hA, timeout=15).json()
        listB = requests.get(f"{API}/vehicles", headers=hB, timeout=15).json()
        assert any(v["registration"] == reg for v in listA)
        assert not any(v["registration"] == reg for v in listB)
