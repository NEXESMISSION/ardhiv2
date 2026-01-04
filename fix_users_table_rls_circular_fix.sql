-- ============================================
-- FIX: RLS Policies for Users Table (Circular Dependency Fix)
-- This version uses a SECURITY DEFINER function to avoid circular dependencies
-- ============================================

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies on users table
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'users') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON users';
    END LOOP;
END $$;

-- ============================================
-- HELPER FUNCTION: Check if current user is Owner
-- Uses SECURITY DEFINER to bypass RLS when checking
-- ============================================
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
    
    RETURN user_role_val = 'Owner';
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RETURN FALSE;
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$;

-- ============================================
-- HELPER FUNCTION: Get current user role
-- ============================================
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
-- POLICY 1: Users can view their own profile
-- This must come first and doesn't query the users table
-- ============================================
CREATE POLICY "users_select_own"
ON users
FOR SELECT
USING (auth.uid() = id);

-- ============================================
-- POLICY 2: Owners can view all users
-- Uses the helper function to avoid circular dependency
-- ============================================
CREATE POLICY "owners_select_all_users"
ON users
FOR SELECT
USING (is_current_user_owner());

-- ============================================
-- POLICY 3: Owners can insert users
-- ============================================
CREATE POLICY "owners_insert_users"
ON users
FOR INSERT
WITH CHECK (is_current_user_owner());

-- ============================================
-- POLICY 4: Owners can update all users
-- ============================================
CREATE POLICY "owners_update_users"
ON users
FOR UPDATE
USING (is_current_user_owner())
WITH CHECK (is_current_user_owner());

-- ============================================
-- POLICY 5: Owners can delete users (except themselves)
-- ============================================
CREATE POLICY "owners_delete_users"
ON users
FOR DELETE
USING (
    is_current_user_owner() 
    AND id != auth.uid()  -- Prevent self-deletion
);

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION is_current_user_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_user_role() TO authenticated;

-- ============================================
-- VERIFY SETUP
-- ============================================
-- Run these queries to verify:

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

-- 4. Test query (should work for Owner role)
SELECT id, name, email, role, status 
FROM users 
WHERE id = auth.uid();

