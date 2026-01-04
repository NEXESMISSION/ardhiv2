-- Add confirmed_by column to sales table to track who confirmed each sale
ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES users(id);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_sales_confirmed_by ON sales(confirmed_by);

-- Add comment
COMMENT ON COLUMN sales.confirmed_by IS 'User who confirmed this sale (Owner only)';

