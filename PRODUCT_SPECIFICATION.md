# myHR by Swaniki — Product Specification
### Current capabilities & the roadmap to a complete SME HRMS

**Doc purpose:** Define (A) every functionality built into the product today, with honest maturity,
and (B) what must still be built for myHR to be a **complete HRMS for Small & Medium Enterprises**.

**Maturity legend:** ✅ Built & usable · 🟡 Partial (exists but incomplete) · ⛔ Not built

- **Live:** https://myhr-by-swaniki.vercel.app · **Demo password:** `Welcome@123`
- Companion doc: `FUNCTIONALITIES.md` (full API/endpoint reference).

---

## 1. Vision & target users

myHR is a **single-system HR + Payroll + Attendance** platform for Indian SMEs (≈20–500 employees),
replacing legacy vendor suites (e.g., Spine HR) and spreadsheet-based HR. It unifies
**biometric attendance → payroll → statutory compliance**, with role-based access and self-service.

**Personas**
| Persona | Needs |
| :--- | :--- |
| **Owner / Director** | Org-wide dashboards, cost, compliance confidence |
| **HR / Payroll Admin** | Attend, payroll, leave, roster, employee records, reports |
| **Reporting Manager** | Team attendance/leaves approvals, roster, corrections |
| **Employee** | View own attendance/payslips/leaves/roster, request leave/corrections, change password |
| **Accountant** | Payroll registers, bank/Tally exports, statutory numbers |

---

## 2. Platform & architecture (summary)

React 19 + Vite SPA · Express (Node ≥22) serverless API on Vercel · **PostgreSQL (Neon)**.
Request security chain: `requireAuth` (JWT) → `accessGuard` (role perms + data scope) → `requirePerm(key)`.
Data scope enforced via `scopeFilter()` with a recursive manager CTE for `TEAM`.
Biometric files read transiently with `node:sqlite`.

---

# PART A — Current feature specification

## A1. Authentication & session — ✅
- **Real login** with company email + bcrypt-verified password.
- **Tokens:** 15-min JWT access token + rotating **7-day refresh httpOnly cookie** (secure/same-site), silent refresh on app boot.
- **Self-service & forced** password change; **admin reset** (issues a temp password, forces change).
- **Protections:** login rate limit (10/min/IP) + **account lockout** (5 fails → 30 min); status/`must_change_password` server-gated.
- **Limits:** no MFA/OTP; no social/SSO; no "remember device".

## A2. Access control (RBAC + data scope) — ✅
- **18 permission keys**, **4 data scopes** (`SELF/TEAM/DEPARTMENT/ALL`), **4 seeded roles** (Super Admin, HR Admin, Manager, Employee).
- **Admin → Access Management:** create/edit/delete custom roles, toggle permissions, set scope, assign employee roles & **reporting manager** (hierarchy).
- Permission-driven navigation & API enforcement.
- **Limits:** coarse-grained (no field-level / action-on-behalf scoping); no per-page granular view/edit split beyond key set; no audit trail of permission changes.

## A3. Organization & settings — ✅
- Company profile & branding (name, tagline, industry, address, GSTIN, registration no., director, contacts).
- Settings for security (password policy fields), payroll & **statutory rule** configuration; consumed by engines via `settingsService`/`config`.
- **Limits:** mostly single-org; multi-entity / branch-level config not modeled in UI.

## A4. Employee master — 🟡
- Staff records: profile, department, designation, shift, manager, joining date, gender/city/mobile/email, bank details, statutory IDs (UAN, ESIC, PAN), personal details & documents (seeded).
- **Read scoped** by data access; edit with `EMPLOYEES_EDIT`.
- **Limits:** primarily **view/update** (`GET/PUT /employees/:id`); **no dedicated create / onboard / exit / rejoin** flow or CSV bulk import in the API today; document upload/verify workflow thin.

## A5. Biometric ingestion & devices — ✅
- **Three ingestion paths:** device push (`/biometrics/punch`), **scheduled API pull** (vendor punch APIs), and **file import** (SQLite `.db` / `.sql` dumps) with **auto-detected vendor tables/columns**.
- **Data Sources** admin UI: integration type (API/SQL), auth, **download URL + auto-fetch**, connection test, **manual Fetch Now/sync**, and **per-source column mapping** to fit any client schema.
- Devices registry + models catalog + **live punch SSE stream** + **punch simulator**.
- **Limits:** on serverless (Vercel) the in-process scheduler is skipped → auto-pull/auto-fetch needs an **external cron**; device **template push / biometric enrollment** not built; offline edge only via companion Python bridge.

## A6. Attendance engine — ✅
- Converts punches → daily `attendance_records`; **cross-midnight** duty-date anchoring; grace & **late** detection; **half/full/overtime** classification; absent derivation.
- **Limits:** no multi-shift-in-a-day / split shifts; no manual "punch pair" editing UI beyond corrections; no **geo/OTP/mobile** attendance source.

## A7. Attendance management UI — ✅
- Today view, filterable records (dept/shift/search), **monthly summary register**, CSV export; statuses: Present/Overtime/Regularized/Half/Absent/On-Leave.

## A8. Regularization & corrections — ✅
- Employee **correction request** → manager/HR **approve/reject** workflow; admin **regularize** a day; manager **hours override**.

## A9. Shifts & roster — 🟡
- Shift master (day/evening/night/general, **cross-midnight**, grace/break, color); 24×7 roster view & employee shift assignment; shift coverage visualizations.
- **Limits:** no **roster auto-scheduling**, rotation patterns, shift-swapping, or weekly cyclic templates; no strong leave↔roster conflict checks.

## A10. Leave management — ✅ (core) / 🟡 (accrual)
- Leave **types** (annual/sick/casual/comp-off/bereavement) w/ allowance, accrual basis, carry-forward, encashment, color; **balances**; **request → approve/reject**; per-employee & set-all balance admin.
- **Limits:** accrual appears **frontloaded/manually** managed rather than a scheduled monthly/annual accrual job; no **leave calendar/holiday-by-branch**, no **leave-in-lieu / maternity policies engine**, no half-day/hourly leave granularity UI, no payslip↔LOP deep link automation beyond status.

## A11. Payroll engine (statutory) — ✅ (core) / 🟡 (completeness)
- Monthly run over scope-visible staff: **EPF 12% (capped), ESIC 0.75% (≤₹21k), MP Professional Tax slabs, Gratuity accrual, tiered Overtime**; full/half/LOP driven by attendance.
- **Limits:** no **income-tax/TDS (old & new regime)**, no **salary revisions/arreals**, **loans/advances**, **reimbursements/claims**, **variable pay/incentives/bonus**, **arrears**, or **Full & Final settlement**; statutory set is MP-centric (not multi-state); no payroll **accounting journal** auto-posting.

## A12. Payslips, runs & payroll exports — ✅
- Payslip per employee/month (earnings/deductions breakdown, PDF print), run history, per-employee salary history, **bank advice** + **Tally** export files.
- **Limits:** no scheduled payslip **email/WhatsApp delivery**; no password-protected PDF; no role-gated bulk payslip zip.

## A13. Dashboard & analytics — ✅ (basic)
- **Scope-aware** KPIs (staff/present/absent/late/hours/payroll), attendance **trend**, by-department staffing, pending-approvals digest, "My attendance" for self scope; universal **date-range** picker.
- **Limits:** no custom/saved dashboards, no cost/attrition/absence analytics, no scheduled em, no BI drill-through beyond modals.

## A14. Reports — 🟡
- Attendance **custom report builder** (muster/registers, PDF) in Demo Lab; payroll exports; CSV exports.
- **Limits:** report library thin and partly **demo-scoped**; no statutory registers (e.g., Form 6/11/12/24), no scheduled/emailed reports, no Excel/PDF template management.

## A15. Demo Lab tooling — ✅
- Device simulator, hardware-gateway/partner hub, 24×7 roster sandbox, **Data Sources** config, custom reports. (Wired to real backend; demonstration content.)

## A16. UX / responsive / theming — ✅
- **Light/dark** themes (persisted), **responsive** layout with mobile drawer + **bottom tab bar** + safe-area, splash/loading states, modals (payslip, password, drilldowns), live punch feed.
- **Limits:** not an installable **PWA/offline**; no localization beyond en-IN.

---

## A17. Maturity snapshot

| Module | Status |
| :--- | :---: |
| Auth & session | ✅ |
| RBAC & data scope | ✅ |
| Organization & settings | ✅ |
| Employee master | 🟡 |
| Biometric ingestion & devices | ✅ (auto-schedule needs cron) |
| Attendance engine & UI | ✅ |
| Regularization & corrections | ✅ |
| Shifts & roster | 🟡 |
| Leave management | 🟡 |
| Payroll (statutory) | 🟡 |
| Payslips & exports | ✅ |
| Dashboard & analytics | ✅ (basic) |
| Reports | 🟡 |
| Self-service portal & mobile | 🟡 |
| Recruitment/ATS | ⛔ |
| Onboarding/Offboarding | ⛔ |
| Performance management | ⛔ |
| Expenses/Claims | ⛔ |
| Compliance & e-filing | 🟡 (calc only) |
| Notifications | ⛔ |
| Audit log / security ops | ⛔ (mostly) |
| Multi-company/branch | ⛔ |
| Integrations (SSO/accounting/payment) | 🟡 (Tally export) |

---

# PART B — What to build to complete an SME HRMS

Priority: **P0** = required for "complete HRMS" & first paid SME deployments · **P1** = high value ·
**P2** = differentiation. Effort: **S/M/L** (small/medium/large).

## B1. Employee Self-Service portal + Mobile (P0, L)
- Installable **PWA** (offline roster/payslip cache), push notifications, in-app **punch via geo-fencing + selfie/OTP** as an attendance source; self profile editing (with HR approval), document upload & acknowledgement, pay slips/income proofs download, birthday/anniversary info, "my team" for managers.
- **Depends on:** attendance source plumbing, notifications (B10).

## B2. Full employee lifecycle — Onboarding / Joining / Transfer / Exit (P0, L)
- Structured onboarding checklists, document collection & verification, offer→joining statuses, asset/IT/LFY checklists, **relieving & Full & Final settlement**, experience/resignation letters. Replaces today's thin `employee_documents`.
- **Enables:** proper employee **create/exit** flows (fixes A4 🟡).

## B3. Recruitment / Applicant Tracking (P1, L)
- Job requisitions, openings, candidate pipeline (kanban), resume parsing, interview scheduling (link to roster/availability), offer management → converts to onboarding. Source analytics.

## B4. Payroll completeness (P0, L) — *biggest gap*
- **Income Tax / TDS:** old & new regime, declarations (Form 12BB), Exemption & deduction calc, monthly TDS, **Challan 281 + Form 16/16AA** generation.
- **Earnings & deductions framework:** configurable pay components, **allowances/perquisites**, **variable pay / incentive / bonus**, festival advance.
- **Loans & advances** with EMI recovery; **arrear** & **salary revision** with effective-date backpay; **retro** adjustments.
- **Full & Final:** notice pay, leave encashment, gratuity, deductions, one-time settlement statement.
- **Multi-state statutory:** per-state PT/labour welfare fund, minimum-notice/hour rules.
- **Accounting:** auto **payroll journal** & GL mapping; payment-file formats beyond Tally (bank-agnostic salary disbursement file / UPI).
- **Depends on:** attendance/LOP (✅), leave encashment (B6), org structure (B11).

## B5. Time & Attendance — advanced (P1, M)
- **Geo-fence/geo-tag punch**, split/rotating multi-shifts, **auto OT approval** rules, shift bidding, **missed-punch auto-suggest**, device **offline reconcile & heartbeat**, **visitor/contractor** punch handling, mid-day breaks & in/out pairs editing UI, work-from-office/remote classification.
- Wire the **scheduler** for real auto-pull/auto-fetch (cron/worker) — closes A5 caveat.

## B6. Leave — advanced (P1, M)
- **Scheduled accrual engine** (monthly/annual pro-rata), **leave calendar** + branch/regional **holiday lists**, **maternity/paternity/sabbatical** policy engine, **half-day & hourly** leave, leave **rules** (min notice, blocking, combos), leave↔**payroll LOP** automation, **leave dashboard** & balances forecast.

## B7. Shift & Roster automation (P1, M)
- Cyclic **roster templates**, **auto-scheduling** with constraints (skills, rest gaps, fatigue, cost), **swap/apply** approvals, coverage alerts, overtime budgeting, link to labor-law **max-hours** rules.

## B8. Performance & Talent (P2, L)
- **KRA/KPI** & goal setting (OKR), appraisal cycles, **self + manager + 360** reviews, rating & calibration, **feedback/1:1**, **PIP**, succession & talent pool, **learning/LMS** (basics), employee engagement (surveys).

## B9. HR Operations & Documents (P1, M)
- **Policy** publication & acknowledgement, **letter generation** (offer, confirmation, increment, experience, relieving) with templates + merge fields, **digital signature**, **employee database/custom fields**, **org chart**, job roles/grades, **announcements**.

## B10. Notifications & Comms (P0, S)
- **Email + SMS + WhatsApp + in-app** with templating & digests (punch confirmation, leave decisions, payroll ready, birthdays, shift alerts, approvals pending). Foundation many modules depend on.

## B11. Multi-company / branch / structure (P1, M)
- **Multi-entity & multi-branch**, cost centers & locations, **legal entities** with separate statutory config & branding, HR/finance role matrix, consolidated vs. per-entity reporting. (Table `organizations` exists; needs hierarchy + tenant switching.)

## B12. Compliance & statutory (P0, L)
- **Audit trail** of user/HR actions (who/what/when), data retention & **DPDP Act 2023** consent/PII controls, statutory **registers** (attendance/OT/wage forms), e-filing exports for **EPFO ECR**, **ESIC returns**, PT, **labour welfare**, minimum wage & working-hour checks, compliance calendar & reminders.

## B13. Analytics, Reports & BI (P1, M)
- Prebuilt report library (attendance, leave, labour cost, attrition, absenteeism, diversity, headcount), **saved/scheduled** reports (email on cadence), Excel/CSV/PDF, **drill-through BI**, exportable datasets, board-ready MIS.

## B14. Integrations (P1, M/L)
- **SSO/SAML/OIDC + SCIM** provisioning, **accounting** (Tally, QuickBooks, Zoho Books) journal push, **payment gateways/banks** for disbursement, calendar sync, ATS boards, biometric **vendor SDK/adapters** (beyond file/API), HR data **webhooks & public REST API**.

## B15. Platform, security & admin ops (P0, M)
- **Centralized logging + user audit log**, **MFA/2FA**, enforceable **password policy**, session/device management, **IP allowlists**, **backup/restore & data-export** (tenant portability), **feature flags**, background **job queue/workers** (for scheduler/payroll bulk), **rate-limit & abuse controls** for bulk APIs, environment secrets CI, **RBAC field-level** permissions, tenant provisioning/onboarding for SaaS.

---

## B16. Recommended build sequence (phased)

**Phase 4 — "Trust & Complete" (make it genuinely sellable to SMEs) — P0**
> Notifications (B10) · Payroll completeness: TDS + F&F + loans/advances + revisions (B4) ·
> Employee lifecycle on/off-boarding incl. employee create/exit (B2) · Audit log + MFA + backup (B15) ·
> Wire real scheduler/cron for ingestion (B5) · Self-service portal + PWA punch (B1).

**Phase 5 — "Operations" — P1**
> Leave advanced (B6) · Roster automation (B7) · HR operations & letters (B9) ·
> Multi-company/branch (B11) · Reports & BI (B13) · Accounting/payment SSO integrations (B14) ·
> Advanced attendance geo/OT (B5).

**Phase 6 — "Talent & Scale" — P1/P2**
> Recruitment/ATS (B3) · Performance & Talent (B8) · full Compliance/e-filing suite (B12) ·
> SaaS tenant provisioning & marketplace integrations.

**Definition of "complete SME HRMS":** a company can **hire → onboard → run attendance & shifts →
apply & approve leave → process fully compliant multi-statutory payroll (incl. TDS) → deliver payslips →
appraise → off-board & settle F&F** — across **multiple branches**, on **mobile**, with a **compliance
audit trail** — without leaving myHR. Today it covers the **middle (attendance → core payroll → leave)**;
the ends (**hire/onboarding**, **TDS/F&F/full payroll**, **offboarding**, **self-service/mobile**,
**notifications**, **compliance/audit**) and **multi-entity** are the primary build targets.

---

## 17. Non-functional requirements (target)
- **Performance:** dashboards < 2s at 500 employees; payroll bulk ≤ a few minutes via **worker queue** (not request-scoped).
- **Security/Privacy:** encrypted PII, least-privilege RBAC to field level, **DPDP Act 2023** alignment, secrets via KMS/env, full audit trail, MFA.
- **Reliability:** idempotent ingestion, retries on sync, **backups + tested restore**.
- **Scale/tenancy:** multi-company isolation; index & query plans reviewed at 500–1k employees.
- **Usability/Accessibility:** mobile-first, keyboard nav (existing `Ctrl+K`), WCAG-conscious contrast in both themes.
- **Localization (India):** en-IN, ₹ formats, state-wise statutory rules.

---

## Appendix — references
- **Data model:** `organizations, departments, shifts, employees, roles, devices, data_sources, sync_logs, biometric_punches, attendance_records, employee_shifts, leave_types, leave_balances, leave_requests, holidays, ot_policy, payroll_runs, payslips, employee_personal_details, employee_documents`
- **API surface & permission matrix:** see `FUNCTIONALITIES.md`
- **Code entry points:** `server/index.js`, `server/routes/*`, `server/middleware/accessGuard.js`, `server/services/{attendanceEngine,payrollEngine,syncEngine}.js`, `client/src/App.jsx`.
