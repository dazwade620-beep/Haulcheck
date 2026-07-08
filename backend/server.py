from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
import jwt
import httpx
import requests
import json
import base64
import tempfile
from passlib.context import CryptContext
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ---------- Object storage ----------
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "haulcheck"
storage_key = None
MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif",
    "webp": "image/webp", "pdf": "application/pdf", "heic": "image/heic",
}


def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------- Helpers ----------
def now_iso():
    return datetime.now(timezone.utc).isoformat()


def days_until(date_str: Optional[str]) -> Optional[int]:
    if not date_str:
        return None
    try:
        d = datetime.fromisoformat(date_str).date()
        return (d - datetime.now(timezone.utc).date()).days
    except Exception:
        return None


def compliance_status(days: Optional[int]) -> str:
    if days is None:
        return "unknown"
    if days < 0:
        return "expired"
    if days <= 30:
        return "due_soon"
    return "valid"


# ---------- Models ----------
class RegisterInput(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "manager"


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class User(BaseModel):
    user_id: str
    email: str
    name: str
    role: str = "manager"
    region: str = "UK"
    picture: Optional[str] = None


class Attachment(BaseModel):
    file_id: str
    filename: str = ""
    content_type: str = ""


class Vehicle(BaseModel):
    id: str = Field(default_factory=lambda: f"veh_{uuid.uuid4().hex[:10]}")
    user_id: str = ""
    registration: str
    make: str = ""
    model: str = ""
    type: str = "HGV"
    mot_due: Optional[str] = None
    service_due: Optional[str] = None
    tax_due: Optional[str] = None
    notes: str = ""
    created_at: str = Field(default_factory=now_iso)


class VehicleInput(BaseModel):
    registration: str
    make: str = ""
    model: str = ""
    type: str = "HGV"
    mot_due: Optional[str] = None
    service_due: Optional[str] = None
    tax_due: Optional[str] = None
    notes: str = ""


class Trailer(BaseModel):
    id: str = Field(default_factory=lambda: f"trl_{uuid.uuid4().hex[:10]}")
    user_id: str = ""
    trailer_number: str
    type: str = "Curtainsider"
    mot_due: Optional[str] = None
    service_due: Optional[str] = None
    notes: str = ""
    created_at: str = Field(default_factory=now_iso)


class TrailerInput(BaseModel):
    trailer_number: str
    type: str = "Curtainsider"
    mot_due: Optional[str] = None
    service_due: Optional[str] = None
    notes: str = ""


class Driver(BaseModel):
    id: str = Field(default_factory=lambda: f"drv_{uuid.uuid4().hex[:10]}")
    user_id: str = ""
    name: str
    licence_number: str = ""
    licence_expiry: Optional[str] = None
    cpc_expiry: Optional[str] = None
    tacho_card_expiry: Optional[str] = None
    weekly_hours: float = 0.0
    max_weekly_hours: float = 56.0
    notes: str = ""
    created_at: str = Field(default_factory=now_iso)


class DriverInput(BaseModel):
    name: str
    licence_number: str = ""
    licence_expiry: Optional[str] = None
    cpc_expiry: Optional[str] = None
    tacho_card_expiry: Optional[str] = None
    weekly_hours: float = 0.0
    max_weekly_hours: float = 56.0
    notes: str = ""


class DefectReport(BaseModel):
    id: str = Field(default_factory=lambda: f"def_{uuid.uuid4().hex[:10]}")
    user_id: str = ""
    vehicle_reg: str
    reported_by: str = ""
    category: str = "General"
    severity: str = "minor"
    description: str
    ai_summary: str = ""
    status: str = "open"
    attachments: List[Attachment] = []
    created_at: str = Field(default_factory=now_iso)


class DefectInput(BaseModel):
    vehicle_reg: str
    reported_by: str = ""
    category: str = "General"
    severity: str = "minor"
    description: str
    attachments: List[Attachment] = []


class ComplianceDoc(BaseModel):
    id: str = Field(default_factory=lambda: f"doc_{uuid.uuid4().hex[:10]}")
    user_id: str = ""
    title: str
    doc_type: str = "Operator Licence"
    reference: str = ""
    expiry_date: Optional[str] = None
    notes: str = ""
    attachments: List[Attachment] = []
    created_at: str = Field(default_factory=now_iso)


class DocInput(BaseModel):
    title: str
    doc_type: str = "Operator Licence"
    reference: str = ""
    expiry_date: Optional[str] = None
    notes: str = ""
    attachments: List[Attachment] = []


class InsurancePolicy(BaseModel):
    id: str = Field(default_factory=lambda: f"ins_{uuid.uuid4().hex[:10]}")
    user_id: str = ""
    policy_type: str = "Motor — Truck"
    insurer: str = ""
    policy_number: str = ""
    start_date: Optional[str] = None
    expiry_date: Optional[str] = None
    cover_amount: str = ""
    notes: str = ""
    needs_review: bool = False
    ai_extracted: bool = False
    attachments: List[Attachment] = []
    created_at: str = Field(default_factory=now_iso)


class InsuranceInput(BaseModel):
    policy_type: str = "Motor — Truck"
    insurer: str = ""
    policy_number: str = ""
    start_date: Optional[str] = None
    expiry_date: Optional[str] = None
    cover_amount: str = ""
    notes: str = ""
    needs_review: bool = False
    attachments: List[Attachment] = []


class TachoRecord(BaseModel):
    id: str = Field(default_factory=lambda: f"tac_{uuid.uuid4().hex[:10]}")
    user_id: str = ""
    source_type: str = "Driver Card"  # Driver Card | Vehicle Unit
    reference: str = ""  # driver name or vehicle reg
    frequency_days: int = 28
    last_download: Optional[str] = None
    next_due: Optional[str] = None
    infringements: int = 0
    notes: str = ""
    attachments: List[Attachment] = []
    created_at: str = Field(default_factory=now_iso)


class TachoInput(BaseModel):
    source_type: str = "Driver Card"
    reference: str = ""
    frequency_days: int = 28
    last_download: Optional[str] = None
    infringements: int = 0
    notes: str = ""
    attachments: List[Attachment] = []


class TachoParseInput(BaseModel):
    file_id: str


class PMISchedule(BaseModel):
    id: str = Field(default_factory=lambda: f"pmi_{uuid.uuid4().hex[:10]}")
    user_id: str = ""
    vehicle_reg: str
    frequency_weeks: int = 6
    next_due: Optional[str] = None
    inspector: str = ""
    notes: str = ""
    created_at: str = Field(default_factory=now_iso)


class PMIInput(BaseModel):
    vehicle_reg: str
    frequency_weeks: int = 6
    next_due: Optional[str] = None
    inspector: str = ""
    notes: str = ""


class PMICompleteInput(BaseModel):
    inspection_date: str
    result: str = "pass"  # pass | advisory | fail
    inspector: str = ""
    notes: str = ""


class TrainingRecord(BaseModel):
    id: str = Field(default_factory=lambda: f"trn_{uuid.uuid4().hex[:10]}")
    user_id: str = ""
    driver_id: str = ""
    driver_name: str = ""
    course_name: str
    category: str = "Driver CPC"
    completed_date: Optional[str] = None
    expiry_date: Optional[str] = None
    provider: str = ""
    notes: str = ""
    attachments: List[Attachment] = []
    created_at: str = Field(default_factory=now_iso)


class TrainingInput(BaseModel):
    driver_id: str = ""
    driver_name: str = ""
    course_name: str
    category: str = "Driver CPC"
    completed_date: Optional[str] = None
    expiry_date: Optional[str] = None
    provider: str = ""
    notes: str = ""
    attachments: List[Attachment] = []


# ---------- Auth ----------
def create_jwt(user_id: str) -> str:
    payload = {"user_id": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


async def _authenticate(cookie_token: Optional[str], bearer: Optional[str]) -> Optional[User]:
    candidate = cookie_token or bearer
    # Google session token
    if candidate:
        session = await db.user_sessions.find_one({"session_token": candidate}, {"_id": 0})
        if session:
            expires_at = session["expires_at"]
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at < datetime.now(timezone.utc):
                return None
            user_doc = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
            if user_doc:
                return User(**user_doc)
    # JWT (email/password)
    if bearer:
        try:
            payload = jwt.decode(bearer, JWT_SECRET, algorithms=["HS256"])
            user_doc = await db.users.find_one({"user_id": payload["user_id"]}, {"_id": 0})
            if user_doc:
                return User(**user_doc)
        except jwt.PyJWTError:
            pass
    return None


async def get_current_user(request: Request) -> User:
    cookie_token = request.cookies.get("session_token")
    auth = request.headers.get("Authorization")
    bearer = auth.split(" ", 1)[1] if auth and auth.startswith("Bearer ") else None
    user = await _authenticate(cookie_token, bearer)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


@api_router.post("/auth/register")
async def register(data: RegisterInput):
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    await db.users.insert_one({
        "user_id": user_id,
        "email": data.email,
        "name": data.name,
        "role": data.role,
        "region": "UK",
        "picture": None,
        "password_hash": pwd_context.hash(data.password),
        "created_at": now_iso(),
    })
    token = create_jwt(user_id)
    return {"token": token, "user": {"user_id": user_id, "email": data.email, "name": data.name, "role": data.role, "region": "UK"}}


@api_router.put("/settings/region")
async def set_region(payload: dict, user: User = Depends(get_current_user)):
    region = payload.get("region", "UK")
    if region not in ("UK", "IE"):
        raise HTTPException(status_code=400, detail="Invalid region")
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"region": region}})
    return {"ok": True, "region": region}


@api_router.post("/auth/login")
async def login(data: LoginInput):
    user_doc = await db.users.find_one({"email": data.email})
    if not user_doc or not user_doc.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not pwd_context.verify(data.password, user_doc["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_jwt(user_doc["user_id"])
    return {"token": token, "user": {"user_id": user_doc["user_id"], "email": user_doc["email"], "name": user_doc["name"], "role": user_doc.get("role", "manager")}}


@api_router.post("/auth/session")
async def google_session(request: Request, response: Response):
    session_id = request.headers.get("X-Session-ID")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session id")
    async with httpx.AsyncClient() as http:
        r = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    data = r.json()
    user_doc = await db.users.find_one({"email": data["email"]}, {"_id": 0})
    if not user_doc:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id, "email": data["email"], "name": data.get("name", ""),
            "role": "manager", "picture": data.get("picture"), "created_at": now_iso(),
        }
        await db.users.insert_one(dict(user_doc))
    else:
        user_id = user_doc["user_id"]
    session_token = data["session_token"]
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": now_iso(),
    })
    response.set_cookie(key="session_token", value=session_token, httponly=True,
                        secure=True, samesite="none", path="/", max_age=7 * 24 * 60 * 60)
    return {"user": {"user_id": user_id, "email": data["email"], "name": data.get("name", ""),
                     "role": "manager", "picture": data.get("picture")}}


@api_router.get("/auth/me", response_model=User)
async def me(user: User = Depends(get_current_user)):
    return user


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_many({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ---------- Vehicles ----------
@api_router.get("/vehicles")
async def list_vehicles(user: User = Depends(get_current_user)):
    docs = await db.vehicles.find({"user_id": user.user_id}, {"_id": 0}).to_list(1000)
    for d in docs:
        d["mot_status"] = compliance_status(days_until(d.get("mot_due")))
        d["service_status"] = compliance_status(days_until(d.get("service_due")))
        d["tax_status"] = compliance_status(days_until(d.get("tax_due")))
    return docs


@api_router.post("/vehicles")
async def create_vehicle(data: VehicleInput, user: User = Depends(get_current_user)):
    v = Vehicle(**data.model_dump(), user_id=user.user_id)
    await db.vehicles.insert_one(v.model_dump())
    return v.model_dump()


@api_router.put("/vehicles/{vid}")
async def update_vehicle(vid: str, data: VehicleInput, user: User = Depends(get_current_user)):
    res = await db.vehicles.update_one({"id": vid, "user_id": user.user_id}, {"$set": data.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return {"ok": True}


@api_router.delete("/vehicles/{vid}")
async def delete_vehicle(vid: str, user: User = Depends(get_current_user)):
    await db.vehicles.delete_one({"id": vid, "user_id": user.user_id})
    return {"ok": True}


# ---------- Trailers ----------
@api_router.get("/trailers")
async def list_trailers(user: User = Depends(get_current_user)):
    docs = await db.trailers.find({"user_id": user.user_id}, {"_id": 0}).to_list(1000)
    for d in docs:
        d["mot_status"] = compliance_status(days_until(d.get("mot_due")))
        d["service_status"] = compliance_status(days_until(d.get("service_due")))
    return docs


@api_router.post("/trailers")
async def create_trailer(data: TrailerInput, user: User = Depends(get_current_user)):
    t = Trailer(**data.model_dump(), user_id=user.user_id)
    await db.trailers.insert_one(t.model_dump())
    return t.model_dump()


@api_router.put("/trailers/{tid}")
async def update_trailer(tid: str, data: TrailerInput, user: User = Depends(get_current_user)):
    res = await db.trailers.update_one({"id": tid, "user_id": user.user_id}, {"$set": data.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Trailer not found")
    return {"ok": True}


@api_router.delete("/trailers/{tid}")
async def delete_trailer(tid: str, user: User = Depends(get_current_user)):
    await db.trailers.delete_one({"id": tid, "user_id": user.user_id})
    return {"ok": True}


# ---------- Files (object storage) ----------
@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    file_id = uuid.uuid4().hex
    path = f"{APP_NAME}/uploads/{user.user_id}/{file_id}.{ext}"
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 15MB)")
    content_type = file.content_type or MIME_TYPES.get(ext, "application/octet-stream")
    try:
        result = put_object(path, data, content_type)
    except Exception as e:
        logging.error(f"Upload failed: {e}")
        raise HTTPException(status_code=502, detail="Upload failed")
    await db.files.insert_one({
        "id": file_id,
        "user_id": user.user_id,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "is_deleted": False,
        "created_at": now_iso(),
    })
    return {"file_id": file_id, "filename": file.filename, "content_type": content_type,
            "url": f"/api/files/{file_id}"}


@api_router.get("/files/{file_id}")
async def download_file(file_id: str, request: Request, auth: Optional[str] = Query(None)):
    cookie_token = request.cookies.get("session_token")
    header_auth = request.headers.get("Authorization")
    bearer = (header_auth.split(" ", 1)[1] if header_auth and header_auth.startswith("Bearer ") else None) or auth
    user = await _authenticate(cookie_token, bearer)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    rec = await db.files.find_one({"id": file_id, "user_id": user.user_id, "is_deleted": False}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="File not found")
    data, ct = get_object(rec["storage_path"])
    return Response(content=data, media_type=rec.get("content_type") or ct,
                    headers={"Content-Disposition": f'inline; filename="{rec.get("original_filename", file_id)}"'})


# ---------- Drivers ----------
@api_router.get("/drivers")
async def list_drivers(user: User = Depends(get_current_user)):
    docs = await db.drivers.find({"user_id": user.user_id}, {"_id": 0}).to_list(1000)
    for d in docs:
        d["licence_status"] = compliance_status(days_until(d.get("licence_expiry")))
        d["cpc_status"] = compliance_status(days_until(d.get("cpc_expiry")))
        d["tacho_status"] = compliance_status(days_until(d.get("tacho_card_expiry")))
        d["hours_status"] = "expired" if d.get("weekly_hours", 0) > d.get("max_weekly_hours", 56) else "valid"
    return docs


@api_router.post("/drivers")
async def create_driver(data: DriverInput, user: User = Depends(get_current_user)):
    d = Driver(**data.model_dump(), user_id=user.user_id)
    await db.drivers.insert_one(d.model_dump())
    return d.model_dump()


@api_router.put("/drivers/{did}")
async def update_driver(did: str, data: DriverInput, user: User = Depends(get_current_user)):
    res = await db.drivers.update_one({"id": did, "user_id": user.user_id}, {"$set": data.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Driver not found")
    return {"ok": True}


@api_router.delete("/drivers/{did}")
async def delete_driver(did: str, user: User = Depends(get_current_user)):
    await db.drivers.delete_one({"id": did, "user_id": user.user_id})
    return {"ok": True}


# ---------- Driver Training ----------
@api_router.get("/training")
async def list_training(driver_id: Optional[str] = Query(None), user: User = Depends(get_current_user)):
    q = {"user_id": user.user_id}
    if driver_id:
        q["driver_id"] = driver_id
    docs = await db.training.find(q, {"_id": 0}).sort("expiry_date", 1).to_list(1000)
    for d in docs:
        d["status"] = compliance_status(days_until(d.get("expiry_date")))
        d["days_left"] = days_until(d.get("expiry_date"))
    return docs


@api_router.post("/training")
async def create_training(data: TrainingInput, user: User = Depends(get_current_user)):
    t = TrainingRecord(**data.model_dump(), user_id=user.user_id)
    await db.training.insert_one(t.model_dump())
    return t.model_dump()


@api_router.put("/training/{tid}")
async def update_training(tid: str, data: TrainingInput, user: User = Depends(get_current_user)):
    res = await db.training.update_one({"id": tid, "user_id": user.user_id}, {"$set": data.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Training record not found")
    return {"ok": True}


@api_router.delete("/training/{tid}")
async def delete_training(tid: str, user: User = Depends(get_current_user)):
    await db.training.delete_one({"id": tid, "user_id": user.user_id})
    return {"ok": True}


# ---------- Documents ----------
@api_router.get("/documents")
async def list_documents(user: User = Depends(get_current_user)):
    docs = await db.documents.find({"user_id": user.user_id}, {"_id": 0}).to_list(1000)
    for d in docs:
        d["status"] = compliance_status(days_until(d.get("expiry_date")))
        d["days_left"] = days_until(d.get("expiry_date"))
    return docs


@api_router.post("/documents")
async def create_document(data: DocInput, user: User = Depends(get_current_user)):
    doc = ComplianceDoc(**data.model_dump(), user_id=user.user_id)
    await db.documents.insert_one(doc.model_dump())
    return doc.model_dump()


@api_router.put("/documents/{docid}")
async def update_document(docid: str, data: DocInput, user: User = Depends(get_current_user)):
    res = await db.documents.update_one({"id": docid, "user_id": user.user_id}, {"$set": data.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"ok": True}


@api_router.delete("/documents/{docid}")
async def delete_document(docid: str, user: User = Depends(get_current_user)):
    await db.documents.delete_one({"id": docid, "user_id": user.user_id})
    return {"ok": True}


# ---------- Insurance ----------
@api_router.get("/insurance")
async def list_insurance(user: User = Depends(get_current_user)):
    docs = await db.insurance.find({"user_id": user.user_id}, {"_id": 0}).sort("expiry_date", 1).to_list(1000)
    for d in docs:
        d["status"] = compliance_status(days_until(d.get("expiry_date")))
        d["days_left"] = days_until(d.get("expiry_date"))
    return docs


@api_router.post("/insurance")
async def create_insurance(data: InsuranceInput, user: User = Depends(get_current_user)):
    p = InsurancePolicy(**data.model_dump(), user_id=user.user_id)
    await db.insurance.insert_one(p.model_dump())
    return p.model_dump()


@api_router.put("/insurance/{iid}")
async def update_insurance(iid: str, data: InsuranceInput, user: User = Depends(get_current_user)):
    res = await db.insurance.update_one({"id": iid, "user_id": user.user_id}, {"$set": data.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Insurance policy not found")
    return {"ok": True}


@api_router.delete("/insurance/{iid}")
async def delete_insurance(iid: str, user: User = Depends(get_current_user)):
    await db.insurance.delete_one({"id": iid, "user_id": user.user_id})
    return {"ok": True}


INSURANCE_TYPES = ["Goods in Transit (GIT)", "Motor — Truck", "Motor — Trailer", "Green Card", "Public Liability (PL)", "Employers' Liability (EL)", "Other"]


def normalize_policy_type(raw: str) -> str:
    if not raw:
        return "Other"
    if raw in INSURANCE_TYPES:
        return raw
    s = raw.lower()
    if "goods in transit" in s or "git" in s:
        return "Goods in Transit (GIT)"
    if "employ" in s or s.strip() == "el":
        return "Employers' Liability (EL)"
    if "public" in s or s.strip() == "pl":
        return "Public Liability (PL)"
    if "green card" in s or "green" in s:
        return "Green Card"
    if "trailer" in s:
        return "Motor — Trailer"
    if "motor" in s or "truck" in s or "vehicle" in s or "fleet" in s:
        return "Motor — Truck"
    return "Other"


async def ai_extract_insurance(file_bytes: bytes, mime: str, ext: str):
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent, FileContentWithMimeType
    system = (
        "You read UK & Ireland commercial vehicle insurance documents (certificates, schedules, cover notes) "
        "and extract structured data. Classify policy_type as EXACTLY one of: " + ", ".join(INSURANCE_TYPES) + ". "
        "Goods in Transit=GIT; Motor for the tractor unit=Motor — Truck; Motor for trailers=Motor — Trailer; "
        "international motor cover=Green Card; Public Liability=PL; Employers' Liability=EL. "
        "Return ONLY minified JSON with keys: policy_type, insurer, policy_number, start_date (YYYY-MM-DD or null), "
        "expiry_date (YYYY-MM-DD or null), cover_amount (string incl currency symbol or ''), confidence (0-1), "
        "needs_review (true if you are unsure or the document is unclear). No prose, no code fences."
    )
    prompt = "Extract the insurance policy details from this document."
    tmp_path = None
    try:
        if (mime or "").startswith("image/"):
            b64 = base64.b64encode(file_bytes).decode("utf-8")
            chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"ins_{uuid.uuid4().hex[:8]}", system_message=system).with_model("openai", "gpt-4o")
            msg = UserMessage(text=prompt, file_contents=[ImageContent(b64)])
        else:
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}")
            tmp.write(file_bytes)
            tmp.flush()
            tmp.close()
            tmp_path = tmp.name
            chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"ins_{uuid.uuid4().hex[:8]}", system_message=system).with_model("gemini", "gemini-2.5-flash")
            msg = UserMessage(text=prompt, file_contents=[FileContentWithMimeType(mime or "application/pdf", tmp_path)])
        resp = await chat.send_message(msg)
        text = (resp if isinstance(resp, str) else str(resp)).strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:]
        s, e = text.find("{"), text.rfind("}")
        return json.loads(text[s:e + 1])
    except Exception as ex:
        logging.error(f"AI insurance extract failed: {ex}")
        return None
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@api_router.post("/insurance/ai-import")
async def ai_import_insurance(files: List[UploadFile] = File(...), user: User = Depends(get_current_user)):
    created = []
    for file in files:
        data = await file.read()
        if not data:
            continue
        ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
        file_id = uuid.uuid4().hex
        content_type = file.content_type or MIME_TYPES.get(ext, "application/octet-stream")
        path = f"{APP_NAME}/uploads/{user.user_id}/{file_id}.{ext}"
        try:
            result = put_object(path, data, content_type)
        except Exception as e:
            logging.error(f"AI import upload failed: {e}")
            continue
        await db.files.insert_one({
            "id": file_id, "user_id": user.user_id, "storage_path": result["path"],
            "original_filename": file.filename, "content_type": content_type,
            "size": result.get("size", len(data)), "is_deleted": False, "created_at": now_iso(),
        })
        attachment = Attachment(file_id=file_id, filename=file.filename or "", content_type=content_type)
        extracted = await ai_extract_insurance(data, content_type, ext)
        if extracted:
            ptype = normalize_policy_type(extracted.get("policy_type"))
            conf = extracted.get("confidence", 0) or 0
            policy = InsurancePolicy(
                user_id=user.user_id, policy_type=ptype,
                insurer=extracted.get("insurer") or "", policy_number=extracted.get("policy_number") or "",
                start_date=extracted.get("start_date") or None, expiry_date=extracted.get("expiry_date") or None,
                cover_amount=str(extracted.get("cover_amount") or ""),
                needs_review=bool(extracted.get("needs_review")) or conf < 0.6,
                ai_extracted=True, attachments=[attachment],
            )
        else:
            policy = InsurancePolicy(
                user_id=user.user_id, policy_type="Other", needs_review=True, ai_extracted=True,
                attachments=[attachment], notes="AI could not read this document — please review manually.",
            )
        await db.insurance.insert_one(policy.model_dump())
        created.append({"id": policy.id, "filename": file.filename, "policy_type": policy.policy_type,
                        "insurer": policy.insurer, "expiry_date": policy.expiry_date, "needs_review": policy.needs_review})
    return {"count": len(created), "created": created}


# ---------- Tacho Portal ----------
def compute_next_due(last: Optional[str], days: int) -> Optional[str]:
    base = last or now_iso()
    try:
        return (datetime.fromisoformat(base) + timedelta(days=days)).date().isoformat()
    except Exception:
        return None


@api_router.get("/tacho")
async def list_tacho(user: User = Depends(get_current_user)):
    docs = await db.tacho.find({"user_id": user.user_id}, {"_id": 0}).sort("next_due", 1).to_list(1000)
    for d in docs:
        d["status"] = compliance_status(days_until(d.get("next_due")))
        d["days_left"] = days_until(d.get("next_due"))
    return docs


@api_router.post("/tacho")
async def create_tacho(data: TachoInput, user: User = Depends(get_current_user)):
    payload = data.model_dump()
    t = TachoRecord(**payload, user_id=user.user_id)
    t.next_due = compute_next_due(t.last_download, t.frequency_days)
    await db.tacho.insert_one(t.model_dump())
    return t.model_dump()


@api_router.put("/tacho/{tid}")
async def update_tacho(tid: str, data: TachoInput, user: User = Depends(get_current_user)):
    payload = data.model_dump()
    payload["next_due"] = compute_next_due(payload.get("last_download"), payload.get("frequency_days", 28))
    res = await db.tacho.update_one({"id": tid, "user_id": user.user_id}, {"$set": payload})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tacho record not found")
    return {"ok": True, "next_due": payload["next_due"]}


@api_router.post("/tacho/{tid}/download")
async def log_tacho_download(tid: str, payload: dict, user: User = Depends(get_current_user)):
    rec = await db.tacho.find_one({"id": tid, "user_id": user.user_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Tacho record not found")
    dl_date = payload.get("download_date") or now_iso()[:10]
    attachments = rec.get("attachments", [])
    if payload.get("attachment"):
        attachments = attachments + [payload["attachment"]]
    next_due = compute_next_due(dl_date, rec.get("frequency_days", 28))
    await db.tacho.update_one({"id": tid}, {"$set": {"last_download": dl_date, "next_due": next_due, "attachments": attachments}})
    return {"ok": True, "last_download": dl_date, "next_due": next_due}


@api_router.delete("/tacho/{tid}")
async def delete_tacho(tid: str, user: User = Depends(get_current_user)):
    await db.tacho.delete_one({"id": tid, "user_id": user.user_id})
    return {"ok": True}


def parse_ddd_last_timestamp(data: bytes):
    # Digital tacho TimeReal = uint32 seconds since 1970-01-01 UTC. Scan for the
    # most recent plausible timestamp (best-effort read of last activity/download).
    lo = int(datetime(2005, 1, 1, tzinfo=timezone.utc).timestamp())
    hi = int(datetime.now(timezone.utc).timestamp()) + 2 * 86400
    scan = data[:5_000_000]
    best = None
    for i in range(0, len(scan) - 3):
        val = int.from_bytes(scan[i:i + 4], "big")
        if lo <= val <= hi and (best is None or val > best):
            best = val
    if best:
        return datetime.fromtimestamp(best, tz=timezone.utc).date().isoformat()
    return None


async def ai_extract_tacho(file_bytes: bytes, mime: str, ext: str):
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent, FileContentWithMimeType
    system = (
        "You read tachograph analysis reports and driver-card/vehicle-unit printouts. Extract: "
        "last_download (the most recent download date or card-read/print date, YYYY-MM-DD or null) and "
        "infringements (integer count of infringements/violations/offences noted, else 0). "
        "Return ONLY minified JSON {\"last_download\": ..., \"infringements\": ..., \"confidence\": 0-1}. No prose."
    )
    tmp_path = None
    try:
        if (mime or "").startswith("image/"):
            b64 = base64.b64encode(file_bytes).decode("utf-8")
            chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"tac_{uuid.uuid4().hex[:8]}", system_message=system).with_model("openai", "gpt-4o")
            msg = UserMessage(text="Extract tacho details from this report.", file_contents=[ImageContent(b64)])
        else:
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}")
            tmp.write(file_bytes)
            tmp.flush()
            tmp.close()
            tmp_path = tmp.name
            chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"tac_{uuid.uuid4().hex[:8]}", system_message=system).with_model("gemini", "gemini-2.5-flash")
            msg = UserMessage(text="Extract tacho details from this report.", file_contents=[FileContentWithMimeType(mime or "application/pdf", tmp_path)])
        resp = await chat.send_message(msg)
        text = (resp if isinstance(resp, str) else str(resp)).strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:]
        s, e = text.find("{"), text.rfind("}")
        return json.loads(text[s:e + 1])
    except Exception as ex:
        logging.error(f"AI tacho extract failed: {ex}")
        return None
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@api_router.post("/tacho/parse")
async def parse_tacho(payload: TachoParseInput, user: User = Depends(get_current_user)):
    rec = await db.files.find_one({"id": payload.file_id, "user_id": user.user_id, "is_deleted": False}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="File not found")
    data, ct = get_object(rec["storage_path"])
    ct = rec.get("content_type") or ct
    ext = (rec.get("original_filename") or "").rsplit(".", 1)[-1].lower()
    ai_types = (ct or "").startswith("image/") or (ct or "").startswith("text/") or ct == "application/pdf"
    if ai_types or ext in ("pdf", "txt", "csv"):
        extracted = await ai_extract_tacho(data, ct, ext) or {}
        return {"last_download": extracted.get("last_download"), "infringements": extracted.get("infringements"), "method": "ai"}
    last = parse_ddd_last_timestamp(data)
    return {"last_download": last, "infringements": None, "method": "binary"}


# ---------- Defects ----------
async def summarise_defect(description: str, severity: str) -> str:
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"defect_{uuid.uuid4().hex[:8]}",
            system_message="You are a UK road haulage compliance assistant. Summarise vehicle defect reports into one concise professional line, note if it is safety-critical (roadworthiness), and recommend an action. Keep under 40 words.",
        ).with_model("openai", "gpt-5.4")
        msg = UserMessage(text=f"Severity: {severity}. Defect: {description}")
        resp = await chat.send_message(msg)
        return resp if isinstance(resp, str) else str(resp)
    except Exception as e:
        logging.error(f"AI summary failed: {e}")
        return ""


@api_router.get("/defects")
async def list_defects(user: User = Depends(get_current_user)):
    docs = await db.defects.find({"user_id": user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs


@api_router.post("/defects")
async def create_defect(data: DefectInput, user: User = Depends(get_current_user)):
    d = DefectReport(**data.model_dump(), user_id=user.user_id)
    d.ai_summary = await summarise_defect(data.description, data.severity)
    await db.defects.insert_one(d.model_dump())
    return d.model_dump()


@api_router.put("/defects/{did}/status")
async def update_defect_status(did: str, status: str, user: User = Depends(get_current_user)):
    res = await db.defects.update_one({"id": did, "user_id": user.user_id}, {"$set": {"status": status}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Defect not found")
    return {"ok": True}


@api_router.delete("/defects/{did}")
async def delete_defect(did: str, user: User = Depends(get_current_user)):
    await db.defects.delete_one({"id": did, "user_id": user.user_id})
    return {"ok": True}


# ---------- PMI Inspections ----------
def advance_due(inspection_date: str, weeks: int) -> str:
    d = datetime.fromisoformat(inspection_date)
    return (d + timedelta(weeks=weeks)).date().isoformat()


@api_router.get("/pmi")
async def list_pmi(user: User = Depends(get_current_user)):
    docs = await db.pmi_schedules.find({"user_id": user.user_id}, {"_id": 0}).to_list(1000)
    for d in docs:
        d["status"] = compliance_status(days_until(d.get("next_due")))
        d["days_left"] = days_until(d.get("next_due"))
    docs.sort(key=lambda x: x.get("next_due") or "9999")
    return docs


@api_router.post("/pmi")
async def create_pmi(data: PMIInput, user: User = Depends(get_current_user)):
    payload = data.model_dump()
    if not payload.get("next_due"):
        payload["next_due"] = advance_due(now_iso(), payload.get("frequency_weeks", 6))
    p = PMISchedule(**payload, user_id=user.user_id)
    await db.pmi_schedules.insert_one(p.model_dump())
    return p.model_dump()


@api_router.put("/pmi/{pid}")
async def update_pmi(pid: str, data: PMIInput, user: User = Depends(get_current_user)):
    res = await db.pmi_schedules.update_one({"id": pid, "user_id": user.user_id}, {"$set": data.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="PMI schedule not found")
    return {"ok": True}


@api_router.delete("/pmi/{pid}")
async def delete_pmi(pid: str, user: User = Depends(get_current_user)):
    await db.pmi_schedules.delete_one({"id": pid, "user_id": user.user_id})
    return {"ok": True}


@api_router.post("/pmi/{pid}/complete")
async def complete_pmi(pid: str, data: PMICompleteInput, user: User = Depends(get_current_user)):
    sched = await db.pmi_schedules.find_one({"id": pid, "user_id": user.user_id}, {"_id": 0})
    if not sched:
        raise HTTPException(status_code=404, detail="PMI schedule not found")
    record = {
        "id": f"pmr_{uuid.uuid4().hex[:10]}",
        "user_id": user.user_id,
        "pmi_id": pid,
        "vehicle_reg": sched["vehicle_reg"],
        "inspection_date": data.inspection_date,
        "result": data.result,
        "inspector": data.inspector,
        "notes": data.notes,
        "created_at": now_iso(),
    }
    await db.pmi_records.insert_one(dict(record))
    new_due = advance_due(data.inspection_date, sched.get("frequency_weeks", 6))
    await db.pmi_schedules.update_one({"id": pid}, {"$set": {"next_due": new_due}})
    record.pop("_id", None)
    return {"ok": True, "next_due": new_due, "record": record}


@api_router.get("/pmi/records")
async def list_pmi_records(user: User = Depends(get_current_user)):
    docs = await db.pmi_records.find({"user_id": user.user_id}, {"_id": 0}).sort("inspection_date", -1).to_list(1000)
    return docs


# ---------- Calendar ----------
@api_router.get("/calendar")
async def calendar(user: User = Depends(get_current_user)):
    events = []
    schedules = await db.pmi_schedules.find({"user_id": user.user_id}, {"_id": 0}).to_list(1000)
    for s in schedules:
        if s.get("next_due"):
            events.append({
                "date": s["next_due"], "type": "pmi_due", "title": f"PMI Due — {s['vehicle_reg']}",
                "subtitle": f"Every {s.get('frequency_weeks', 6)} weeks", "status": compliance_status(days_until(s["next_due"])),
            })
    records = await db.pmi_records.find({"user_id": user.user_id}, {"_id": 0}).to_list(2000)
    for r in records:
        events.append({
            "date": r["inspection_date"], "type": "pmi_done", "title": f"PMI Completed — {r['vehicle_reg']}",
            "subtitle": r.get("result", "pass").title(), "status": "expired" if r.get("result") == "fail" else "valid",
        })
    defects = await db.defects.find({"user_id": user.user_id}, {"_id": 0}).to_list(2000)
    for d in defects:
        events.append({
            "date": (d.get("created_at") or "")[:10], "type": "defect", "title": f"Defect — {d['vehicle_reg']}",
            "subtitle": f"{d.get('category', 'General')} · {d.get('severity', 'minor').replace('_', ' ')}",
            "status": "expired" if d.get("severity") in ("major", "safety_critical") else "due_soon",
        })
    events = [e for e in events if e.get("date")]
    training = await db.training.find({"user_id": user.user_id}, {"_id": 0}).to_list(2000)
    for t in training:
        if t.get("expiry_date"):
            events.append({
                "date": t["expiry_date"], "type": "training", "title": f"Training Expiry — {t.get('driver_name') or t.get('course_name')}",
                "subtitle": f"{t.get('category', '')} · {t.get('course_name', '')}".strip(" ·"),
                "status": compliance_status(days_until(t["expiry_date"])),
            })
    insurance = await db.insurance.find({"user_id": user.user_id}, {"_id": 0}).to_list(2000)
    for ins in insurance:
        if ins.get("expiry_date"):
            events.append({
                "date": ins["expiry_date"], "type": "insurance", "title": f"Insurance Renewal — {ins.get('policy_type')}",
                "subtitle": ins.get("insurer") or ins.get("policy_number") or "",
                "status": compliance_status(days_until(ins["expiry_date"])),
            })
    tacho = await db.tacho.find({"user_id": user.user_id}, {"_id": 0}).to_list(2000)
    tacho_latest = {}
    for tc in tacho:
        key = (tc.get("source_type"), tc.get("reference"))
        cur = tacho_latest.get(key)
        if cur is None or (tc.get("last_download") or tc.get("next_due") or "") > (cur.get("last_download") or cur.get("next_due") or ""):
            tacho_latest[key] = tc
    for tc in tacho_latest.values():
        if tc.get("next_due"):
            events.append({
                "date": tc["next_due"], "type": "tacho", "title": f"Tacho Download — {tc.get('reference') or tc.get('source_type')}",
                "subtitle": tc.get("source_type", ""),
                "status": compliance_status(days_until(tc["next_due"])),
            })
    for ev in await db.calendar_events.find({"user_id": user.user_id}, {"_id": 0}).to_list(2000):
        events.append({
            "id": ev.get("id"), "date": ev.get("date"), "type": "custom", "title": ev.get("title", "Event"),
            "subtitle": ev.get("notes", ""), "status": ev.get("status", "valid"),
        })
    events = [e for e in events if e.get("date")]
    return events


class CalendarEventInput(BaseModel):
    date: str
    title: str
    notes: str = ""
    status: str = "valid"


@api_router.post("/calendar/events")
async def create_calendar_event(data: CalendarEventInput, user: User = Depends(get_current_user)):
    ev = {"id": f"evt_{uuid.uuid4().hex[:10]}", "user_id": user.user_id, "date": data.date,
          "title": data.title, "notes": data.notes, "status": data.status, "created_at": now_iso()}
    await db.calendar_events.insert_one(dict(ev))
    ev.pop("_id", None)
    return ev


@api_router.delete("/calendar/events/{eid}")
async def delete_calendar_event(eid: str, user: User = Depends(get_current_user)):
    await db.calendar_events.delete_one({"id": eid, "user_id": user.user_id})
    return {"ok": True}


# ---------- Dashboard + AI risk ----------
async def gather_stats(user_id: str):
    vehicles = await db.vehicles.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
    drivers = await db.drivers.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
    documents = await db.documents.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
    defects = await db.defects.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
    pmi_schedules = await db.pmi_schedules.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
    trailers = await db.trailers.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
    training = await db.training.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
    insurance = await db.insurance.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
    tacho = await db.tacho.find({"user_id": user_id}, {"_id": 0}).to_list(1000)

    alerts = []
    expired = due_soon = 0
    for v in vehicles:
        for label, key in [("MOT", "mot_due"), ("Service", "service_due"), ("Tax", "tax_due")]:
            d = days_until(v.get(key))
            st = compliance_status(d)
            if st == "expired":
                expired += 1
                alerts.append({"type": "vehicle", "name": v["registration"], "item": label, "status": "expired", "days": d})
            elif st == "due_soon":
                due_soon += 1
                alerts.append({"type": "vehicle", "name": v["registration"], "item": label, "status": "due_soon", "days": d})
    for dr in drivers:
        for label, key in [("Licence", "licence_expiry"), ("CPC", "cpc_expiry"), ("Tacho Card", "tacho_card_expiry")]:
            d = days_until(dr.get(key))
            st = compliance_status(d)
            if st == "expired":
                expired += 1
                alerts.append({"type": "driver", "name": dr["name"], "item": label, "status": "expired", "days": d})
            elif st == "due_soon":
                due_soon += 1
                alerts.append({"type": "driver", "name": dr["name"], "item": label, "status": "due_soon", "days": d})
        if dr.get("weekly_hours", 0) > dr.get("max_weekly_hours", 56):
            expired += 1
            alerts.append({"type": "driver", "name": dr["name"], "item": "Weekly Hours Exceeded", "status": "expired", "days": None})
    for doc in documents:
        d = days_until(doc.get("expiry_date"))
        st = compliance_status(d)
        if st == "expired":
            expired += 1
            alerts.append({"type": "document", "name": doc["title"], "item": doc.get("doc_type", "Document"), "status": "expired", "days": d})
        elif st == "due_soon":
            due_soon += 1
            alerts.append({"type": "document", "name": doc["title"], "item": doc.get("doc_type", "Document"), "status": "due_soon", "days": d})

    for p in pmi_schedules:
        d = days_until(p.get("next_due"))
        st = compliance_status(d)
        if st == "expired":
            expired += 1
            alerts.append({"type": "pmi", "name": p["vehicle_reg"], "item": "PMI Inspection", "status": "expired", "days": d})
        elif st == "due_soon":
            due_soon += 1
            alerts.append({"type": "pmi", "name": p["vehicle_reg"], "item": "PMI Inspection", "status": "due_soon", "days": d})

    for tr in trailers:
        for label, key in [("Annual Test", "mot_due"), ("Service", "service_due")]:
            d = days_until(tr.get(key))
            st = compliance_status(d)
            if st == "expired":
                expired += 1
                alerts.append({"type": "trailer", "name": tr["trailer_number"], "item": label, "status": "expired", "days": d})
            elif st == "due_soon":
                due_soon += 1
                alerts.append({"type": "trailer", "name": tr["trailer_number"], "item": label, "status": "due_soon", "days": d})

    for t in training:
        d = days_until(t.get("expiry_date"))
        st = compliance_status(d)
        if st == "expired":
            expired += 1
            alerts.append({"type": "training", "name": t.get("driver_name") or t.get("course_name"), "item": t.get("course_name", "Training"), "status": "expired", "days": d})
        elif st == "due_soon":
            due_soon += 1
            alerts.append({"type": "training", "name": t.get("driver_name") or t.get("course_name"), "item": t.get("course_name", "Training"), "status": "due_soon", "days": d})

    for ins in insurance:
        d = days_until(ins.get("expiry_date"))
        st = compliance_status(d)
        if st == "expired":
            expired += 1
            alerts.append({"type": "insurance", "name": ins.get("insurer") or ins.get("policy_type"), "item": ins.get("policy_type", "Insurance"), "status": "expired", "days": d})
        elif st == "due_soon":
            due_soon += 1
            alerts.append({"type": "insurance", "name": ins.get("insurer") or ins.get("policy_type"), "item": ins.get("policy_type", "Insurance"), "status": "due_soon", "days": d})

    # Only the LATEST download per driver-card / vehicle-unit counts toward compliance
    tacho_latest = {}
    for tc in tacho:
        key = (tc.get("source_type"), tc.get("reference"))
        cur = tacho_latest.get(key)
        if cur is None or (tc.get("last_download") or tc.get("next_due") or "") > (cur.get("last_download") or cur.get("next_due") or ""):
            tacho_latest[key] = tc
    for tc in tacho_latest.values():
        d = days_until(tc.get("next_due"))
        st = compliance_status(d)
        if st == "expired":
            expired += 1
            alerts.append({"type": "tacho", "name": tc.get("reference") or tc.get("source_type"), "item": f"{tc.get('source_type', 'Tacho')} Download", "status": "expired", "days": d})
        elif st == "due_soon":
            due_soon += 1
            alerts.append({"type": "tacho", "name": tc.get("reference") or tc.get("source_type"), "item": f"{tc.get('source_type', 'Tacho')} Download", "status": "due_soon", "days": d})

    open_defects = [d for d in defects if d.get("status") == "open"]
    major_defects = [d for d in open_defects if d.get("severity") in ("major", "safety_critical")]
    alerts.sort(key=lambda a: (a["status"] != "expired", a["days"] if a["days"] is not None else 9999))
    return {
        "counts": {
            "vehicles": len(vehicles), "drivers": len(drivers), "documents": len(documents),
            "open_defects": len(open_defects), "major_defects": len(major_defects),
            "pmi": len(pmi_schedules), "trailers": len(trailers), "training": len(training),
            "insurance": len(insurance), "tacho": len(tacho_latest),
            "expired": expired, "due_soon": due_soon,
        },
        "alerts": alerts,
    }


@api_router.get("/dashboard")
async def dashboard(user: User = Depends(get_current_user)):
    stats = await gather_stats(user.user_id)
    c = stats["counts"]
    penalty = c["expired"] * 25 + c["due_soon"] * 8 + c["major_defects"] * 15 + c["open_defects"] * 3
    score = max(0, 100 - penalty)
    if score >= 85:
        band = "Low Risk"
    elif score >= 60:
        band = "Moderate Risk"
    else:
        band = "High Risk"
    stats["risk_score"] = score
    stats["risk_band"] = band
    return stats


@api_router.post("/ai/risk-insight")
async def ai_risk_insight(user: User = Depends(get_current_user)):
    stats = await gather_stats(user.user_id)
    c = stats["counts"]
    penalty = c["expired"] * 25 + c["due_soon"] * 8 + c["major_defects"] * 15 + c["open_defects"] * 3
    score = max(0, 100 - penalty)
    top = stats["alerts"][:8]
    alert_text = "; ".join([f"{a['name']} {a['item']} {a['status']}" for a in top]) or "No outstanding alerts"
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"risk_{uuid.uuid4().hex[:8]}",
            system_message="You are a UK & Ireland operator-licence compliance advisor for road haulage operators (DVSA in the UK, RSA in Ireland). Given fleet stats, write a short risk briefing (max 90 words) for a transport manager: state the biggest risks to the operator licence, and 2-3 prioritised actions. Be direct and practical.",
        ).with_model("openai", "gpt-5.4")
        prompt = (f"Compliance score: {score}/100. Vehicles: {c['vehicles']}, Drivers: {c['drivers']}, "
                  f"Documents: {c['documents']}. Expired items: {c['expired']}, Due soon: {c['due_soon']}, "
                  f"Open defects: {c['open_defects']} (major: {c['major_defects']}). Top alerts: {alert_text}.")
        resp = await chat.send_message(UserMessage(text=prompt))
        insight = resp if isinstance(resp, str) else str(resp)
    except Exception as e:
        logging.error(f"AI risk insight failed: {e}")
        insight = "AI insight unavailable right now. Review expired and due-soon items in the alerts panel and clear major defects first."
    return {"score": score, "insight": insight}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup_event():
    try:
        init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
