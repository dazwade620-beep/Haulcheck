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

- **Operator Details page** (2026-07-08): dedicated page for company name/number, O-Licence number & type, authorised vehicles/trailers, operating-centre address, and Transport Manager details (name, CPC, email, phone, notes). `GET/PUT /api/operator`. Feeds the AI gap-detection audit (missing O-Licence no / TM name / company number flagged as gaps). Route wired in App.js (was missing), verified end-to-end via curl + UI.
- Silenced `react-hooks/exhaustive-deps` warnings on mount-only loads across all pages.
- **Email reminders (Resend)** (2026-07-08): new Reminders page — configurable recipient list (`GET/PUT /api/reminders/settings`) and "Send reminder now" (`POST /api/reminders/send`) that emails an HTML compliance digest of all items expired or due within 30 days (MOT/CVRT, tax, service, driver licence/CPC/tacho, PMI, insurance, training). Region-aware (DVSA/RSA) header. Verified end-to-end: real email delivered via Resend (email_id returned). Env: `RESEND_API_KEY`, `SENDER_EMAIL` (default onboarding@resend.dev). NOTE: Resend account is in testing mode — delivers only to account-owner email until a sending domain is verified. Daily auto-scheduler now live (see below).
- **Daily reminder scheduler + bug fix** (2026-07-08): APScheduler runs `run_daily_reminders` daily at 07:00 UTC — sends each recipient list a digest, with per-item dedup (`reminder_log` collection) so an item is emailed once when it enters the 30-day window and re-notified only if renewed and re-entering. Manual `POST /api/reminders/send` (full digest) and test `POST /api/reminders/run-scheduled` (dedup logic) both verified. FIXED: Operator page flashing/jumping/focus-loss bug — `Card` component was defined inside `Operator()`, remounting the form on every keystroke; moved to module scope.
- **Per-recipient reminder preferences** (2026-07-08): each recipient now has its own compliance-area filter (Fleet, Drivers, Tacho, PMI, Insurance, Training, Documents, Defects) and frequency (Daily 30-day alerts vs Weekly summary sent Mondays). Quick presets: Transport Manager (all), Driver (Drivers+Tacho+Training), Maintenance (Fleet+PMI+Defects). New recipients default to all areas + daily. Daily dedup is now per-recipient (`reminder_log.sent` keyed by email); manual send emails each recipient their area-filtered digest individually. Open defects included in the digest. Recipient model migrated from `List[str]` to `List[{email, areas, frequency}]` with backward-compat normalization. Weekly scheduler job added (Mon 07:00 UTC). All flows verified via curl + real email delivery.

- **Insurance folder auto-sort** (2026-07-08): fixed AI-imported docs landing "loose" in Other. Added `classify_policy_type`/`infer_from_text` (filename + policy number + insurer heuristics) applied at import, plus `POST /api/insurance/reclassify` and a "Sort loose docs" button (shown when Other>0) to re-file existing Other docs into their correct folder. Verified: GIT/Trailer/Green Card auto-filed; combined-liability → PL best-effort.

- **Maintenance folder** (2026-07-08): grouped PMI Inspections + Defects under a single "Maintenance" sidebar item → `/maintenance` tabbed page (mirrors Fleet/Drivers pattern). Panels refactored with an `embedded` prop; old `/inspections` and `/defects` routes redirect to `/maintenance`.

- **Office folder** (2026-07-08): grouped Insurance + Documents + Training under a single "Office" sidebar item → `/office` tabbed page (same pattern as Maintenance). Panels refactored with `embedded` prop; `/insurance`, `/documents`, `/training` redirect to `/office`.

- **Combined liability split + Training driver folders** (2026-07-08): consolidated the main account's 5 "Combined Hauliers Liability" PL fragments into exactly 1 PL + 1 EL record (all 5 files attached to both). Added `is_combined_liability` detection in AI Import so combined-liability docs auto-create a deduped PL+EL pair (keyed on policy_number/insurer). Training tab now shows a folder per driver (filter by `driver_name`, "All" + per-person pills).

- **Drivers training view + persistent AI clean-up** (2026-07-08): each driver card on the Drivers page now shows that driver's training records (course + expiry status) alongside licence/CPC/tacho/hours. The Insurance "Sort loose docs" (AI clean-up) button is now always visible (previously only shown when loose docs existed).

- **PDF export** (2026-07-08): `GET /api/export/account` and `GET /api/export/driver/{id}` (both `?include_files=`) generate colour-coded compliance summary PDFs (reportlab), optionally merging all uploaded documents (PDFs/images via pypdf + Pillow; non-mergeable .txt/.ddd skipped) into one pack. Frontend: Dashboard "Export PDF" dropdown (summary / full pack) and per-driver export dropdown on each driver card. New files: `backend/pdf_export.py`, `frontend/src/lib/download.js`.

- **PMI/Defect dropdowns + Wheel Security Audits** (2026-07-08): PMI and Defect forms now use vehicle/trailer dropdowns (and driver dropdown for defect reporter) instead of free text. Added a Wheel Security Audits feature (`/api/wheel-audits` CRUD, `db.wheel_audits`): vehicle, date, result (pass/advisory/fail), torque setting, checked-by, next-due with status, notes, attachments — surfaced as a 3rd tab in the Maintenance folder and included in the account PDF export. New file: `frontend/src/pages/WheelSecurity.js`.

- **100% DVSA/RSA compliance batch — VERIFIED (2026-07-08)**: Walkaround/Daily Checks (`/api/walkarounds` CRUD, Maintenance > Daily Checks tab), Test History/Prohibitions (`/api/test-history` CRUD, Fleet > Test History tab), Defect "Mark Rectified" flow (`PUT /api/defects/{id}/rectify` → status=rectified + rectified_date/by/notes, green banner on card), Wheel Security Audits (`/api/wheel-audits`), PMI brake-test fields (roller/laden/service/secondary/parking pct into pmi_records), CPC hours, fleet insurance summary strip, and 6 new document types (Attestation Record, Indoctrination Document, Driver Infringement, Adhoc Note, Warning Letter, Infringement Report). AI gap-detection (`detect_gaps`) now surfaces wheel/walkaround/test-history gaps per vehicle. Tested via testing_agent: 19/19 new + 64/64 regression PASS (iteration_12.json). New test file: `backend/tests/test_new_compliance.py`.

- **Per-driver Documents folder (2026-07-08)**: each driver card now has a "Documents" folder (mirrors Training) with "+ Add" opening a dialog for driver-specific compliance paperwork: Driver Infringement, Infringement Report, Warning Letter, Attestation Record, Indoctrination Document, Adhoc Note, Other — with reference/date/notes + file upload. Documents are linked via `driver_id`/`driver_name` on `ComplianceDoc`/`DocInput`; driver-linked docs are excluded from the general Office → Documents list to avoid clutter. Verified via UI (create/persist/delete).

- **Company Documents Generator (2026-07-08)**: In Office → Documents, a "Generate Document" button opens a generator: pick a template (Warning Letter, Employment Offer Letter, Contract of Employment, Reference Letter, Disciplinary Invite, Disciplinary Outcome, Return to Work), enter recipient name/address + key points, then "AI Draft Letter" (`POST /api/documents/draft`, gpt-5.4) writes an editable subject + body. "Generate & Save PDF" (`POST /api/documents/generate`) renders a branded formal letter PDF (company letterhead pulled from Operator Details, TM sign-off) via `build_letter_pdf` in pdf_export.py, uploads it to object storage, and saves it as a document in the Office Documents list with the PDF attached. Verified end-to-end (curl + UI).

## Backlog
- P2: Role-based views (driver vs manager), scheduled email reminders for expiries/PMI due.
- P2: Export compliance report (PDF), tachograph infringement log detail.
- P2: UI delete/soft-delete for uploaded files & inspection history records.
- Minor: silence React uncontrolled->controlled warning on training driver select (cosmetic).

## Next Tasks
- Await user feedback; then tackle P1 items (file uploads, roles).
