-- ============================================
-- FIX SALES TABLE - Add missing columns if they don't exist
-- Run this in Supabase SQL Editor to ensure all columns exist
-- ============================================

-- Add company_fee_percentage if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales' AND column_name = 'company_fee_percentage'
    ) THEN
        ALTER TABLE sales ADD COLUMN company_fee_percentage DECIMAL(5, 2);
    END IF;
END $$;

-- Add company_fee_amount if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales' AND column_name = 'company_fee_amount'
    ) THEN
        ALTER TABLE sales ADD COLUMN company_fee_amount DECIMAL(15, 2);
    END IF;
END $$;

-- Add deadline_date if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales' AND column_name = 'deadline_date'
    ) THEN
        ALTER TABLE sales ADD COLUMN deadline_date DATE;
    END IF;
END $$;

-- Verify the columns exist
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'sales' 
  AND column_name IN ('company_fee_percentage', 'company_fee_amount', 'deadline_date')
ORDER BY column_name;

