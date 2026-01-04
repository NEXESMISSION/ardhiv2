-- Add price per m² columns to land_batches table
-- These are used as default prices for NEW pieces only
-- Existing pieces and sales are NOT affected

ALTER TABLE land_batches
ADD COLUMN IF NOT EXISTS price_per_m2_full DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS price_per_m2_installment DECIMAL(10, 2);

COMMENT ON COLUMN land_batches.price_per_m2_full IS 'Default selling price per m² for full payment (used for NEW pieces only)';
COMMENT ON COLUMN land_batches.price_per_m2_installment IS 'Default selling price per m² for installment payment (used for NEW pieces only)';

