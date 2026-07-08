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

- **PRSI template + logo letterhead (2026-07-08)**: Added "PRSI Letter" (Ireland/RSA — Pay Related Social Insurance) to the Company Documents Generator templates with an Irish-employment AI guide. Added a **company logo upload** to Operator Details (`logo_file_id`); `build_letter_pdf` now embeds the logo as letterhead at the top of every generated document PDF (logo bytes fetched from object storage in `generate_document`). Verified end-to-end: logo uploaded → operator saved → PRSI letter PDF generated with embedded logo image + company header + body.

- **Logo on all PDFs (2026-07-08)**: extracted a shared `_logo_flowable` helper in pdf_export.py; `build_report_pdf` now accepts `logo_bytes` and renders the company logo as letterhead. Wired into both `/api/export/account` (Fleet Compliance Report) and `/api/export/driver/{id}` (Driver Compliance File) via new `_get_logo_bytes` helper, plus the existing generated-document PDFs. Set the account's real logo (DLZ International Limited). Verified: account export PDF embeds the logo image on page 1.

- **View button on document cards (2026-07-08)**: each document card in Office → Documents now shows an eye icon (`view-document-button`) that opens/downloads the first attachment (the generated/uploaded PDF) in a new tab via the authenticated `/api/files/{id}?auth=` URL. Verified in UI.

- **Edit / Regenerate letters (2026-07-08)**: generated documents now persist their `letter_data` (template, recipient, subject, body). A ↻ icon (`regenerate-document-button`) on the card reopens the generator pre-filled so wording can be tweaked; `PUT /api/documents/{id}/regenerate` rebuilds the branded PDF, replaces the attachment in place and retires the old file. Refactored the shared render logic into `_render_letter_attachment`. Verified end-to-end (curl): body updated, new attachment created, old file 404'd.

- **Fuel & Emissions + Calendar PMI + doc links (2026-07-08)**:
  - **Fuel & Emissions** tab in Fleet (`/api/fuel` CRUD + `/api/fuel/summary`): log diesel/AdBlue litres, cost, odometer per fill; auto **MPG** (imperial, tank-to-tank — miles between fills ÷ gallons, first fill excluded from averages), **CO₂** at 2.64 kg/L diesel, per-vehicle efficiency league (avg mpg, CO₂, cost/mile) + fleet totals strip (incl. CO₂ tonnes). New file `frontend/src/pages/Fuel.js`.
  - **Calendar "Add PMI"**: pick vehicle + first date + interval (4/6/8/10/12/13 weeks); `GET /api/calendar` now projects recurring `pmi_due` events across a 52-week horizon (max 26), first carries real status, later marked "· planned".
  - **Letter versioning**: generated docs store `letter_data.version`; a ↻ regenerate button reopens the generator pre-filled, `PUT /api/documents/{id}/regenerate` bumps the version and stamps notes "vN · updated <date>", soft-deleting the prior PDF.
  - **Document web link**: `link_url` on ComplianceDoc/DocInput; Link2 icon on the card opens the URL. Verified via testing_agent (iteration_13.json): 11/11 tests + regression pass.

- **CPC hours false-alarm fix (2026-07-08)**: the gap-detection "Driver CPC hours behind" flag previously fired for any driver with <35h logged CPC training regardless of DQC status. Now it only flags when the driver's CPC is within 12 months of expiry (medium priority ≤90 days), with clearer wording ("periodic training incomplete (Xh/35h) before CPC renewal <date>"). Verified via risk-insight on the test account.

- **CPC training progress bar (2026-07-08)**: each driver card now shows a colour-coded CPC periodic-training bar (amber until 35h, green when complete) with hours logged, hours remaining and the CPC renewal date — proactive planner replacing the plain hours row. `data-testid=cpc-progress-bar`.

- **Log CPC shortcut + IE brake-test rule (2026-07-08)**: added a "+ Log" button on each driver card's CPC bar opening a compact dialog (course, hours, date, provider) that creates a Driver-CPC training record so the progress bar updates without leaving the page (verified 0→7h). Also: the PMI completion "Laden?" brake-test field is now hidden for Ireland/RSA region accounts (not required under RSA).

- **Office Links tab + region tax term (2026-07-08)**: added a dedicated "Links" tab in the Office folder — a reference-bookmarks manager (`/api/links` CRUD, `db.links`): title, URL (auto-prefixed https://), category (Government/Authority, Legislation, Portal, Training, Supplier, General) and notes; grouped by category, opens in new tab. New files `frontend/src/pages/Links.js`. Region pass: added `roadTax` term (UK "Vehicle Tax" / IE "Motor Tax") applied to the Fleet vehicle table + form (complements existing CVRT/MOT, currency, O-licence terms and the IE laden-brake-test hide).

- **Service tab + starter links (2026-07-08)**: added a "Service" tab to Maintenance (`/api/service-records` CRUD, `db.service_records`): vehicle, service type (Full/Interim/Oil/AdBlue/Repair/Other), date, odometer, provider, cost, next-service-due (colour-coded status via compliance_status), notes + invoice upload. New file `frontend/src/pages/Service.js`. Also added `POST /api/links/seed` + "Add starter links" button that inserts region-appropriate official links (6 UK DVSA / 5 IE RSA), idempotent by URL. Verified via curl (service status/days, seed added 6 then 0) + UI smoke.

- **Calendar event editing + service on calendar (2026-07-08)**: added `PUT /api/calendar/events/{id}` and an edit (pencil) button on custom day events so date/title/notes can be corrected. Next-service-due dates from `service_records` now surface on the calendar (type "service", ⚙ icon, colour-coded) and feed email reminders via a new "service" area (registered in ALL_AREAS/AREA_OF, added to the Maintenance recipient preset; service due items within 30 days added in `_reminder_alerts`). Verified via curl (edit updates title/date; service event appears due_soon).

- **AI briefing region fix (2026-07-08)**: the laden brake-test gap in `detect_gaps` is now skipped for IE, and the AI risk-insight prompt is region-aware (reads region from db.users; injects a note telling the model NOT to recommend laden brake tests / DVSA-only requirements for RSA operators, and not to invent gaps). Verified: IE checklist has no brake gap and the briefing no longer mentions "laden".

- **Full region audit of AI checklist (2026-07-08)**: audited every `detect_gaps` rule for DVSA vs RSA. Findings: only the laden brake test is UK-only (suppressed for IE); vehicle-test & annual-test wording now switches MOT↔CVRT via `mot_label`/`test_label`; all other rules (operator licence, TM, insurance GIT/Motor/PL/EL, tacho calibration & downloads, speed limiter, PMI, wheel security, walkarounds, licence/CPC expiry, CPC 35h, training) are EU-derived and correct for both. AI prompt already region-aware + instructed not to invent jurisdiction requirements.

- **Authority badge on AI Briefing (2026-07-08)**: added a DVSA/RSA pill badge (`ai-authority-badge`) to the AI Compliance Briefing card on the Dashboard, driven by `getTerms(user.region).authority`, so the applied jurisdiction is always visible and updates with the region toggle. Verified in UI (shows DVSA for UK).

## Backlog
- P2: Role-based views (driver vs manager), scheduled email reminders for expiries/PMI due.
- P2: Export compliance report (PDF), tachograph infringement log detail.
- P2: UI delete/soft-delete for uploaded files & inspection history records.
- Minor: silence React uncontrolled->controlled warning on training driver select (cosmetic).

## Next Tasks
- Await user feedback; then tackle P1 items (file uploads, roles).
