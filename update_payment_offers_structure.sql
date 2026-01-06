-- ============================================
-- SQL Migration: Update Payment Offers Structure
-- ============================================
-- This script updates the payment_offers table structure:
-- 1. Adds price_per_m2_installment field
-- 2. Renames received_amount to advance_amount
-- 3. Adds advance_is_percentage field
-- 4. Renames number_of_months to monthly_payment
--
-- IMPORTANT: Run this script in Supabase SQL Editor
-- ============================================

-- Step 1: Add new columns
DO $$
BEGIN
    -- Add price_per_m2_installment if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'payment_offers' AND column_name = 'price_per_m2_installment') THEN
        ALTER TABLE payment_offers ADD COLUMN price_per_m2_installment DECIMAL(15, 2);
        RAISE NOTICE 'Column "price_per_m2_installment" added to "payment_offers" table.';
    ELSE
        RAISE NOTICE 'Column "price_per_m2_installment" already exists. Skipping.';
    END IF;

    -- Add advance_is_percentage if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'payment_offers' AND column_name = 'advance_is_percentage') THEN
        ALTER TABLE payment_offers ADD COLUMN advance_is_percentage BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Column "advance_is_percentage" added to "payment_offers" table.';
    ELSE
        RAISE NOTICE 'Column "advance_is_percentage" already exists. Skipping.';
    END IF;

    -- Add monthly_payment if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'payment_offers' AND column_name = 'monthly_payment') THEN
        ALTER TABLE payment_offers ADD COLUMN monthly_payment DECIMAL(15, 2);
        RAISE NOTICE 'Column "monthly_payment" added to "payment_offers" table.';
    ELSE
        RAISE NOTICE 'Column "monthly_payment" already exists. Skipping.';
    END IF;
END $$;

-- Step 2: Migrate data from old columns to new columns
DO $$
BEGIN
    -- Rename received_amount to advance_amount if it exists and advance_amount doesn't
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'payment_offers' AND column_name = 'received_amount')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'payment_offers' AND column_name = 'advance_amount') THEN
        ALTER TABLE payment_offers RENAME COLUMN received_amount TO advance_amount;
        RAISE NOTICE 'Column "received_amount" renamed to "advance_amount".';
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'payment_offers' AND column_name = 'advance_amount') THEN
        RAISE NOTICE 'Column "advance_amount" already exists. Skipping rename.';
    END IF;

    -- Migrate number_of_months to monthly_payment (if monthly_payment is NULL and number_of_months exists)
    -- Note: This is a one-way migration. We'll calculate monthly_payment from existing data if possible
    -- For now, we'll keep number_of_months for backward compatibility and calculate monthly_payment later
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'payment_offers' AND column_name = 'number_of_months') THEN
        -- Update monthly_payment where it's NULL (we'll need to calculate this based on total price)
        -- For now, we'll leave it as is and handle calculation in the application
        RAISE NOTICE 'Column "number_of_months" exists. Monthly payment will be calculated in application.';
    END IF;
END $$;

-- Step 3: Update constraints (if needed)
-- Note: We're keeping number_of_months for now for backward compatibility
-- You can drop it later after verifying the new structure works

-- Step 4: Verify the changes
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'payment_offers'
ORDER BY ordinal_position;

-- Expected columns:
-- id, land_batch_id, land_piece_id, price_per_m2_installment, company_fee_percentage,
-- advance_amount, advance_is_percentage, monthly_payment, number_of_months (temporary),
-- offer_name, notes, is_default, created_by, created_at, updated_at

