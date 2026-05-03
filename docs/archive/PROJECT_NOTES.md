# PROJECT_NOTES — Ardhi / FULLDEV-V2

> Generated 2026-05-02 by distilling ~50 stale `*.md` files scattered across `ardhiv2/`, `ardhiv2/dev-report/`, and `ardhiv2/documentation/`.
> Purpose: preserve the project context that lived in those files so the originals can be deleted.
> Authoritative current code lives in `ardhiv2/FULLDEV-V2/`. Most of the source docs describe **older parallel versions** of the app (called variously "FULLLANDDEV", "fulldevland", or "webapp-v2") and do **not** match the current `FULLDEV-V2/src/` tree. Where they conflict, current code wins; this document calls out the divergences.

**Source files distilled** (full index at end of document):
- `ardhiv2/README.md`
- All root-level `ardhiv2/*.md` (~36 files): security audits, fix summaries, deployment, runbooks
- All files under `ardhiv2/dev-report/` (28 files): a "build from scratch" guide for a similar app
- All files under `ardhiv2/documentation/` (11 files): user/admin/dev/security guides for the older app

---

## 1. Project overview

**App name (current):** FULLDEV-V2 (`package.json` `name: "fulldev-v2"`, version `0.0.1`)
**Display name:** نظام إدارة الأراضي — "Land Management System"
**Deployed at:** ardhiv2.vercel.app
**Domain:** Tunisian real estate / land sales. Currency = Tunisian Dinar (DT). UI is Arabic, RTL.

### What it does
Manages a land-sales business: an Owner imports land in batches, splits each batch into pieces (lots), prices them (cash or installment plans), then sells pieces to clients. Sales are reviewed/confirmed, and finance is tracked.

### Current core entities (per `FULLDEV-V2/DOCUMENTATION.md`)
- `clients` — name, `id_number` (8 chars, unique), phone, email, address, type ('individual'|'company'), notes
- `land_batches` — name, location, `title_reference`, `price_per_m2_cash`, `company_fee_percent_cash`
- `land_pieces` — `batch_id`, `piece_number`, `surface_m2`, `direct_full_payment_price` (deprecated), `status` ('Available'|'Reserved'|'Sold'), notes
- `payment_offers` — installment plans bound to either a batch OR a piece (XOR), with `price_per_m2_installment`, `company_fee_percent`, `advance_mode` ('fixed'|'percent'), `advance_value`, `calc_mode` ('monthlyAmount'|'months'), `monthly_amount`, `months`
- `sales` — `client_id`, `land_piece_id`, `batch_id`, `payment_offer_id` (nullable), `sale_price`, `deposit_amount` (العربون), `sale_date`, `status` ('pending'|'completed'|'cancelled'), notes

### Current pages (`FULLDEV-V2/src/pages/`)
`Home.tsx`, `Login.tsx`, `Land.tsx`, `Clients.tsx`, `Confirmation.tsx`, `ConfirmationHistory.tsx`, `Finance.tsx`, `Installments.tsx`, `SalesRecords.tsx`, `Appointments.tsx`, `PhoneCallAppointments.tsx`, `ContractWriters.tsx`, `Users.tsx`.

### Current dialogs (`FULLDEV-V2/src/components/`)
`ClientSelectionDialog`, `ConfirmGroupSaleDialog`, `ConfirmSaleDialog`, `EditSaleDialog`, `FinanceDetailsDialog`, `GroupSaleDetailsDialog`, `InstallmentDetailsDialog`, `InstallmentStatsDialog`, `MultiPieceSaleDialog`, `PaymentBreakdown`, `PieceDialog`, `PiecePriceDetails`, `SaleDetailsDialog`, `DeadlineCountdown`, `HardRefreshWrapper`, `Layout`, `Sidebar`.

### Tech stack (current `package.json`)
- React 19.2.0, TypeScript ~5.9.3, Vite 7.2.4
- Tailwind CSS 3.4.19 (NOT v4 as the legacy docs claim)
- `@supabase/supabase-js` ^2.90.1 — only runtime dependency
- `vite-plugin-pwa` ^1.2.0 — PWA support
- No React Router, no React Query, no Lucide. Routing is done in `App.tsx` via a `currentPage` state switch (per DOCUMENTATION.md).

### Workflows (current)
1. **Create batch** → set base prices + optional installment offers → `INSERT INTO land_batches` (+ `payment_offers`).
2. **Add pieces** to batch → `INSERT INTO land_pieces`.
3. **Sell a piece**: click Sale on piece → lookup client by 8-digit `id_number` (or create one) → choose Full vs Installment + offer → enter deposit + deadline → `INSERT INTO sales (status='pending')`, set piece to `'Reserved'`.
4. **Confirm sale**: from Confirmation page → confirm sets sale `'completed'` and piece `'Sold'`; reject sets sale `'cancelled'` and piece back to `'Available'`.

### Calculations
- `src/utils/priceCalculator.ts::calculatePiecePrice()` — priority Installment > Batch > Piece direct. Returns `{ basePrice, totalPrice, deposit, totalDue, priceSource }`.
- `src/utils/installmentCalculator.ts::calculateInstallment()` — returns `{ basePrice, advanceAmount, remainingAmount, monthlyPayment, numberOfMonths }`. Supports `advance_mode` fixed/percent and `calc_mode` monthlyAmount/months.
- `formatPrice()` formats numbers as Tunisian Dinar with 2 decimals.

### Naming conventions in use
- DB columns: `snake_case` (e.g. `surface_m2`, `price_per_m2_cash`, `company_fee_percent_cash`).
- TS interfaces: `PascalCase` (`LandBatch`, `LandPiece`, `Client`, `Sale`).
- Functions: `camelCase` with verb prefixes — `loadX`, `handleX`, `openX`, `resetX`, `validateX`.
- State: `loading*`, `*DialogOpen`, `selected*`, `editing*`, `*Error`, `*Success`.

---

## 2. Architecture & deployment

### Vercel
- `ardhiv2/VERCEL_DEPLOYMENT.md`: a `vercel.json` exists (in the repo root according to that doc, but the *current* `FULLDEV-V2/` has its own `vercel.json` — verify before redeploying).
- Recommended Vercel settings (legacy, may need updating for FULLDEV-V2 root):
  - Framework: Vite
  - Root Directory: `frontend` *(legacy — for FULLDEV-V2 this should likely be `FULLDEV-V2` or be repo-root with `vercel.json` pointing to it)*
  - Build: `npm run build`, Output: `dist`
  - Required env vars (Production + Preview + Development):
    - `VITE_SUPABASE_URL=https://xxxxx.supabase.co`
    - `VITE_SUPABASE_ANON_KEY=eyJ...`
- SPA rewrite rule needed in `vercel.json`: rewrite `/(.*)` → `/index.html` (otherwise client-side routes 404).

### Supabase
- Single Supabase project hosts Postgres + Auth + (in legacy versions) Storage.
- Frontend uses **anon key only**. Service role key is correctly kept server-side (verified in `SERVICE_ROLE_KEY_SECURITY_VERIFICATION.md` for the legacy app — re-verify for FULLDEV-V2).
- Auth: email + password via `supabase.auth.signInWithPassword`. Session stored in `localStorage` under key `land-system-auth` (legacy app).
- DB schema for FULLDEV-V2 lives in `database_schema.sql` / `clean_database_setup.sql` (referenced by `FULLDEV-V2/DOCUMENTATION.md`). Note: per that DOC, **RLS is configured but disabled** in FULLDEV-V2. This is a major divergence from the legacy app where RLS was the primary protection.

### Storage buckets (legacy — verify whether FULLDEV-V2 still uses them)
- `land-images` — public bucket for batch/piece images. Per `SETUP_STORAGE_BUCKET_MANUAL.md`: 5 MB limit, MIME whitelist `image/jpeg,jpg,png,gif,webp`. Needs RLS policies allowing authenticated users to INSERT/UPDATE/DELETE under prefix `land-batches/`, plus a public SELECT policy. Quick-setup version: one "Authenticated full access" policy + one public SELECT policy on `bucket_id = 'land-images'`.
- `app-downloads` — public bucket for the APK download feature (`SETUP_APK_DOWNLOAD.md`). File must be named exactly `app.apk`. 100 MB limit. MIME whitelist `application/vnd.android.package-archive,application/octet-stream`. Alternative: drop `app.apk` directly into `frontend/public/`.

### App URL
- ardhiv2.vercel.app (the production deployment of FULLDEV-V2).

---

## 3. Security findings & implementation status

> Important caveat: nearly all security docs in `ardhiv2/` describe the **legacy "FULLLANDDEV" app** (with `frontend/` directory, role enum `Owner`/`Manager`/`FieldStaff`, RLS enabled, server-side validation functions). FULLDEV-V2's `DOCUMENTATION.md` says **RLS is disabled**, so most of the legacy "RLS protects you" reassurance does NOT apply to the currently deployed app. Treat this section as a backlog of issues to verify against FULLDEV-V2.

### Issues that were "fixed" in the legacy codebase (may not be ported to FULLDEV-V2)

| # | Issue | Legacy fix file(s) | Notes |
|---|-------|-------------------|-------|
| 1 | Hardcoded credentials in `VERCEL_DEPLOYMENT.md` | Replaced with placeholders | Legacy doc says rotate the anon key if the repo was ever public. Check git history. |
| 2 | Client-side `hasPermission()` bypassable | `add_server_side_permission_validation.sql` + `frontend/src/lib/permissionValidation.ts` | Added `validate_user_permission(text)`, `validate_user_permissions(text[])`, `validate_user_any_permission(text[])` Postgres functions called before sensitive ops. Applied to legacy `Clients.tsx`, `SalesNew.tsx`, `LandManagement.tsx`. NOT applied to legacy `SaleManagement.tsx`, `Users.tsx`, `Installments.tsx`, `FinancialNew.tsx`, `Expenses.tsx`, `Workers.tsx`, `UserPermissions.tsx`, `Security.tsx`, `SaleConfirmation.tsx`. |
| 3 | `get_user_role()` returned NULL for inactive Owners → RLS denied legitimate ops | `fix_get_user_role_rls_complete.sql`, test script `test_get_user_role_rls.sql`. Older partial attempts: `fix_all_deletion_issues.sql`, `fix_get_user_role_function.sql`, `fix_sales_delete_rls_policy.sql` | New behavior: Owners always get role even if inactive; non-Owners only if `status='Active'`; defaults to NULL. SECURITY DEFINER + `search_path = public`. Use `fix_get_user_role_rls_complete.sql`, not the older ones. |
| 4 | No login rate limiting / no CAPTCHA | `add_login_attempts_tracking.sql` + `frontend/src/components/ui/captcha.tsx` + AuthContext changes | Added `login_attempts` table (email, ip, success, timestamp, user_agent), `should_lock_account(email)` and `get_failed_attempts(email)` Postgres functions. Behavior: 0–2 failures normal, 3–4 require math CAPTCHA, 5+ → 15-min lockout. CAPTCHA is local math (no external service). |
| 5 | Session timeout too long (24h) | AuthContext config | Reduced session to 8h, inactivity to 15 min, token auto-refresh every 7h, re-auth required after 1h for sensitive ops via `requiresReAuth()` / `updateLastAuthTime()`. |
| 6 | Admin functions in frontend (`supabase.auth.admin.deleteUser`) | Removed from `Users.tsx` | If service role key is ever added to frontend env, this becomes catastrophic. |
| 7 | Generic error leakage | Hardened messages in `Users.tsx`, `SalesNew.tsx`, `LandManagement.tsx`, `AuthContext.tsx` | Login errors no longer reveal whether email exists. |
| 8 | Console.log in production | Removed 23 instances across 9 legacy files | Manual cleanup; no logger lib. |
| 9 | Weak password policy (6 chars) | Bumped min to 8 chars + complexity (upper/lower/digit) + max 72 | Legacy `Users.tsx`. |
| 10 | Missing audit triggers on `land_batches`, `reservations`, `users`, `debts`, `debt_payments` | `security_database_fixes.sql` | Adds DB constraints + audit triggers. |
| 11 | Input sanitization gaps | `frontend/src/lib/sanitize.ts` (`sanitizeText`, `sanitizePhone`, `sanitizeEmail`, `sanitizeCIN`, `sanitizeNotes`) applied across all forms | Combined with React's escaping → XSS protection rated good. |
| 12 | `allowed_pieces` / `allowed_batches` not enforced (CRITICAL) | `FIX_allowed_pieces_RLS_SECURITY.sql` + `TEST_allowed_pieces_RLS_FIX.sql`, helper functions `can_access_land_piece(uuid)` and `can_access_land_batch(uuid)` | The `users.allowed_pieces UUID[]` and `users.allowed_batches UUID[]` columns existed but RLS used `USING (true)`, so any authenticated user could read **all** pieces by direct API call, frontend modification, Postman, or by mutating the in-memory profile. Fix replaces those policies with the helper functions. Owners always see all; users with NULL allowed_pieces see all within allowed_batches; users with non-empty allowed_pieces only see those IDs. **Verify whether FULLDEV-V2 has this column, this RLS, or this fix at all.** |

### Issues still open in the legacy app (and likely open in FULLDEV-V2 unless explicitly addressed)

- **Password reset flow**: not implemented. Requires admin to reset manually.
- **2FA**: not implemented. Recommended for Owner/Manager roles. Supabase has built-in MFA — wire it up.
- **`select('*')` everywhere**: 62 instances across 15 legacy files. Risk if RLS misconfigured. Mitigated only by `sales_public` / `land_pieces_public` views that hide `purchase_cost`, `profit_margin`, etc.
- **Session storage in `localStorage`**: JWT tokens vulnerable to XSS exfiltration. No httpOnly cookie option without a backend.
- **Missing security headers in `vercel.json`**: has `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection` but missing `Content-Security-Policy`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`.
- **File upload**: validates extension only, not MIME content; filenames `${batchId}-${Date.now()}.${ext}` are predictable.
- **No HTTPS enforcement in code** — relies on Vercel.
- **No request body size limits in app code** — relies on Supabase storage bucket limits (5 MB for images).
- **No IP-based rate limiting on app endpoints** — must be configured in Supabase Dashboard → Settings → API → Rate Limiting (recommended: 60–100 req/min anon, 200–500 authenticated, 10–20 for `/auth/*`). See `SUPABASE_API_MONITORING_GUIDE.md`.
- **Console.log removal is one-shot** — no environment-based logger to prevent regressions.

### Contradictions between source docs (flagged)

- `COMPREHENSIVE_SECURITY_AUDIT.md` says critical credentials issue is "FIXED" and overall score is 72%; `COMPLETE_SECURITY_FLAWS_LIST.md` (same date) reports score 78% and lists rate limiting as still open. They were written before/after `LOGIN_RATE_LIMITING_IMPLEMENTATION.md` and `SECURITY_IMPLEMENTATION_COMPLETE.md`. Treat the *_IMPLEMENTATION.md files as the most recent state of the legacy code.
- Roles: legacy docs use `Owner / Manager / FieldStaff`; `dev-report/` (a fresh re-design) collapses to `Owner / Worker` only, with Owners created via Supabase Dashboard exclusively. Unclear which model FULLDEV-V2 ships with — `FULLDEV-V2/DOCUMENTATION.md` doesn't describe a role system, only that "Authentication: Supabase Auth (configured but RLS disabled)".
- Tailwind: legacy `README.md` and `documentation/` say Tailwind v4; FULLDEV-V2 `package.json` actually uses Tailwind 3.4.19.
- Routing: legacy uses React Router v6/v7; FULLDEV-V2 uses no router.

---

## 4. Operational runbooks

One-paragraph "how to do X" for each ops task documented in the legacy docs. SQL filenames referenced may or may not still exist in the repo — search before assuming.

- **Backup database** (`BACKUP_INSTRUCTIONS.md` — original was huge, ~88k tokens; only the title was readable in the source). Treat as reminder: dump via Supabase CLI `supabase db dump --data-only -f data.sql` and `--schema-only -f schema.sql`, plus `supabase storage download` for each bucket. Keep encrypted backups offsite.

- **Reset DB but keep land + users** (`CLEAR_DATABASE_INSTRUCTIONS.md` → `clear_database_keep_lands.sql`). Wraps everything in `BEGIN;...COMMIT;`. Deletes (in FK-safe order): `sale_rendezvous_history`, `sales_history`, `sale_rendezvous`, `installments`, `payments`, `sales`, `reservations`, `clients`, `phone_calls`, `box_expenses`, `project_boxes`, `projects`, `expenses`, `debt_payments`, `debts`. Resets `land_pieces.status='Available'` and clears `reserved_until`, `reservation_client_id`, `notes`. Keeps `land_batches`, `users`, `audit_logs`. Run only after explicit backup.

- **Delete all pieces from a single batch named "Terrain agricole"** (`DELETE_PIECES_INSTRUCTIONS.md` → `delete_pieces_from_batch_simple.sql` or `delete_pieces_from_batch.sql`). Wrapped in transaction. CASCADE deletes piece-level `payment_offers`. Keeps the batch row and batch-level offers (those with `land_piece_id IS NULL`). Verification queries provided. If sales/reservations point at those pieces, you must delete them first.

- **Migrate to a new Supabase project** (`MIGRATION_CONTINGENCY_PLAN.md`). Pre-flight: backup, prep new project, schedule a maintenance window. Auth migration: `auth.users` requires service-role-level export; **encrypted passwords don't move cleanly — plan to force a password reset** for all users on the new project (preferred). Data: `supabase db dump --data-only` from old, `psql -f data.sql` into new. Storage: `supabase storage download` then upload. Verify by record-count diffing each table. Rollback = revert DNS to old project. Post-cutover: rebuild matviews via `refresh_dashboard_stats_cache()`, `refresh_clients_summary_cache()`, `refresh_active_users_cache()`. Keep old project running 7+ days.

- **Set up Vercel deployment** (`VERCEL_DEPLOYMENT.md`). Push repo to GitHub, import in Vercel, set Root Directory (`frontend` for legacy / verify for FULLDEV-V2), add the two `VITE_SUPABASE_*` env vars to all 3 environments, ensure `vercel.json` has the SPA rewrite. Build command: `cd frontend && npm install && npm run build` for legacy; `npm run build` for FULLDEV-V2 if root.

- **Set up land-images storage bucket** (`SETUP_STORAGE_BUCKET_MANUAL.md`). Dashboard → Storage → New bucket `land-images`, public, 5 MB, MIME whitelist for image types. Then add 2 policies: (1) "Authenticated full access" for INSERT/UPDATE/DELETE/SELECT with definition `bucket_id = 'land-images'`; (2) "Public read" for SELECT to `public` role with same definition. More restrictive variant scopes uploads to the prefix `land-batches/`.

- **Set up app-downloads bucket for APK** (`SETUP_APK_DOWNLOAD.md`). Bucket name exactly `app-downloads`, public, 100 MB, MIME `application/vnd.android.package-archive,application/octet-stream`. Upload file named exactly `app.apk`. Run `create_app_downloads_bucket.sql` for policies. Alternative: place `app.apk` in `frontend/public/`. The `/download` page reads from this bucket.

- **Apply SQL migrations to a new database** (`SQL_MIGRATIONS_README.md`). Order: (1) `supabase_schema.sql` (foundation), (2) `security_database_fixes.sql`, (3) optional `create_debts_table.sql` + `add_debt_payments_table.sql`, (4) `add_real_estate_tax_number.sql`, (5) `add_login_attempts_tracking.sql`, (6) `fix_get_user_role_rls_complete.sql`, (7) `add_server_side_permission_validation.sql`, (8) `FIX_allowed_pieces_RLS_SECURITY.sql`. **Note**: these are legacy filenames; FULLDEV-V2 ships its own `database_schema.sql` + `clean_database_setup.sql` instead.

- **Set up performance optimizations** (`PERFORMANCE_OPTIMIZATION_README.md`). Run `PERFORMANCE_OPTIMIZATION_FIXES.sql` first (fixes index predicate / matview enum casting / cache freshness bugs), then `performance_optimization_indexes.sql`, `performance_optimization_rls.sql` (marks `get_user_role()` STABLE, adds active-users matview), `performance_caching_implementation.sql` (matviews for dashboard + client-summary), `performance_monitoring.sql` (slow-query log table, threshold 500 ms). Deploy edge functions `dashboard-aggregate` and `clients-batch` (need `SUPABASE_SERVICE_ROLE_KEY` in edge function env). Schedule via pg_cron: dashboard-cache every 5 min, clients-cache every 10 min, users-cache every 5 min.

- **Monitor API & rate-limit tuning** (`SUPABASE_API_MONITORING_GUIDE.md`). Dashboard → Settings → API → Usage / Rate Limiting. Recommended limits: 60–100 req/min anon, 200–500 req/min authenticated, 10–20 req/min on `/auth/*`. Configure alerts for >5% error rate and traffic spikes. Check `audit_logs` and `login_attempts` tables for anomalies. Frontend should handle 429 / `PGRST116` gracefully.

---

## 5. Development context

### What FULLDEV-V2 ships today (from `DOCUMENTATION.md` + `package.json` + `src/` listing)

- Single-file routing: `App.tsx` switches on a `currentPage` string. No React Router.
- State: pure `useState`/`useMemo`/`useEffect`. No Redux, Zustand, or React Query.
- One Supabase client in `src/lib/supabase.ts`. The legacy storage key was `land-system-auth`.
- Layout: `Layout.tsx` (sidebar + content) + `Sidebar.tsx` for nav.
- UI primitives in `src/components/ui/`: `button`, `input`, `dialog`, `card`, `badge`, `alert`, `select`, `textarea`, `label`, `tabs`, `confirm-dialog`, `icon-button`, `divider`. Tailwind + shadcn-style.
- Calculations live in `src/utils/priceCalculator.ts` and `src/utils/installmentCalculator.ts` (see Section 1).
- Pages reflect newer features absent from the legacy docs: `Appointments.tsx`, `PhoneCallAppointments.tsx`, `ConfirmationHistory.tsx`, `SalesRecords.tsx`, `ContractWriters.tsx`. None of these are described in any of the source docs — they're FULLDEV-V2-specific evolutions.

### Auth flow (legacy — describes a more complex AuthContext than FULLDEV-V2 likely has)

- `AuthProvider` loads session via `supabase.auth.getSession()`, then fetches the matching row from `users` table by `id = auth.uid()` and stores it as `profile`.
- `hasPermission(perm)` checks `profile.permissions[perm]` first, falls back to role defaults from `roles` table.
- Auto-logout timers tied to `mousemove`/`keydown`/`scroll`/`touchstart` events. Token refresh runs in background.
- For FULLDEV-V2: the `package.json` doesn't even include any router, the `DOCUMENTATION.md` says auth is "configured but RLS disabled" — assume the implementation is much simpler than the legacy docs describe.

### Permission model (legacy — Owner / Manager / FieldStaff)

Permission strings include: `view_dashboard`, `view_land`, `edit_land`, `delete_land`, `view_clients`, `edit_clients`, `delete_clients`, `view_sales`, `create_sales`, `edit_sales`, `edit_prices`, `view_installments`, `edit_installments`, `view_payments`, `record_payments`, `view_financial`, `view_profit`, `manage_users`, `view_audit_logs`, `view_workers`, `view_messages`. Legacy `roles.permissions` is a JSONB column. Per-user overrides in `users.permissions` JSONB.

### `dev-report/` folder (a redesign that diverges)

- This is a "build a Land Management System from scratch" tutorial written for some other developer (or for an LLM). It assumes **two roles only: Owner and Worker** (Owners only created via Supabase Dashboard) and proposes worker `title` field with presets like "مدير", "مندوب مبيعات", "موظف ميداني".
- Proposes React Router v7 + React Query — neither of which is in FULLDEV-V2.
- Proposes Tailwind v4 + `@tailwindcss/vite` — FULLDEV-V2 uses v3.
- Proposes a soft-delete + restore model with `deleted_at` columns, plus an `OwnerActionButton` component for cancel/remove/restore on every list row. Not in FULLDEV-V2.
- The schema in `dev-report/REFERENCE/DATABASE_SCHEMA.md` is much richer than FULLDEV-V2's: `land_status` enum with `Cancelled`, `payment_type` with `PromiseOfSale`, `sale_status` with `AwaitingPayment`/`InstallmentsOngoing`, dual pricing (`price_per_m2_full` + `price_per_m2_installment` per batch), worker `title`, `permissions` JSONB, `allowed_pages`/`allowed_features`/`sidebar_order` arrays.
- Treat `dev-report/` as **aspirational / abandoned**, not as documentation of the deployed app.

### Worker messaging system (legacy — `WORKER_MESSAGING_IMPLEMENTATION.md`)

The legacy app added these tables in Jan 2026:
- `worker_profiles` — one row per user with `worker_type`, `region`, `skills[]`, `availability`, `notes`. Separate from identity.
- `conversations` — task threads between creator and worker, status open/closed, subject-based.
- `messages` — directive messages within a conversation. No emojis, typing indicators, or attachments by design.
- `notifications` — bell-icon polling-based (every 30s), no realtime push. Types: `new_message`, `task_update`, `system`.

SQL: `CREATE_WORKER_MESSAGING_SYSTEM.sql`, `UPDATE_ROLES_WORKER_MESSAGING_PERMISSIONS.sql`. Pages: `Workers.tsx`, `Messages.tsx`. Component: `notification-bell.tsx`. Permissions: `view_workers` (Owner/Manager only), `view_messages` (all roles). **None of these tables/pages appear in FULLDEV-V2's `src/`** — assume not ported.

### Other legacy domain features mentioned

- **Real estate buildings/projects**: tables `projects`, `project_boxes`, `box_expenses` (referenced in `CLEAR_DATABASE_INSTRUCTIONS.md`). Page `RealEstateBuildings.tsx`. Not in FULLDEV-V2.
- **Phone calls / scheduling**: table `phone_calls`. Page `PhoneCalls.tsx`. FULLDEV-V2 has `PhoneCallAppointments.tsx` and `Appointments.tsx`, possibly evolved replacements.
- **Contract editors**: legacy page `ContractEditors.tsx`. FULLDEV-V2 has `ContractWriters.tsx` (likely renamed/replaced).
- **Debt management**: tables `debts`, `debt_payments`. Page `Debts.tsx`. SQL `create_debts_table.sql`, `add_debt_payments_table.sql`. Not in FULLDEV-V2.
- **Expenses**: table `expenses` with `category`, `amount`, `expense_date`, `status` (Pending/Approved/Rejected), recurring expense support via cron (`SETUP_RECURRING_EXPENSES_CRON.sql`). Not in FULLDEV-V2.
- **Login attempts tracking**: `login_attempts` table + helper functions. Not visible in FULLDEV-V2 (verify).

---

## 6. Stale / abandoned ideas (from old docs, not in FULLDEV-V2/src/)

One-line each, so the user remembers these were discussed:

- **Mobile loading retry logic with exponential backoff** + 10-second timeout on first load (Development Report.md "Critical Issue #1" — was urgent because mobile users were getting stuck on the loading screen).
- **Per-client isolated installment calculations** so one client's overpayment doesn't bleed into another's balance (Development Report.md #2). Current system was global.
- **Switch dialogs to bottom-sheets on mobile** (Development Report.md #3).
- **Variable land pricing with snapshot-at-sale-time** so editing piece prices later doesn't retroactively change historical sales (Development Report.md #19).
- **Sale deadline countdown** with 3-days-out warning, day-of red highlight, and post-deadline "Cancel & Release" button that returns the piece to Available with no refund (Development Report.md #17). FULLDEV-V2 has `DeadlineCountdown.tsx` so part of this exists.
- **Admin cancellation dashboard** for Owner-only review of cancellation requests (Development Report.md #16).
- **Sale Confirmation page with editable 2% company fee + installment scheduling form** (Development Report.md #15). FULLDEV-V2 has `Confirmation.tsx` + `ConfirmGroupSaleDialog.tsx` so the basic page exists.
- **Owner Dashboard seller leaderboard** — total sales count/value/commission per worker (Development Report.md #10).
- **Finance page sales-type breakdown** (Full vs Installment) with pie/line charts and prior-period comparison (Development Report.md #11).
- **Expenses page** with categories, recurring expenses, approval workflow, budget-vs-actual, receipt upload (Development Report.md #18). Legacy app implemented this; FULLDEV-V2 dropped it.
- **Activity feed widget on Owner dashboard** showing recent actions across all users (Development Report.md #23).
- **Capacitor-based Android packaging** of the webapp (`QUICK_SETUP_CAPACITOR.md` was an empty/single-line file — the idea existed but was never written up).
- **Worker title presets** with autocomplete: مدير, مدير مبيعات, مندوب مبيعات, موظف ميداني, etc. (`dev-report/FEATURES/WORKER_TITLES.md`).
- **2FA for Owner/Manager**, password reset via email, password history (last 5), CAPTCHA-after-3-failures (`SECURITY_*.md` recommendations — the CAPTCHA half shipped in legacy app).
- **Edge Functions for request batching** — `dashboard-aggregate`, `clients-batch` — to cut API call counts 70–90% and Supabase bill 60–80% (`PERFORMANCE_OPTIMIZATION_README.md`).
- **Read replicas** for >80% read traffic, with edge functions configured to route SELECTs to replica URL (`PERFORMANCE_OPTIMIZATION_README.md`).
- **PWA + offline support / pull-to-refresh / swipe gestures**. FULLDEV-V2 has `vite-plugin-pwa` and `HardRefreshWrapper.tsx`, so partial.
- **APK download page** at `/download` reading `app.apk` from Supabase storage (`SETUP_APK_DOWNLOAD.md`). Legacy `Download.tsx` page existed.

---

## 7. Source file index

Every `.md` file distilled into this document, with a one-sentence summary. Sorted by location.

### `ardhiv2/` (root)
- `README.md` — Top-level project README for the legacy "FULLLANDDEV" app: features, tech stack (React 18, Tailwind v4 — outdated), setup, role permissions matrix (Owner/Manager/FieldStaff), business rules (dual pricing, multi-land sales, small/big advance, stacked installments).
- `BACKUP_INSTRUCTIONS.md` — (Unread, ~88k tokens) Reminder file for DB+storage backup procedures via Supabase CLI.
- `CLEANUP_SUMMARY.md` — Log of an earlier doc/SQL cleanup pass that deleted 20+ redundant files (Page1.md…Page8.md, several FINAL_/IMPLEMENTATION_ reports, old reset scripts).
- `CLEAR_DATABASE_INSTRUCTIONS.md` — Runbook for `clear_database_keep_lands.sql`: deletes sales/clients/financial/projects/debts, resets pieces to Available, keeps batches/users/audit_logs.
- `COMPLETE_SECURITY_FLAWS_LIST.md` — Earlier (Jan 2026) security audit, score 78%, 12 vulnerabilities listed by category with mitigation status.
- `COMPREHENSIVE_SECURITY_AUDIT.md` — Later/parallel audit, 20 vulnerabilities (1 Critical / 13 Medium / 6 Low), score 72%, lots of "✅ FIXED" annotations marking what landed.
- `DELETE_PIECES_INSTRUCTIONS.md` — Arabic runbook for `delete_pieces_from_batch_simple.sql` to remove all pieces from one specific batch ("Terrain agricole") while keeping batch + batch-level offers.
- `DEVELOPMENT_DOCUMENTATION.md` — (Read first 200 lines of) Long developer guide for the legacy app: architecture, project structure, code conventions, RLS, common tasks. Largely overlaps `documentation/08_Development.md`.
- `Development Report.md` — Big improvement-backlog memo: 25 items grouped Critical/High/New Features/UX/Reporting/Tech, with phased rollout (10-week plan).
- `EXPLOITATION_GUIDE_allowed_pieces.md` — Step-by-step PoC for the `allowed_pieces` RLS bypass. Five attack methods (direct API, modify frontend, profile manipulation, Postman/curl, SQL injection attempt).
- `GET_USER_ROLE_FIX_SUMMARY.md` — Explains why `get_user_role()` returned NULL for inactive Owners and how the fix file handles them.
- `LOGIN_RATE_LIMITING_IMPLEMENTATION.md` — Details the `login_attempts` table, CAPTCHA component, AuthContext changes, and 5-attempt/15-min lockout policy.
- `MIGRATION_CONTINGENCY_PLAN.md` — Plan for moving to a new Supabase project: auth export/import, data export/import, storage migration, password-reset strategy, rollback.
- `PERFORMANCE_OPTIMIZATION_README.md` — Install order for the SQL optimization scripts, Edge Function deployment, pg_cron schedules, expected 60–80% latency reduction, monitoring queries.
- `PROJECT_STRUCTURE.md` — Short directory tree for the legacy `frontend/` layout.
- `QUICK_SETUP_CAPACITOR.md` — Empty/single-line placeholder for Android-packaging-via-Capacitor instructions.
- `README.md` — (See first entry above.)
- `SECURITY_AUDIT_allowed_pieces.md` — Deep-dive on the `allowed_pieces` RLS vulnerability: shows the broken `USING (true)` policy and the fix using `can_access_land_piece(uuid)` helper.
- `SECURITY_FIXES_COMPLETE.md` — Status report claiming 12/12 critical security issues fixed in legacy code.
- `SECURITY_IMPLEMENTATION_COMPLETE.md` — "All high priority fixes implemented", details the lockout/timeout/error-message work; bumps security score 78→88%.
- `SECURITY_SUMMARY_allowed_pieces.md` — Plain-language summary of the `allowed_pieces` issue and pointer to the fix script.
- `SECURITY_VULNERABILITY_ASSESSMENT.md` — An earlier security overview (10 vulns, score 78%); largely superseded by `COMPREHENSIVE_SECURITY_AUDIT.md`.
- `SERVER_SIDE_VALIDATION_IMPLEMENTATION.md` — The three Postgres validation functions and the matching `permissionValidation.ts` helpers, plus list of pages updated/pending.
- `SERVICE_ROLE_KEY_SECURITY_VERIFICATION.md` — Confirms service role key only appears in server-side Edge Functions, never in the frontend.
- `SESSION_TIMEOUT_IMPLEMENTATION.md` — Timeouts (8h session, 15min idle, 7h refresh, 1h re-auth), `requiresReAuth()` API, sample usage in delete/payment handlers.
- `SETUP_APK_DOWNLOAD.md` — Arabic runbook for the `app-downloads` Supabase storage bucket and uploading `app.apk`.
- `SETUP_STORAGE_BUCKET_MANUAL.md` — Manual setup of the `land-images` bucket and its 4 RLS policies.
- `SQL_MIGRATIONS_README.md` — File-by-file inventory of the legacy SQL migrations and their canonical run order.
- `SUPABASE_API_MONITORING_GUIDE.md` — Where to find usage stats / logs / alerts in the Supabase dashboard, recommended rate limits, suspicious-activity playbook.
- `VERCEL_DEPLOYMENT.md` — `vercel.json` rewrite for SPA, env-var setup, build command for legacy `frontend/` directory, troubleshooting 404/build/blank-page.
- `WEBAPP_DOCUMENTATION.md` — Empty file.
- `WHAT_THE_FIX_DOES.md` — Plain-English explainer of which security issues `FIX_allowed_pieces_RLS_SECURITY.sql` actually fixes vs leaves open.
- `WORKER_MESSAGING_IMPLEMENTATION.md` — Worker profiles + conversations + messages + notifications design (the polling-based, no-emoji, task-oriented messaging system).

### `ardhiv2/dev-report/` (a "build from scratch" tutorial — aspirational, not deployed)
- `README.md`, `README_FIRST.md`, `HOW_TO_USE_THIS_FOLDER.md`, `QUICK_START_CHECKLIST.md` — Various "start here" entry points.
- `00_WHAT_IS_THIS_APP.md` — Plain-language pitch of what a Land Management System is for.
- `01_START_HERE.md` — Owner-vs-Worker model, time estimate, navigation.
- `02_SETUP_PROJECT.md` — Step-by-step project bootstrap (Node, Vite, Supabase signup, schema run, first Owner user).
- `03_BUILD_FEATURES.md` — Phase-by-phase build plan over 3-4 weeks.
- `FEATURES/README.md`, `FEATURES/USER_MANAGEMENT.md`, `FEATURES/WORKER_TITLES.md`, `FEATURES/LAND_MANAGEMENT.md`, `FEATURES/SALES_MANAGEMENT.md`, `FEATURES/FINANCIAL.md`, `FEATURES/OWNER_ACTIONS.md` — Per-feature design docs with TS/SQL code samples.
- `REFERENCE/README.md`, `REFERENCE/QUICK_REFERENCE.md`, `REFERENCE/DATABASE_SCHEMA.md`, `REFERENCE/TYPE_DEFINITIONS.md`, `REFERENCE/CALCULATIONS.md`, `REFERENCE/UI_COMPONENTS.md`, `REFERENCE/SECURITY.md`, `REFERENCE/API_PATTERNS.md`, `REFERENCE/ERROR_HANDLING.md`, `REFERENCE/NAMING_CONVENTIONS.md`, `REFERENCE/TESTING.md`, `REFERENCE/DEPLOYMENT.md` — Reference material for the redesign: Postgres schema with extra enums (PromiseOfSale, AwaitingPayment, InstallmentsOngoing), TS interfaces, calculation function shapes, React Query hook patterns, error-class hierarchy, naming rules (camelCase / PascalCase / UPPER_CASE), Vitest setup.

### `ardhiv2/documentation/` (the older app's published docs)
- `00_README.md` — Index page for the docs; security score 78%, 3-role system, Tailwind v4 + React 19 stack.
- `01_Getting_Started.md` — Setup walkthrough for the legacy `frontend/` layout.
- `02_User_Guide.md` — End-user guide; covers piece-generation modes (None / Uniform / Custom Flexible / Auto Smart / Optimized).
- `03_Admin_Guide.md` — Permissions matrix for Owner/Manager/FieldStaff, user creation flows.
- `04_Database_Schema.md` — Schema doc with enums (land_status, payment_type, sale_status, reservation_status, installment_status, payment_record_type, user_role, user_status), tables, indexes, triggers, RLS overview.
- `05_SQL_Migrations.md` — Migration order and per-script descriptions.
- `06_Security.md` — Same 78% scorecard, expanded sections on each protection class.
- `07_Deployment.md` — Vercel + Supabase deployment architecture.
- `08_Development.md` — Code style, project structure, common dev patterns.
- `09_API_Reference.md` — Common Supabase query patterns by table.
- `10_Troubleshooting.md` — Setup / auth / DB / deploy / perf / UI issue catalog.
