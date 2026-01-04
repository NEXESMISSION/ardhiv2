-- ============================================
-- DIAGNOSTIC SCRIPT: Check Users Table RLS Status
-- Run this to see the current state of RLS policies
-- ============================================

-- 1. Check if RLS is enabled
SELECT 
    tablename, 
    rowsecurity as "RLS Enabled"
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'users';

-- 2. List ALL policies on users table (this will show what's currently active)
SELECT 
    policyname as "Policy Name",
    cmd as "Command",
    roles as "Roles",
    qual as "Using Expression",
    with_check as "With Check Expression"
FROM pg_policies
WHERE tablename = 'users'
ORDER BY policyname;

-- 3. Check if helper functions exist
SELECT 
    routine_name as "Function Name",
    routine_type as "Type",
    security_type as "Security Type"
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('is_current_user_owner', 'get_current_user_role', 'get_user_role')
ORDER BY routine_name;

-- 4. Test current user (run this while logged in as the Owner user)
SELECT 
    auth.uid() as "Current User ID",
    is_current_user_owner() as "Is Owner (via function)",
    get_current_user_role() as "Current Role (via function)";

-- 5. Check if your user exists in users table
SELECT 
    id, 
    name, 
    email, 
    role, 
    status,
    created_at
FROM users 
WHERE id = auth.uid();

-- 6. Check all users (this might fail if policies block it)
SELECT 
    id, 
    name, 
    email, 
    role, 
    status
FROM users
ORDER BY created_at DESC
LIMIT 10;

-- 7. Check function definitions
SELECT 
    pg_get_functiondef(oid) as "Function Definition"
FROM pg_proc
WHERE proname IN ('is_current_user_owner', 'get_current_user_role')
AND pronamespace = 'public'::regnamespace;

