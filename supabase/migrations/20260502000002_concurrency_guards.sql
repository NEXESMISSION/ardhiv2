-- =============================================================================
-- Concurrency guards (audit items #2 and #3)
-- =============================================================================
-- These guard against two workers performing the same operation simultaneously:
--
--   #2  Two workers confirm the same pending sale at once.
--       Without a guard the front-end's "check-then-update" race produces
--       duplicate installment schedules + duplicate owner notifications.
--
--   #3  Two workers sell the same land piece to two different clients at once.
--       Without a guard a single piece ends up sold twice in the data.
--
-- The fix is a partial UNIQUE INDEX on `sales(land_piece_id)` filtered to the
-- statuses that represent an active claim ('pending' and 'completed'). A
-- second insert/update attempting to put the same piece into one of those
-- statuses will fail with a unique-violation error, which the front-end
-- already handles via the existing try/catch around the mutation.
--
-- This does NOT touch any existing rows. It only adds an index. If your
-- current data already contains duplicates, the index creation will fail and
-- you'll get a clear error pointing at the duplicate piece — fix it manually
-- then re-run the migration.
--
-- How to run:
--   Option A (Supabase CLI):  supabase db push
--   Option B (SQL editor):    paste this whole file → Run.
--
-- Rollback: see the commented block at the bottom.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Detect any pre-existing duplicate active sales for the same piece, so the
--    operator can resolve them before the index is created. This SELECT is
--    informational only — read the result before the CREATE INDEX runs.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT land_piece_id
      FROM public.sales
      WHERE status IN ('pending', 'completed')
      GROUP BY land_piece_id
      HAVING COUNT(*) > 1
  ) AS dups;
  IF dup_count > 0 THEN
    RAISE WARNING
      'There are % land_piece_id values already with multiple active sales. '
      'The unique index below will FAIL until you resolve those duplicates. '
      'Run:  SELECT land_piece_id, array_agg(id), array_agg(status) '
      '       FROM public.sales WHERE status IN (''pending'',''completed'') '
      '       GROUP BY land_piece_id HAVING COUNT(*) > 1;',
      dup_count;
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 2. Unique partial index — at most one active (pending or completed) sale
--    per land_piece. Cancelled sales are excluded so a piece can be re-sold
--    after a cancellation.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS sales_one_active_per_piece_idx
  ON public.sales (land_piece_id)
  WHERE status IN ('pending', 'completed');

-- =============================================================================
-- ROLLBACK:
--
--   DROP INDEX IF EXISTS public.sales_one_active_per_piece_idx;
-- =============================================================================
