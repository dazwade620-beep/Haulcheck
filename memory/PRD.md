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
- Dashboard: risk score gauge, AI risk briefing, KPI cards (incl. PMI), prioritised alerts feed (incl. PMI due).
- Vehicles CRUD (MOT/service/tax tracking with badges).
- Drivers CRUD (licence/CPC/tacho + weekly-hours over-limit flag).
- Documents CRUD (operator licence, insurance, audit, wheel security, etc.).
- Defects: report + AI summary + status workflow (open/monitoring/resolved).
- **PMI Inspections**: recurring maintenance schedules per vehicle (frequency in weeks, auto next-due), record completed inspections (pass/advisory/fail) which advance next-due, and inspection history.
- **Calendar**: month grid combining PMI due dates, completed PMIs and driver defect reports; day-detail panel + legend.
- Fully tested: backend 24/24 pytest, all critical frontend flows pass. Fixed dev-mode ResizeObserver overlay + Dialog a11y descriptions.

## Backlog
- P1: File uploads/attachments for documents & defect photos (object storage).
- P2: Role-based views (driver vs manager), scheduled email reminders for expiries/PMI due.
- P2: Export compliance report (PDF), tachograph infringement log detail.
- P2: UI delete for inspection history records.

## Next Tasks
- Await user feedback; then tackle P1 items (file uploads, roles).
