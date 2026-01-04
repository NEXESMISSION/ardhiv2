-- ============================================
-- FINAL FIX: RLS Policies for Users Table
-- This fixes the circular dependency issue when Owners try to insert users
-- ============================================
-- Problem: get_user_role() function creates circular dependency during INSERT
-- Solution: Use SECURITY DEFINER functions that bypass RLS to check user role
-- ============================================

-- Step 1: Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop ALL existing policies on users table to avoid conflicts
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'users') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON users';
    END LOOP;
END $$;

-- Step 3: Drop and recreate helper functions with SECURITY DEFINER
-- This allows the functions to bypass RLS when checking user roles

-- Function to check if current user is Owner
DROP FUNCTION IF EXISTS is_current_user_owner();
CREATE OR REPLACE FUNCTION is_current_user_owner()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role_val user_role;
BEGIN
    -- This function runs with elevated privileges, so it can bypass RLS
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

-- Function to get current user role
DROP FUNCTION IF EXISTS get_current_user_role();
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

-- Step 4: Grant execute permissions on the functions
GRANT EXECUTE ON FUNCTION is_current_user_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_user_role() TO authenticated;

-- Step 5: Create RLS policies using the SECURITY DEFINER functions

-- Policy 1: Users can view their own profile (no function needed, direct check)
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
    AND id != auth.uid()  -- Prevent self-deletion
);

-- Step 6: Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- ============================================
-- VERIFICATION QUERIES
-- Run these to verify the setup:
-- ============================================

-- 1. Check if RLS is enabled
SELECT 
    tablename, 
    rowsecurity as "RLS Enabled"
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'users';

-- 2. List all policies on users table
SELECT 
    policyname as "Policy Name",
    cmd as "Command",
    qual as "Using Expression",
    with_check as "With Check Expression"
FROM pg_policies
WHERE tablename = 'users'
ORDER BY policyname;

-- 3. Test the helper function (should return true if you're Owner)
SELECT is_current_user_owner() as "Is Owner";

-- 4. Test current user role
SELECT get_current_user_role() as "Current Role";

-- 5. Verify your user exists and is Owner
SELECT id, name, email, role, status 
FROM users 
WHERE id = auth.uid();

