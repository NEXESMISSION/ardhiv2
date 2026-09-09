-- =============================================================================
-- payment_offers — let every land user (not just Owners) create an offer
-- =============================================================================
-- Why:
--   The sale form (MultiPieceSaleDialog) now has a "+ عرض جديد" button that
--   writes a batch-level row to payment_offers so a seller can add an
--   installment plan without leaving the sale. The button is shown to every
--   user, but the INSERT is still gated by RLS — on a database where the only
--   write policy is Owner-only, a worker sees a permission error instead.
--
--   This migration adds a PERMISSIVE INSERT policy so a worker who already has
--   'land' page access and access to the batch can create an offer for it.
--
-- Safety:
--   * PERMISSIVE policies are OR-ed together, so this only ever GRANTS. No
--     existing policy is dropped and no current access is removed.
--   * Scope is unchanged for everything else: SELECT/UPDATE/DELETE policies are
--     untouched, and a worker still cannot create an offer for a batch that is
--     not in their allowed_batches.
--   * Re-runnable: DROP POLICY IF EXISTS then CREATE.
--
-- Uses the app's existing security helpers (already present in this database):
--   user_has_page_access(required_page)  -- TRUE for owners, or page in allowed_pages
--   worker_has_batch_access(batch_id_param) -- TRUE for owners, or batch in allowed_batches
--   worker_has_piece_access(piece_id_param) -- TRUE for owners, or piece in allowed_pieces
--
-- How to run:
--   Option A (Supabase CLI):  supabase db push
--   Option B (SQL editor):    paste this whole file into the Supabase Dashboard
--                             → SQL Editor → New query → Run.
--
-- Rollback: see the commented block at the bottom of this file.
-- =============================================================================

-- Make sure RLS is actually on (no-op if it already is).
ALTER TABLE public.payment_offers ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- INSERT: any authenticated user with 'land' access may create an offer for a
-- batch (or piece) they are allowed to work on. Owners pass both helpers.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "land_users_can_create_payment_offers" ON public.payment_offers;
CREATE POLICY "land_users_can_create_payment_offers"
  ON public.payment_offers
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_has_page_access('land')
    AND (
      -- batch-level offer (what the sale form creates)
      (batch_id IS NOT NULL AND public.worker_has_batch_access(batch_id))
      -- piece-level offer (kept for parity with the existing data model)
      OR (land_piece_id IS NOT NULL AND public.worker_has_piece_access(land_piece_id))
    )
  );

-- =============================================================================
-- Verification — run these after applying.
-- =============================================================================
-- 1. The new policy exists and is PERMISSIVE / INSERT:
--
--    SELECT polname, permissive, cmd
--    FROM pg_policies
--    WHERE tablename = 'payment_offers'
--    ORDER BY polname;
--
-- 2. Full picture of who can do what on the table:
--
--    SELECT policyname, permissive, roles, cmd, qual, with_check
--    FROM pg_policies
--    WHERE tablename = 'payment_offers';
--
-- 3. End-to-end check: log into the app as a worker who has 'land' access,
--    open a batch → sell a piece → نوع البيع = التقسيط → "+ عرض جديد",
--    fill the form and save. The offer should appear and auto-select.
-- =============================================================================

-- =============================================================================
-- ROLLBACK (paste into the SQL editor to undo this migration)
-- =============================================================================
-- DROP POLICY IF EXISTS "land_users_can_create_payment_offers" ON public.payment_offers;
-- =============================================================================
