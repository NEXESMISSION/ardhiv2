-- ============================================
-- STEP-BY-STEP FIX: Run each section separately
-- ============================================
-- Run each section one at a time and check the results
-- ============================================

-- ============================================
-- SECTION 1: DIAGNOSTIC - Run this first to see current state
-- ============================================
SELECT 'Current auth.uid():' as info, auth.uid() as your_id;

SELECT 'Auth users:' as info;
SELECT id, email FROM auth.users ORDER BY created_at DESC;

-- Disable RLS temporarily
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

SELECT 'Current users in table:' as info;
SELECT id, name, email, role, status FROM users ORDER BY created_at DESC;

-- Check if your user exists
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM users WHERE id = auth.uid()) 
        THEN 'Your user EXISTS in users table'
        ELSE 'Your user is MISSING from users table - this is the problem!'
    END as status;

-- ============================================
-- SECTION 2: FIX MISSING USER - Run if your user is missing
-- ============================================
-- First, insert missing users from auth.users
INSERT INTO users (id, name, email, role, status)
SELECT 
    au.id,
    COALESCE(au.raw_user_meta_data->>'name', split_part(au.email, '@', 1), 'User'),
    au.email,
    'FieldStaff'::user_role,  -- Default role
    'Active'::user_status
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = au.id);

-- Set your email as Owner
UPDATE users SET role = 'Owner', status = 'Active' WHERE email = 'saifelleuchi127@gmail.com';
UPDATE users SET role = 'Owner', status = 'Active' WHERE email = 'lassad.mazed@gmail.com';

-- Verify
SELECT 'After fix - users:' as info;
SELECT id, name, email, role, status FROM users ORDER BY role, name;

-- ============================================
-- SECTION 3: RE-ENABLE RLS
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ============================================
-- SECTION 4: DROP OLD POLICIES
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
-- SECTION 5: CREATE FUNCTIONS
-- ============================================
CREATE OR REPLACE FUNCTION is_current_user_owner()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users 
        WHERE id = auth.uid() 
        AND role = 'Owner'
        AND status = 'Active'
    );
END;
$$;

CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS user_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r user_role;
BEGIN
    SELECT role INTO r FROM users WHERE id = auth.uid() AND status = 'Active';
    RETURN COALESCE(r, 'FieldStaff'::user_role);
END;
$$;

GRANT EXECUTE ON FUNCTION is_current_user_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_user_role() TO authenticated;

-- ============================================
-- SECTION 6: CREATE POLICIES
-- ============================================
CREATE POLICY "users_select_own" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "owners_select_all" ON users FOR SELECT USING (is_current_user_owner());
CREATE POLICY "owners_insert" ON users FOR INSERT WITH CHECK (is_current_user_owner());
CREATE POLICY "owners_update" ON users FOR UPDATE USING (is_current_user_owner()) WITH CHECK (is_current_user_owner());
CREATE POLICY "owners_delete" ON users FOR DELETE USING (is_current_user_owner() AND id != auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON users TO authenticated;

-- ============================================
-- SECTION 7: VERIFY
-- ============================================
SELECT 'Testing functions:' as info;
SELECT is_current_user_owner() as "Is Owner", get_current_user_role() as "Role";

SELECT 'Your user record:' as info;
SELECT id, name, email, role, status FROM users WHERE id = auth.uid();

SELECT 'All policies:' as info;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'users';

SELECT '✅ DONE! Log out and log back in.' as result;

