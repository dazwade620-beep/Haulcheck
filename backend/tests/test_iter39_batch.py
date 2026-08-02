"""
Iter-39: Email verification, EU region, brake-test gap, super-admin, staff role.
"""
import os
import uuid
import time
import pytest
import requests
from pymongo import MongoClient

def _load_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    except Exception:
        pass
    return ""

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or _load_env()
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "manager@haulcheck.co.uk"
ADMIN_PASS = "Test1234!"

# Direct DB access for verification token retrieval + cleanup
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
_mc = MongoClient(MONGO_URL)
db = _mc[DB_NAME]


# ---------- helpers ----------

def _rand_email():
    return f"qa_{uuid.uuid4().hex[:10]}@example.com"


def _register(email, password="Test1234!", name="QA User"):
    return requests.post(f"{API}/auth/register", json={
        "email": email, "password": password, "name": name, "base_url": BASE_URL
    })


def _verify_via_token(email):
    rec = db.email_verifications.find_one({"email": email})
    assert rec, f"no email_verifications row for {email}"
    return requests.post(f"{API}/auth/verify", json={"email": email, "token": rec["token"]})


def _login(email, password="Test1234!"):
    return requests.post(f"{API}/auth/login", json={"email": email, "password": password})


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_token():
    r = _login(ADMIN_EMAIL, ADMIN_PASS)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture
def fresh_verified_user():
    """Create + verify a fresh user; yields (email, password, token, user_id). Cleans up."""
    email = _rand_email()
    _register(email)
    v = _verify_via_token(email)
    assert v.status_code == 200, v.text
    tok = v.json()["token"]
    uid = v.json()["user"]["user_id"]
    yield {"email": email, "password": "Test1234!", "token": tok, "user_id": uid}
    # cleanup
    db.users.delete_many({"email": email})
    db.email_verifications.delete_many({"email": email})
    db.vehicles.delete_many({"user_id": uid})


# ========== 1. EMAIL VERIFICATION ==========

class TestEmailVerification:
    def test_register_returns_needs_verification(self):
        email = _rand_email()
        try:
            r = _register(email)
            assert r.status_code == 200, r.text
            j = r.json()
            assert j.get("needs_verification") is True
            assert j.get("email") == email
            assert "token" not in j  # no JWT
            rec = db.email_verifications.find_one({"email": email})
            assert rec is not None
            assert rec.get("token")  # plaintext
            assert rec.get("code_hash")
        finally:
            db.users.delete_many({"email": email})
            db.email_verifications.delete_many({"email": email})

    def test_login_before_verify_blocked(self):
        email = _rand_email()
        try:
            _register(email)
            r = _login(email)
            assert r.status_code == 403
            assert "email_not_verified" in r.text
        finally:
            db.users.delete_many({"email": email})
            db.email_verifications.delete_many({"email": email})

    def test_verify_with_token_logs_in(self):
        email = _rand_email()
        try:
            _register(email)
            v = _verify_via_token(email)
            assert v.status_code == 200, v.text
            assert v.json().get("token")
            u = db.users.find_one({"email": email})
            assert u["email_verified"] is True
            # login now works
            r = _login(email)
            assert r.status_code == 200
        finally:
            db.users.delete_many({"email": email})
            db.email_verifications.delete_many({"email": email})

    def test_wrong_code_400_then_429(self):
        email = _rand_email()
        try:
            _register(email)
            # 6 wrong codes -> 429 on the 7th (or 6th based on check >=6)
            statuses = []
            for _ in range(7):
                r = requests.post(f"{API}/auth/verify", json={"email": email, "code": "000000"})
                statuses.append(r.status_code)
            assert 400 in statuses
            assert 429 in statuses, f"expected 429 in {statuses}"
        finally:
            db.users.delete_many({"email": email})
            db.email_verifications.delete_many({"email": email})

    def test_resend_verification_ok(self):
        email = _rand_email()
        try:
            _register(email)
            r = requests.post(f"{API}/auth/resend-verification", json={"email": email, "base_url": BASE_URL})
            assert r.status_code == 200
            assert r.json().get("ok") is True
        finally:
            db.users.delete_many({"email": email})
            db.email_verifications.delete_many({"email": email})

    def test_existing_admin_grandfathered(self):
        # admin login must still work
        r = _login(ADMIN_EMAIL, ADMIN_PASS)
        assert r.status_code == 200


# ========== 2. REGION EU ==========

class TestRegionEU:
    def test_set_region_eu_and_back(self, admin_token):
        try:
            r = requests.put(f"{API}/settings/region", json={"region": "EU"}, headers=_hdr(admin_token))
            assert r.status_code == 200
            assert r.json()["region"] == "EU"
            me = requests.get(f"{API}/auth/me", headers=_hdr(admin_token))
            assert me.json().get("region") == "EU"
            # invalid
            bad = requests.put(f"{API}/settings/region", json={"region": "XX"}, headers=_hdr(admin_token))
            assert bad.status_code == 400
            # costs currency €
            costs = requests.get(f"{API}/maintenance/costs", headers=_hdr(admin_token))
            assert costs.status_code == 200
            assert costs.json().get("currency") == "€"
        finally:
            requests.put(f"{API}/settings/region", json={"region": "UK"}, headers=_hdr(admin_token))


# ========== 3. BRAKE-TEST GAP ==========

class TestBrakeTestGap:
    def test_uk_brake_gap_high_priority(self, fresh_verified_user):
        u = fresh_verified_user
        # region should default UK
        me = requests.get(f"{API}/auth/me", headers=_hdr(u["token"])).json()
        assert me.get("region") == "UK"
        # add a vehicle (no pmi_record with brake test)
        v = requests.post(f"{API}/vehicles", json={
            "registration": "TEST01", "make": "T", "model": "M"
        }, headers=_hdr(u["token"]))
        assert v.status_code == 200, v.text
        # get risk insight
        r = requests.post(f"{API}/ai/risk-insight", headers=_hdr(u["token"]))
        assert r.status_code == 200, r.text
        gaps = r.json().get("gaps", []) or r.json().get("checklist", [])
        # search for brake gap
        brake_gaps = [g for g in gaps if "brake" in str(g).lower()]
        assert brake_gaps, f"no brake gap found in {gaps}"
        # priority high
        assert any(g.get("priority") == "high" for g in brake_gaps if isinstance(g, dict)), \
            f"brake gap not high priority: {brake_gaps}"
        # risk_score < 100
        dash = requests.get(f"{API}/dashboard", headers=_hdr(u["token"]))
        assert dash.status_code == 200
        assert dash.json().get("risk_score", 100) < 100

    def test_eu_no_brake_gap(self, fresh_verified_user):
        u = fresh_verified_user
        requests.put(f"{API}/settings/region", json={"region": "EU"}, headers=_hdr(u["token"]))
        requests.post(f"{API}/vehicles", json={"registration": "TEST02", "make": "T", "model": "M"},
                      headers=_hdr(u["token"]))
        r = requests.post(f"{API}/ai/risk-insight", headers=_hdr(u["token"]))
        gaps = r.json().get("gaps", []) or r.json().get("checklist", [])
        brake_gaps = [g for g in gaps if "brake" in str(g).lower()]
        assert not brake_gaps, f"EU should not have brake gap: {brake_gaps}"

    def test_ie_no_brake_gap(self, fresh_verified_user):
        u = fresh_verified_user
        requests.put(f"{API}/settings/region", json={"region": "IE"}, headers=_hdr(u["token"]))
        requests.post(f"{API}/vehicles", json={"registration": "TEST03", "make": "T", "model": "M"},
                      headers=_hdr(u["token"]))
        r = requests.post(f"{API}/ai/risk-insight", headers=_hdr(u["token"]))
        gaps = r.json().get("gaps", []) or r.json().get("checklist", [])
        brake_gaps = [g for g in gaps if "brake" in str(g).lower()]
        assert not brake_gaps, f"IE should not have brake gap: {brake_gaps}"


# ========== 4 & 5. SUPER-ADMIN + SUSPEND ==========

class TestAdminPanel:
    def test_admin_list_users(self, admin_token):
        r = requests.get(f"{API}/admin/users", headers=_hdr(admin_token))
        assert r.status_code == 200
        j = r.json()
        assert "users" in j and "stats" in j
        s = j["stats"]
        for k in ("total", "active", "suspended", "verified", "unverified", "by_region", "owners"):
            assert k in s, f"missing stat key {k}"
        assert set(s["by_region"].keys()) == {"UK", "IE", "EU"}

    def test_non_admin_403(self, fresh_verified_user):
        r = requests.get(f"{API}/admin/users", headers=_hdr(fresh_verified_user["token"]))
        assert r.status_code == 403

    def test_me_is_admin_flag(self, admin_token, fresh_verified_user):
        m1 = requests.get(f"{API}/auth/me", headers=_hdr(admin_token)).json()
        assert m1.get("is_admin") is True
        m2 = requests.get(f"{API}/auth/me", headers=_hdr(fresh_verified_user["token"])).json()
        assert m2.get("is_admin") is False

    def test_suspend_reactivate_flow(self, admin_token, fresh_verified_user):
        u = fresh_verified_user
        uid = u["user_id"]
        # suspend
        r = requests.put(f"{API}/admin/users/{uid}/active", json={"active": False}, headers=_hdr(admin_token))
        assert r.status_code == 200
        assert r.json() == {"ok": True, "active": False}
        # login blocked
        lg = _login(u["email"])
        assert lg.status_code == 403
        # existing token rejected
        me = requests.get(f"{API}/auth/me", headers=_hdr(u["token"]))
        assert me.status_code == 401
        # reactivate
        r2 = requests.put(f"{API}/admin/users/{uid}/active", json={"active": True}, headers=_hdr(admin_token))
        assert r2.status_code == 200
        # login works
        lg2 = _login(u["email"])
        assert lg2.status_code == 200

    def test_cannot_suspend_self(self, admin_token):
        me = requests.get(f"{API}/auth/me", headers=_hdr(admin_token)).json()
        r = requests.put(f"{API}/admin/users/{me['user_id']}/active",
                         json={"active": False}, headers=_hdr(admin_token))
        assert r.status_code == 400

    def test_cannot_suspend_another_admin(self, admin_token):
        # find the other admin
        other = db.users.find_one({"email": "traffic@dlz-international.com"})
        if not other:
            pytest.skip("other admin not in DB")
        r = requests.put(f"{API}/admin/users/{other['user_id']}/active",
                         json={"active": False}, headers=_hdr(admin_token))
        assert r.status_code == 400


# ========== 6. STAFF ROLE ==========

class TestStaffRole:
    def test_staff_invite_and_edit(self, admin_token):
        staff_email = _rand_email()
        try:
            # create invitation
            inv = requests.post(f"{API}/invitations", json={
                "email": staff_email, "role": "staff", "base_url": BASE_URL
            }, headers=_hdr(admin_token))
            assert inv.status_code == 200, inv.text
            # find token in db
            inv_doc = db.invitations.find_one({"email": staff_email})
            assert inv_doc and inv_doc.get("role") == "staff"
            token = inv_doc["token"]
            # accept invite
            ar = requests.post(f"{API}/auth/accept-invite", json={
                "token": token, "name": "Staff QA", "password": "Test1234!"
            })
            assert ar.status_code == 200, ar.text
            staff_tok = ar.json()["token"]
            staff_uid = ar.json()["user"]["user_id"]
            # DB check
            staff_doc = db.users.find_one({"user_id": staff_uid})
            assert staff_doc["role"] == "staff"
            assert staff_doc["email_verified"] is True
            admin_doc = db.users.find_one({"email": ADMIN_EMAIL})
            assert staff_doc["account_owner_id"] == admin_doc["user_id"]
            # staff can list owner's vehicles
            v = requests.get(f"{API}/vehicles", headers=_hdr(staff_tok))
            assert v.status_code == 200
            # staff can create a vehicle (edit)
            cv = requests.post(f"{API}/vehicles", json={
                "registration": "STAFF01", "make": "T", "model": "M"
            }, headers=_hdr(staff_tok))
            assert cv.status_code == 200, f"staff write should succeed, got {cv.status_code} {cv.text}"
            # cleanup vehicle
            requests.delete(f"{API}/vehicles/{cv.json().get('id') or cv.json().get('vehicle_id') or ''}",
                            headers=_hdr(staff_tok))
        finally:
            db.users.delete_many({"email": staff_email})
            db.invitations.delete_many({"email": staff_email})
            db.vehicles.delete_many({"registration": "STAFF01"})

    def test_viewer_write_blocked(self, admin_token):
        viewer_email = _rand_email()
        try:
            inv = requests.post(f"{API}/invitations", json={
                "email": viewer_email, "role": "viewer", "base_url": BASE_URL
            }, headers=_hdr(admin_token))
            assert inv.status_code == 200
            inv_doc = db.invitations.find_one({"email": viewer_email})
            ar = requests.post(f"{API}/auth/accept-invite", json={
                "token": inv_doc["token"], "name": "Viewer QA", "password": "Test1234!"
            })
            assert ar.status_code == 200
            v_tok = ar.json()["token"]
            # read ok
            gv = requests.get(f"{API}/vehicles", headers=_hdr(v_tok))
            assert gv.status_code == 200
            # write blocked
            cv = requests.post(f"{API}/vehicles", json={
                "registration": "VIEW01", "make": "T", "model": "M"
            }, headers=_hdr(v_tok))
            assert cv.status_code == 403
        finally:
            db.users.delete_many({"email": viewer_email})
            db.invitations.delete_many({"email": viewer_email})
            db.vehicles.delete_many({"registration": "VIEW01"})


# ========== 7. REGRESSION ==========

class TestRegression:
    def test_admin_dashboard(self, admin_token):
        r = requests.get(f"{API}/dashboard", headers=_hdr(admin_token))
        assert r.status_code == 200

    def test_region_uk_ie_still_work(self, admin_token):
        for reg in ("UK", "IE", "EU", "UK"):
            r = requests.put(f"{API}/settings/region", json={"region": reg}, headers=_hdr(admin_token))
            assert r.status_code == 200

    def test_jobcards_prohibitions_costs_load(self, admin_token):
        for path in ("/job-cards", "/prohibitions", "/maintenance/costs"):
            r = requests.get(f"{API}{path}", headers=_hdr(admin_token))
            assert r.status_code == 200, f"{path} -> {r.status_code}"
