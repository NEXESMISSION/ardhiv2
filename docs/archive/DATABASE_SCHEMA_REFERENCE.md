# Ardhi / FULLDEV-V2 — Database Schema Reference

**Generated:** 2026-05-02
**Source:** Synthesis of 106 ad-hoc `*.sql` files at the root of the `ardhiv2/` repo.
**Backend:** Supabase (PostgreSQL + Auth + Storage + Realtime).
**App:** Vite + React at `FULLDEV-V2/` using `@supabase/supabase-js` (see `FULLDEV-V2/src/lib/supabase.ts`).
**Auth keys:** `localStorage` key `land-system-auth-v2`, `Prefer: return=minimal`, realtime cap 10 events/sec.

This document supersedes the loose SQL files. Scope: capture schema shape, RLS posture, functions/triggers, and which pieces the live app actually uses. Raw SQL is in git history if needed.

---

## 0. TL;DR — what the live app actually touches

Tables hit by `supabase.from(...)` in `FULLDEV-V2/src` (counted, descending):

| Table | Refs | Notes |
|---|---|---|
| `sales` | 61 | Core domain. |
| `land_pieces` | 40 | Core domain. |
| `notifications` | 17 | Messaging/notification system. |
| `installment_payments` | 17 | **Mismatch:** SQL files only define `payments` + `installments`. App uses a name `installment_payments` not present in any SQL file — likely a view/alias OR app expects a table that was renamed. Investigate before deleting `add_debt_payments_table.sql` etc. |
| `clients` | 17 | Core domain. |
| `users` | 14 | Core domain (auth-linked). |
| `land_batches` | 13 | Core domain. |
| `payment_offers` | 11 | Installment offer templates per batch/piece. |
| `appointments` | 7 | **Mismatch:** SQL files define `sale_rendezvous`. App uses `appointments` — likely renamed. |
| `phone_call_appointments` | 5 | **Mismatch:** SQL files define `phone_calls`. App uses `phone_call_appointments`. |
| `contract_writers` | 5 | **Mismatch:** SQL files define `contract_editors`. App uses `contract_writers`. |
| `audit_logs` | 3 | Activity log. |

RPCs called by app: `update_sale_safe`, `notify_owners`. **Neither is defined in any of the 106 SQL files** — they live in Supabase only. Preserve the live DB definitions before any reset.

Storage bucket used by app: **`profile-images` only**. The `app-downloads` bucket (`create_app_downloads_bucket.sql`) is set up but no code reference exists in `FULLDEV-V2/src`.

---

## 1. Current schema (in use by FULLDEV-V2)

### 1.1 Auth & users

#### `users` — links to `auth.users`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | FK → `auth.users.id` ON DELETE CASCADE |
| `name` | VARCHAR(255) NOT NULL | Length-checked ≤ 255 |
| `email` | VARCHAR(254) UNIQUE NOT NULL | Length-checked, regex-validated by `validate_email()` |
| `role` | `user_role` enum NOT NULL | **Originally** `Owner`/`Manager`/`FieldStaff`. **Migrated** to `Owner`/`Worker` via `update_users_role_structure.sql`. |
| `status` | `user_status` enum DEFAULT `Active` | Values: `Active`, `Inactive`. |
| `allowed_pages` | TEXT[] DEFAULT NULL | NULL = all pages (Owner). Page IDs: `home`, `land`, `availability`, `clients`, `sales`, `confirm-sales`, `installments`, `finance`, `expenses`, `debts`, `users`, `security`, `real-estate`. |
| `allowed_batches` | UUID[] DEFAULT NULL | NULL/empty = all batches. |
| `allowed_pieces` | UUID[] DEFAULT NULL | NULL/empty = all pieces in allowed batches. |
| `page_order` | TEXT[] DEFAULT NULL | Custom page ordering. |
| `sidebar_order` | JSONB DEFAULT NULL | Custom sidebar ordering. |
| `preferred_language` | TEXT | Used by `i18n/context.tsx` (`.update({ preferred_language })`). |
| `image_url` | TEXT | Profile image, stored in `profile-images` bucket. |
| `created_at`, `updated_at` | TIMESTAMPTZ | Auto-updated via `update_updated_at_column()` trigger. |

> **Note on `auth_user_id`:** `i18n/context.tsx` calls `.eq('auth_user_id', user.id)` — but the canonical schema uses `id` as both PK and FK to `auth.users`. Either app code is buggy or there's a separate column added in a missing migration. Worth verifying live DB.

#### `roles`
JSONB-permissions table. Roles seeded: `Owner`, `Manager`, `FieldStaff` (legacy) — extended with `view_workers` / `view_messages` permissions (`UPDATE_ROLES_WORKER_MESSAGING_PERMISSIONS.sql`). After role migration only `Owner`/`Worker` users exist; the roles table mostly serves as documentation now.

#### `permission_templates` & `user_permissions`
Granular per-resource permission overrides (`add_user_permissions_table.sql`).
- `permission_templates(id, name UNIQUE, description, permissions JSONB)` — seeded with `Seller`, `Accountant`, `Field Agent`.
- `user_permissions(id, user_id FK users, resource_type, permission_type, granted BOOL, UNIQUE(user_id, resource_type, permission_type))`.
- `resource_type` ∈ `land`, `client`, `sale`, `payment`, `report`, `user`, `expense`.
- `permission_type` ∈ `view`, `create`, `edit`, `delete`, `export`.

#### `login_attempts`
Rate-limit / brute-force tracking (`add_login_attempts_tracking.sql`).
| Column | Type |
|---|---|
| `id` | UUID PK |
| `email` | VARCHAR(255) NOT NULL |
| `ip_address` | VARCHAR(45) |
| `success` | BOOLEAN |
| `attempted_at` | TIMESTAMPTZ |
| `user_agent` | TEXT |

Functions: `should_lock_account(email)` (5 attempts in 15 min), `get_failed_attempts(email)`, `cleanup_old_login_attempts()` (30-day retention).

---

### 1.2 Land

#### `land_batches`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK |  |
| `name` | VARCHAR(255) NOT NULL | Length-checked ≤ 255 |
| `total_surface` | DECIMAL(15,2) NOT NULL |  |
| `total_cost` | DECIMAL(15,2) NOT NULL |  |
| `date_acquired` | DATE NOT NULL |  |
| `notes` | TEXT | ≤ 5000 chars |
| `location` | VARCHAR(255) | indexed |
| `image_url` | TEXT | Originally targeted `land-images` bucket (see `ADD_IMAGE_TO_LAND_BATCHES.sql`); bucket was set up via dashboard. |
| `real_estate_tax_number` | VARCHAR(100) | الرسم العقاري عدد |
| `price_per_m2_full` | DECIMAL(10,2) | Default for NEW pieces only |
| `price_per_m2_installment` | DECIMAL(10,2) | Default for NEW pieces only |
| `company_fee_percentage_full` | NUMERIC(5,2) | Fee % for full payment sales |
| `created_by` | UUID FK users |  |
| `created_at`, `updated_at` | TIMESTAMPTZ |  |

Indexes: `idx_land_batches_location`, `idx_land_batches_company_fee_percentage_full`, `idx_land_batches_created_by`.

#### `land_pieces`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK |  |
| `land_batch_id` | UUID FK land_batches ON DELETE CASCADE |  |
| `piece_number` | VARCHAR(50) NOT NULL | UNIQUE per batch |
| `surface_area` | DECIMAL(15,2) NOT NULL |  |
| `purchase_cost` | DECIMAL(15,2) NOT NULL | Often 0 — see `fix_land_pieces_optional_fields.sql` |
| `selling_price_full` | DECIMAL(15,2) NOT NULL |  |
| `selling_price_installment` | DECIMAL(15,2) NOT NULL |  |
| `status` | `land_status` enum | `Available`, `Reserved`, `Sold`, `Cancelled` |
| `reserved_until` | TIMESTAMPTZ |  |
| `reservation_client_id` | UUID FK clients |  |
| `notes` | TEXT |  |
| `created_at`, `updated_at` | TIMESTAMPTZ |  |

Indexes: `idx_land_pieces_status`, `idx_land_pieces_batch`, `idx_land_pieces_batch_status`. Unique: `(land_batch_id, piece_number)`.

#### `payment_offers` — installment-offer templates per batch or piece
Created by `add_payment_offers_table.sql`, evolved by `update_payment_offers_structure.sql`.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK |  |
| `land_batch_id` | UUID FK land_batches ON DELETE CASCADE | XOR with `land_piece_id` |
| `land_piece_id` | UUID FK land_pieces ON DELETE CASCADE | XOR with `land_batch_id` |
| `price_per_m2_installment` | DECIMAL(15,2) |  |
| `company_fee_percentage` | DECIMAL(5,2) NOT NULL DEFAULT 0 |  |
| `advance_amount` | DECIMAL(15,2) | Was `received_amount` |
| `advance_is_percentage` | BOOLEAN DEFAULT FALSE |  |
| `monthly_payment` | DECIMAL(15,2) | Replaces hard-coded `number_of_months` (kept for back-compat) |
| `number_of_months` | INTEGER | Legacy/back-compat |
| `offer_name` | VARCHAR(255) |  |
| `notes` | TEXT |  |
| `is_default` | BOOLEAN DEFAULT FALSE | Single-default enforced via `ensure_single_default_offer()` trigger |
| `created_by` | UUID FK users |  |
| `created_at`, `updated_at` | TIMESTAMPTZ |  |

Indexes: `idx_payment_offers_batch`, `idx_payment_offers_piece`, `idx_payment_offers_default`.

---

### 1.3 Clients

#### `clients`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK |  |
| `name` | VARCHAR(255) NOT NULL | Length-checked |
| `cin` | VARCHAR(50) NOT NULL | Indexed; not unique (multiple sales possible) |
| `phone` | VARCHAR(100) | Originally VARCHAR(50) — extended to 100 to allow `/`-separated multiple numbers (`update_clients_phone_structure.sql`). Regex-validated by `validate_phone()`. |
| `email` | VARCHAR(254) | Optional. Added retroactively (`FIX_CLIENTS_TABLE_EMAIL_COLUMN.sql`). |
| `address` | VARCHAR(500) |  |
| `client_type` | VARCHAR(50) DEFAULT `Individual` | Or `Company` |
| `notes` | TEXT | ≤ 5000 chars |
| `created_by` | UUID FK users |  |
| `created_at`, `updated_at` | TIMESTAMPTZ |  |

Index: `idx_clients_cin`.

---

### 1.4 Reservations & Sales

#### `reservations`
Pre-sale holds with small advance.
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK |  |
| `client_id` | UUID FK clients ON DELETE RESTRICT |  |
| `land_piece_ids` | UUID[] NOT NULL | Multi-piece supported |
| `small_advance_amount` | DECIMAL(15,2) DEFAULT 0 |  |
| `reservation_date` | DATE DEFAULT CURRENT_DATE |  |
| `reserved_until` | DATE NOT NULL |  |
| `status` | `reservation_status` enum | `Pending`, `Confirmed`, `Cancelled`, `Expired` |
| `notes`, `created_by`, `created_at`, `updated_at` | — |  |

Indexes: `idx_reservations_client`, `idx_reservations_status`.

#### `sales`
The most-mutated table — many ALTER migrations apply here.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK |  |
| `client_id` | UUID FK clients ON DELETE RESTRICT |  |
| `land_piece_ids` | UUID[] NOT NULL |  |
| `reservation_id` | UUID FK reservations |  |
| `payment_type` | `payment_type` enum | `Full`, `Installment`, `PromiseOfSale` (added later) |
| `total_purchase_cost` | DECIMAL(15,2) NOT NULL |  |
| `total_selling_price` | DECIMAL(15,2) NOT NULL |  |
| `profit_margin` | DECIMAL(15,2) NOT NULL |  |
| `small_advance_amount`, `big_advance_amount` | DECIMAL(15,2) DEFAULT 0 |  |
| `installment_start_date`, `installment_end_date` | DATE | End-date back-filled via `update_installment_end_dates.sql` |
| `number_of_installments` | INTEGER |  |
| `monthly_installment_amount` | DECIMAL(15,2) |  |
| `status` | `sale_status` enum | `Pending`, `Completed`, `Cancelled`. **NOT** `Confirmed` — see `fix_sale_status_confirmed_error.sql`. |
| `is_confirmed`, `big_advance_confirmed` | BOOLEAN DEFAULT FALSE | Confirmation flags (separate from `status`). |
| `confirmed_by` | UUID FK users | Who confirmed |
| `sale_date` | DATE DEFAULT CURRENT_DATE |  |
| `deadline_date` | DATE | Procedure-completion deadline |
| `company_fee_percentage` | DECIMAL(5,2) DEFAULT 0 |  |
| `company_fee_amount` | DECIMAL(15,2) DEFAULT 0 |  |
| `selected_offer_id` | UUID FK payment_offers ON DELETE SET NULL |  |
| `contract_editor_id` | UUID FK contract_editors ON DELETE SET NULL | (App may call this `contract_writers` — verify.) |
| `promise_initial_payment` | DECIMAL(15,2) DEFAULT 0 | For PromiseOfSale type |
| `promise_completion_date` | DATE | Auto-set from `deadline_date` |
| `promise_completed` | BOOLEAN DEFAULT FALSE |  |
| `notes` | TEXT | ≤ 5000 chars |
| `created_by` | UUID FK users |  |
| `created_at`, `updated_at` | TIMESTAMPTZ |  |

Indexes: `idx_sales_client`, `idx_sales_status`, `idx_sales_date`, `idx_sales_client_status`, `idx_sales_deadline`, `idx_sales_is_confirmed`, `idx_sales_created_by`, `idx_sales_confirmed_by`, `idx_sales_selected_offer_id`.

#### `installments`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK |  |
| `sale_id` | UUID FK sales ON DELETE CASCADE | UNIQUE per `installment_number` |
| `installment_number` | INTEGER |  |
| `amount_due` | DECIMAL(15,2) NOT NULL |  |
| `amount_paid` | DECIMAL(15,2) DEFAULT 0 |  |
| `stacked_amount` | DECIMAL(15,2) DEFAULT 0 | For partial-payment carry-over |
| `due_date` | DATE NOT NULL |  |
| `paid_date` | DATE |  |
| `status` | `installment_status` enum | `Unpaid`, `Paid`, `Late`, `Partial` |
| `notes` | TEXT |  |

Indexes: `idx_installments_sale`, `idx_installments_status`, `idx_installments_due_date`, `idx_installments_sale_status`.

#### `payments`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK |  |
| `client_id` | UUID FK clients ON DELETE RESTRICT |  |
| `sale_id` | UUID FK sales ON DELETE SET NULL |  |
| `installment_id` | UUID FK installments ON DELETE SET NULL |  |
| `reservation_id` | UUID FK reservations ON DELETE SET NULL |  |
| `amount_paid` | DECIMAL(15,2) NOT NULL |  |
| `payment_type` | `payment_record_type` enum | `BigAdvance`, `SmallAdvance`, `Installment`, `Full`, `Partial`, `Field`, `Refund` |
| `payment_date` | DATE DEFAULT CURRENT_DATE |  |
| `payment_method` | VARCHAR(50) DEFAULT `Cash` |  |
| `notes` | TEXT |  |
| `recorded_by` | UUID FK users |  |
| `created_at`, `updated_at` | TIMESTAMPTZ |  |

Indexes: `idx_payments_client`, `idx_payments_sale`, `idx_payments_type`, `idx_payments_date`, `idx_payments_client_date`, `idx_payments_recorded_by`.

> **App naming mismatch:** App queries `installment_payments` 17×. No SQL defines this; likely either a Postgres view over `payments` filtered to installment payments, or a renamed table. **Confirm in live DB before deleting SQL files.**

---

### 1.5 Audit / activity

#### `audit_logs`
| Column | Type |
|---|---|
| `id` | UUID PK |
| `user_id` | UUID FK users ON DELETE SET NULL |
| `action` | VARCHAR(50) NOT NULL |
| `table_name` | VARCHAR(100) NOT NULL |
| `record_id` | UUID |
| `old_values`, `new_values` | JSONB |
| `ip_address` | INET |
| `user_agent` | TEXT |
| `created_at` | TIMESTAMPTZ |

View `audit_logs_with_user` joins user name/email for easier querying. Insert-only at the policy level (no UPDATE/DELETE policies = denied).

#### `sales_history` (`create_sales_history_schema.sql`)
Per-row change log of `sales` table. Columns mirror old/new of: `status`, `payment_type`, `total_selling_price`, `small_advance_amount`, `big_advance_amount`, `notes`. Trigger `trigger_log_sale_change` calls `log_sale_change()` (Arabic change descriptions). DELETE policy = `false` (immutable).

#### `sale_rendezvous_history` (`create_rendezvous_history_schema.sql`)
Per-row change log of `sale_rendezvous` (see Appointments). Same pattern as `sales_history`.

---

### 1.6 Appointments

#### `sale_rendezvous` (app references it as `appointments`)
Sales-completion appointments.
| Column | Type |
|---|---|
| `id` | UUID PK |
| `sale_id` | UUID FK sales ON DELETE CASCADE |
| `rendezvous_date` | DATE NOT NULL |
| `rendezvous_time` | TIME NOT NULL |
| `notes` | TEXT |
| `status` | TEXT CHECK IN (`scheduled`, `completed`, `cancelled`, `rescheduled`) |
| `rescheduled_from_id` | UUID self-FK |
| `created_by` | UUID FK users |

#### `phone_calls` (app references it as `phone_call_appointments`)
Phone-call scheduling.
| Column | Type |
|---|---|
| `id` | UUID PK |
| `phone_number` | TEXT NOT NULL |
| `name` | TEXT NOT NULL |
| `rendezvous_time` | TIMESTAMPTZ NOT NULL |
| `land_batch_id` | UUID FK land_batches ON DELETE SET NULL |
| `motorized` | TEXT CHECK IN (`motorisé`, `non motorisé`) |
| `status` | TEXT CHECK IN (`pending`, `done`, `not_done`) |
| `notes`, `created_by`, `created_at`, `updated_at` | — |

> **Likely renamed:** App's `appointments` and `phone_call_appointments` table names don't exist in the SQL files — these are likely renames of `sale_rendezvous` and `phone_calls` respectively, done outside the captured SQL.

---

### 1.7 Contracts

#### `contract_editors` (app references it as `contract_writers`)
محررين العقد — contract editor/writer reference list.
| Column | Type |
|---|---|
| `id` | UUID PK |
| `type` | VARCHAR(100) NOT NULL |
| `name` | VARCHAR(255) NOT NULL |
| `place` | VARCHAR(255) NOT NULL |
| `created_by` | UUID FK users |

Referenced from `sales.contract_editor_id`.

---

### 1.8 Notifications

#### `notifications` (heavily used by app)
| Column | Type |
|---|---|
| `id` | UUID PK |
| `user_id` | UUID FK users ON DELETE CASCADE |
| `type` | `notification_type` enum (`new_message`, `task_update`, `system`) |
| `reference_id` | UUID |
| `is_read` | BOOLEAN DEFAULT FALSE |
| `created_at` | TIMESTAMPTZ |

Indexes incl. `idx_notifications_user_unread` (partial WHERE not read). Helper function `get_unread_notification_count()`. Realtime-enabled (`ENABLE_REALTIME_MESSAGING.sql`).

App calls `supabase.rpc('notify_owners', ...)` — RPC defined live in Supabase, NOT in any SQL file here.

---

## 2. Database functions, triggers & RLS — current state

### 2.1 Core functions

| Function | Purpose | Defined in |
|---|---|---|
| `get_user_role()` returns `user_role` | Returns current `auth.uid()`'s role. **Critical fix:** Owners get role even if `status != Active`; other roles must be Active. SECURITY DEFINER with `search_path=public`. | `fix_get_user_role_rls_complete.sql` (latest), originally in `supabase_schema.sql`. |
| `is_current_user_owner()` returns BOOLEAN | Convenience wrapper. Used to break circular-RLS on the `users` table itself. SECURITY DEFINER. | `COMPLETE_FIX_users_table.sql`, `ULTIMATE_FIX_ALL_ISSUES.sql`. |
| `get_current_user_role()` returns `user_role` | Like `get_user_role` but defaults to `FieldStaff` instead of NULL. | Same. |
| `has_permission(name)` / `has_user_permission(name, user_id)` | JSONB lookup against `roles.permissions` and `user_permissions`. Owner always TRUE. | `supabase_schema.sql`, `add_user_permissions_table.sql`. |
| `validate_user_permission(name)` / `validate_user_permissions(names[])` / `validate_user_any_permission(names[])` | Server-side permission validation called from frontend before sensitive ops. Handles legacy `view_X` and new `X_view` formats; hard-codes Worker-role permissions. | `add_server_side_permission_validation.sql`, `fix_validate_user_permission_for_workers.sql`. |
| `can_access_land_piece(piece_id)` / `can_access_land_batch(batch_id)` | Enforce `allowed_pieces` / `allowed_batches` at RLS level. SECURITY DEFINER. **Critical security fix:** Without this, restrictions were UI-only. | `FIX_allowed_pieces_RLS_SECURITY.sql`. |
| `delete_client_completely(client_id)` | RPC: cascades delete of payments → installments → sales → reservations → client; resets piece status to `Available`. Owner-only. | `create_delete_client_function.sql`, `fix_all_deletion_issues.sql`. |
| `delete_sale_completely(sale_id)` | RPC: cascades delete of payments → installments → sale; resets piece status. Owner-only. | `create_delete_sale_function.sql`, `fix_all_deletion_issues.sql`. |
| `calculate_sale_profit(piece_ids[], use_installment_price)` | Returns total cost, total price, profit. | `supabase_schema.sql`. |
| `calculate_monthly_revenue(month, year)` | Sum of completed sales for a month. | `supabase_schema.sql`. |
| `update_overdue_installments()` | Marks `Unpaid` installments past `due_date` as `Late` and stacks remainder. | `supabase_schema.sql`. |
| `update_expired_reservations()` | Marks expired reservations and frees pieces. | `supabase_schema.sql`. |
| `update_updated_at_column()` | Trigger fn; sets `NEW.updated_at = NOW()`. | `supabase_schema.sql`. |
| `audit_trigger_function()` | Trigger fn; writes INSERT/UPDATE/DELETE to `audit_logs` with IP & user agent (best-effort from request headers). | `supabase_schema.sql`, enhanced in `ENSURE_USER_TRACKING_COMPLETE.sql`. |
| `log_user_action(action, table, record_id, old, new)` | Manual audit-log insertion from frontend. | `ENSURE_USER_TRACKING_COMPLETE.sql`. |
| `validate_email(text)` / `validate_phone(text)` | IMMUTABLE format validators used in CHECK constraints. | `security_database_fixes.sql`. |
| `should_lock_account(email)` / `get_failed_attempts(email)` / `cleanup_old_login_attempts()` | Login rate-limiting. | `add_login_attempts_tracking.sql`. |
| `can_create_sales()` | RLS helper restricting INSERT on sales to Owner/Manager. | `security_database_fixes.sql`. |
| `update_sale_safe(...)` | Called from `ConfirmSaleDialog.tsx` via `.rpc('update_sale_safe', ...)`. **Not defined in any SQL file** — lives only in the live Supabase DB. **Preserve before any reset.** | (live only) |
| `notify_owners(...)` | Called from `utils/notifications.ts` via `.rpc('notify_owners', ...)`. **Not defined in any SQL file.** **Preserve before any reset.** | (live only) |

### 2.2 Triggers (table → trigger → function)

| Table | Trigger | Function | Purpose |
|---|---|---|---|
| every domain table | `update_<table>_updated_at` (BEFORE UPDATE) | `update_updated_at_column` | Auto-bump `updated_at`. |
| `sales`, `payments`, `land_pieces`, `clients`, `installments`, `land_batches`, `reservations`, `users`, `debts`, `expenses`, `worker_profiles`, `conversations`, `messages`, `real_estate_projects`, `project_expenses`, `debt_payments` | `audit_<table>` (AFTER INSERT/UPDATE/DELETE) | `audit_trigger_function` | Write to `audit_logs`. |
| `messages` | `create_notification_on_message` | `create_message_notification` | Auto-create notification for the message recipient. |
| `messages` | `update_conversation_timestamp_on_message` | `update_conversation_on_message` | Bump `conversations.updated_at`. |
| `payment_offers` | `trigger_ensure_single_default_offer` | `ensure_single_default_offer` | Only one default offer per batch/piece. |
| `project_expenses` | `trigger_update_project_expenses` | `update_project_total_expenses` | Roll up totals to `real_estate_projects.total_expenses`. |
| `sales` | `trigger_log_sale_change` | `log_sale_change` | Write to `sales_history`. |
| `sale_rendezvous` | `trigger_log_rendezvous_change` | `log_rendezvous_change` | Write to `sale_rendezvous_history`. |

### 2.3 RLS — current effective posture

After many iterations, the latest pattern is:

- **Read** (`SELECT`): All authenticated users can view nearly every table (`USING (true)`), EXCEPT `land_batches` and `land_pieces` which now use `can_access_land_batch(id)` / `can_access_land_piece(id)` (FIX_allowed_pieces_RLS_SECURITY.sql).
- **Insert**: All authenticated users for clients, sales, reservations, installments, payments, debts, debt_payments, expenses, contract_editors, payment_offers, phone_calls, sale_rendezvous, projects, project_boxes, box_expenses, sales_history, sale_rendezvous_history.
- **Insert** (Owner-only): `users`, `real_estate_projects`, `project_expenses`, `recurring_expenses_templates`. Restricted to Owner/Manager (legacy) → `Owner` after role migration.
- **Update**: All authenticated for installments, payments, sales, land_batches/pieces (after `FIX_RLS_POLICIES_QUICK.sql` relaxed them, then partially re-tightened by `update_users_role_structure.sql` to Owner-only — **state is mixed; verify live**).
- **Delete**: Owner-only across the board, enforced via `is_current_user_owner()` or `EXISTS (SELECT 1 FROM users WHERE id=auth.uid() AND role='Owner' AND status='Active')`.
- **`users` table**: SECURITY DEFINER helper `is_current_user_owner()` breaks circular-dependency. `users_select_own` (own row) + `owners_select_all_users` + `owners_insert_users` + `owners_update_users` + `owners_delete_users` (cannot self-delete).
- **`audit_logs`**: Owner-only SELECT; INSERT allowed (system); no UPDATE/DELETE policies → denied by default.
- **History tables** (`sales_history`, `sale_rendezvous_history`): SELECT/INSERT open; DELETE explicitly `USING (false)` = immutable.

There were many overlapping fix attempts. The **canonical/latest** RLS state can be inspected via:
```sql
SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename, cmd;
```

---

## 3. Storage buckets

| Bucket | Public | Used by app? | Defined in |
|---|---|---|---|
| `profile-images` | Public read | **YES** (`Home.tsx`, `Users.tsx`) | Created via Dashboard, no SQL file. App uses path `profile-images/<filename>`. |
| `land-images` | Public read, 5MB cap, JPEG/PNG/GIF/WebP | Set up but no app reference | `ADD_IMAGE_TO_LAND_BATCHES.sql` + `SETUP_STORAGE_POLICIES.sql`. The `land_batches.image_url` column exists. |
| `app-downloads` | Public read | **NO** code reference | `create_app_downloads_bucket.sql`. Intended for APK distribution (`app.apk`). Likely abandoned or distributed elsewhere. |

Storage RLS (in `storage.objects`):
- `land-images`: authenticated INSERT/UPDATE/DELETE if `bucket_id='land-images' AND foldername[1]='land-batches'`; public SELECT.
- `app-downloads`: authenticated INSERT/UPDATE/DELETE; public SELECT.
- `profile-images`: policies set up via Dashboard (not in SQL files).

---

## 4. Schema NOT used by current app (likely legacy / abandoned)

The following schema bits exist in SQL but have **no `.from(...)` references** in `FULLDEV-V2/src/`:

### Worker-messaging system (CREATE_WORKER_MESSAGING_SYSTEM.sql)
- Tables: `worker_profiles`, `conversations`, `messages`
- Enums: `worker_availability_status`, `conversation_status`, `notification_type` (the last is still used by `notifications` table that IS active)
- Realtime-enabled. Triggers create notifications on new messages.
- App uses `notifications` table heavily but does NOT query `messages`/`conversations`/`worker_profiles` — likely the messaging UI was removed but the notifications layer was repurposed.

### Recurring expenses (ADD_RECURRING_EXPENSES.sql, SETUP_RECURRING_EXPENSES_CRON.sql)
- Tables: `recurring_expenses_templates`, plus columns on `expenses` (`is_recurring`, `is_revenue`, `recurrence_type`, etc.)
- Enum: `recurrence_type` (`Daily`, `Weekly`, `Monthly`, `Yearly`)
- Functions: `calculate_next_occurrence()`, `generate_recurring_expenses()`, `check_and_generate_recurring_expenses()`, `get_day_name()`
- Cron setup via pg_cron (commented out — never wired up).
- No app reference at all.

### Expenses & expense categories (add_expenses_table.sql + many fixes)
- Tables: `expenses`, `expense_categories`
- Enums: `expense_status` (`Pending`/`Approved`/`Rejected`), `payment_method` (`Cash`/`BankTransfer`/`Check`/`CreditCard`/`Other`), `expense_category` (mixed Arabic/English values, several conflicting versions across `FIX_EXPENSES_*` and `CHECK_AND_FIX_EXPENSE_CATEGORY_ENUM.sql`)
- 11 default Arabic categories seeded (إيجار، رواتب، كهرباء، ...).
- App has an `expenses` page in routing (`allowed_pages` enum) but no `.from('expenses')` calls — page likely removed/stubbed.

### Real-estate projects (CREATE_REAL_ESTATE_PROJECTS_TABLES.sql + simpler box variant)
- Tables: `real_estate_projects`, `project_expenses` — and the **simpler alternative** structure `projects`, `project_boxes`, `box_expenses` (`create_project_boxes_schema.sql`)
- Enums: `project_type`, `project_status`, `project_expense_category`
- Both schemas exist; simpler one was the later iteration. Many `FIX_PROJECT_EXPENSES_ENUM_*.sql` files attempting to converge enum types.
- No app code references either set of tables.

### Debts (create_debts_table.sql, add_debt_payments_table.sql)
- Tables: `debts`, `debt_payments`
- App has `debts` page in `allowed_pages` enum but no `.from('debts')` calls — page exists but stubbed/removed.

### Cancellation requests (add_cancellation_requests_table.sql)
- Table: `cancellation_requests` (Pending/Approved/Rejected workflow for sale cancellations)
- Enum (in fix_all_missing_columns.sql): `cancellation_status`
- No app code references.

### Permission templates / user_permissions (add_user_permissions_table.sql)
- Tables: `permission_templates`, `user_permissions`
- Used at the function level (`validate_user_permission()`) but app-side queries to these tables are absent.

### Removed: `worker_profiles.availability` column
Dropped via `remove_availability_from_worker_profiles.sql`.

### Backup tables (created by `backup_lands_data.sql`)
- `land_batches_backup`, `land_pieces_backup`, `payment_offers_backup` — only created if backup script was run; restorable via `restore_lands_data.sql`.

---

## 5. Migration history catalog (chronological-ish, by content)

### 5.1 Foundational
- `supabase_schema.sql` — original full schema. 858 lines. Foundation: enums, tables (users, roles, land_batches, land_pieces, reservations, sales, installments, payments, audit_logs), all triggers, RLS, helper functions, two views (`sales_public`, `land_pieces_public`).

### 5.2 Land schema additions
- `add_location_to_land_batches.sql` — `location` column.
- `add_real_estate_tax_number.sql` — `real_estate_tax_number`.
- `ADD_IMAGE_TO_LAND_BATCHES.sql` — `image_url` + `land-images` bucket.
- `add_price_per_m2_to_land_batches.sql` — `price_per_m2_full`, `price_per_m2_installment`.
- `add_company_fee_percentage_full_to_land_batches.sql` — `company_fee_percentage_full`.
- `fix_land_pieces_optional_fields.sql` — clarification only; no schema change.
- `insert_terrain_agricole_pieces.sql` — data insert (44+ pieces for "Terrain agricole" batch).
- `delete_pieces_from_batch.sql` / `delete_pieces_from_batch_simple.sql` — one-off cleanup of "Terrain agricole" pieces.

### 5.3 Sales schema additions
- `add_company_fee_to_sales.sql` / `FIX_SALES_TABLE_COMPANY_FEE_COLUMNS.sql` / `fix_sales_table_columns.sql` / `update_sales_company_fee_migration.sql` — repeated attempts to add `company_fee_percentage`, `company_fee_amount`.
- `add_deadline_to_sales.sql` — `deadline_date`.
- `add_confirmed_by_to_sales.sql` — `confirmed_by`.
- `add_selected_offer_id_to_sales.sql` / `verify_selected_offer_id_column.sql` — `selected_offer_id` FK.
- `add_promise_of_sale_payment_type.sql` — adds `PromiseOfSale` to enum + 3 promise_* columns.
- `update_installment_end_dates.sql` — back-fills `installment_end_date`.
- `fix_sale_status_confirmed_error.sql` — drops triggers/functions that incorrectly tried to use `'Confirmed'` status (which doesn't exist in `sale_status` enum).
- `fix_sale_confirmation_ui.sql` — verification only.

### 5.4 Clients schema additions
- `FIX_CLIENTS_TABLE_EMAIL_COLUMN.sql` — adds `email`.
- `update_clients_phone_structure.sql` — extends `phone` from VARCHAR(50) → VARCHAR(100).
- `update_clients_phone_numbers.sql` — bulk data update of 30 client phone numbers (with `/`-separators for multiple lines).

### 5.5 Payment offers
- `add_payment_offers_table.sql` — initial table.
- `update_payment_offers_structure.sql` — rename `received_amount` → `advance_amount`, add `advance_is_percentage`, `monthly_payment`.

### 5.6 User permissions / page access
- `add_allowed_batches_to_users.sql` — `allowed_batches` UUID[].
- `add_allowed_pieces_to_users.sql` — `allowed_pieces` UUID[].
- `ADD_ALLOWED_PAGES_TO_USERS.sql` — `allowed_pages` TEXT[] + role-based defaults.
- `add_page_order_to_users.sql` — `page_order` TEXT[].
- `add_sidebar_order_to_users.sql` — `sidebar_order` JSONB.
- `add_user_permissions_table.sql` — granular permissions tables + `has_user_permission()`.
- `add_server_side_permission_validation.sql` — `validate_user_permission(name)` + variants.
- `fix_validate_user_permission_for_workers.sql` — hard-codes Worker permissions.
- `update_users_role_structure.sql` — **Major migration:** replaces `Manager`/`FieldStaff` enum values with single `Worker`. Drops/recreates dozens of RLS policies. Hides the old enum as `user_role_old`.
- `update_worker_role_permissions.sql` — Worker can edit but not delete clients.
- `update_clients_rls_worker_permissions.sql` — recreate clients UPDATE policy for Owner+Worker.

### 5.7 RLS / permissions fix attempts (many; latest wins)
The following are repeated attempts to fix RLS on the `users` table (circular dependencies and insert failures). The **latest / canonical** are `ULTIMATE_FIX_ALL_ISSUES.sql` and `fix_users_table_rls_final.sql`.

- `diagnose_users_table_rls.sql` — read-only diagnostic.
- `QUICK_DIAGNOSTIC.sql` — disable-RLS-and-look diagnostic.
- `fix_users_table_rls_policies.sql` — first attempt (complex with `user_permissions` checks).
- `fix_users_table_rls_simple.sql` — simpler "only Owner can do everything" version.
- `fix_users_table_rls_circular_fix.sql` — introduces `is_current_user_owner()` SECURITY DEFINER.
- `fix_users_table_rls_final.sql` — refined SECURITY DEFINER pattern.
- `COMPLETE_FIX_users_table.sql` — adds Owner-list (`saifelleuchi127@gmail.com`, `lassad.mazed@gmail.com`).
- `STEP_BY_STEP_FIX.sql` — manual sectioned variant.
- `ULTIMATE_FIX_ALL_ISSUES.sql` — **most recent** comprehensive variant.
- `FIX_MISSING_USER.sql` / `add_orphaned_user_to_users_table.sql` — repair scripts when `auth.users` row exists but `public.users` row doesn't.
- `FIX_RLS_POLICIES_QUICK.sql` — open-up everything to authenticated for a quick unblock.

### 5.8 `get_user_role()` evolution
- `fix_get_user_role_function.sql` — adds `WHERE status='Active'` filter.
- `fix_get_user_role_rls_complete.sql` — **Critical:** Owners get role even if inactive (latest).
- `fix_sales_delete_rls_policy.sql` — apply same pattern, recreate `sales` DELETE policy.
- `test_get_user_role_rls.sql` — test script.

### 5.9 Land-access security (allowed_pieces / allowed_batches enforcement)
- `FIX_allowed_pieces_RLS_SECURITY.sql` — **Critical security fix:** add `can_access_land_piece()` / `can_access_land_batch()` and rewrite all `land_pieces` / `land_batches` policies to use them. Closes a UI-only-restriction vulnerability.
- `TEST_allowed_pieces_RLS_FIX.sql` — verification.

### 5.10 Deletion fixes
- `create_delete_client_function.sql` / `create_delete_sale_function.sql` — first SECURITY DEFINER versions of cascade-delete RPCs.
- `fix_all_deletion_issues.sql` — refined versions + improved `get_user_role()`.
- `fix_clients_delete_rls.sql` / `fix_sales_delete_rls_policy.sql` — policy-level fixes.
- `ensure_workers_cannot_delete_clients.sql` (×2 files with same name in different content) — strict Owner-only DELETE on clients.

### 5.11 User tracking / audit
- `ADD_USER_TRACKING_COLUMNS.sql` — ensures `created_by`/`recorded_by`/`confirmed_by` exist.
- `ENSURE_USER_TRACKING_COMPLETE.sql` — enhances `audit_trigger_function()` with IP/user-agent capture; adds audit triggers to all major tables; creates `audit_logs_with_user` view; adds `log_user_action()` RPC.
- `security_database_fixes.sql` — adds CHECK constraints for length/format, missing audit triggers, `validate_email`/`validate_phone`, `can_create_sales()`.

### 5.12 Domain extensions (most unused by app)
- `create_debts_table.sql` + `add_debt_payments_table.sql` — debt tracking.
- `add_expenses_table.sql` — expenses with categories + workflow. Many `FIX_EXPENSES_*` and `FIX_PROJECT_EXPENSES_*` files re-shaping the enum vs FK approach.
- `CREATE_REAL_ESTATE_PROJECTS_TABLES.sql` — `real_estate_projects` + `project_expenses`.
- `create_project_boxes_schema.sql` — simpler alternative `projects`/`project_boxes`/`box_expenses`.
- `CREATE_WORKER_MESSAGING_SYSTEM.sql` — worker_profiles, conversations, messages, notifications.
- `ENABLE_REALTIME_MESSAGING.sql` — adds these to `supabase_realtime` publication.
- `UPDATE_ROLES_WORKER_MESSAGING_PERMISSIONS.sql` — adds `view_workers`/`view_messages` to roles JSONB.
- `remove_availability_from_worker_profiles.sql` — drops a column.
- `add_cancellation_requests_table.sql` — cancellation workflow.
- `ADD_RECURRING_EXPENSES.sql` + `SETUP_RECURRING_EXPENSES_CRON.sql` — auto-generated recurring expenses (cron never wired).
- `add_login_attempts_tracking.sql` — brute-force prevention.
- `create_phone_calls_schema.sql` — phone-call appointments.
- `create_sale_rendezvous_schema.sql` — sale appointments.
- `create_rendezvous_history_schema.sql` — appointment audit trail.
- `create_sales_history_schema.sql` — sales audit trail.
- `create_contract_editors_table.sql` — contract editor reference list + `sales.contract_editor_id`.
- `create_real_estate_simple_structure.sql` — **empty/1-line file.**
- `fix_all_missing_columns.sql` — comprehensive idempotent backfill of all the above.

### 5.13 One-off / data-fix scripts
- `undo_sale_to_confirmation.sql` — generic "reset a sale to Pending" template.
- `undo_rami_bahloul_sale.sql` — applied version of above for client CIN `11075951`.
- `reset_client_installments.sql` — clear installments for a specific client.

---

## 6. Reset / backup / dangerous scripts

**Read carefully before running any of these. They DELETE data.**

### Backups (safe; read-only or create-only)
- `backup_database.sql` — SELECT-only export of all tables for inspection.
- `backup_lands_data.sql` — Creates `land_batches_backup`, `land_pieces_backup`, `payment_offers_backup` tables in DB; also emits INSERT/JSON dumps.
- `restore_lands_data.sql` — Inverse: restore from `*_backup` tables (uses `ON CONFLICT DO NOTHING`).

### Full resets — delete EVERYTHING except specified user(s)
- `RESET_DATABASE_FULL.sql` — Keeps `saifelleuchi127@gmail.com` only. Disables/re-enables RLS. Includes optional tables (debts, expenses, etc.) via `IF EXISTS` guards. Sets user as Owner/Active.
- `RESET_DATABASE_COMPLETE.sql` — Same as `_FULL` but **also clears messaging tables** (conversations, messages, notifications, worker_profiles) and recurring_expenses_templates.
- `RESET_DATABASE_KEEP_USER.sql` — Older flavor.
- `database_full_reset_keep_users.sql` — Keeps **all** users + roles, deletes all business data + `user_permissions` (but keeps `permission_templates`).
- `database_full_reset_with_test_data.sql` — Same delete + repopulates with 3 batches, 100 pieces, 10 clients, 10 sales, installments + payments. Useful for dev/QA.

### Partial resets (keep some data)
- `reset_database_keep_users_and_land.sql` — Keeps `saifelleuchi127` + `abir@gmail.com` + ALL land_pieces/batches (resets piece status to Available). Wipes everything else.
- `clear_database_keep_lands.sql` — Wipes clients/sales/installments/payments/reservations/expenses/debts/projects/phone_calls/sale_rendezvous; keeps batches and pieces (resets pieces to Available). Also wipes `payment_offers`.

### Misc / reference
- `test_database_schema.sql` — Diagnostic; checks 10+ schema elements exist, prints RAISE NOTICE results.
- `QUICK_DIAGNOSTIC.sql` / `diagnose_users_table_rls.sql` — Diagnostic queries for RLS state.
- `test_get_user_role_rls.sql` / `TEST_allowed_pieces_RLS_FIX.sql` — Verify recent fixes applied correctly.
- `SETUP_STORAGE_POLICIES.sql` — Storage RLS for `land-images` (often fails without superuser; falls back to manual Dashboard setup).
- `STEP_BY_STEP_FIX.sql` — Manual sectioned alternative to `ULTIMATE_FIX_ALL_ISSUES.sql`.

---

## 7. Open questions / things to verify in the live DB before deleting SQL files

1. **`installment_payments` table or view?** App queries it 17×. Not in any SQL file. Could be a view, a renamed `payments` filter, or a missing migration.
2. **`appointments`, `phone_call_appointments`, `contract_writers`** — App names that don't match SQL. Likely renames; confirm with `\dt` in Supabase SQL editor.
3. **`auth_user_id` column on `users`** — used in `i18n/context.tsx` but not defined anywhere. Either bug or undocumented column.
4. **RPC functions `update_sale_safe` and `notify_owners`** — Live in DB only. **Export their definitions** before any reset:
   ```sql
   SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname IN ('update_sale_safe','notify_owners');
   ```
5. **Storage bucket `profile-images`** — created via Dashboard, no SQL captures its policies.
6. **Active RLS state per table** — many overlapping fix attempts. Run `pg_policies` query (Section 2.3) to confirm what's actually applied today.
7. **`role` enum** — verify only `Owner`/`Worker` are present (post `update_users_role_structure.sql`); old `user_role_old` may still exist.

---

## 8. Quick reference: how to recreate from scratch

If you ever need to rebuild from scratch (no live DB to dump), the rough order is:

1. `supabase_schema.sql` (foundation: enums, tables, triggers, RLS, functions).
2. Land additions: `add_location_to_land_batches.sql`, `add_real_estate_tax_number.sql`, `ADD_IMAGE_TO_LAND_BATCHES.sql`, `add_price_per_m2_to_land_batches.sql`, `add_company_fee_percentage_full_to_land_batches.sql`.
3. Sales additions: `add_company_fee_to_sales.sql`, `add_deadline_to_sales.sql`, `add_confirmed_by_to_sales.sql`, `add_promise_of_sale_payment_type.sql`, `update_installment_end_dates.sql`.
4. Clients additions: `FIX_CLIENTS_TABLE_EMAIL_COLUMN.sql`, `update_clients_phone_structure.sql`.
5. Payment offers: `add_payment_offers_table.sql`, `update_payment_offers_structure.sql`, `add_selected_offer_id_to_sales.sql`.
6. User permissions / page access: `add_allowed_batches_to_users.sql`, `add_allowed_pieces_to_users.sql`, `ADD_ALLOWED_PAGES_TO_USERS.sql`, `add_page_order_to_users.sql`, `add_sidebar_order_to_users.sql`, `add_user_permissions_table.sql`, `add_server_side_permission_validation.sql`.
7. Role migration: `update_users_role_structure.sql` (Owner/Worker only), then `update_worker_role_permissions.sql`, `update_clients_rls_worker_permissions.sql`, `fix_validate_user_permission_for_workers.sql`.
8. Final RLS / function fixes: `fix_get_user_role_rls_complete.sql`, `ULTIMATE_FIX_ALL_ISSUES.sql`, `FIX_allowed_pieces_RLS_SECURITY.sql`, `fix_all_deletion_issues.sql`, `ENSURE_USER_TRACKING_COMPLETE.sql`, `security_database_fixes.sql`.
9. Optional domain extensions (only if features active): debts, expenses, recurring_expenses, projects, worker_messaging, cancellation_requests, login_attempts, phone_calls, sale_rendezvous + history tables, contract_editors.
10. Storage: create `profile-images` bucket via Dashboard with public-read; optionally `land-images` and `app-downloads`.
11. Re-create `update_sale_safe()` and `notify_owners()` RPCs (preserved separately — not in these SQL files).
12. Run `database_full_reset_with_test_data.sql` for seed data, or import a backup.

---

*End of reference. The 106 source SQL files this document replaces are listed in section 5 by area.*
