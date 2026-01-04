-- ============================================
-- SIMPLE FIX: RLS Policies for Users Table
-- This is a simpler version that only checks user role
-- Use this if the complex version doesn't work
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
-- POLICY 1: Users can view their own profile
-- ============================================
CREATE POLICY "users_select_own"
ON users
FOR SELECT
USING (auth.uid() = id);

-- ============================================
-- POLICY 2: Owners can do everything (SELECT, INSERT, UPDATE, DELETE)
-- ============================================
CREATE POLICY "owners_manage_all_users"
ON users
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'Owner'
    AND status = 'Active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'Owner'
    AND status = 'Active'
  )
);

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

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

-- 3. Test query (should work for Owner role)
-- This should return your user if you're logged in as Owner
SELECT id, name, email, role, status 
FROM users 
WHERE id = auth.uid();

