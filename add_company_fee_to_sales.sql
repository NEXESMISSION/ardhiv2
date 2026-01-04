-- Add company fee fields to sales table
ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS company_fee_percentage DECIMAL(5, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS company_fee_amount DECIMAL(15, 2) DEFAULT 0;

-- Add comment
COMMENT ON COLUMN sales.company_fee_percentage IS 'Company commission percentage (e.g., 2.00 for 2%)';
COMMENT ON COLUMN sales.company_fee_amount IS 'Calculated company fee amount based on total_selling_price';

