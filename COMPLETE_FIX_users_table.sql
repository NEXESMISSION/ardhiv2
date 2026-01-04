-- ============================================
-- COMPLETE FIX: Users Table and RLS Policies
-- This script fixes ALL issues with user management
-- ============================================
-- RUN THIS ENTIRE SCRIPT IN SUPABASE SQL EDITOR
-- ============================================

-- ============================================
-- STEP 1: Check current user's auth.uid()
-- ============================================
SELECT auth.uid() as "Your Auth User ID";

-- ============================================
-- STEP 2: Check if your user exists in users table
-- First, temporarily disable RLS to see all data
-- ============================================
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Show all users
SELECT id, name, email, role, status FROM users ORDER BY created_at DESC;

-- ============================================
-- STEP 3: Find your auth user email to match
-- ============================================
SELECT 
    id,
    email,
    raw_user_meta_data->>'name' as name,
    raw_user_meta_data->>'role' as meta_role,
    created_at
FROM auth.users
ORDER BY created_at DESC;

-- ============================================
-- STEP 4: INSERT or UPDATE your user as Owner
-- Replace 'YOUR_USER_ID' and 'YOUR_EMAIL' with actual values from Step 3
-- ============================================

-- Option A: If your user DOESN'T exist in users table, INSERT it:
-- Uncomment and modify the line below:
/*
INSERT INTO users (id, name, email, role, status)
VALUES (
    'YOUR_USER_ID_FROM_AUTH_USERS',  -- Replace with your actual UUID
    'saif',                           -- Your name
    'saifelleuchi127@gmail.com',      -- Your email
    'Owner',
    'Active'
);
*/

-- Option B: If your user EXISTS but has wrong role, UPDATE it:
-- This will update ALL users with email matching yours to Owner
UPDATE users 
SET role = 'Owner', status = 'Active'
WHERE email = 'saifelleuchi127@gmail.com';

-- Also update for the other owner
UPDATE users 
SET role = 'Owner', status = 'Active'
WHERE email = 'lassad.mazed@gmail.com';

-- ============================================
-- STEP 5: Verify the update worked
-- ============================================
SELECT id, name, email, role, status FROM users WHERE role = 'Owner';

-- ============================================
-- STEP 6: Re-enable RLS
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 7: Drop ALL existing policies on users table
-- ============================================
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'users') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON users';
    END LOOP;
END $$;

-- ============================================
-- STEP 8: Create helper functions with SECURITY DEFINER
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

-- ============================================
-- STEP 9: Grant execute permissions
-- ============================================
GRANT EXECUTE ON FUNCTION is_current_user_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_user_role() TO authenticated;

-- ============================================
-- STEP 10: Create new RLS policies
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
-- STEP 11: Grant table permissions
-- ============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- ============================================
-- STEP 12: VERIFICATION - Run these to confirm fix
-- ============================================

-- Check RLS is enabled
SELECT tablename, rowsecurity as "RLS Enabled"
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'users';

-- List all policies
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'users'
ORDER BY policyname;

-- Test the functions
SELECT is_current_user_owner() as "Is Owner";
SELECT get_current_user_role() as "Current Role";

-- Verify your user
SELECT id, name, email, role, status 
FROM users 
WHERE id = auth.uid();

