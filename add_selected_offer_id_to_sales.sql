-- ============================================
-- SQL Migration: Add selected_offer_id to sales table
-- ============================================
-- This script adds a new column `selected_offer_id` to the `sales` table
-- to track which payment offer was selected for installment sales.
--
-- IMPORTANT: Run this script in Supabase SQL Editor
-- ============================================

DO $$
BEGIN
    -- Step 1: Add the new column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'sales' 
        AND column_name = 'selected_offer_id'
    ) THEN
        ALTER TABLE public.sales 
        ADD COLUMN selected_offer_id UUID REFERENCES public.payment_offers(id) ON DELETE SET NULL;
        
        RAISE NOTICE 'Column "selected_offer_id" added to "sales" table.';
    ELSE
        RAISE NOTICE 'Column "selected_offer_id" already exists in "sales" table.';
    END IF;

    -- Step 2: Add index for better query performance
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_indexes 
        WHERE tablename = 'sales' 
        AND indexname = 'idx_sales_selected_offer_id'
    ) THEN
        CREATE INDEX idx_sales_selected_offer_id ON public.sales(selected_offer_id);
        RAISE NOTICE 'Index "idx_sales_selected_offer_id" created.';
    ELSE
        RAISE NOTICE 'Index "idx_sales_selected_offer_id" already exists.';
    END IF;

END $$;

-- Step 3: Verify the changes
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'sales' 
AND column_name = 'selected_offer_id';

-- Expected result:
-- column_name        | data_type | is_nullable | column_default
-- -------------------+-----------+-------------+---------------
-- selected_offer_id  | uuid      | YES         | NULL

