-- ============================================
-- DATABASE CLEANUP SCRIPT
-- ============================================
-- This script will:
-- 1. DELETE all sales, payments, installments, reservations
-- 2. DELETE all clients
-- 3. DELETE all phone calls, rendezvous, and their history
-- 4. DELETE all projects, boxes, and expenses
-- 5. DELETE all expenses and debts
-- 6. KEEP land_batches (all data)
-- 7. KEEP land_pieces but:
--    - Keep: id, land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment
--    - Reset: status = 'Available', reserved_until = NULL, reservation_client_id = NULL, notes = NULL
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: Delete all payment offers (from batches and pieces)
-- ============================================
-- Delete all payment offers associated with land batches and land pieces
DELETE FROM payment_offers;

-- ============================================
-- STEP 2: Delete all sales-related data
-- ============================================

-- Delete sale rendezvous history (no FK dependencies)
DELETE FROM sale_rendezvous_history;

-- Delete sales history (no FK dependencies)
DELETE FROM sales_history;

-- Delete sale rendezvous (references sales)
DELETE FROM sale_rendezvous;

-- Delete installments (references sales, CASCADE will handle)
DELETE FROM installments;

-- Delete payments (references sales, installments, reservations)
DELETE FROM payments;

-- Delete sales (references clients, reservations)
DELETE FROM sales;

-- Delete reservations (references clients, land_pieces)
DELETE FROM reservations;

-- ============================================
-- STEP 3: Delete all clients
-- ============================================
DELETE FROM clients;

-- ============================================
-- STEP 4: Delete phone calls
-- ============================================
DELETE FROM phone_calls;

-- ============================================
-- STEP 5: Delete real estate projects data
-- ============================================
-- Delete box expenses (references project_boxes)
DELETE FROM box_expenses;

-- Delete project boxes (references projects)
DELETE FROM project_boxes;

-- Delete projects
DELETE FROM projects;

-- ============================================
-- STEP 6: Delete expenses
-- ============================================
DELETE FROM expenses;

-- ============================================
-- STEP 7: Delete debts and debt payments
-- ============================================
-- Delete debt payments if table exists (references debts)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'debt_payments') THEN
        DELETE FROM debt_payments;
    END IF;
END $$;

-- Delete debts
DELETE FROM debts;

-- ============================================
-- STEP 8: Clean land_pieces
-- ============================================
-- Reset all land pieces to Available status
-- Clear reservation data
-- Keep: id, land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment
UPDATE land_pieces
SET 
    status = 'Available',
    reserved_until = NULL,
    reservation_client_id = NULL,
    notes = NULL,
    updated_at = NOW();

-- ============================================
-- STEP 9: Optional - Clean audit logs (uncomment if needed)
-- ============================================
-- DELETE FROM audit_logs;

COMMIT;

-- ============================================
-- VERIFICATION QUERIES (Run these after to verify)
-- ============================================

-- Check remaining data counts
SELECT 'land_batches' as table_name, COUNT(*) as count FROM land_batches
UNION ALL
SELECT 'land_pieces', COUNT(*) FROM land_pieces
UNION ALL
SELECT 'payment_offers', COUNT(*) FROM payment_offers
UNION ALL
SELECT 'clients', COUNT(*) FROM clients
UNION ALL
SELECT 'sales', COUNT(*) FROM sales
UNION ALL
SELECT 'installments', COUNT(*) FROM installments
UNION ALL
SELECT 'payments', COUNT(*) FROM payments
UNION ALL
SELECT 'reservations', COUNT(*) FROM reservations
UNION ALL
SELECT 'phone_calls', COUNT(*) FROM phone_calls
UNION ALL
SELECT 'projects', COUNT(*) FROM projects
UNION ALL
SELECT 'expenses', COUNT(*) FROM expenses
UNION ALL
SELECT 'debts', COUNT(*) FROM debts;

-- Check land_pieces status distribution
SELECT status, COUNT(*) as count 
FROM land_pieces 
GROUP BY status;

-- Check if any land_pieces still have reservations
SELECT COUNT(*) as pieces_with_reservations
FROM land_pieces
WHERE reserved_until IS NOT NULL OR reservation_client_id IS NOT NULL;

