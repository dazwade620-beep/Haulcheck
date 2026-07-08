# HaulCheck — Road Haulage Compliance

## Original Problem Statement
Road haulage compliance web app for transport/fleet managers (desktop) and drivers (mobile). Track vehicle inspections/defects & MOT/service dates, driver licences/CPC/tacho hours, operator licence & document expiry (insurance, audit, wheel security). Auth via email/password + Google. AI for defect summaries and compliance risk scoring.

## Architecture
- **Backend**: FastAPI + MongoDB (motor). JWT (email/password) + Emergent Google OAuth. All routes under `/api`.
- **Frontend**: React 19, React Router, Tailwind, shadcn/ui, lucide-react. Fonts: Chivo (headings) + IBM Plex Sans (body). Light "Swiss/high-contrast" control-room theme with traffic-light statuses.
- **AI**: emergentintegrations LlmChat (OpenAI gpt-5.4) via EMERGENT_LLM_KEY — defect triage summaries + fleet risk briefing.

## User Personas
- Transport/Fleet Manager: monitors fleet compliance, manages records (desktop-first).
- Driver: reports vehicle defects on the go (mobile-friendly).

## Core Requirements (static)
- Per-user data isolation (user_id scoping).
- Compliance status computed from expiry dates: valid / due_soon (≤30d) / expired.
- Server-side risk score (0–100) with Low/Moderate/High bands.

## Implemented (2026-07-08)
- Email/password register+login (JWT) and Google OAuth (cookie session).
- Dashboard: risk score gauge, AI risk briefing, KPI cards, prioritised alerts feed (vehicles, trailers, drivers, PMI, training, documents, defects).
- **Fleet page** with tabs: Vehicles (MOT/service/tax) + **Trailers** (annual test/service).
- Drivers CRUD (licence/CPC/tacho + weekly-hours over-limit flag).
- **Driver Training records**: courses/qualifications per driver, category, completed/expiry dates, provider, certificate uploads, expiry status.
- Documents CRUD (operator licence, insurance, audit, wheel security) with scan uploads.
- **Insurance**: dedicated section for GIT, Motor–Truck, Motor–Trailer, Green Card, Public Liability (PL) and Employers' Liability (EL) policies — insurer, policy number, cover, start/expiry, certificate upload; surfaced in dashboard alerts/KPI + calendar.
- **AI Insurance Import**: bulk-upload insurance PDFs/photos → AI (OpenAI vision for images, Gemini for PDFs) classifies policy type, extracts insurer/number/dates/cover, auto-creates records; low-confidence flagged "Review".
- **UK & Ireland support**: account-wide region setting (UK=DVSA / IE=RSA) switching terminology (MOT↔CVRT, Annual Test↔CVRT, £↔€) via sidebar switcher.
- **Tacho Portal**: Driver Cards / Vehicle Units folder tabs, grouped by driver/vehicle showing the latest download (older ones collapsed). Compliance now evaluates only the LATEST download per driver/vehicle (fixed false "expired" from historical records). Auto next-due, Log Download, infringements, dropdown references, .ddd/report auto-read. Dashboard alerts/KPI + calendar.
- **Calendar**: month grid of PMI/defects/training/insurance/tacho events + manual custom events (add/delete).
- **Insurance**: folder filters (Truck/Trailer/GIT/PL/EL/Green Card/Other) + AI bulk import.
- Defects: report + AI summary + status workflow + photo uploads.
- PMI Inspections: recurring schedules + completed-inspection records (auto next-due) + history.
- Calendar: month grid combining PMI due/done, defects and training expiries.
- **File uploads via Emergent object storage**: reusable upload/download (image + PDF), served through backend with `?auth=` query-param for `<img src>`; per-user scoped.
- Fully tested: backend 35/35 pytest, all critical frontend flows pass.

## Backlog
- P2: Role-based views (driver vs manager), scheduled email reminders for expiries/PMI due.
- P2: Export compliance report (PDF), tachograph infringement log detail.
- P2: UI delete/soft-delete for uploaded files & inspection history records.
- Minor: silence React uncontrolled->controlled warning on training driver select (cosmetic).

## Next Tasks
- Await user feedback; then tackle P1 items (file uploads, roles).
