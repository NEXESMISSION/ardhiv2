-- =============================================================================
-- clients.id_number — allow "CIN not available" at sale time
-- =============================================================================
-- Why:
--   A seller often closes a sale before the buyer's CIN is on hand. The sale
--   form now offers "رقم الهوية غير متوفر", which stores NULL and lets the
--   client be created and sold to immediately; the CIN is filled in later from
--   the Clients page.
--
--   Today `id_number` is NOT NULL, so that insert is rejected by the database.
--   This migration drops only the NOT NULL.
--
-- Why NULL and not a placeholder string:
--   `clients_id_number_key` (UNIQUE) stays in place. In PostgreSQL a UNIQUE
--   constraint permits many NULLs but only one of any given text value, so:
--     * any number of clients may have "no CIN yet"            -> NULL
--     * two clients can still never share a real CIN           -> enforced
--   A placeholder like 'NOCIN-123' would pollute search, print on documents,
--   and need cleaning up later. NULL needs none of that.
--
-- Safety:
--   * Only relaxes a constraint — no existing row changes, nothing is dropped
--     or rewritten. All 1690 current clients keep their CIN.
--   * Touches no batch, piece, sale, or payment offer.
--   * Re-runnable: DROP NOT NULL on a nullable column is a no-op.
--
-- How to run:
--   Option A (Supabase CLI):  supabase db push
--   Option B (SQL editor):    paste this file into the Supabase Dashboard
--                             → SQL Editor → New query → Run.
--
-- Rollback: see the commented block at the bottom.
-- =============================================================================

ALTER TABLE public.clients
  ALTER COLUMN id_number DROP NOT NULL;

COMMENT ON COLUMN public.clients.id_number IS
  'National ID (CIN). NULL = not supplied yet; fill in later from the Clients page. UNIQUE still applies to non-NULL values.';

-- =============================================================================
-- Verification — run after applying.
-- =============================================================================
-- 1. Column is now nullable, and the UNIQUE constraint is still there:
--
--    SELECT column_name, is_nullable
--    FROM information_schema.columns
--    WHERE table_name = 'clients' AND column_name = 'id_number';
--    -- expect: is_nullable = 'YES'
--
--    SELECT conname, contype
--    FROM pg_constraint
--    WHERE conrelid = 'public.clients'::regclass AND contype = 'u';
--    -- expect: clients_id_number_key still listed
--
-- 2. No existing client lost its CIN:
--
--    SELECT count(*) FROM public.clients WHERE id_number IS NULL;
--    -- expect: 0 immediately after this migration
--
-- =============================================================================
-- ROLLBACK — only possible while no client has a NULL CIN.
-- =============================================================================
-- -- Fill or remove NULL rows first, then:
-- ALTER TABLE public.clients ALTER COLUMN id_number SET NOT NULL;
-- =============================================================================
