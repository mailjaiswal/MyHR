# 🏥 myHR by Swaniki — Biometric Attendance & Automated Payroll Platform

**Enterprise HRMS for biometric-verified attendance and statutory (Indian) payroll — replacing legacy vendor suites like Spine HR.**
Developed by **Swaniki** in partnership with hardware implementation partner **Anubhav Infotech (Bhopal & Chhindwara)**.

- **Live app:** https://myhr-by-swaniki.vercel.app
- **API health:** https://myhr-by-swaniki.vercel.app/api/health

---

## Synopsis

myHR is a full-stack **HR & Payroll web application** that ingests biometric punch data from
floor devices, converts raw punches into accurate attendance (including cross-midnight night shifts),
and computes **statutory-compliant Indian payroll** (EPF, ESIC, Professional Tax, Gratuity, overtime)
with downloadable payslips and MIS reports.

It is a **multi-tenant, role-secured SaaS-style platform**: real email login, permission-driven UI,
and row-level **data scoping** so each user only sees the records they are entitled to
(self / their team / their department / the whole company).

**Why it exists:** eliminate recurring SaaS licensing and vendor lock-in, fix the classic
"night shift split across two days" defect, and give HR + staff a fast, modern self-service experience.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, Vite 6, React Router, Recharts, Lucide icons, hand-rolled CSS design system (light/dark themes) |
| **Backend API** | Node.js (≥22), Express 4, JWT auth, cookie + rate-limit middleware |
| **Database** | **PostgreSQL** (Neon) over a serverless driver with `?`-placeholder compatibility layer |
| **Biometric file import** | `node:sqlite` used transiently to read uploaded **SQLite / `.sql`** exports |
| **Auth** | bcrypt password hashes, 15-min access tokens + 7-day rotating refresh-token cookies |
| **Hosting** | Vercel (serverless function at `/api/*` rewrites to `api/index.js` + static SPA) |

---

## Architecture Overview

```
 Biometric devices           Admin uploads               Browser / API client
 (eSSL, ZKTeco, Biomax)     .sql / SQLite export               (React SPA)
        │                          │                              │
        │ REST push / polling      │  POST /api/.../sources/upload│  Bearer access token
        ▼                          ▼                              ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │                       Express API  (server/index.js)                  │
 │  requireAuth → accessGuard (must-change-pw gate) → requirePerm(KEY)    │
 │                                                                        │
 │  Auth & RBAC          Biometric ingestion           Business modules   │
 │  authService          /biometrics/punch (push)      attendance         │
 │  accessControl        sqlFileImporter (file)        payroll            │
 │  accessGuard          syncEngine (auto-pull/API)    employees · leaves │
 │  permissions/scopes   ingestion (sources CRUD)      shifts · settings  │
 │                                  │                        │             │
 │                                  ▼                        ▼             │
 │                 attendanceEngine  →  daily_attendance    payrollEngine  │
 └───────────────────────────────┬────────────────────────────────────────┘
                                  ▼
                       PostgreSQL (Neon)  —  users, staff, departments,
                       biometric_logs, daily_attendance, payroll, roles…
```

**Deployment note:** on Vercel the in-process schedulers do not run (serverless), so automatic
API/file pull requires an **external cron** hitting the sync endpoint; manual "Fetch Now" always works.

---

## Core Modules

| Module | Responsibility |
| :--- | :--- |
| **Auth & Access** | Login/logout, temp-password change, JWT access + refresh cookies, 18 granular permissions, 4 data scopes |
| **Dashboard** | Scope-aware KPIs, live punch feed, charts, attendance regularization approvals |
| **Attendance** | Punch → per-day attendance via the attendance engine; monthly registers; IN/OUT status |
| **Payroll** | Statutory salary computation, payslips, full & final settlement, MIS hub (LOP / overtime / PT / OT payouts) |
| **Employees** | Staff master, add/edit, CSV import, profile & bank details |
| **Leaves / Shift Roster / Regularization** | Leave management, 24×7 shift rostering, punch-miss regularization |
| **Data Sources** | Configure & test biometric vendors, upload files, manual/auto sync, per-source column mapping |
| **Settings** | Company, security (password policy), payroll, statutory rules, user & role management |

---

## Biometric Data Ingestion

Three ingestion paths feed raw punches into `biometric_logs`, which the attendance engine turns into
daily records. Punch timestamps are anchored to a duty date (timezone-aware).

1. **Real-time push** — devices (or the Python edge bridge) POST punches to `POST /api/v1/biometrics/punch`.
2. **Scheduled API pull** — background job (every 60s) fetches punch logs from vendor APIs (eSSL/eTime/BlueTars…).
3. **File import** — admin uploads the device's **SQLite DB or `.sql` text dump** (MySQL / SQL Server exports);
   a vendor-agnostic layer auto-detects the punch/employee table & columns, with optional
   **per-source column mapping** to handle any client's schema without code changes.

Each source can also **auto-fetch** a file over HTTP/HTTPS on the sync cadence, and every source has a
**manual "Fetch Now / Refresh"** button.

---

## Security (RBAC)

- **Canonical permissions (18):** e.g. `DASHBOARD_VIEW`, `ATTENDANCE_VIEW/EDIT`, `PAYROLL_VIEW/PROCESS/FULLN_FINAL`,
  `EMPLOYEES_VIEW/EDIT`, `LEAVES_VIEW/Approve`, `ROSTER_VIEW/EDIT`, `REGULARIZATION_VIEW/APPROVE`,
  `DEMO_LAB`, `SETTINGS_VIEW/EDIT`, `REPORTS_VIEW`.
- **Data scopes:** `SELF` · `TEAM` (reporting-manager subtree via recursive CTE) · `DEPARTMENT` · `ALL`.
- **Roles:** Super Admin / Org Admin / HR Manager / Department Manager / Employee / Accountant.
- **Controls:** bcrypt hashes, `must_change_password` server gate, refresh-token rotation + reuse
  detection, per-route rate limiting, CORS allowlist, and **fail-fast in production** if
  `JWT_SECRET` / `JWT_REFRESH_SECRET` are not configured.

---

## Statutory Payroll Engine (India)

| Rule | Logic |
| :--- | :--- |
| **Full day** | ≥ 7.45 h logged |
| **Half day** | 3.45 h – 7.45 h |
| **Absent / LOP** | < 3.45 h |
| **EPF** | 12% of Basic (capped at statutory limit) |
| **ESIC** | 0.75% of Gross when Gross ≤ ₹21,000/month |
| **Professional Tax** | State slab (MP 2026) |
| **Overtime** | Hourly rate beyond 3.5 h of extra duty, at `OT_multiplier` |
| **Night shift** | Cross-midnight punches anchored to the correct duty date |

---

## Getting Started (Local)

```bash
# 1. Install dependencies
npm install
npm --prefix client install

# 2. Configure environment (Postgres/Neon + JWT secrets)
cp .env.example server/.env      # set DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET

# 3. Seed sample data (optional)
npm run seed

# 4. Run backend + frontend together
npm run dev                      # API :4010, client via Vite

# Tests / utilities
npm run test:engine              # compliance & engine tests
npm run backup                   # SQLite backup helper
```

Requires **Node 22+** (uses `node:sqlite` for file import and `fetch`).

---

## Deployment (Vercel)

```bash
npx vercel deploy --prod          # project is linked in .vercel/
```

- `vercel.json`: build `npm run build`, output `client/dist`, `/api/(.*)` → `/api/index.js`.
- **Production env vars:** `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET` (add via
  `vercel env add <NAME> production`, then redeploy — env changes need a new deployment).
- Missing JWT secrets in production cause a deliberate startup fail (500 on all `/api` routes).

---

## Competitive Advantage over Spine HR

| Criteria | Spine HR | myHR by Swaniki |
| :--- | :--- | :--- |
| Recurring cost | Per-employee/month + setup + GST | **No SaaS license** — owned outright |
| Night shifts | Splits across 2 calendar days | **Cross-midnight engine** anchors duty date |
| Access control | Coarse | **18 permissions × 4 data scopes**, row-level |
| Hardware | Vendor lock-in | **Vendor-agnostic** (eSSL, ZKTeco, Biomax, Realtime) + file import |
| UI / search | Legacy tables | Modern light/dark SPA, `Ctrl+K` palette, mobile-responsive |
| Compliance | Manual | Automated **EPF/ESIC/PT/Gratuity** + MIS reports |

---

## Project Status

- **Phases 1–3 (Core payroll engine, hardware/telemetry, ergonomics & theming):** complete.
- **Real authentication, RBAC & data scoping, mobile optimization, and SQL-file/CSV ingestion & auto-sync:** implemented and deployed to production.
- **Planned:** multi-branch hierarchy, device auto-discovery & template push, PWA/offline, WhatsApp
  payroll alerts, AI shift auto-rostering, and 1-click EPFO/ESIC e-filings.
