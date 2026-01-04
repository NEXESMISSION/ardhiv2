-- Add deadline field to sales table
ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS deadline_date DATE;

-- Add index for deadline queries
CREATE INDEX IF NOT EXISTS idx_sales_deadline ON sales(deadline_date) WHERE deadline_date IS NOT NULL;

-- Add comment
COMMENT ON COLUMN sales.deadline_date IS 'Deadline for completing sale procedures (آخر أجل لإتمام الإجراءات)';

