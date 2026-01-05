-- ============================================
-- FULL DATABASE RESET - KEEP ONLY ONE USER
-- ============================================
-- This script will:
-- 1. Delete ALL data from ALL tables
-- 2. Keep ONLY the user with email: saifelleuchi127@gmail.com
-- 3. Set that user as Owner with Active status
-- 4. Reset all sequences
-- 5. Re-enable RLS policies
--
-- WARNING: This will DELETE ALL DATA except the specified user!
-- Run this in Supabase SQL Editor
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: Disable RLS temporarily
-- ============================================
ALTER TABLE IF EXISTS audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS installments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sales DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS reservations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS land_pieces DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS land_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS roles DISABLE ROW LEVEL SECURITY;

-- Disable RLS on additional tables if they exist
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_expenses') THEN
    ALTER TABLE project_expenses DISABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'real_estate_projects') THEN
    ALTER TABLE real_estate_projects DISABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'debt_payments') THEN
    ALTER TABLE debt_payments DISABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'debts') THEN
    ALTER TABLE debts DISABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'expenses') THEN
    ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'expense_categories') THEN
    ALTER TABLE expense_categories DISABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cancellation_requests') THEN
    ALTER TABLE cancellation_requests DISABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ============================================
-- STEP 2: Delete all data in proper order
-- (Respecting foreign key constraints)
-- ============================================

-- Delete audit logs (no dependencies)
DELETE FROM audit_logs;

-- Delete payments (references sales, installments, reservations, clients)
DELETE FROM payments;

-- Delete installments (references sales)
DELETE FROM installments;

-- Delete project expenses (references real_estate_projects)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_expenses') THEN
    DELETE FROM project_expenses;
  END IF;
END $$;

-- Delete real estate projects (references users)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'real_estate_projects') THEN
    DELETE FROM real_estate_projects;
  END IF;
END $$;

-- Delete debt payments (references debts)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'debt_payments') THEN
    DELETE FROM debt_payments;
  END IF;
END $$;

-- Delete debts (references users)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'debts') THEN
    DELETE FROM debts;
  END IF;
END $$;

-- Delete expenses (references expense_categories, users, land_batches, sales)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'expenses') THEN
    DELETE FROM expenses;
  END IF;
END $$;

-- Delete expense categories (no dependencies, but keep structure)
-- Note: We keep the table structure but clear data
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'expense_categories') THEN
    DELETE FROM expense_categories;
  END IF;
END $$;

-- Delete cancellation requests (references sales)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cancellation_requests') THEN
    DELETE FROM cancellation_requests;
  END IF;
END $$;

-- Delete sales (references clients, reservations, users, land_pieces)
DELETE FROM sales;

-- Delete reservations (references clients, users, land_pieces)
DELETE FROM reservations;

-- Delete land pieces (references land_batches, clients)
DELETE FROM land_pieces;

-- Delete land batches (references users)
DELETE FROM land_batches;

-- Delete clients (references users)
DELETE FROM clients;

-- ============================================
-- STEP 3: Delete all users EXCEPT saifelleuchi127@gmail.com
-- ============================================
DELETE FROM users WHERE email != 'saifelleuchi127@gmail.com';

-- Ensure the remaining user is set as Owner with Active status
UPDATE users 
SET 
  role = 'Owner',
  status = 'Active',
  updated_at = NOW()
WHERE email = 'saifelleuchi127@gmail.com';

-- ============================================
-- STEP 4: Re-insert default expense categories if table exists
-- ============================================
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'expense_categories') THEN
    INSERT INTO expense_categories (name, description) VALUES
    ('إيجار', 'إيجار المكتب أو المستودع'),
    ('رواتب', 'رواتب الموظفين'),
    ('كهرباء', 'فاتورة الكهرباء'),
    ('ماء', 'فاتورة الماء'),
    ('هاتف', 'فاتورة الهاتف والإنترنت'),
    ('نقل', 'مصاريف النقل والوقود'),
    ('صيانة', 'صيانة المعدات والمباني'),
    ('تسويق', 'مصاريف التسويق والإعلان'),
    ('مستلزمات مكتبية', 'مستلزمات المكتب'),
    ('ضرائب', 'الضرائب والرسوم'),
    ('أخرى', 'مصاريف أخرى')
    ON CONFLICT (name) DO NOTHING;
  END IF;
END $$;

-- ============================================
-- STEP 5: Re-enable RLS on all tables
-- ============================================
ALTER TABLE IF EXISTS audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS land_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS land_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS roles ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_expenses') THEN
    ALTER TABLE project_expenses ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'real_estate_projects') THEN
    ALTER TABLE real_estate_projects ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'debt_payments') THEN
    ALTER TABLE debt_payments ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'debts') THEN
    ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'expenses') THEN
    ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'expense_categories') THEN
    ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cancellation_requests') THEN
    ALTER TABLE cancellation_requests ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ============================================
-- STEP 6: Verification
-- ============================================
DO $$
DECLARE
  user_count INTEGER;
  user_email TEXT;
  user_role TEXT;
  user_status TEXT;
BEGIN
  -- Check user count
  SELECT COUNT(*) INTO user_count FROM users;
  
  IF user_count = 0 THEN
    RAISE EXCEPTION 'ERROR: No users found! The user saifelleuchi127@gmail.com does not exist in the database.';
  ELSIF user_count > 1 THEN
    RAISE EXCEPTION 'ERROR: Multiple users found! Expected only 1 user.';
  END IF;
  
  -- Get user details
  SELECT email, role::TEXT, status::TEXT 
  INTO user_email, user_role, user_status
  FROM users;
  
  -- Verify user details
  IF user_email != 'saifelleuchi127@gmail.com' THEN
    RAISE EXCEPTION 'ERROR: Wrong user kept! Expected saifelleuchi127@gmail.com but found %', user_email;
  END IF;
  
  IF user_role != 'Owner' THEN
    RAISE WARNING 'WARNING: User role is % instead of Owner. Updating...', user_role;
    UPDATE users SET role = 'Owner' WHERE email = 'saifelleuchi127@gmail.com';
  END IF;
  
  IF user_status != 'Active' THEN
    RAISE WARNING 'WARNING: User status is % instead of Active. Updating...', user_status;
    UPDATE users SET status = 'Active' WHERE email = 'saifelleuchi127@gmail.com';
  END IF;
  
  RAISE NOTICE 'SUCCESS: Database reset complete!';
  RAISE NOTICE 'User kept: %', user_email;
  RAISE NOTICE 'Role: Owner, Status: Active';
END $$;

-- ============================================
-- STEP 7: Display summary
-- ============================================
SELECT '=== DATABASE RESET SUMMARY ===' as info;

SELECT 'Users:' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'Clients:', COUNT(*) FROM clients
UNION ALL
SELECT 'Land Batches:', COUNT(*) FROM land_batches
UNION ALL
SELECT 'Land Pieces:', COUNT(*) FROM land_pieces
UNION ALL
SELECT 'Reservations:', COUNT(*) FROM reservations
UNION ALL
SELECT 'Sales:', COUNT(*) FROM sales
UNION ALL
SELECT 'Installments:', COUNT(*) FROM installments
UNION ALL
SELECT 'Payments:', COUNT(*) FROM payments
UNION ALL
SELECT 'Audit Logs:', COUNT(*) FROM audit_logs;

SELECT '=== USER DETAILS ===' as info;
SELECT id, email, name, role, status, created_at 
FROM users;

COMMIT;

-- ============================================
-- DONE!
-- ============================================
-- Your database has been reset with:
-- ✅ All data deleted
-- ✅ Only saifelleuchi127@gmail.com kept as Owner
-- ✅ User set to Active status
-- ✅ Default expense categories re-inserted (if table exists)
-- ✅ RLS policies re-enabled
-- ============================================

