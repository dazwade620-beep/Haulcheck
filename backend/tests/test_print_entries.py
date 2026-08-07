"""Test universal single-entry PDF /api/print/{kind}/{entry_id} endpoint."""
import os
import pytest
import requests
from pathlib import Path

def _load_env():
    p = Path("/app/frontend/.env")
    if p.exists():
        for line in p.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())
_load_env()
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
EMAIL = "manager@haulcheck.co.uk"
PASSWORD = "Test1234!"

KINDS = ["walkaround", "defect", "service", "repair", "wheel", "training",
         "insurance", "tacho", "recall", "prohibition", "compliance-doc",
         "document", "fuel"]

# Collection map (kind -> mongo collection) mirrors ENTRY_SPECS
COLLECTIONS = {
    "walkaround": "walkaround_checks", "defect": "defects", "service": "service_records",
    "repair": "repairs", "wheel": "wheel_audits", "training": "training",
    "insurance": "insurance", "tacho": "tacho", "recall": "recalls",
    "prohibition": "prohibitions", "compliance-doc": "compliance_docs",
    "document": "documents", "fuel": "fuel",
}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def H(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def user_id(H):
    r = requests.get(f"{BASE}/api/auth/me", headers=H, timeout=30)
    assert r.status_code == 200
    return r.json().get("user_id") or r.json().get("id")


@pytest.fixture(scope="module")
def entry_ids(H):
    """Fetch one entry id per kind by listing common endpoints. Return dict kind->id (or None)."""
    endpoints = {
        "walkaround": "/api/walkarounds",
        "defect": "/api/defects",
        "service": "/api/service",
        "repair": "/api/repairs",
        "wheel": "/api/wheel-audits",
        "training": "/api/training",
        "insurance": "/api/insurance",
        "tacho": "/api/tacho",
        "recall": "/api/recalls",
        "prohibition": "/api/prohibitions",
        "compliance-doc": "/api/compliance-docs",
        "document": "/api/documents",
        "fuel": "/api/fuel",
    }
    ids = {}
    for kind, path in endpoints.items():
        try:
            r = requests.get(f"{BASE}{path}", headers=H, timeout=30)
            if r.status_code == 200:
                data = r.json()
                items = data if isinstance(data, list) else (data.get("items") or data.get("results") or [])
                if items:
                    ids[kind] = items[0].get("id")
                else:
                    ids[kind] = None
            else:
                ids[kind] = None
        except Exception:
            ids[kind] = None
    print("Discovered entry ids:", ids)
    return ids


@pytest.mark.parametrize("kind", KINDS)
def test_print_pdf_returns_200(kind, H, entry_ids):
    eid = entry_ids.get(kind)
    if not eid:
        pytest.skip(f"No seeded {kind} record")
    r = requests.get(f"{BASE}/api/print/{kind}/{eid}", headers=H, timeout=60)
    assert r.status_code == 200, f"{kind}: {r.status_code} {r.text[:200]}"
    assert r.headers.get("content-type", "").startswith("application/pdf"), r.headers
    assert r.content[:4] == b"%PDF", "response is not a PDF"


@pytest.mark.parametrize("kind", KINDS)
def test_print_json_format(kind, H, entry_ids):
    eid = entry_ids.get(kind)
    if not eid:
        pytest.skip(f"No seeded {kind} record")
    r = requests.get(f"{BASE}/api/print/{kind}/{eid}?format=json", headers=H, timeout=30)
    assert r.status_code == 200
    j = r.json()
    for key in ("title", "subtitle", "sections"):
        assert key in j, f"{kind} json missing {key}"


@pytest.mark.parametrize("kind", KINDS)
def test_print_include_files(kind, H, entry_ids):
    eid = entry_ids.get(kind)
    if not eid:
        pytest.skip(f"No seeded {kind} record")
    r = requests.get(f"{BASE}/api/print/{kind}/{eid}?include_files=true", headers=H, timeout=60)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/pdf")


def test_print_unknown_kind_404(H, entry_ids):
    # Use any real id if available, otherwise a dummy id — either way unknown kind => 404
    any_id = next((v for v in entry_ids.values() if v), "abc123")
    r = requests.get(f"{BASE}/api/print/bogus-kind/{any_id}", headers=H, timeout=30)
    assert r.status_code == 404


def test_print_unknown_id_404(H):
    r = requests.get(f"{BASE}/api/print/walkaround/nonexistent-id-zzz", headers=H, timeout=30)
    assert r.status_code == 404


def test_print_requires_auth():
    r = requests.get(f"{BASE}/api/print/walkaround/anything", timeout=30)
    assert r.status_code in (401, 403)
