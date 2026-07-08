from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
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
    picture: Optional[str] = None


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
    created_at: str = Field(default_factory=now_iso)


class DefectInput(BaseModel):
    vehicle_reg: str
    reported_by: str = ""
    category: str = "General"
    severity: str = "minor"
    description: str


class ComplianceDoc(BaseModel):
    id: str = Field(default_factory=lambda: f"doc_{uuid.uuid4().hex[:10]}")
    user_id: str = ""
    title: str
    doc_type: str = "Operator Licence"
    reference: str = ""
    expiry_date: Optional[str] = None
    notes: str = ""
    created_at: str = Field(default_factory=now_iso)


class DocInput(BaseModel):
    title: str
    doc_type: str = "Operator Licence"
    reference: str = ""
    expiry_date: Optional[str] = None
    notes: str = ""


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


# ---------- Auth ----------
def create_jwt(user_id: str) -> str:
    payload = {"user_id": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


async def get_current_user(request: Request) -> User:
    cookie_token = request.cookies.get("session_token")
    auth = request.headers.get("Authorization")
    bearer = auth.split(" ", 1)[1] if auth and auth.startswith("Bearer ") else None
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
                raise HTTPException(status_code=401, detail="Session expired")
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

    raise HTTPException(status_code=401, detail="Not authenticated")


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
        "picture": None,
        "password_hash": pwd_context.hash(data.password),
        "created_at": now_iso(),
    })
    token = create_jwt(user_id)
    return {"token": token, "user": {"user_id": user_id, "email": data.email, "name": data.name, "role": data.role}}


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
    return events


# ---------- Dashboard + AI risk ----------
async def gather_stats(user_id: str):
    vehicles = await db.vehicles.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
    drivers = await db.drivers.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
    documents = await db.documents.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
    defects = await db.defects.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
    pmi_schedules = await db.pmi_schedules.find({"user_id": user_id}, {"_id": 0}).to_list(1000)

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

    open_defects = [d for d in defects if d.get("status") == "open"]
    major_defects = [d for d in open_defects if d.get("severity") in ("major", "safety_critical")]
    alerts.sort(key=lambda a: (a["status"] != "expired", a["days"] if a["days"] is not None else 9999))
    return {
        "counts": {
            "vehicles": len(vehicles), "drivers": len(drivers), "documents": len(documents),
            "open_defects": len(open_defects), "major_defects": len(major_defects),
            "pmi": len(pmi_schedules),
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
            system_message="You are a UK O-licence compliance advisor for road haulage operators. Given fleet stats, write a short risk briefing (max 90 words) for a transport manager: state the biggest risks to the operator licence, and 2-3 prioritised actions. Be direct and practical.",
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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
