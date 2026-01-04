-- ============================================
-- ULTIMATE FIX: Solve ALL User Management Issues
-- ============================================
-- This script will:
-- 1. Disable RLS temporarily
-- 2. Ensure all auth users are in users table
-- 3. Set correct roles for known owners
-- 4. Create proper RLS policies
-- 5. Re-enable RLS
-- ============================================
-- RUN THIS ENTIRE SCRIPT IN SUPABASE SQL EDITOR
-- ============================================

-- ============================================
-- STEP 1: Disable RLS temporarily to fix data
-- ============================================
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 2: Sync ALL auth.users to public.users table
-- This ensures every authenticated user has a record
-- ============================================
INSERT INTO users (id, name, email, role, status)
SELECT 
    au.id,
    COALESCE(au.raw_user_meta_data->>'name', split_part(au.email, '@', 1), 'User'),
    au.email,
    COALESCE((au.raw_user_meta_data->>'role')::user_role, 'FieldStaff'::user_role),
    'Active'::user_status
FROM auth.users au
WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = au.id
);

-- ============================================
-- STEP 3: Set known owners to Owner role
-- Add any email addresses that should be Owner
-- ============================================
UPDATE users 
SET role = 'Owner', status = 'Active', updated_at = NOW()
WHERE email IN (
    'saifelleuchi127@gmail.com',
    'lassad.mazed@gmail.com'
);

-- ============================================
-- STEP 4: Verify users are correct
-- ============================================
SELECT 'Users in table:' as info;
SELECT id, name, email, role, status FROM users ORDER BY role, name;

-- ============================================
-- STEP 5: Re-enable RLS
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 6: Drop ALL existing policies on users table
-- ============================================
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'users') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON users';
    END LOOP;
    RAISE NOTICE 'All existing policies on users table dropped';
END $$;

-- ============================================
-- STEP 7: Create SECURITY DEFINER helper functions
-- ============================================
DROP FUNCTION IF EXISTS is_current_user_owner() CASCADE;
CREATE OR REPLACE FUNCTION is_current_user_owner()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role_val user_role;
BEGIN
    SELECT role INTO user_role_val 
    FROM users 
    WHERE id = auth.uid() 
    AND status = 'Active';
    
    RETURN COALESCE(user_role_val = 'Owner', FALSE);
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RETURN FALSE;
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$;

DROP FUNCTION IF EXISTS get_current_user_role() CASCADE;
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS user_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role_val user_role;
BEGIN
    SELECT role INTO user_role_val 
    FROM users 
    WHERE id = auth.uid() 
    AND status = 'Active';
    
    RETURN COALESCE(user_role_val, 'FieldStaff'::user_role);
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RETURN 'FieldStaff'::user_role;
    WHEN OTHERS THEN
        RETURN 'FieldStaff'::user_role;
END;
$$;

-- Also update the original get_user_role function used by other policies
DROP FUNCTION IF EXISTS get_user_role() CASCADE;
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role_val user_role;
BEGIN
    SELECT role INTO user_role_val 
    FROM users 
    WHERE id = auth.uid() 
    AND status = 'Active';
    
    RETURN COALESCE(user_role_val, 'FieldStaff'::user_role);
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RETURN 'FieldStaff'::user_role;
    WHEN OTHERS THEN
        RETURN 'FieldStaff'::user_role;
END;
$$;

-- ============================================
-- STEP 8: Grant execute permissions
-- ============================================
GRANT EXECUTE ON FUNCTION is_current_user_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;

-- ============================================
-- STEP 9: Create new RLS policies for users table
-- ============================================

-- Policy 1: Users can view their own profile
CREATE POLICY "users_select_own"
ON users
FOR SELECT
USING (auth.uid() = id);

-- Policy 2: Owners can view all users
CREATE POLICY "owners_select_all_users"
ON users
FOR SELECT
USING (is_current_user_owner());

-- Policy 3: Owners can insert users
CREATE POLICY "owners_insert_users"
ON users
FOR INSERT
WITH CHECK (is_current_user_owner());

-- Policy 4: Owners can update all users
CREATE POLICY "owners_update_users"
ON users
FOR UPDATE
USING (is_current_user_owner())
WITH CHECK (is_current_user_owner());

-- Policy 5: Owners can delete users (except themselves)
CREATE POLICY "owners_delete_users"
ON users
FOR DELETE
USING (
    is_current_user_owner() 
    AND id != auth.uid()
);

-- ============================================
-- STEP 10: Grant table permissions
-- ============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- ============================================
-- STEP 11: VERIFICATION
-- ============================================
SELECT '=== VERIFICATION ===' as info;

-- Check RLS is enabled
SELECT 'RLS Status:' as info;
SELECT tablename, rowsecurity as "RLS Enabled"
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'users';

-- List all policies
SELECT 'Policies:' as info;
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'users'
ORDER BY policyname;

-- Test the functions (these should work now)
SELECT 'Function Tests:' as info;
SELECT 
    is_current_user_owner() as "Is Owner",
    get_current_user_role() as "Current Role";

-- Verify your user record
SELECT 'Your User Record:' as info;
SELECT id, name, email, role, status 
FROM users 
WHERE id = auth.uid();

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
SELECT '✅ FIX COMPLETE! Please log out and log back in to refresh your session.' as result;

