-- ============================================
-- DATABASE RESET - KEEP USERS AND ROLES
-- Utility Script: Full database reset
-- ============================================
-- Purpose: Deletes all business data while preserving user accounts
-- WARNING: This will DELETE ALL DATA except users and roles!
-- Use Case: Starting fresh while keeping user accounts
-- ============================================
-- WHAT IS KEPT:
-- ✓ users - All user accounts preserved
-- ✓ roles - All roles preserved
--
-- WHAT IS DELETED:
-- ✗ clients - All clients deleted
-- ✗ land_batches - All land batches deleted
-- ✗ land_pieces - All land pieces deleted
-- ✗ sales - All sales deleted
-- ✗ payments - All payments deleted
-- ✗ installments - All installments deleted
-- ✗ reservations - All reservations deleted
-- ✗ audit_logs - All audit history deleted
-- ✗ debts - All debts deleted (if table exists)
-- ✗ debt_payments - All debt payments deleted (if table exists)
-- ============================================

-- Step 1: Delete all debt payments (if table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'debt_payments') THEN
        DELETE FROM debt_payments;
    END IF;
END $$;

-- Step 2: Delete all debts (if table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'debts') THEN
        DELETE FROM debts;
    END IF;
END $$;

-- Step 3: Delete all payments
DELETE FROM payments;

-- Step 4: Delete all installments
DELETE FROM installments;

-- Step 5: Delete all reservations
DELETE FROM reservations;

-- Step 6: Delete all sales
DELETE FROM sales;

-- Step 7: Delete all land pieces
DELETE FROM land_pieces;

-- Step 8: Delete all land batches
DELETE FROM land_batches;

-- Step 9: Delete all clients
DELETE FROM clients;

-- Step 10: Delete audit logs
DELETE FROM audit_logs;

-- =====================================================
-- RESET SEQUENCES (if any)
-- =====================================================
-- Note: UUIDs don't use sequences, but if you have any sequences, reset them here

-- =====================================================
-- VERIFICATION - Run to confirm cleanup
-- =====================================================
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL SELECT 'roles', COUNT(*) FROM roles
UNION ALL SELECT 'clients', COUNT(*) FROM clients
UNION ALL SELECT 'land_batches', COUNT(*) FROM land_batches
UNION ALL SELECT 'land_pieces', COUNT(*) FROM land_pieces
UNION ALL SELECT 'sales', COUNT(*) FROM sales
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'installments', COUNT(*) FROM installments
UNION ALL SELECT 'reservations', COUNT(*) FROM reservations
UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs;

-- =====================================================
-- WHAT IS KEPT:
-- ✓ users - All user accounts preserved
-- ✓ roles - All roles preserved
--
-- WHAT IS DELETED:
-- ✗ clients - All clients deleted
-- ✗ land_batches - All land batches deleted
-- ✗ land_pieces - All land pieces deleted
-- ✗ sales - All sales deleted
-- ✗ payments - All payments deleted
-- ✗ installments - All installments deleted
-- ✗ reservations - All reservations deleted
-- ✗ audit_logs - All audit history deleted
-- ✗ debts - All debts deleted (if table exists)
-- ✗ debt_payments - All debt payments deleted (if table exists)
-- =====================================================

