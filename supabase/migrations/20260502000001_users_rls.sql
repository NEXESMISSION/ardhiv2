-- =============================================================================
-- Users-table RLS — block worker self-promotion (audit item #3)
-- =============================================================================
-- Goals:
--   1. Workers cannot read other workers' rows (privacy).
--   2. Workers can update their own profile fields (name, phone, place, title,
--      notes, image_url) but NOT the privileged columns (role, allowed_pages,
--      allowed_batches, allowed_pieces, email, auth_user_id, created_by).
--   3. Only Owners can INSERT or DELETE rows.
--   4. The Edge Function (admin-users) bypasses RLS via service-role; this
--      migration does NOT change its behavior.
--
-- How to run:
--   Option A (Supabase CLI):  supabase db push
--   Option B (SQL editor):    paste this whole file into the Supabase Dashboard
--                             → SQL Editor → New query → Run.
--
-- Rollback: see the commented block at the bottom of this file.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helper: is the current JWT an Owner?
--    SECURITY DEFINER + STABLE so the policy lookup doesn't recurse on `users`
--    once RLS is enabled.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_app_owner()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role = 'owner'
       FROM public.users
       WHERE auth_user_id = auth.uid()
       LIMIT 1),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_app_owner() FROM public;
GRANT EXECUTE ON FUNCTION public.is_app_owner() TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Trigger: revert privileged-column changes when the caller is not an Owner.
--    RLS works at the row level, not the column level; this trigger is what
--    actually stops a worker from setting role='owner' on their own row.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.users_block_privileged_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Owners are unrestricted.
  IF public.is_app_owner() THEN
    RETURN NEW;
  END IF;

  -- Non-owners: silently revert privileged columns to their old values.
  -- (Silent rather than RAISE so legitimate self-edits of name/phone/etc. still succeed.)
  NEW.role            := OLD.role;
  NEW.allowed_pages   := OLD.allowed_pages;
  NEW.allowed_batches := OLD.allowed_batches;
  NEW.allowed_pieces  := OLD.allowed_pieces;
  NEW.email           := OLD.email;
  NEW.auth_user_id    := OLD.auth_user_id;
  NEW.created_by      := OLD.created_by;
  NEW.created_at      := OLD.created_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_block_privileged_self_update_trigger ON public.users;
CREATE TRIGGER users_block_privileged_self_update_trigger
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.users_block_privileged_self_update();

-- -----------------------------------------------------------------------------
-- 3. Enable RLS and replace any prior policies on `users`.
-- -----------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;  -- also enforce against table owner

-- Drop any existing policies on the table so this migration is idempotent.
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'users'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', pol.policyname);
  END LOOP;
END
$$;

-- SELECT: a logged-in user sees their own row; Owners see all rows.
CREATE POLICY users_select_self_or_owner ON public.users
  FOR SELECT
  TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR public.is_app_owner()
  );

-- INSERT: only Owners can create new user rows. The Edge Function uses
-- service-role so it bypasses this policy entirely.
CREATE POLICY users_insert_owner_only ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK ( public.is_app_owner() );

-- UPDATE: a user can update their own row, an Owner can update any row.
-- Privileged columns are still protected by the BEFORE UPDATE trigger above.
CREATE POLICY users_update_self_or_owner ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR public.is_app_owner()
  )
  WITH CHECK (
    auth_user_id = auth.uid()
    OR public.is_app_owner()
  );

-- DELETE: only Owners.
CREATE POLICY users_delete_owner_only ON public.users
  FOR DELETE
  TO authenticated
  USING ( public.is_app_owner() );

-- =============================================================================
-- ROLLBACK (run only if this migration breaks something in production):
--
--   ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.users NO FORCE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS users_select_self_or_owner ON public.users;
--   DROP POLICY IF EXISTS users_insert_owner_only    ON public.users;
--   DROP POLICY IF EXISTS users_update_self_or_owner ON public.users;
--   DROP POLICY IF EXISTS users_delete_owner_only    ON public.users;
--   DROP TRIGGER IF EXISTS users_block_privileged_self_update_trigger ON public.users;
--   DROP FUNCTION IF EXISTS public.users_block_privileged_self_update();
--   DROP FUNCTION IF EXISTS public.is_app_owner();
-- =============================================================================
