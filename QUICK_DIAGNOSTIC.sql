-- ============================================
-- QUICK DIAGNOSTIC: Run this FIRST to see the problem
-- ============================================

-- 1. Get your auth user ID
SELECT auth.uid() as "Your Auth UID";

-- 2. Temporarily disable RLS to see all users
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- 3. Show all users in the table
SELECT 
    id, 
    name, 
    email, 
    role, 
    status,
    'Match: ' || CASE WHEN id = auth.uid() THEN 'YES ✓' ELSE 'NO ✗' END as "ID Match"
FROM users
ORDER BY created_at DESC;

-- 4. Show all auth.users
SELECT 
    id,
    email,
    created_at
FROM auth.users
ORDER BY created_at DESC;

-- 5. Check if YOUR user (by auth.uid) exists in users table
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM users WHERE id = auth.uid()) 
        THEN 'YES - User exists in users table'
        ELSE 'NO - User MISSING from users table! This is the problem.'
    END as "User Exists?";

-- 6. If user exists, what's their role?
SELECT role, status FROM users WHERE id = auth.uid();

-- 7. Re-enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

