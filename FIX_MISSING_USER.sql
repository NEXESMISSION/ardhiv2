-- ============================================
-- FIX: Insert missing user into users table
-- ============================================
-- The problem: Your auth.uid() doesn't have a matching row in users table
-- Solution: Insert the user with Owner role
-- ============================================

-- Step 1: Disable RLS temporarily
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Step 2: Get your auth user info
SELECT 
    id as "Your User ID (copy this)",
    email as "Your Email",
    raw_user_meta_data->>'name' as "Your Name"
FROM auth.users 
WHERE email = 'saifelleuchi127@gmail.com';

-- Step 3: Insert your user as Owner (if doesn't exist)
INSERT INTO users (id, name, email, role, status)
SELECT 
    id,
    COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1)),
    email,
    'Owner'::user_role,
    'Active'::user_status
FROM auth.users 
WHERE email = 'saifelleuchi127@gmail.com'
ON CONFLICT (id) DO UPDATE 
SET role = 'Owner', status = 'Active';

-- Step 4: Also ensure lassad is Owner
INSERT INTO users (id, name, email, role, status)
SELECT 
    id,
    COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1)),
    email,
    'Owner'::user_role,
    'Active'::user_status
FROM auth.users 
WHERE email = 'lassad.mazed@gmail.com'
ON CONFLICT (id) DO UPDATE 
SET role = 'Owner', status = 'Active';

-- Step 5: Verify the users were inserted/updated
SELECT id, name, email, role, status FROM users WHERE role = 'Owner';

-- Step 6: Re-enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Step 7: Test the function again (should now return 'Owner')
SELECT get_current_user_role() as "Current Role (should be Owner now)";
SELECT is_current_user_owner() as "Is Owner (should be true now)";

-- Step 8: Test SELECT on your own profile
SELECT id, name, email, role, status 
FROM users 
WHERE id = auth.uid();

