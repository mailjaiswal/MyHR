# myHR by Swaniki — Functional Specification

> A complete overview of **every feature and functionality** of the myHR web application:
> biometric-verified attendance, statutory Indian payroll, leave/shift management, and
> role-based access — for **Super Admins, HR, Managers, and Employees**.

- **Live app:** https://myhr-by-swaniki.vercel.app
- **API health:** https://myhr-by-swaniki.vercel.app/api/health
- **Demo login password (all accounts):** `Welcome@123`

---

## 1. What the app does (overview)

myHR is a full-stack **HR & Payroll platform** that:

1. **Ingests biometric punches** from floor devices (eSSL, ZKTeco, Biomax, Realtime) via device push, scheduled API pull, or file upload (`.db` / `.sql`).
2. **Turns raw punches into attendance** — including cross-midnight night shifts — using a configurable attendance policy (full/half/absent thresholds, grace period, late detection, overtime).
3. **Computes statutory payroll** (EPF, ESIC, Professional Tax, Gratuity, Overtime) with payslips and MIS/export reports.
4. **Manages people operations** — employee master, leaves & approvals, 24×7 shift rostering, and punch-miss regularization.
5. **Secures everything with RBAC** — real email login, 18 granular permissions, and 4 row-level **data scopes** so every user sees only what they're entitled to.

It runs as a **multi-tenant, serverless web app** (Vercel + PostgreSQL/Neon), replacing legacy vendor suites like Spine HR.

---

## 2. Roles, permissions & data scopes (RBAC)

Access is resolved per request by middleware: `requireAuth` (validates JWT) → `accessGuard`
(loads role, permissions & scope) → `requirePerm('KEY')` (per-route gate). The role's
**data scope** additionally filters rows via `scopeFilter()`.

### Data scopes
| Scope | What the user can see |
| :--- | :--- |
| `SELF` | Only their own records |
| `TEAM` | Themselves + everyone reporting (transitively) to them — recursive manager CTE |
| `DEPARTMENT` | All active employees in their department |
| `ALL` | The entire organization |

### Permission keys (18)
`DASHBOARD_VIEW` · `ATTENDANCE_VIEW` · `ATTENDANCE_EDIT` · `REGULARIZATION_APPROVE` ·
`PAYROLL_VIEW` · `PAYROLL_MANAGE` · `EMPLOYEES_VIEW` · `EMPLOYEES_EDIT` ·
`LEAVES_VIEW` · `LEAVES_REQUEST` · `LEAVES_APPROVE` · `ROSTER_VIEW` · `ROSTER_EDIT` ·
`SETTINGS_VIEW` · `SETTINGS_EDIT` · `ACCESS_MANAGE` · `EXPORTS` · `DEMO_LAB`

### Built-in roles
| Role | Scope | Notes |
| :--- | :--- | :--- |
| **Super Admin** (`SUPER_ADMIN`) | ALL | All 18 permissions, incl. `ACCESS_MANAGE` |
| **HR Admin** (`ADMIN`) | ALL | Everything except `ACCESS_MANAGE` |
| **Manager** (`MANAGER`) | TEAM | Dashboards, attendance, roster, leave approval, payroll *view* |
| **Employee** (`EMPLOYEE`) | SELF | Own dashboard, attendance, payslips, leave requests, roster |

Custom roles can be created and assigned through **Admin Panel → Access Management**.

### Demo accounts (password `Welcome@123`)
| Role | Email |
| :--- | :--- |
| Super Admin (ALL) | `aarav.mehta@novaven.example` |
| HR Admin (ALL) | `priya.sharma@novaven.example` |
| Manager / Head Nurse (TEAM) | `anita.nair@novaven.example` |
| Employee / Staff Nurse (SELF) | `ramesh.yadav@novaven.example` |

*(11 more seeded staff — 15 employees total, 14 days of punches, and a live payroll run.)*
The login screen shows a **"Try a demo account"** click-to-fill panel.

---

## 3. Feature modules

Navigation is **permission-driven**: a nav item appears only if the user holds its
`*_VIEW` permission (see `client/src/config/navItems.js`).

### 3.1 Authentication
- **Sign in** with company email + password (bcrypt-verified). JWT **access token (15 min)** +
  rotating **refresh-token httpOnly cookie (7 days)** for silent re-auth.
- **Forced password change** on first login / admin reset (`must_change_password` gate enforced server-side).
- **Self-service change password**, **logout**, and **admin password reset** (issues a temp password).
- **Brute-force protection:** per-IP login rate limit (10/min) and **account lockout** (5 failures → 30 min).

### 3.2 Dashboard (`DASHBOARD_VIEW`)
- Scope-aware KPI cards: total staff, present, absent, late arrivals, total hours, payroll access.
- **Attendance trend** chart (hours logged / % present per day).
- **By-department** staffing bars (ALL/DEPARTMENT scope only).
- **Pending your approval** digest (leave requests + corrections) for approvers.
- **"My attendance"** table for `SELF`-scope employees.
- Respects date-range selection and the user's data scope.

### 3.3 Attendance (`ATTENDANCE_VIEW` / `ATTENDANCE_EDIT`)
- **Today's** snapshot, filterable **records** (department / shift / search), and **monthly summary** register.
- Status classification: Present · Overtime · Regularized · Half Day · Absent · On Leave.
- **Regularize** a day, and a **corrections workflow** (employee submits a correction request → manager/HR decides approve/reject).
- Manual **hours adjustment** override for managers/HR.
- CSV **export** of the attendance register (with `EXPORTS`).

### 3.4 Payroll (`PAYROLL_VIEW` / `PAYROLL_MANAGE`)
- **Run monthly payroll** across scope-visible staff (`PAYROLL_MANAGE`).
- **Payslips** per employee/month with earnings + deductions breakdown (viewable by employee for self, by HR for all).
- **Payroll runs** history and per-employee **salary history**.
- **Exports:** bank advice file and Tally import file for a given month.
- Statutory engine detailed in §4.

### 3.5 Employees (`EMPLOYEES_VIEW` / `EMPLOYEES_EDIT`)
- Staff master with profile, department, designation, shift, manager, joining date, bank & statutory IDs (UAN/ESIC/PAN).
- View employee detail; edit allowed with `EMPLOYEES_EDIT`.

### 3.6 Leaves (`LEAVES_VIEW` / `LEAVES_REQUEST` / `LEAVES_APPROVE`)
- Leave **types** (annual/sick/casual/comp-off/bereavement) with allowances, accrual, carry-forward, encashment.
- **Balances** per employee (with admin set-all / per-employee adjustment).
- **Request** leave (employee) and **approve/reject** (manager/HR); request listing by status.

### 3.7 Shift Roster (`ROSTER_VIEW` / `ROSTER_EDIT`)
- Define shifts (day/evening/night/general) incl. **cross-midnight** flags, grace & break minutes.
- Assign/manage employee shifts; 24×7 roster timeline & coverage views.

### 3.8 Regularization (`REGULARIZATION_APPROVE`)
- Dedicated approvals surface for punch-miss / attendance corrections.

### 3.9 Admin Panel / Settings (`SETTINGS_VIEW` / `SETTINGS_EDIT`)
- **Organization** profile & branding (name, tagline, address, GSTIN, director, contacts).
- **Security**, **payroll**, and **statutory rule** configuration.
- **Access management**: create/edit/delete roles, toggle permissions, set data scope,
  assign employee roles & reporting **hierarchy** (`ACCESS_MANAGE`).

### 3.10 Demo Lab (`DEMO_LAB`)
Tools wired to the **live backend** for concept walkthroughs:
- **Device Simulator** — fire a biometric punch (choose employee, device, verification mode).
- **Hardware Gateway** — Anubhav partner hub & device/API-key info.
- **24×7 Roster** — cross-midnight shift visualization.
- **Data Sources** — configure vendors, test connections, upload files, sync (see §5).
- **Custom Reports** — client-side muster/attendance/payroll registers with PDF printing.

### 3.11 Cross-cutting UI features
- **Light / dark theme** toggle (persisted), organized around a `ThemeContext`.
- **Universal date-range picker** (Day/Week/Month/Quarter/Year/Custom) shared by data pages.
- **Live punch feed / SSE** streaming on relevant views.
- **Responsive / mobile layout:** collapsible navigation drawer, a compact mobile top bar, and a **bottom tab bar** (Dashboard · Attendance · Payroll · Leaves · More) with safe-area handling.
- **Splash / loading** states and **payslip + password-change modals**.

---

## 4. Statutory payroll & attendance rules

| Rule | Logic (configurable in `server/config.js`) |
| :--- | :--- |
| Full day | ≥ **7.45 h** logged |
| Half day | **3.45 h – 7.45 h** |
| Absent / LOP | < **3.45 h** |
| Late | Entry past shift start + grace minutes |
| Overtime | Hours beyond threshold at tiered multipliers (1.5× / 2.0×; weekend/holiday) |
| **EPF** | 12% of Basic (capped at statutory limit) |
| **ESIC** | 0.75% of Gross when Gross ≤ ₹21,000/month |
| **Professional Tax** | State slab (MP 2026) |
| **Gratuity** | Statutory accrual formula |
| Night shift | Punches anchored to the correct **duty date** across midnight |

Engines: `services/attendanceEngine.js` (punch → `attendance_records`) and
`services/payrollEngine.js` (`runMonthlyPayroll` → payslips).

---

## 5. Biometric data ingestion

Three paths feed raw punches, all idempotent and logged (`sync_logs`):

1. **Real-time push** — devices / Python edge bridge → `POST /api/v1/biometrics/punch`.
2. **Scheduled API pull** — background scheduler fetches vendor punch APIs (eSSL/eTime/BlueTars).
   ⚠️ On Vercel serverless the in-process scheduler is skipped; use an **external cron** hitting
   `POST /api/v1/ingestion/sources/:id/sync`. Manual "Fetch Now" works everywhere.
3. **File import** — upload the device's **SQLite DB** or **`.sql` text dump** (MySQL / SQL Server):
   `POST /api/v1/ingestion/upload`. A vendor-agnostic layer auto-detects the punch/employee
   table + columns (`sqlFileImporter.js`, `sqlTextDumpLoader.js`).

Per **Data Source**, admins can set **Integration Type** (API pull vs SQL-file), auth, a
**download URL** + **auto-fetch** toggle, and an optional **column-mapping override** (JSON) to fit
any client's schema **without code changes**.

---

## 6. API reference (REST, base `/api/v1`)

| Area | Endpoints |
| :--- | :--- |
| **Auth** | `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/change-password` · `PATCH /auth/reset-password` |
| **Dashboard** | `GET /dashboard/summary` · `/trend` · `/pending-actions` · `/my-attendance` |
| **Attendance** | `GET /attendance/today` · `/records` · `/summary/monthly` · `/trend` · `POST /regularize` · `GET|POST /corrections` · `PUT /corrections/:id/decide` |
| **Payroll** | `POST /payroll/process` · `GET /runs` · `/slips/:monthYear` · `/employee/:id/history` · `/payslip/:empId/:monthYear` · `/export/bank/:monthYear` · `/export/tally/:monthYear` |
| **Organization** | `GET /organization/info` · `GET|PUT /settings` · `GET /departments` · `GET /shifts` · `POST /shifts` · `PUT /shifts/:id` · `GET /devices/models` · `PUT /devices/:id` · `GET /employees` · `GET|PUT /employees/:id` |
| **Leaves** | `GET /leaves/types` · `POST|PUT /types/:id` · `GET /balances` · `PUT /balances/:id` · `POST /balances/set-all` · `GET|POST /requests` · `PUT /requests/:id/status` |
| **Access (RBAC)** | `GET|POST /access/roles` · `PATCH|DELETE /access/roles/:id` · `GET /roles/:id/members` · `PATCH /employees/:id/role` · `PATCH /employees/:id/manager` · `GET /hierarchy` |
| **Ingestion** | `GET|POST /ingestion/sources` · `GET|PUT|DELETE /sources/:id` · `POST /sources/:id/test` · `POST /sources/:id/sync` · `POST /upload` · `GET /logs` · `GET /summary` |
| **Biometrics** | `POST /biometrics/punch` · `POST /simulate` · `GET /devices` · `GET /stream` (SSE) |
| **Health** | `GET /api/health` |

---

## 7. Tech stack & architecture

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, Vite 6, Recharts, Lucide icons, hand-rolled CSS design system |
| **Backend** | Node.js ≥22, Express 4, JWT auth, cookie + rate-limit middleware |
| **Database** | PostgreSQL (Neon) with a `?`-placeholder compatibility layer (`server/db/database.js`) |
| **File import** | `node:sqlite` used transiently to read uploaded SQLite/`.sql` exports |
| **Hosting** | Vercel — `/api/(.*)` → `api/index.js`; static SPA from `client/dist` |

**Key services:** `attendanceEngine`, `payrollEngine`, `syncEngine`, `sqlFileImporter`,
`sqlTextDumpLoader`, `biotimeApi`, `settingsService`, `syncLogger`, `exportService`, `authService`.
**Middleware:** `authGuard` (JWT) and `accessGuard` (permissions + scope).
**Contexts (client):** `AuthContext`, `ThemeContext`, `OrganizationContext`.

---

## 8. Data model (primary tables)

`organizations`, `departments`, `shifts`, `employees` (+ auth columns), `roles`,
`devices`, `data_sources`, `sync_logs`, `biometric_punches`, `attendance_records`,
`employee_shifts`, `leave_types`, `leave_balances`, `leave_requests`, `holidays`,
`ot_policy`, `payroll_runs`, `payslips`, `employee_personal_details`, `employee_documents`.

Schema: `server/db/schema_v2.sql` (idempotent; applied via `npm run`/`server/scripts/migrateV2.js`).

---

## 9. Running & deploying

```bash
npm install && npm --prefix client install
cp .env.example server/.env        # DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET
node server/scripts/migrateV2.js   # apply RBAC/auth schema (idempotent)
node server/db/seedPg.js           # load the demo dataset (clears + reseeds)
npm run dev                        # API :4010 + Vite client

npx vercel deploy --prod           # deploy (env vars must be set in Vercel)
```

> Requires **Node 22+**. Production **fails fast** if `JWT_SECRET`/`JWT_REFRESH_SECRET` are unset
> (that's a deliberate security guard — a 500 on all `/api` routes means those secrets are missing).

---

## 10. Roadmap (planned)

Multi-branch hierarchy · device LAN auto-discovery & template push · installable **PWA** + offline
rosters · Wi-Fi BSSID geo-verification · **WhatsApp** payslip/handover alerts · AI shift
auto-rostering · one-click **EPFO/ESIC** e-filings.
