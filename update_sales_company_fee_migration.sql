-- ============================================
-- UPDATE SALES TABLE - Company Fee Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- Ensure company_fee_percentage column exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales' AND column_name = 'company_fee_percentage'
    ) THEN
        ALTER TABLE sales ADD COLUMN company_fee_percentage DECIMAL(5, 2);
    END IF;
END $$;

-- Ensure company_fee_amount column exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales' AND column_name = 'company_fee_amount'
    ) THEN
        ALTER TABLE sales ADD COLUMN company_fee_amount DECIMAL(15, 2);
    END IF;
END $$;

-- Ensure deadline_date column exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales' AND column_name = 'deadline_date'
    ) THEN
        ALTER TABLE sales ADD COLUMN deadline_date DATE;
    END IF;
END $$;

-- Add index for deadline queries (if not exists)
CREATE INDEX IF NOT EXISTS idx_sales_deadline ON sales(deadline_date) WHERE deadline_date IS NOT NULL;

-- Add comments
COMMENT ON COLUMN sales.company_fee_percentage IS 'Company commission percentage (e.g., 2.00 for 2%)';
COMMENT ON COLUMN sales.company_fee_amount IS 'Calculated company fee amount based on total_selling_price';
COMMENT ON COLUMN sales.deadline_date IS 'Deadline for completing sale procedures (آخر أجل لإتمام الإجراءات)';

-- Verify the columns exist
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'sales' 
  AND column_name IN ('company_fee_percentage', 'company_fee_amount', 'deadline_date')
ORDER BY column_name;

