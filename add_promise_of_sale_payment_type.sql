-- ============================================
-- ADD PROMISE OF SALE (LES PROMESSES DE VENTE) PAYMENT TYPE
-- ============================================
-- This script adds a new payment type for "Promise of Sale" sales
-- ============================================

-- Step 1: Add 'PromiseOfSale' to payment_type enum
-- Note: PostgreSQL doesn't support ALTER TYPE ADD VALUE in a transaction
-- So we need to use a different approach

DO $$
BEGIN
    -- Check if PromiseOfSale already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'PromiseOfSale' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'payment_type')
    ) THEN
        -- Add the new value to the enum
        ALTER TYPE payment_type ADD VALUE IF NOT EXISTS 'PromiseOfSale';
        RAISE NOTICE 'Added PromiseOfSale to payment_type enum';
    ELSE
        RAISE NOTICE 'PromiseOfSale already exists in payment_type enum';
    END IF;
END $$;

-- Step 2: Add columns to sales table for Promise of Sale
-- These fields will store the initial payment and completion date

DO $$
BEGIN
    -- Add initial_payment_amount column (amount received now)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales' 
        AND column_name = 'promise_initial_payment'
    ) THEN
        ALTER TABLE sales 
        ADD COLUMN promise_initial_payment DECIMAL(15, 2) DEFAULT 0;
        RAISE NOTICE 'Added promise_initial_payment column';
    ELSE
        RAISE NOTICE 'promise_initial_payment column already exists';
    END IF;

    -- Add completion_date column (date when rest of payment is due)
    -- Note: This is automatically filled from deadline_date when creating a PromiseOfSale sale
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales' 
        AND column_name = 'promise_completion_date'
    ) THEN
        ALTER TABLE sales 
        ADD COLUMN promise_completion_date DATE;
        RAISE NOTICE 'Added promise_completion_date column';
    ELSE
        RAISE NOTICE 'promise_completion_date column already exists';
    END IF;

    -- Add promise_completed column (whether the promise was completed)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales' 
        AND column_name = 'promise_completed'
    ) THEN
        ALTER TABLE sales 
        ADD COLUMN promise_completed BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added promise_completed column';
    ELSE
        RAISE NOTICE 'promise_completed column already exists';
    END IF;
END $$;

-- Step 3: Add comment to explain the new payment type
COMMENT ON COLUMN sales.promise_initial_payment IS 'Initial payment amount for Promise of Sale (les promesses de vente)';
COMMENT ON COLUMN sales.promise_completion_date IS 'Date when the remaining payment is due for Promise of Sale. This is automatically set from deadline_date when creating the sale.';
COMMENT ON COLUMN sales.promise_completed IS 'Whether the Promise of Sale has been completed (full payment received)';

-- Step 4: Verify the changes
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'sales'
AND column_name IN ('promise_initial_payment', 'promise_completion_date', 'promise_completed')
ORDER BY column_name;

-- Verify enum value
SELECT enumlabel 
FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'payment_type')
ORDER BY enumsortorder;

