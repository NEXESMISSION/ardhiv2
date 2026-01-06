-- ============================================
-- SQL Migration: Add Payment Offers Table
-- ============================================
-- This script creates a new table for payment offers
-- that can be associated with land batches and land pieces.
-- Each offer contains company fee, received amount, and installment settings.
--
-- IMPORTANT: Run this script in Supabase SQL Editor
-- ============================================

-- Step 1: Create payment_offers table
CREATE TABLE IF NOT EXISTS payment_offers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Reference to either land_batch_id or land_piece_id (one must be set)
    land_batch_id UUID REFERENCES land_batches(id) ON DELETE CASCADE,
    land_piece_id UUID REFERENCES land_pieces(id) ON DELETE CASCADE,
    
    -- Offer details
    price_per_m2_installment DECIMAL(15, 2), -- Price per square meter for installment
    company_fee_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0,
    advance_amount DECIMAL(15, 2) NOT NULL DEFAULT 0, -- Changed from received_amount to advance_amount (التسبقة)
    advance_is_percentage BOOLEAN DEFAULT FALSE, -- Whether advance is a percentage or fixed amount
    monthly_payment DECIMAL(15, 2) NOT NULL DEFAULT 0, -- Changed from number_of_months to monthly_payment (المبلغ الشهري)
    -- number_of_months will be calculated based on: (total_price - advance) / monthly_payment
    
    -- Optional: Offer name/description
    offer_name VARCHAR(255),
    notes TEXT,
    
    -- Metadata
    is_default BOOLEAN DEFAULT FALSE, -- Mark one offer as default per batch/piece
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure either land_batch_id or land_piece_id is set, but not both
    CONSTRAINT check_reference CHECK (
        (land_batch_id IS NOT NULL AND land_piece_id IS NULL) OR
        (land_batch_id IS NULL AND land_piece_id IS NOT NULL)
    )
);

-- Step 2: Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_payment_offers_batch ON payment_offers(land_batch_id);
CREATE INDEX IF NOT EXISTS idx_payment_offers_piece ON payment_offers(land_piece_id);
CREATE INDEX IF NOT EXISTS idx_payment_offers_default ON payment_offers(is_default) WHERE is_default = TRUE;

-- Step 3: Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_payment_offers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_update_payment_offers_updated_at ON payment_offers;
CREATE TRIGGER trigger_update_payment_offers_updated_at
    BEFORE UPDATE ON payment_offers
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_offers_updated_at();

-- Step 5: Enable Row Level Security (RLS)
ALTER TABLE payment_offers ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policies
-- Policy: Users can view all payment offers
DROP POLICY IF EXISTS "Users can view payment offers" ON payment_offers;
CREATE POLICY "Users can view payment offers"
    ON payment_offers FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Owners can manage all payment offers
DROP POLICY IF EXISTS "Owners can manage payment offers" ON payment_offers;
CREATE POLICY "Owners can manage payment offers"
    ON payment_offers FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'Owner'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'Owner'
        )
    );

-- Policy: Workers can manage payment offers for batches/pieces they have access to
-- (This assumes workers can view/edit land batches and pieces)
DROP POLICY IF EXISTS "Workers can manage payment offers" ON payment_offers;
CREATE POLICY "Workers can manage payment offers"
    ON payment_offers FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'Worker'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'Worker'
        )
    );

-- Step 7: Create function to ensure only one default offer per batch/piece
CREATE OR REPLACE FUNCTION ensure_single_default_offer()
RETURNS TRIGGER AS $$
BEGIN
    -- If this offer is being set as default, unset other defaults for the same batch/piece
    IF NEW.is_default = TRUE THEN
        IF NEW.land_batch_id IS NOT NULL THEN
            UPDATE payment_offers
            SET is_default = FALSE
            WHERE land_batch_id = NEW.land_batch_id
            AND id != NEW.id;
        ELSIF NEW.land_piece_id IS NOT NULL THEN
            UPDATE payment_offers
            SET is_default = FALSE
            WHERE land_piece_id = NEW.land_piece_id
            AND id != NEW.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Create trigger to enforce single default offer
DROP TRIGGER IF EXISTS trigger_ensure_single_default_offer ON payment_offers;
CREATE TRIGGER trigger_ensure_single_default_offer
    BEFORE INSERT OR UPDATE ON payment_offers
    FOR EACH ROW
    WHEN (NEW.is_default = TRUE)
    EXECUTE FUNCTION ensure_single_default_offer();

-- Step 9: Optional - Migrate existing data from land_batches and land_pieces
-- If you have existing data with company_fee_percentage, received_amount, number_of_months
-- in land_batches or land_pieces tables, you can migrate them here
-- (Uncomment and adjust if needed)

/*
-- Migrate from land_batches
INSERT INTO payment_offers (land_batch_id, company_fee_percentage, received_amount, number_of_months, is_default, created_at)
SELECT 
    id,
    COALESCE(company_fee_percentage, 0),
    COALESCE(received_amount, 0),
    COALESCE(number_of_months, 12),
    TRUE,
    created_at
FROM land_batches
WHERE company_fee_percentage IS NOT NULL 
   OR received_amount IS NOT NULL 
   OR number_of_months IS NOT NULL;

-- Migrate from land_pieces
INSERT INTO payment_offers (land_piece_id, company_fee_percentage, received_amount, number_of_months, is_default, created_at)
SELECT 
    id,
    COALESCE(company_fee_percentage, 0),
    COALESCE(received_amount, 0),
    COALESCE(number_of_months, 12),
    TRUE,
    created_at
FROM land_pieces
WHERE company_fee_percentage IS NOT NULL 
   OR received_amount IS NOT NULL 
   OR number_of_months IS NOT NULL;
*/

-- Step 10: Verify the table was created
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'payment_offers'
ORDER BY ordinal_position;

-- Expected result: payment_offers table with all columns listed above.

