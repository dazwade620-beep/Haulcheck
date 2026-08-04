## Feature batch (2026-08 fork pt.12 — Recurring Edit One-vs-All + Dashboard Roster Snapshot) — VERIFIED (backend curl + testing_agent iteration_42.json 100%)
- **Edit/Delete one occurrence vs whole series** for recurring calendar events/reminders:
  - Backend: `_expand_occurrences(..., exceptions)` now skips exception dates. `DELETE /api/calendar/events/{id}?occurrence=DATE` adds the date to `exceptions` (removes just that date); no `occurrence` param = delete whole series. New `PUT /api/calendar/events/{id}/occurrence` (`OccurrenceEditInput` = CalendarEventInput + `occurrence_date`) adds the original date to `exceptions` and inserts a detached one-off event with the edited fields. `PUT /api/calendar/events/{id}` still edits the whole series (exceptions preserved).
  - Frontend (Calendar.js): editing a recurring item shows an `edit-scope` selector (`edit-scope-one` / `edit-scope-all`); deleting shows a scope Dialog (`delete-one` / `delete-all`). Non-recurring items edit/delete directly (no prompt). State: editIsRecurring/editScope/editOccDate/delTarget.
- **Dashboard "Who's off this week" roster strip**:
  - Backend `GET /api/roster/week` → `{week_start, total_off, days:[{date, weekday, day_num, off:[names], count, clash(≥2), is_today}]}` (Mon–Sun, holidays overlapping the week).
  - Frontend `components/RosterStrip.js` (test-ids `roster-strip`, `roster-day`, `roster-off-names`) rendered on the Dashboard after the KPI grid; clash days amber, today ringed. Verified via screenshot + testing agent.
- Advisory (not actioned, per no-unrequested-refactor): Calendar.js ~745 lines; shared renderEvent duplicates edit/delete test-ids across the sidebar and enlarged day dialog.


## Feature batch (2026-08 fork pt.11 — Recurring events, Reminder lead times, Holiday clash, Driver leaver archive) — VERIFIED (backend curl + scheduler test + testing_agent iteration_41.json; holiday-name UI bug found & fixed + self-tested)
- **Recurring events** (Reminders + General events): `CalendarEventInput` gained `recurrence` (none|weekly|fortnightly|monthly) + `recurrence_until`. `GET /api/calendar` expands occurrences via `_expand_occurrences(base, recurrence, until, horizon=372d, cap=120)` — every occurrence shares the same `id` so edit/delete affects the series. Frontend: reusable `RepeatFields` (Repeats select + "Repeat until") in the reminder & general-event forms. Test-ids: `event-recurrence`, `reminder-recurrence`, `*-recurrence-until`.
- **Reminder lead times**: `remind_days_before` is now `List[int]` (was int). Frontend replaced the single number with tick-boxes (On the day/1/3/7/14 days before, any combo) — `reminder-leads`, `reminder-lead-{0,1,3,7,14}`. Scheduler `run_calendar_reminders` rewritten: for each reminder occurrence × lead, sends once when `(occ − lead) ≤ today ≤ occ` and the marker `"{occ}:{lead}"` isn't in `reminders_fired` (replaces old `reminder_sent` bool; idempotent, verified). Works for recurring reminders too.
- **Holiday clash alerts** (threshold **2**): frontend counts `type==holiday` events per day (`holidayCountByDay`, `CLASH_THRESHOLD=2`); days at/над threshold get an amber `clash-badge` (⚠ N) on the grid and a `holiday-clash-warning` banner in the day panel. Backend unchanged (already emits one holiday event per person per day).
- **Driver leaver archive**: `Driver`/`DriverInput` have `start_date`/`leave_date`; `PUT /api/drivers/{id}/lifecycle` sets them. Helper `_is_left_driver(d)` (leave_date in the past) excludes leavers from `gather_stats` (KPI driver count + alerts) AND `detect_gaps` (compliance score) — verified count drops 2→1. Drivers page: **Active / Left-Archived** tabs (`drivers-tab-active`/`drivers-tab-archived`), `driver-left-badge`, Employment section (`drv-start-date`/`drv-leave-date`). Calendar add-forms only list active drivers.
- **Bug fixed this batch**: the Holiday `holiday-name-input` free-text field was inert (dual controlled-binding with the driver `<Select value={holForm.name}>`). Fixed by decoupling — Input is the source of truth; the driver dropdown is now an uncontrolled write-only picker (`<Select value="">`). Self-tested: typing a name + two holidays same day → clash badge + warning render.


## Feature batch (2026-08 fork pt.10 — Unified Calendar "Add Event" + EU label) — VERIFIED (backend curl + testing_agent frontend 100%, iteration_40.json)
- **EU label fix**: dashboard/sidebar RegionToggle EU option now reads just **"EU"** (was "EU · Tacho"). File: frontend/src/components/RegionToggle.js.
- **Unified "Add Event" on the Calendar**: single **Add Event** button (data-testid `cal-add-event`) opens a grouped chooser (`add-event-chooser`) so the user can add ANYTHING from one place, and each item saves to its correct record/tab AND shows on the calendar:
  - **Maintenance** → opens MaintenanceQuickAdd on the chosen type: PMI, Service, Defect, Daily Check, Wheel Security, **Job Card** (new). Job Card posts to `/api/job-cards`.
  - **People**: **Driver started** / **Driver leaving** → `PUT /api/drivers/{id}/lifecycle` sets `start_date`/`leave_date` on the driver record (also on Drivers page); **Training day** → `POST /api/training`.
  - **Reminders & other**: **Reminder** (new), Tacho download, Holiday, General event.
- **Reminders**: `CalendarEventInput` gained `reminder`, `remind_email`, `remind_days_before`. `POST/PUT /api/calendar/events` persist them; reminders render with a bell (type `reminder`), are editable/deletable. New scheduler job `run_calendar_reminders` (daily 07:00:05 UTC) emails due reminders once (Resend), using `remind_days_before` lead + `reminder_sent` de-dup.
- **Calendar endpoint** now also emits: `driver_start`, `driver_leave` (from driver start/leave dates), and `job_card` (from job_cards `date_raised`) events. Training already emitted completed + expiry.
- **Models**: `Driver`/`DriverInput` gained `start_date`, `leave_date`. New `DriverDatesInput`.
- Chooser test-ids: `add-choice-{pmi|service|defect|walkaround|wheel|job_card|driver_start|driver_leave|training|reminder|tacho|holiday|event}`. Form test-ids: reminder-title/date/notes/email/days-before, driver-lifecycle-select/date, training-driver/course/category/hours/completed/expiry/provider, mqa-jc-*.
- Note (advisory, not fixed): Calendar.js ~615 lines; renderEvent is used in both the sidebar and the enlarged day Dialog so edit/delete test-ids appear twice in the DOM.


## Feature batch (2026-08 fork pt.9 — Admin "View As" impersonation + Signup Trend) — VERIFIED (backend curl 9/9 + UI E2E)
- **Impersonate / View As** (read-only, 2h): admins can view exactly what an operator sees without a password. Backend: `create_impersonation_jwt(target, admin_id, admin_email)` mints an HS256 token with claims `{imp:true, sub, impersonated_by, impersonated_by_email, scope:"read", jti, iat, exp(+2h)}`. `POST /api/admin/users/{uid}/impersonate` (admin-only) — only allows **account owners** (role=manager, no account_owner_id), rejects staff/viewer (403 "Only account owners can be viewed") and admins (403 "Administrators cannot be viewed") and inactive/missing (404). Writes an `admin_audit` record. `_authenticate` detects `imp` claim and flags the User (`impersonating`, `impersonated_by`, `impersonated_by_email`); malformed imp tokens rejected. `get_current_user` forces `is_admin=False` and skips viewer/staff owner-remapping while impersonating. `require_admin` rejects imp tokens (403). `viewer_write_guard` middleware blocks ALL writes under an imp token (403 "Read-only while viewing as another operator"). `/auth/me` (User model) now returns the impersonation fields.
- **Frontend**: AuthContext gained `viewAs(user)` (stashes admin token in sessionStorage.adminToken, swaps localStorage.token to the imp token, re-hydrates /auth/me) and `exitViewAs()` (restores admin token). logout clears adminToken. Admin.js: per-row **"View as"** button (only for active, non-admin, top-level operators; not self) → navigates to /dashboard. Layout.js: amber **impersonation banner** ("Viewing as X … signed in as admin Y") with **"Exit view"** button → back to /admin. Test-ids: admin-view-as-button, impersonation-banner, exit-view-as-button.
- **Signup Trend** on Admin panel: `GET /api/admin/users` stats now include `signups: {daily:[{date,count}]×30, this_week, this_month}` (this_week = since Monday, this_month = since 1st). Admin.js `SignupTrend` card (recharts BarChart, last 30 days) with headline **This week / This month** counts at the top of the panel. Test-ids: admin-signup-trend, signup-chart, signups-this-week, signups-this-month.
- Security notes (from integration playbook): HS256 only, `algorithms=["HS256"]` on decode; imp tokens are stateless & valid until 2h expiry (no server revocation, acceptable for short TTL); read-only enforced SERVER-SIDE not just in UI.

## Fix (2026-08 fork pt.8 — production admin access)
## Fix (2026-08 fork pt.8 — production admin access)
- Admin allowlist now includes a built-in owner email (traffic@dlz-international.com) UNIONed with ADMIN_EMAILS env, so the /admin panel works on PRODUCTION after redeploy without needing the env var configured there. `_is_admin_email` is case-insensitive. NOTE: the Admin panel + user list is new this session and only reaches production on redeploy; the "95 users" the owner saw live was the older dashboard KPI, not the (undeployed) admin list.

# HaulCheck — Road Haulage Compliance

## Feature batch (2026-08 fork pt.7 — welcome email + admin activity) — verified (backend curl + admin screenshot)
- **Welcome email**: `_send_welcome_email` (Resend) fires fire-and-forget (asyncio.create_task) inside /api/auth/verify right after a new user verifies — friendly welcome + 4-step quick-start + "Open my dashboard" link. VerifyEmailInput gained `base_url` (frontend passes window.location.origin from both the code and link verify paths).
- **Admin activity**: GET /api/admin/users now returns per-user `fleet_size` (vehicles+trailers for the effective account, aggregated once), `drivers`, and `activity` (active ≤7d / idle ≤30d / dormant >30d / never); stats gained `active_7d` + `dormant_30d`. Admin.js shows a Fleet column (truck icon + drivers) and an Activity badge, and the top stat cards now read Registered / Active (7d) / Dormant (30d+) / Unverified. Robust date parsing handles naive/legacy timestamps.


## Feature batch (2026-08 fork pt.6 — email verification, EU region, brake-test score fix, super-admin, staff role) — VERIFIED iter39 (backend 21/21, frontend 100%)
- **Email verification on signup**: POST /api/auth/register no longer logs in — returns {needs_verification,email}, emails a one-click link + 6-digit code (Resend) via `email_verifications` (plaintext token + bcrypt code_hash, 24h expiry, 6-attempt cap on code, ~45s resend rate-limit). Login blocked pre-verify (403 "email_not_verified"). POST /api/auth/verify (token OR code) + /api/auth/resend-verification. Existing users + invited team members grandfathered (email_verified defaults True; only /register sets False). Frontend: verify screen (6-digit input + resend), /verify-email?token= link route. Register now enforces 8-char min password.
- **EU region**: region is now UK|IE|EU. EU = € currency, "Roadworthiness Test" label, "EU (Tachograph & Roadworthiness)" authority, NO UK brake-test requirement. 3-way sidebar toggle (region-UK/IE/EU). reports._terms + all currency/authority strings updated.
- **Brake-test score fix**: missing laden roller brake test is now a **HIGH-priority** gap and UK-only (was medium + fired for UK+EU). A UK fleet with no brake test can no longer score 100%. NOTE: the earlier 100% was PRODUCTION on a stale build — a redeploy applies this.
- **Super-admin panel** (/admin): admin = email in backend .env ADMIN_EMAILS (traffic@dlz-international.com, manager@haulcheck.co.uk). GET /api/admin/users (list + stats: total/active/suspended/verified/unverified/by_region/owners), PUT /api/admin/users/{uid}/active (suspend/reactivate). Suspended = login 403 + every request 401 (immediate sign-out, _authenticate checks `active`). Admin can't suspend self/other admins. Nav link + page gated on user.is_admin (from /auth/me).
- **Staff role**: new invite role "staff" — logs into inviter's account (account_owner_id=inviter, user_id remapped to owner) and CAN edit (not blocked by viewer_write_guard, unlike viewer). Team invite UI has 3 roles (Operator/Staff/Viewer).
- Deferred non-blocking (review): server.py ~5560 lines (module split); detect_gaps re-queries 12 collections per call (no cache); admin_list_users unpaginated (5000 cap); no TTL index on email_verifications (mitigated by delete-per-email + lazy cleanup).


## Feature batch (2026-08 fork pt.5 — monthly trend, board labour totals, prohibition pack, vehicle cost card, high-cost flag) — VERIFIED iter38 (backend 9/9, frontend 100%)
- **Monthly cost trend** (GET /api/maintenance/costs/monthly?months=12, MaintenanceCosts.js LineChart): month-by-month total maintenance spend for last 12 months on the Dashboard.
- **Board labour totals** (JobCards.js): each board column header shows "N jobs · Xh" (sum of labour hours).
- **Prohibition follow-up pack** (GET /api/prohibitions/pack): one PDF of every OPEN prohibition with per-prohibition detail + merged notice attachments; "Follow-up pack" button in Prohibitions (shown when openCount>0).
- **Vehicle cost card** (Vehicles.js): Fleet table now has a "Maintenance" column showing lifetime spend + £/mile per vehicle (from /api/maintenance/costs keyed by registration).
- **Flag expensive vehicles**: /api/maintenance/costs returns totals.avg_cost_per_mile + per-row high_cost (cost_per_mile > 1.5× fleet avg); red "High" badge on the Dashboard cost-per-mile panel and the Fleet row.
- Deferred non-blocking (from review): server.py ~5395 lines (router split); avg_cost_per_mile is simple (not mileage-weighted) mean; high_cost 1.5× multiplier hard-coded; no cap on prohibition-pack attachment merge.


## Feature batch (2026-08 fork pt.4 — DnD board, cost date filter, cost/mile KPI, board filters, prohibition chase) — VERIFIED iter37 (backend 8/8, frontend 100%)
- **Job Card board drag & drop** (JobCards.js): board cards are HTML5-draggable between Open/In-progress/Completed columns (drop → PUT /api/job-cards/{id}/status); arrow buttons kept as fallback.
- **Board & table filters**: filter bar (vehicle + technician selects + Clear + "N of M" count) applied to both board and table views.
- **Maintenance cost date filter** (MaintenanceCosts.js + GET /api/maintenance/costs?from_date=&to_date=): filters job cards/service/repairs by their date, with a from/to picker + clear on the Dashboard chart.
- **Cost-per-mile KPI**: /api/maintenance/costs now returns per-vehicle `miles` (odometer span from fuel fills in range) + `cost_per_mile` (total ÷ miles, null when miles=0); shown in a "Cost per mile" panel beside the spend chart.
- **Prohibition chase reminder**: open prohibitions (status != cleared) whose encounter_date is older than PROHIBITION_CHASE_DAYS (3) are added to the email reminder digest (type 'prohibition', area 'fleet'); each distinguished by reference/id so multiple open PG9s on one reg don't collapse.
- Deferred non-blocking: server.py ~5320 lines (router split recommended); PUT status uses raw dict; costs computed in-memory (fine at MVP scale).


## Feature batch (2026-08 fork pt.3 — PG9 dashboard alert, job-card-from-alert, workshop board, cost chart, auto-close) — VERIFIED iter36 (backend 6/6, frontend 5/5)
- **PG9 live Dashboard alert**: gather_stats now adds every OUTSTANDING prohibition (status != cleared) to the dashboard alerts feed (type='prohibition', status='expired', counts toward risk). Clears when marked cleared.
- **Raise Job Card from alert**: POST /api/alerts/{id}/job-card creates a workshop job card from a defect/PMI alert (source='alert', source_ref='alert:{id}', deduped → 409 on repeat). DefectAlerts.js: wrench button (alert-raise-job-card) on each alert row with a vehicle.
- **Workshop Board view** (JobCards.js): Table/Board toggle; board has Open / In progress / Completed columns with ◀ ▶ move buttons → PUT /api/job-cards/{id}/status (validates open|in_progress|completed).
- **Maintenance Spend chart** (MaintenanceCosts.js on Dashboard): GET /api/maintenance/costs returns per-vehicle totals (job cards + service + repairs) + grand total; stacked recharts horizontal bar chart (top 12 vehicles). Known non-blocking: recharts logs a harmless width(-1) warning on first mount.
- **Auto-close on rectify**: PUT /api/defects/{id}/rectify now flips the linked auto-raised job card (source_ref = defect id) to 'completed' and writes a 'Defect rectified …' note, keeping the workshop board in sync.
- Deferred non-blocking: _next_job_number/count is not concurrency-safe; no unique index on (user_id, source_ref); server.py ~5276 lines (modular refactor recommended).


## Feature batch (2026-08 fork pt.2 — PG9 log, Job Card PDF, auto job cards, compliance-doc reminders, audit-pack spend) — VERIFIED iter35 (backend 11/11, frontend 100%)
- **PG9 Roadside Prohibition Log** (Prohibitions.js `ProhibitionsPanel`, new Fleet tab): log DVSA/RSA roadside stops — vehicle, driver, date, location, authority (DVSA/RSA/Police/Other), encounter type, prohibition type (immediate/delayed/S-marked/none), category, reference, details, fixed penalty + amount + points, status (open/cleared) + cleared date, notes, attachments. Summary strip (encounters/PG9/outstanding/penalties) + branded PDF report. Backend Prohibition/ProhibitionInput models + GET/POST/PUT/DELETE /api/prohibitions. Wired into Vehicles.js (tab-prohibitions).
- **Job Card PDF**: per-card branded PDF GET /api/job-cards/{id}/report (?include_files merges attachments) + a job-cards list report kind. JobCards.js: per-row Download button + header 'Report' button.
- **Auto job cards**: a defect report (manager POST /defects + driver /driver/defect) and a PMI/interim inspection FAIL now auto-raise a linked workshop Job Card via `_auto_job_card` (source='defect'|'pmi_fail', source_ref = defect/record id, deduped by source_ref). Auto rows show a blue 'Auto' badge.
- **Compliance-doc reminders**: `_reminder_alerts` now includes compliance_docs whose expiry_date is within 30 days (type 'compliance_doc', area 'documents') so they surface in the daily/weekly digest.
- **Fleet Audit Report enrichment**: audit_pack now has a 'Workshop Job Cards' section, a 'Roadside Prohibitions (PG9)' section, and Overview KPIs for Job cards / Open job cards / **Maintenance spend** (job cards + service + repairs) / Roadside prohibitions. reports.job_cards_report + prohibitions_report; _report_data + _REPORT_BUILDERS + _REPORT_FILE_KEYS extended.
- Viewer role: new write endpoints blocked (403); reads/reports allowed.
- Known non-blocking (deferred): _next_job_number uses count (not concurrency-safe) — fine for single-operator use; server.py ~5210 lines (modular-router refactor recommended).


## Feature batch (2026-08 fork — Job Cards, Compliance Docs, Operator financials, VOR calendar span) — VERIFIED iter34 (backend 10/10, frontend 8/8)
- **Maintenance › Job Cards tab** (JobCards.js `JobCardsPanel`): workshop job-card CRUD — vehicle, date raised, status (open/in_progress/completed), work requested, work carried out, parts used, technician, labour hours, cost, odometer, signed off by, notes + file uploads. Auto job number `JC-0001`. Backend JobCard/JobCardInput models + GET/POST/PUT/DELETE /api/job-cards. Wired into Maintenance.js (VALID + tab-job-cards). Vehicle picker deduplicated by registration.
- **Office › Compliance Docs tab** (ComplianceDocs.js `ComplianceDocsPanel`): compliance document + web-link store — title, category (Operator Licence/Insurance/H&S/Environmental/Policies/Certificates/HR/Financial/Web Link/Other), reference, expiry/review date (colour-coded status pill), web link (auto https:// prefix), notes + file uploads. Card grid with category filter pills. Backend CompanyDoc/ComplianceDocInput models + GET/POST/PUT/DELETE /api/compliance-docs. Wired into Office.js (tab-compliance).
- **Operator › Financial & Contact section** (Operator.js): VAT number, EORI number, website, company email + bank details (sort code, account number, SWIFT/BIC, IBAN). Persists via existing PUT /api/operator.
- **VOR spans every calendar day**: GET /api/calendar emits a `vor` event for every day between vor_off_date and vor_expected_return (capped 366 days); Calendar.js already had `vor` TYPE_META.
- **BUG FIX (critical regression)**: a duplicate `ComplianceDoc` Pydantic model was added for the new feature, silently overriding the existing Documents model (would drop doc_type/letter_data on document create/generate). Renamed the new model to `CompanyDoc`; existing Office Documents + AI letter generation verified intact.
- **BUG FIX**: Operator page crashed — `Landmark` lucide icon used without import. Added to imports.
- Viewer role: new /api/job-cards & /api/compliance-docs writes are blocked (403) by viewer_write_guard middleware (not in exempt paths); GET allowed.


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


## Maintenance Providers tab + Contact Us page (2026-06 fork) — VERIFIED iter33 (frontend 11/11, backend curl-verified)
- **Maintenance › Providers tab** (MaintenanceProviders.js): CRUD for multiple maintenance providers/contractors — name, type (Garage/PMI inspector/Tyre/Tacho/Brake test/Recovery/Parts/MOT station/Other), contact name, phone, email, address, services, contract start/end, notes, and **signed-contract file uploads** (FileUpload → object storage). Backend: MaintenanceProvider/Input models + GET/POST/PUT/DELETE /api/maintenance-providers. Tab added to Maintenance.js (VALID + trigger + content).
- **Contact Us page** (Contact.js, public route /contact): "Get in touch" hero with the agreed copy + info@haulcheck.co.uk card; form (name, email, message) → POST /api/contact (PUBLIC, added to _VIEWER_EXEMPT_PATHS). Submissions are BOTH emailed via Resend to SENDER_EMAIL (info@haulcheck.co.uk, reply-to = sender) AND saved to contact_messages. When a manager is logged in, the page also shows a received-messages inbox (GET/DELETE /api/contact-messages). Links added in the app sidebar (Layout.js 'Contact') and the login page ('Contact us').
- Note (cosmetic, not fixed): the public /contact page can emit a harmless 401 in console if a stale token exists in localStorage; feature unaffected.

## Weekly walkaround now shows on the Calendar (2026-06 fork) — verified (API + UI)
- BUG: recorded Weekly Walkaround days did not appear on the Calendar (only daily checks + recurring PMI did). The `/api/calendar` aggregator had no `weekly_walkarounds` loop.
- FIX (server.py calendar endpoint): for each weekly sheet, every day with a recorded checklist now emits a `weekly_walkaround` event on that day's date — "Weekly Check — <reg>" with Nil defect / Defects found + driver, status due_soon when defects. Frontend Calendar.js: registered `weekly_walkaround` in TYPE_META (label "Weekly Check", ClipboardCheck icon) and EVENT_LINK (/maintenance?tab=weekly).

## Nil-defect quick tick on walkarounds (2026-06 fork) — self-tested (driver daily verified E2E: nil_defect + 24 items all OK persisted)
- **Driver daily walkaround** (DriverApp.js): prominent green "Nil defect — all OK, submit" one-tap button at the top submits a full all-OK checklist instantly (submit() refactored to accept an optional checklist arg; submitNil = submit(buildChecklist())). Manual item-by-item list remains below for defect cases.
- **Driver weekly walkaround** (DriverApp.js): "Nil defect today (all OK)" button on the sheet screen (nilToday — submits directly, or opens the check with all-OK preset when a weekly signature is still needed) + a "Mark all OK (nil defect)" quick tick inside the checking view.
- **Manager weekly grid** (WeeklyWalkaround.js WeeklyEditor): per-day "✓ all" button in each day column header (setDayAllOk) marks that whole day nil-defect (all items OK).
- **Manager daily** (Walkaround.js): already had "Mark all OK" (walk-all-pass) — unchanged.

## VOR/Sold compliance-score fix + Sold-Disposed status (2026-06 fork) — VERIFIED iter32 (backend 7/7, frontend 100%)
- **BUG FIX (compliance score)**: a VOR (Vehicle Off Road) vehicle's overdue PMI and wheel-security items were still counted in `gather_stats` → wrongly lowering the risk score & showing alerts. Root cause: the PMI-schedule and wheel-audit loops had no VOR check (vehicle/trailer loops did). Fixed: both loops now skip regs in `vor_regs` (VOR + sold). Verified: overdue-PMI account scored 18 → 38 after VOR, expired 1 → 0, PMI alert removed. Flows through to Dashboard alerts + auto-alert bell (both derive from gather_stats) and AI briefing.
- **FEATURE — Sold / Disposed status** (kept VOR for temporary off-road): new `sold`/`sold_date`/`sold_notes` on Vehicle & Trailer models. `POST /api/vehicles/{vid}/sold` (sets sold, clears VOR, adds a 'Sold' + 'Records retention ends (18mo)' calendar event) and `/sold/clear`. Sold vehicles/trailers are excluded from the compliance score (gather_stats + detect_gaps treat `vor or sold`) but stay in the Fleet list with an amber **SOLD** badge. Vehicles.js: Tag 'Mark sold' button → dialog (sold-date/sold-notes), Undo2 'Restore to active fleet'. Trailers.js: 'Sold / Disposed' checkbox + date/notes in the form + trailer-sold-badge.
- **FEATURE — 18-month records retention** for sold/off-road vehicles: `GET /api/records-retention` gained an 'Off-road / sold vehicles' category (18-month DVSA retention). keep_until = sold_date (or vor_off_date) + 18 months; flagged 'eligible' (Archive) once past, 'approaching' within 60 days. Surfaced in the Dashboard Records Retention card. After 18 months it's flagged only (manual delete — no auto-removal).

## Code review fixes (2026-06 fork — post feature-batch-3) — VERIFIED via curl
- **HIGH (authorization)**: `viewer_write_guard` exempted `path.startswith("/api/driver")`, which also matched the manager
  `/api/drivers` CRUD routes — letting read-only "viewer" users create/edit/delete drivers & issue driver access codes.
  Fixed to `/api/driver/` (trailing slash) so only the driver-phone-app routes are exempt. Verified: viewer now 403 on
  POST/DELETE /api/drivers, access-code, licence-checks; GET still 200.
- **MEDIUM (data integrity)**: licence-check headline sync now recomputes the driver's headline fields from the LATEST
  remaining check by check_date on both insert AND delete (`_sync_driver_licence_headline`), instead of blindly overwriting
  with the submitted record and never recomputing on delete.
- **Robustness**: reportlab `Paragraph` cells in build_report_pdf now XML-escape user text (`_esc`/`_xml_escape`) so `&`, `<`,
  `>` in notes/reg/description no longer crash PDF generation (all /reports/* + vehicle history + test history).
- **LOW**: Test-History first-time pass rate counts `advisory` as a pass; vehicle-history JSON `has_files` computed from real attachments.

## Feature batch 3 (2026-06 fork — licence-check log, vehicle history pack, records retention, PG9 pass-rate) — VERIFIED iter31 (backend 10/10, frontend 4/4)
- **Driver Licence-Check History Log** (Drivers page): each driver card has a '+ Log check' link opening a dialog to record chronological
  DVLA/NDLS licence checks (check date, next-due, share/check code, penalty points, result clean|points|disqualified|other, notes).
  Shows a per-driver history list with delete. Backend GET/POST/DELETE /api/licence-checks (POST also syncs the driver headline
  licence_check_date/_code/penalty_points/_due). Models LicenceCheckRecord/LicenceCheckInput already existed; frontend dialog wired this session.
- **Vehicle one-click History Pack** (Fleet > Vehicles): per-row History dropdown → GET /api/reports/vehicle/{reg} builds a single branded
  PDF for one vehicle (vehicle detail + PMI schedules/records + annual test/PG9 + defects + service + repairs + wheel + daily + weekly checks
  + recalls). ?include_files=true merges all evidence attachments; ?format=json for on-screen. Reg matching is case/space-insensitive (_norm_reg).
  reports.vehicle_history_report() + reports.test_history_report().
- **Records-Retention indicator** (Dashboard, RetentionCard.js): GET /api/records-retention flags records past / within 60 days of their
  DVSA/RSA minimum retention (PMI 15mo, daily walkaround 15mo, driver defects 15mo, tacho analyses 12mo). Card shows N past retention +
  M approaching; 'View schedule' dialog lists items per category with keep-until dates.
- **Annual-test / PG9 pass-rate summary** (Fleet > Test History tab): summary strip computes annual-test count, first-time pass rate %,
  prohibitions (PG9) count and outstanding PG9 count from existing test_history records.
- Also: added /fleet → /vehicles route redirect; aria-label on vehicle-history-button.
- NOTE: Roller Brake Test (RBT) numeric % fields (service/secondary/parking + laden toggle + brake type) were ALREADY fully implemented
  (Inspections.js + PMICompleteInput + pdf_export Brake Performance section) — the handoff 'forgotten RBT' note was incorrect; no work needed.

## Feature batch 2 (2026-06 fork — recall check, office vehicle check; brake test confirmed)
- **Dashboard "Vehicle Safety Recalls" card**: region-aware official checker link (UK DVSA / IE RSA) + manual recall
  register (RecallRecord + /api/recalls CRUD) tracking outstanding vs actioned, outstanding count on the card.
- **Office → "Vehicle Check" tab**: enter ANY reg + region toggle -> opens official government checkers in a new tab
  (UK: MOT check + tax; IE: CVRT/CRW checker operator.cvrt.ie + motortax.ie). Copies reg to clipboard. Clear caveat
  that insurance can't be checked by plate (askMID closed). No API key needed — deep-links only.
- **Brake test on PMI**: CONFIRMED already fully implemented — PMI form has brake test type/laden/service/secondary/
  parking %, PDF renders a Brake Performance section, and audit flags missing laden brake tests. Nothing to build.
- **Driver licence-check**: existing tracking (last check date, next-due, DVLA check code, penalty points + reminder +
  audit) is comprehensive. A multi-entry HISTORY log was NOT added (offered to user as optional follow-up).
- Verified: recall CRUD via curl; both new UIs render (screenshot). Compiles clean.

## STILL OPEN / decisions:
- Office reg lookup insurance & IE = not available by API (deep-links used instead — DONE via quick-links).
- Optional: driver licence-check multi-entry history log (currently single last-check entry).

- **Read-only Viewer (Transport Manager) role**: invited via Team page (role selector). Viewer logs in, SEES the
  inviter's whole account (get_current_user maps user_id -> account_owner_id), but ALL writes are blocked server-side
  by `viewer_write_guard` middleware (403; exempts /api/auth/* and /api/driver/*). Frontend shows a read-only banner
  + 403 toast interceptor. accept_invite branches: viewer shares owner account (no seed template).
- **Weekly walkaround mid-week start**: week_start no longer snaps to Monday; `weekly_columns()` rotates the 7
  columns to begin on the chosen start date with dated headers; driver `_get_active_weekly` finds the sheet whose
  7-day window includes today. UI + PDF show dated, rotated columns.
- **VOR button (Fleet)**: POST /api/vehicles/{id}/vor (reason, off_date, expected_return) sets flag + creates 2
  calendar events (off-road + expected-back); red VOR badge; /vor/clear returns to service. New fields vor_off_date/
  vor_expected_return.
- **Maintenance "Repairs / Major Work" folder**: RepairRecord + /api/repairs CRUD (category, description, provider,
  cost, odometer, attachments); new Maintenance tab.
- Tested: iteration_30.json — 15/15 backend pytest + frontend E2E (viewer 403 enforcement, mid-week rotation, VOR
  calendar events, repairs CRUD) all pass. (Testing agent fixed a dropped `export default function Vehicles()` line.)

## STILL PENDING from this request (next phase):
- (1) RSA/DVSA recall check on Dashboard — default plan: region-aware quick-link to official checker + manual recall register.
- (4) Office 3rd-party vehicle reg-check — needs DVLA VES API key (UK MOT+tax only; insurance NOT available by API; IE not available).
- Legal must-haves agreed: brake test % on PMI; driver licence-check log.

- (a) Fleet Audit Report now includes a **Weekly Walkaround Checks** section + count (reports.weekly_walkaround_report,
  audit_pack, _REPORT_BUILDERS 'weekly_walkaround').
- (b) **Missed-day flags**: past weekdays with no check show red on the manager weekly-card and driver screen
  (WeeklyWalkaround.js isMissed/missedCount; DriverApp.js driver-weekly-missed).
- (c) Daily expiry **digest email** confirmed already live (APScheduler daily 07:00 UTC) — just needs recipients in Reminders.
- (d) **QR driver onboarding**: Drivers page shows a QR (qrcode.react) encoding /driver?code=CODE; the driver app
  auto-logs-in from the ?code= param (DriverLogin useEffect).
- (e) **Refactor**: extracted the pure .ddd tacho decoder + EU561 engine into `tacho_engine.py`
  (parse_ddd, parse_ddd_last_timestamp, detect_ddd_infringements, _DDD_EXTS). server.py 4483 -> 4292 lines, no regression.
- BUG FIXED (HIGH, pre-existing): audit/tacho PDF 500'd when a tacho summary was long — reports.tacho_report now
  truncates the summary cell (_short) to the first sentence so reportlab can paginate. Verified 200 with a 4,949-char summary.
- Tested: iteration_29.json (refactor regression + features) all pass after the PDF fix.

- New WEEKLY vehicle walkaround sheet (one page = one vehicle, Mon–Sun grid, 24 items ✓/✗ per day),
  with Mileage Start/Finish/Total (auto), Fault Reporting/Action Taken box, ONE driver signature per week.
  PDF header uses the operator company name from Settings. Daily check is unchanged and still present.
- Driver flow: "running weekly sheet" — driver taps "Do today's check" each day; it fills that day's column
  on the same (vehicle, week) sheet; signature captured once; defects raise a manager alert.
- Backend collection `weekly_walkarounds` keyed by (user_id, vehicle_reg, week_start=Monday). Endpoints:
  GET/POST/PUT/DELETE /api/weekly-walkarounds, GET /api/weekly-walkarounds/{id}/sheet,
  GET /api/driver/weekly-walkaround, POST /api/driver/weekly-walkaround/day. PDF: build_weekly_walkaround_pdf.
- UI: Maintenance "Weekly Checks" tab (WeeklyWalkaround.js grid editor) + driver "Weekly Walkaround" tile.
- Verified: 15/15 backend pytest + full manager & driver E2E (iteration_28.json). 100%.

- Manager login page (`/login`) is the front door for logged-out visitors (root already redirects there);
  added "Are you a driver? Open the driver app" link -> /driver, and reciprocal "Sign in here" (manager)
  link on the driver screen so neither user type gets stuck.
- Made the Driver App installable (Add to Home Screen): added public/manifest.json (start_url /driver,
  standalone), public/sw.js (network-first passthrough), icons (192/512/maskable/apple-touch), meta tags
  in index.html, and SW registration in index.js.
- Added `InstallPrompt` on the driver login screen: native prompt on Android/Chrome (beforeinstallprompt),
  manual step-by-step help on iOS Safari, hidden when already installed. Test on a real phone.

- Root cause: `_authenticate` used `cookie_token or bearer`, so a stale Google `session_token` cookie
  (from the inviter's Google login on a shared/previously-used browser) overrode the invitee's fresh
  JWT bearer -> invitee/inviter saw the inviter's account. API data isolation itself was correct.
- Fix: (1) `_authenticate` now prefers a valid Bearer JWT over the cookie; (2) `/auth/login`,
  `/auth/register`, `/auth/accept-invite` clear the `session_token` cookie on their response;
  (3) AuthCallback clears any stale localStorage bearer before Google login.
- Verified via curl: bearer beats stale cookie, Google cookie-only still works, login clears cookie.

## Implemented (2026-06 fork — Forgot Password flow)
- Login screen now has a "Forgot password?" link -> email-only reset form.
- Backend: POST /api/auth/forgot-password (emails secure 1hr reset link via Resend, no email-existence leak),
  GET /api/auth/reset-password/verify?token=, POST /api/auth/reset-password.
- Tokens stored in `password_reset_tokens` (single-use, 1hr expiry). New page /reset-password.
- Verified end-to-end via curl (register->request->verify->reset->login old fails/new works->token reuse blocked) + UI smoke test.

## Implemented (2026-07-19 pt.2 — audit button, defects date, .ddd analyser)
- **Fleet Audit Report button** (sidebar, desktop+mobile): opens region-aware (DVSA/RSA) full audit — vehicles, trailers, drivers, PMI, defects, service, wheel, walkaround, tacho — view/print/PDF/PDF+evidence. Reuses /reports/audit.
- **Defect date field** on Report-a-Defect form (defect_date) + logged on cards/PDF.
- **Log defect from Calendar**: 'Defect' tab in Add-Event dialog; defects render on calendar grid.
- **PMI routine == interim sheet**: schedule-level /pmi/{pid}/report now concatenates full inspection sheets (build_pmi_sheet_pdf) instead of the old summary table.
- **.ddd tacho analyser** (server.py parse_ddd + detect_ddd_infringements + run_tacho_analysis): decodes driver-card digital-tacho binary into daily activity records and runs deterministic EU 561/2006 checks (4.5h continuous driving, 9h/10h daily driving, 9h/11h daily rest). Both /tacho/analyse and /driver/tacho/analyse route .ddd to the decoder; images/PDF still use AI vision. Frontend analyse dialog accepts .ddd/.tgd/.c1b/.v1b. Verified end-to-end (upload→decode→3 infringements→PDF).


## Implemented (2026-07-19 — Alerts, trend, PMI sheet & interim)
- **Overdue auto-alerts** (VERIFIED iter 26): GET /api/alerts auto-syncs in-app alerts (type='overdue', with dedup_key) for every EXPIRED compliance item (MOT/tax/licence/CPC/tacho/PMI/insurance/training/wheel/trailer). Severity map: MOT/Licence/insurance→safety_critical, training/licence-check/tacho→minor, else major. Dismiss (DELETE) persists in db.dismissed_alerts so items aren't recreated; renewed items auto-clear on reconcile. 120s per-user throttle. server.py sync_overdue_alerts().
- **Compliance trend chart** (VERIFIED iter 26): GET /api/dashboard upserts a daily db.compliance_history snapshot; GET /api/compliance/history?days=90 returns rows. Frontend ComplianceTrend.js (recharts line chart with 60/85 reference bands) on Dashboard.
- **Registered Users tile + sidebar alert badge** (prior session, verified).
- **PMI Inspection Sheet PDF** (VERIFIED iter 27): GET /api/pmi/records/{rid}/sheet → full itemised sheet reproducing the operator's HCV template (header fields, 67 items across sections A/B/C with Check no./TM no./✓-✗ condition/defect description/rectified-by, brake performance, action-taken-on-defects, SQP declaration & signature block). pdf_export.build_pmi_sheet_pdf() + PMI_TM_NUMBERS; ✓/✗ via registered FreeSerif TTF. ?include_files=true merges uploaded attachments. 'Sheet' download buttons on every Recent Inspection row + PMI history popover.
- **Interim inspection (one-off, no schedule)** (VERIFIED iter 27): POST /api/pmi/interim creates a standalone pmi_record (inspection_type='interim', pmi_id=null) WITHOUT creating/advancing any recurring schedule; fail result raises a pmi_fail alert. Frontend 'Interim Inspection' button + dialog (required vehicle selector) in Inspections.js; 'INTERIM' badge on records.
- **On-screen signature pad on PMI sheet** (2026-07-19, self-verified: UI capture + PDF render): SignaturePad.js (canvas, mouse/touch, Clear) captures 'Inspection carried out by' + 'Defects rectified by' signatures in the Record/Interim dialog. Stored as base64 PNG in the pmi_record (inspector_signature/rectifier_signature via PMICompleteInput). build_pmi_sheet_pdf renders them into the declaration block instead of blank signature lines.
- **Email reminders** (pre-existing, confirmed working): daily/weekly APScheduler jobs + Resend; Reminders page + /api/reminders/* (Resend still in TEST MODE — verify a domain for external delivery).

## Implemented (2026-07-09 — Calendar & Fleet session)
- **Calendar = full compliance hub**: now plots ALL work & expiry dates — vehicle MOT/CVRT (region-aware), Tax/Motor Tax, Service Due, Tacho Calibration, Speed Limiter; driver Licence/CPC/Tacho-card expiry + Licence Check; PMI due (recurring; freq **0 = one-off/interim**) + PMI completed; defects (user-picked `defect_date` + mileage); wheel audits (audit_date + next_due); daily walkarounds (`walkaround_checks` collection — note collection name); service (service_date + next_service_due); training (completed_date + expiry); insurance; tacho downloads + due; holidays; custom events.
- **Add Maintenance dialog** (`MaintenanceQuickAdd.js`) from calendar Maintenance button + per-day "Add": type picker (PMI/Service/Defect/Daily Check/Wheel) → posts to existing endpoints. Vehicles+trailers in dropdown (trailers use `trailer_number`). Service odometer/cost coerced to numbers (was causing 422 "could not save").
- **Add to Calendar dialog** now 3 modes: General event / **Tacho download** (Vehicle Unit or Driver Card → logs download + schedules next due) / **Holiday** (from–to range auto-expands to每 day via `/holidays` collection; `create_holiday`/`delete_holiday`).
- Auto-generated calendar entries deep-link "View / edit record →" to source page+tab (`?tab=` on Maintenance & Office).
- **Fuel split (option c)**: FuelRecord now `fill_type` (diesel|adblue) + single `litres`. Separate Add Diesel / Add AdBlue, All/Diesel/AdBlue filter tabs, separate stat cards. Diesel drives MPG (odometer between fills) + CO₂; AdBlue usage-only. **PDF report** `GET /api/fuel/report?from_date&to_date&vehicle_reg` (branded, per-vehicle breakdown + separate diesel/AdBlue tables).
- **VOR** (vehicle off road): `vor`+`vor_reason` on Vehicle/Trailer; badge in list; excluded from `gather_stats` alerts.
- **Defect mileage**: `odometer` field on defects (form + card + MQA).
- **PMI report copy**: attachments on `PMICompleteInput`/record — upload signed PMI sheet in Record Inspection dialog, shown on Recent Inspections row.
- **Maintenance registration folders** across all 5 tabs (`RegFolders.js`, normalised via `normReg`/`matchesReg`). PMI schedule cards show "Last inspection"; Recent Inspections rows deletable (`DELETE /api/pmi/records/{id}`). Service tab → "Vehicles Service".
- **Training completed date now required** (Office Training form + driver CPC quick-log).
- **AI briefing markdown render**: Dashboard now renders `**bold**` + paragraphs (was showing raw asterisks).
- **Company doc templates**: added CMR Consignment Note, POD, Waste Transfer Note.
- **Team**: invitations + accept-invite, member last-login/activation, Deactivate/Reactivate (`PUT /api/invitations/{id}/member-status`).

### KNOWN ISSUE — Resend in TEST MODE (P0 for user)
`SENDER_EMAIL=onboarding@resend.dev` → Resend can only deliver to the account owner's own email (dazwade620@gmail.com); external invite/audit/reminder emails are REJECTED. Invite endpoint now returns `email_sent`/`email_error`; Team page warns + auto-copies invite link as fallback. **Fix requires the user to verify a domain at resend.com/domains and set SENDER_EMAIL to it** — cannot be done from the app.

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

- **Jurisdiction on PDF headers (2026-07-08)**: `build_report_pdf` now takes an `authority` arg and prints it in the brand line ("HAULCHECK · COMPLIANCE · DVSA (UK)" / "RSA (Ireland)"). Applied to both `/api/export/account` and `/api/export/driver/{id}` (driver export also now carries the authority). Logo already renders above it. Verified via PDF text extraction.

- **Audit Pack export (2026-07-08)**: `/api/export/account?include_files=true` now returns a company-branded, dated filename (`{CompanySlug}-Audit-Pack-{YYYY-MM}.pdf`) bundling the full fleet report + all merged evidence PDFs. Dashboard Export menu item "Audit Pack" uses it; `downloadPdf` now falls back to the server's Content-Disposition filename when none is passed. Verified: filename `HaulCheck-Logistics-Ltd-Audit-Pack-2026-07.pdf`, 22-page merged output.

- **Email Audit Pack (2026-07-08)**: `POST /api/export/account/email` builds the full audit pack and emails it as a PDF attachment via Resend (reuses RESEND_API_KEY/SENDER_EMAIL). Refactored account PDF generation into `_build_account_pdf(user, include_files)` shared by the GET export and the email endpoint. Dashboard Export menu → "Email Audit Pack…" opens a dialog (recipients + optional message). Verified via curl: send returned an email_id + correct dated filename; empty-recipient → 400.

- **Tacho download false-positive fix (2026-07-08)**: the driver-card & vehicle-unit "no download record" gaps in `detect_gaps` used exact case-sensitive matching of driver name / vehicle reg against the tacho `reference` free-text field, causing false "complete download immediately" prompts when a recent download existed with any case/whitespace/format difference. Now uses a normalized (lowercase + collapsed whitespace) bidirectional-substring match. Verified by testing_agent iteration_15.json (5/5): false gap gone, genuine gaps still fire.
- **Walkaround defect rectify + data isolation (2026-07-08)**: added rectified/rectified_date/rectified_notes to WalkaroundCheck + `PUT /api/walkarounds/{id}/rectify`; Daily Checks cards show a "Mark rectified" button (defects only) → green Rectified badge + banner. Confirmed multi-tenancy: register creates an empty account, every endpoint scoped by user_id — new users see none of another account's data. Verified iteration_14.json (11/11).
- **Email Audit Pack (2026-07-08)**: `POST /api/export/account/email` sends the branded dated audit pack via Resend; Dashboard → Export → "Email Audit Pack…".

- **Tacho "due soon" threshold fix (2026-07-08)**: `compliance_status(days, soon_days=30)` is now configurable; tacho downloads use a 7-day window (`TACHO_SOON_DAYS`) applied to the tacho list, dashboard/gather_stats alerts and calendar events — so a freshly-logged 28-day-cycle download no longer shows "due soon" until ~7 days before due. Verified testing_agent iteration_16 (8/8): 28d→valid/no alert, ~5d→due_soon, vehicle MOT keeps 30-day window.
- **Trade Unions tab (2026-07-08)**: new "Trade Unions" tab in Office (`/api/trade-unions` CRUD, `db.trade_unions`): union name/branch, rep name/role, email/phone, membership no., agreement ref, notes + document upload. New file `frontend/src/pages/TradeUnions.js`. Verified testing_agent iteration_17 (14/14 backend + full frontend, incl. cross-user isolation).

- **User Invitation & Template Setup (2026-06 — VERIFIED)**: managers can invite other operators to their OWN isolated account. Backend: `POST /api/invitations` (creates token, emails invite via Resend, returns invite_link+token), `GET /api/invitations` (list, includes token for copy-link), `DELETE /api/invitations/{id}` (revoke), `GET /api/invitations/verify?token=` (unauthenticated), `POST /api/auth/accept-invite` (consumes token, creates user, `_seed_template` clones inviter's Links + reminder-settings recipient[0] with invitee's own email, sets region). Frontend: new sidebar **Team** page (`/team`, `Team.js`) with invite form + sent-invitations list (copy-link/revoke), and standalone **`/accept-invite?token=`** page (`AcceptInvite.js`) verify→set name/password→auto-login. Data isolation confirmed (invitee sees none of inviter's vehicles/drivers). Also FIXED: email case-sensitivity bug — all user write/lookup paths (register, login, google session, invite) now normalize email to `.lower().strip()`. Verified: testing_agent iteration_18 (14/14 backend + full frontend E2E incl. isolation & template seed).

- **Team overview enrichment (2026-06)**: users now track `last_login_at` (set on JWT login, Google session, and invite acceptance). `GET /api/invitations` enriches accepted invites with the member's `name` + `last_login_at`; the Team page shows each active operator's name, activation date and relative last-active time ("Active" pill). Verified via curl + regression (14/14).

- **Member deactivation (2026-06)**: inviting managers can suspend an activated team member (e.g. for non-payment) from the Team page. `PUT /api/invitations/{id}/member-status {active}` sets `users.active` (scoped to inviter's own members) and clears the member's sessions on deactivate. `_authenticate` and `/auth/login` now reject inactive users (401 on token, 403 with clear message on login). Team page shows a red "Suspended" pill + Deactivate/Reactivate buttons. Verified via curl (activate→me 200, deactivate→me 401 + login 403, reactivate→login 200) + regression 14/14.

- **Vehicles/Trailers VOR (2026-06)**: `vor` + `vor_reason` added to Vehicle/Trailer models. Fleet vehicle & trailer add/edit forms have a "Vehicle/Trailer Off Road (VOR)" checkbox + reason; list rows show a red VOR badge. VOR vehicles/trailers are skipped in `gather_stats` alert generation (no due/overdue noise while off road). Verified via UI + dashboard alert exclusion.

- **Calendar one-stop Maintenance quick-add (2026-06)**: replaced the calendar "Add PMI" button with a **Maintenance** button + a per-day **Add** button in the day-detail panel. Both open `MaintenanceQuickAdd` (`components/MaintenanceQuickAdd.js`): a type picker (PMI Schedule / Service Record / Defect / Daily Check / Wheel Security Audit) → the matching compact form → posts to the existing endpoints (`/pmi`, `/service-records`, `/defects`, `/walkarounds`, `/wheel-audits`) and refreshes the calendar. The day-panel Add pre-fills the clicked day's date. Auto-generated calendar entries now show a "View / edit record →" deep-link to the source page+tab (Maintenance/Office/Fleet/Drivers/Tacho via `?tab=` on Maintenance & Office). Verified end-to-end (defect created via dialog persisted; date prefill confirmed).

- **Maintenance registration folders (2026-06)**: all five Maintenance tabs group records into per-registration "folders" (`components/RegFolders.js`, normalised case/whitespace via `normReg`/`matchesReg` so one truck = one folder). PMI schedule cards show a "Last inspection" date; Recent Inspections rows have a delete button (`DELETE /api/pmi/records/{id}`) that removes the record from both the list and the calendar. Service tab renamed "Vehicles Service".


- **Vehicle type picker + Download-PDF everywhere + PMI history popover (2026-07 — VERIFIED, testing_agent iter 20, backend 15/15, frontend 8/8)**:
  - Added a required **Vehicle type** dropdown to Add/Edit Vehicle (`Vehicles.js` `VEHICLE_TYPES`: HGV (Rigid), HGV (Artic / Tractor Unit), LGV / Van, Car, Minibus / PSV, Other). Migrated 14 legacy `type='HGV'` → `HGV (Rigid)`.
  - Added a **"Download PDF"** button to every records screen. New backend `GET /api/reports/{kind}` (kind ∈ vehicles, trailers, drivers, defects, service, wheel, walkaround, pmi, audit) + `GET /api/pmi/{pid}/report` (per-schedule inspection history). Section builders live in `backend/reports.py`; PDFs use the branded `build_report_pdf`. Frontend uses shared `lib/download.js` `downloadPdf()`.
  - PMI schedule cards gained a **"History (N)"** popover (per-schedule records + attachments) with its own PDF export button.
  - Note: a full Compliance Audit Pack already exists on the Dashboard via `/export/account` (report + all evidence). Driver defects confirmed rendering on the Calendar (backend returns them; live site needs redeploy).

- **Registered Users counter + alert badge (2026-07 — verified via screenshot)**: Dashboard now shows a **Registered Users** banner (platform-wide count of all `users` accounts, via `registered_users` in the `/api/dashboard` response). The sidebar **Dashboard nav item shows a red unread-defect badge** (polls `/api/alerts/unread-count` every 60s) and the browser tab title reflects the unread count.

- **Defect Alerts (2026-07 — self-verified end-to-end via curl + screenshot)**: driver submissions now raise manager alerts. `create_alert()` inserts into `alerts` and, for major/safety-critical, emails the operator via Resend. Triggered on: driver walkaround with defects (major), driver defect report (own severity), and any PMI completed with result=FAIL (safety_critical). Manager endpoints `GET /api/alerts`, `/alerts/unread-count`, `PATCH /alerts/{id}/read`, `POST /alerts/read-all`, `DELETE /alerts/{id}`. Dashboard shows a **"Defect Alerts"** panel (`components/DefectAlerts.js`) with a bell + unread badge, per-alert mark-read/dismiss, deep-link to /maintenance, and "Mark all read".

- **Driver Mobile App (PWA) + DVSA PMI checklist (2026-07 — VERIFIED, testing_agent iter 24/25, backend 25/25 pytest, frontend 100%)**:
  - **Driver app** at `/driver`: drivers log in with a per-driver 6-char ACCESS CODE (PIN, no email; manager generates/rotates it from the Drivers page and assigns a vehicle). Dark mobile UI (`pages/driver/DriverApp.js`, `lib/driverApi.js`) lets drivers: complete the 24-point DVSA walkaround, report a defect with photo, view their own licence/CPC/tacho expiries + shared documents, view their assigned vehicle, and upload a tacho printout for AI analysis. All submissions feed the manager's records scoped to the owning `user_id`. Driver JWT (role="driver", 30-day) under `localStorage.driver_token`; endpoints `/api/driver/*` via `get_current_driver`.
  - **CRITICAL auth fix**: `_authenticate()` now returns None for driver-role tokens so a driver JWT can no longer access manager endpoints (and manager tokens are rejected on driver endpoints).
  - **DVSA PMI inspection sheet**: the PMI "Record Inspection" dialog reproduces the user's HGV PMI sheet — a **67-point checklist** (A: Inside cab, B: Ground level/under-vehicle, C: Brake performance) with a per-line **✓ Serviceable / ✗ Defect dropdown** (+ defect-description input), plus a **"Rectified by (Workshop Manager)"** field. Any defect auto-sets result to FAIL and compiles defects into notes. `checklist` + `rectified_by` persist on the PMI record, show in the History popover ("X/67 serviceable", rectified by) and the PMI history PDF (new Rectified by + Defects columns).

- **DVSA HGV walkaround checklist in-app (2026-07 — VERIFIED, testing_agent iter 23, backend 8/8, frontend 6/6)**: the Daily Walkaround Check "Log Daily Check" dialog now renders the full **24-point DVSA HGV checklist** from the user's template (9 Internal + 15 External checks), each item with a Pass (tick) / Defect (cross) toggle and a per-item defect note. Result and `defects_noted` are auto-derived from failed items; a "Mark all OK" shortcut is provided. The completed `checklist` is stored on `WalkaroundCheck`, shown as "X/Y checks passed" on the card, and added as a "Checks" column in the walkaround report. Attachments (signed sheet/photos) still supported.

- **On-screen Audit Reports (Dashboard) (2026-07 — VERIFIED, testing_agent iter 22 + date-range self-tested)**: replaced the Dashboard "Insurance" KPI tile with an **"Audit Reports"** tile that opens a dialog (`components/AuditReportDialog.js`) to **view any compliance report on screen** — the whole fleet ("Full Compliance Audit Pack") or an individual section (Vehicles, Trailers, Drivers, PMI, Defects, Service, Wheel, Daily Checks, Tacho analyses) — with colour-coded status pills, plus **Print** (print-optimised window) and **Download PDF** ("PDF + evidence" when the pack has attachments). A **From/To date-range filter** scopes time-series records (defects, service, wheel, daily checks, tacho, PMI records) to a period for DVSA-visit-specific packs; current-state records (fleet, drivers, PMI schedules) stay unfiltered. Backend `GET /api/reports/{kind}?format=json&from_date=&to_date=` returns the same builder output as the PDFs; added a `tacho` report kind + Tacho in the audit pack.

- **Calendar layout & click-to-enlarge (2026-07 — verified via screenshot)**: calendar grid widened (`lg:col-span-3` of 4) and the day-detail side panel narrowed; panel header now shows just the day ("Wed 8"). Clicking any day opens an enlarged, scrollable Dialog with that day's full event list. Per-cell event cap raised 3→4.

- **Tacho infringement documents + AI Analyser (2026-07 — VERIFIED, testing_agent iter 21, backend 10/10, frontend 5/5)**:
  - Added AI-drafted Documents Generator templates: **Driver Infringement, Adhoc Note, Attestation Record, Indoctrination Document, Infringement Report** (region-aware `LETTER_GUIDES`).
  - New **Infringement Analyser** tab on the Tacho Portal: upload a driver-card/vehicle-unit printout or tacho report (image/PDF) → `POST /api/tacho/analyse` runs region-aware AI (GB/EU 561/2006; gpt-4o for images, gemini-2.5-flash for PDFs) returning a detailed infringement list (type, datetime, rule breached, severity, action) + summary. Saved to `tacho_analyses` (`GET /api/tacho/analyses`, `DELETE .../{id}`), exportable as branded PDF (`GET .../{id}/report`). One-click **"Create Driver Infringement letter"** hands the findings to the Documents generator via sessionStorage + `/office?tab=documents`.

- **Report evidence bundling (2026-07 — verified: backend 200 %PDF on all `include_files=true`, merge unit-test appends pages, frontend dropdown renders)**: report screens with record attachments (PMI, Defects, Vehicles Service, Wheel Security, Daily Checks) now offer a dropdown — **"Report (summary)"** vs **"Report + evidence files"** — via reusable `components/ReportDownload.js`. Backend `GET /api/reports/{kind}?include_files=true` and `GET /api/pmi/{pid}/report?include_files=true` merge each record's uploaded attachments (signed sheets, photos) after the summary using the shared `_collect_files` + `merge_pack`. The PMI History popover's PDF button ("PDF + sheets") always bundles the signed inspection sheets.
- **PMI per-schedule "Last inspection" fix (2026-07 — VERIFIED, testing_agent iter 19, 3/3)**: PMI schedule cards computed "Last inspection" by matching on `vehicle_reg`, so a vehicle with multiple schedules (e.g. several freq=0 one-offs + a recurring) showed the SAME (globally latest) date on every card. Fixed in `Inspections.js:108-115` to match by the schedule's own `pmi_id` (`records.filter(r => r.pmi_id === p.id && r.inspection_date).sort().pop()`); each card now shows its own last inspection ("—" when none). Backend `POST /api/pmi/{pid}/complete` already stamps records with `pmi_id`.

- **Company Document Generator — transport templates (2026-06)**: added CMR Consignment Note, Proof of Delivery (POD) and Waste Transfer Note to the generator (backend `LETTER_GUIDES` + frontend `LETTER_TEMPLATES`), producing structured branded PDFs.

- **User Invitation, Team overview & member deactivation (2026-06 — VERIFIED, testing_agent iter 18, 14/14)**: managers invite operators (Team page `/team`) to their own isolated accounts pre-seeded with Links + reminder template; `/accept-invite?token=` page. Team page shows Active members with name/activation/last-active (via `last_login_at`), and Deactivate/Reactivate (`PUT /api/invitations/{id}/member-status`) that blocks a member's tokens (401) + login (403). Email case-normalised on all auth paths.

## Backlog
- P2: Role-based views (driver vs manager), scheduled email reminders for expiries/PMI due.
- P2: Export compliance report (PDF), tachograph infringement log detail.
- P2: UI delete/soft-delete for uploaded files & inspection history records.
- Minor: silence React uncontrolled->controlled warning on training driver select (cosmetic).

## Next Tasks
- Await user feedback; then tackle P1 items (file uploads, roles).
