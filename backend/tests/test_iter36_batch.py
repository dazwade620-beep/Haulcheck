"""Iteration-36 tests: PG9 dashboard alert, alert->job card, job-card status board,
maintenance costs, defect rectify auto-completes job card, regression on iter34/iter35.
"""
import os
import uuid
import pytest
import requests

def _load_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v: return v
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL missing")

BASE = _load_url().rstrip("/")
API = f"{BASE}/api"
MANAGER = {"email": "manager@haulcheck.co.uk", "password": "Test1234!"}
VEH = "AB12 CDE"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json=MANAGER, timeout=30)
    if r.status_code != 200:
        # try register
        requests.post(f"{API}/auth/register", json={**MANAGER, "name": "Manager"}, timeout=30)
        r = requests.post(f"{API}/auth/login", json=MANAGER, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- 1) PG9 dashboard alert ----------
def test_prohibition_appears_on_dashboard(h):
    payload = {
        "vehicle_reg": VEH,
        "encounter_date": "2026-01-10",
        "prohibition_type": "immediate",
        "issuing_authority": "DVSA",
        "reason": "TEST_iter36 brake defect",
        "status": "open",
    }
    r = requests.post(f"{API}/prohibitions", json=payload, headers=h, timeout=30)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    try:
        d = requests.get(f"{API}/dashboard", headers=h, timeout=30).json()
        alerts = d.get("alerts") or []
        proh = [a for a in alerts if a.get("type") == "prohibition"]
        assert proh, f"No prohibition alert on dashboard: {alerts[:5]}"
        assert proh[0]["status"] == "expired"
        # clear
        cleared = {**payload, "status": "cleared"}
        r2 = requests.put(f"{API}/prohibitions/{pid}", json=cleared, headers=h, timeout=30)
        assert r2.status_code == 200
        d2 = requests.get(f"{API}/dashboard", headers=h, timeout=30).json()
        after = [a for a in (d2.get("alerts") or []) if a.get("type") == "prohibition" and a.get("name") == VEH]
        assert not after, "Prohibition still on dashboard after clear"
    finally:
        requests.delete(f"{API}/prohibitions/{pid}", headers=h, timeout=30)


# ---------- 2) Raise job card from alert ----------
def test_raise_job_card_from_alert(h):
    # Creating a defect creates a defect_alert record too
    dr = requests.post(f"{API}/defects", json={
        "vehicle_reg": VEH,
        "description": "TEST_iter36 brake pad worn",
        "severity": "major",
        "reported_by": "tester",
    }, headers=h, timeout=30)
    assert dr.status_code == 200, dr.text
    defect = dr.json()
    did = defect["id"]
    created_jcs = []
    try:
        alerts = requests.get(f"{API}/alerts", headers=h, timeout=30).json()
        cand = [a for a in alerts if a.get("vehicle_reg") == VEH]
        assert cand, "No alert with vehicle_reg found"
        aid = cand[0]["id"]
        r = requests.post(f"{API}/alerts/{aid}/job-card", headers=h, timeout=30)
        assert r.status_code == 200, r.text
        jc = r.json()
        assert jc.get("source") == "alert"
        assert jc.get("source_ref") == f"alert:{aid}"
        created_jcs.append(jc["id"])
        # dedup 409
        r2 = requests.post(f"{API}/alerts/{aid}/job-card", headers=h, timeout=30)
        assert r2.status_code == 409, f"Expected 409 dedup, got {r2.status_code}"
    finally:
        # cleanup: defect auto-created a job card too (source=defect)
        jcs = requests.get(f"{API}/job-cards", headers=h, timeout=30).json()
        for jc in jcs:
            if jc.get("source_ref") == did or jc["id"] in created_jcs:
                requests.delete(f"{API}/job-cards/{jc['id']}", headers=h, timeout=30)
        requests.delete(f"{API}/defects/{did}", headers=h, timeout=30)


# ---------- 3) Job card status board / PUT status ----------
def test_job_card_status_transitions(h):
    r = requests.post(f"{API}/job-cards", json={
        "vehicle_reg": VEH, "date_raised": "2026-01-10",
        "work_requested": "TEST_iter36 board move",
    }, headers=h, timeout=30)
    assert r.status_code == 200
    jid = r.json()["id"]
    try:
        for s in ("in_progress", "completed", "open"):
            r2 = requests.put(f"{API}/job-cards/{jid}/status", json={"status": s}, headers=h, timeout=30)
            assert r2.status_code == 200, r2.text
            got = [j for j in requests.get(f"{API}/job-cards", headers=h, timeout=30).json() if j["id"] == jid][0]
            assert got["status"] == s
        r3 = requests.put(f"{API}/job-cards/{jid}/status", json={"status": "bogus"}, headers=h, timeout=30)
        assert r3.status_code == 400
    finally:
        requests.delete(f"{API}/job-cards/{jid}", headers=h, timeout=30)


# ---------- 4) Maintenance costs ----------
def test_maintenance_costs(h):
    r = requests.get(f"{API}/maintenance/costs", headers=h, timeout=30)
    assert r.status_code == 200, r.text
    baseline = r.json()
    assert "rows" in baseline and "totals" in baseline and "currency" in baseline
    base_total = baseline["totals"]["total"]
    # Add job card with cost 200
    cr = requests.post(f"{API}/job-cards", json={
        "vehicle_reg": VEH, "date_raised": "2026-01-10",
        "work_requested": "TEST_iter36 cost", "cost": 200,
    }, headers=h, timeout=30)
    assert cr.status_code == 200
    jid = cr.json()["id"]
    try:
        after = requests.get(f"{API}/maintenance/costs", headers=h, timeout=30).json()
        assert round(after["totals"]["total"] - base_total, 2) >= 200.0
        row = [r for r in after["rows"] if r["vehicle_reg"] == VEH]
        assert row and row[0]["job_cards"] >= 200
    finally:
        requests.delete(f"{API}/job-cards/{jid}", headers=h, timeout=30)


# ---------- 5) Defect rectify auto-completes job card ----------
def test_defect_rectify_completes_job_card(h):
    dr = requests.post(f"{API}/defects", json={
        "vehicle_reg": VEH,
        "description": "TEST_iter36 rectify flow",
        "severity": "minor",
        "reported_by": "tester",
    }, headers=h, timeout=30)
    assert dr.status_code == 200
    did = dr.json()["id"]
    try:
        jcs = requests.get(f"{API}/job-cards", headers=h, timeout=30).json()
        linked = [j for j in jcs if j.get("source_ref") == did]
        assert linked, "Auto job card not created for defect"
        jc = linked[0]
        assert jc["status"] == "open"
        assert jc.get("source") == "defect"
        rr = requests.put(f"{API}/defects/{did}/rectify", json={
            "rectified_by": "Joe", "rectification_notes": "fixed",
        }, headers=h, timeout=30)
        assert rr.status_code == 200
        jcs2 = requests.get(f"{API}/job-cards", headers=h, timeout=30).json()
        jc2 = [j for j in jcs2 if j["id"] == jc["id"]][0]
        assert jc2["status"] == "completed", jc2
        assert "Defect rectified" in (jc2.get("work_carried_out") or "")
    finally:
        # cleanup all linked jc
        for j in requests.get(f"{API}/job-cards", headers=h, timeout=30).json():
            if j.get("source_ref") == did:
                requests.delete(f"{API}/job-cards/{j['id']}", headers=h, timeout=30)
        requests.delete(f"{API}/defects/{did}", headers=h, timeout=30)


# ---------- 6) Regression ----------
def test_regression_endpoints(h):
    # Job cards
    r = requests.get(f"{API}/job-cards", headers=h, timeout=30); assert r.status_code == 200
    # Compliance docs
    r = requests.get(f"{API}/compliance-docs", headers=h, timeout=30); assert r.status_code == 200
    # Prohibitions
    r = requests.get(f"{API}/prohibitions", headers=h, timeout=30); assert r.status_code == 200
    # Audit pack
    r = requests.get(f"{API}/reports/audit", headers=h, timeout=60)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/pdf") or r.content[:4] == b"%PDF"
