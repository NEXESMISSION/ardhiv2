-- ============================================
-- FIX SALE STATUS "CONFIRMED" ERROR
-- ============================================
-- This script fixes the database issues causing:
-- 1. "invalid input value for enum sale_status: Confirmed" error
-- 2. Land pieces showing wrong status
-- Run this script in Supabase SQL Editor.
-- ============================================

-- Step 1: Check current sale_status enum values
SELECT enumlabel, enumsortorder 
FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'sale_status')
ORDER BY enumsortorder;

-- Step 2: Drop known triggers that might be causing issues
DROP TRIGGER IF EXISTS update_sale_status_on_confirm ON sales;
DROP TRIGGER IF EXISTS set_sale_confirmed ON sales;
DROP TRIGGER IF EXISTS on_sale_confirm ON sales;
DROP TRIGGER IF EXISTS trigger_sale_status ON sales;
DROP TRIGGER IF EXISTS sale_confirmation_trigger ON sales;

-- Step 3: Check and fix the is_confirmed column if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales' AND column_name = 'is_confirmed'
    ) THEN
        UPDATE sales SET is_confirmed = false WHERE is_confirmed = true;
        RAISE NOTICE 'Reset is_confirmed to false for all sales';
    END IF;
END $$;

-- Step 4: Fix land pieces status - set to 'Reserved' for pieces with non-completed sales
UPDATE land_pieces
SET status = 'Reserved'
WHERE id IN (
    SELECT unnest(s.land_piece_ids)
    FROM sales s
    WHERE s.status = 'Pending'
)
AND status = 'Sold';

-- Step 5: Fix land pieces status - set to 'Available' for pieces with no active sales
UPDATE land_pieces lp
SET status = 'Available'
WHERE NOT EXISTS (
    SELECT 1 FROM sales s
    WHERE lp.id = ANY(s.land_piece_ids)
    AND s.status NOT IN ('Cancelled', 'Completed')
)
AND lp.status = 'Reserved';

-- Step 6: Verify pieces status
SELECT 
    lp.id as piece_id,
    lp.piece_number,
    lp.status as piece_status,
    s.id as sale_id,
    s.status as sale_status,
    s.payment_type
FROM land_pieces lp
LEFT JOIN sales s ON lp.id = ANY(s.land_piece_ids) AND s.status NOT IN ('Cancelled')
ORDER BY lp.piece_number
LIMIT 30;

-- Step 7: Show summary of sales statuses
SELECT 
    status,
    COUNT(*) as count
FROM sales
GROUP BY status
ORDER BY count DESC;

-- Step 8: Show summary of land pieces statuses
SELECT 
    status,
    COUNT(*) as count
FROM land_pieces
GROUP BY status
ORDER BY count DESC;

-- Step 9: Verify no problematic triggers remain on sales
SELECT tgname, tgrelid::regclass
FROM pg_trigger
WHERE tgrelid = 'sales'::regclass
AND NOT tgisinternal;

-- DONE! If you still see issues, run this:
-- ALTER TABLE sales DROP COLUMN IF EXISTS is_confirmed;
