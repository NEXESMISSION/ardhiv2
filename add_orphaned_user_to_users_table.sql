-- ============================================
-- Helper Script: Add orphaned user to users table
-- Use this if a user exists in auth.users but not in public.users
-- ============================================
-- Instructions:
-- 1. Find the user's UUID from Supabase Auth dashboard
-- 2. Replace the values below with the actual user data
-- 3. Run this script in SQL Editor
-- ============================================

-- Example: Add user with UUID from auth.users
-- Replace these values with actual data:
INSERT INTO users (id, name, email, role, status)
VALUES (
    'e49e7878-6cd0-436e-ac1d-39ce2b8ff6b0',  -- User UUID from auth.users
    'tanyoursd',                              -- User name
    'saifelleuchi126@gmail.com',              -- User email
    'FieldStaff',                             -- Role (Owner, Manager, or FieldStaff)
    'Active'                                  -- Status (Active or Inactive)
)
ON CONFLICT (id) DO UPDATE
SET 
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    updated_at = NOW();

-- Verify the user was added
SELECT id, name, email, role, status, created_at
FROM users
WHERE id = 'e49e7878-6cd0-436e-ac1d-39ce2b8ff6b0';

