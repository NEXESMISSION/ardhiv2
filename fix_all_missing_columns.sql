-- ============================================
-- Comprehensive Migration: Add All Missing Columns and Tables
-- Run this file to fix all missing database schema elements
-- This script is idempotent - safe to run multiple times
-- ============================================

-- 1. Add location to land_batches
ALTER TABLE land_batches
ADD COLUMN IF NOT EXISTS location VARCHAR(255);

COMMENT ON COLUMN land_batches.location IS 'Location of the land batch';

-- 2. Add price_per_m2 columns to land_batches
ALTER TABLE land_batches
ADD COLUMN IF NOT EXISTS price_per_m2_full DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS price_per_m2_installment DECIMAL(10, 2);

COMMENT ON COLUMN land_batches.price_per_m2_full IS 'Default selling price per m² for full payment (used for NEW pieces only)';
COMMENT ON COLUMN land_batches.price_per_m2_installment IS 'Default selling price per m² for installment payment (used for NEW pieces only)';

-- 3. Add real_estate_tax_number to land_batches
ALTER TABLE land_batches
ADD COLUMN IF NOT EXISTS real_estate_tax_number VARCHAR(100);

COMMENT ON COLUMN land_batches.real_estate_tax_number IS 'Real estate tax number';

-- 4. Add company_fee columns to sales
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS company_fee_percentage DECIMAL(5, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS company_fee_amount DECIMAL(15, 2) DEFAULT 0;

COMMENT ON COLUMN sales.company_fee_percentage IS 'Company commission percentage (e.g., 2.00 for 2%)';
COMMENT ON COLUMN sales.company_fee_amount IS 'Calculated company fee amount based on total_selling_price';

-- 5. Add deadline_date to sales
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS deadline_date DATE;

CREATE INDEX IF NOT EXISTS idx_sales_deadline ON sales(deadline_date) WHERE deadline_date IS NOT NULL;

COMMENT ON COLUMN sales.deadline_date IS 'Deadline for completing sale procedures (آخر أجل لإتمام الإجراءات)';

-- 6. Add confirmation columns to sales
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS big_advance_confirmed BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN sales.is_confirmed IS 'Indicates if the sale has been confirmed (big advance paid or full payment)';
COMMENT ON COLUMN sales.big_advance_confirmed IS 'Indicates if the big advance payment has been confirmed';

-- 7. Create ENUMs for expenses FIRST (before creating the table)
DO $$ BEGIN
    CREATE TYPE expense_status AS ENUM ('Pending', 'Approved', 'Rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_method AS ENUM ('Cash', 'BankTransfer', 'Check', 'CreditCard', 'Other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE expense_category AS ENUM (
        'Salaries', 'Rent', 'Utilities', 'OfficeSupplies', 'Marketing',
        'Travel', 'Maintenance', 'LegalFees', 'Consulting', 'Software',
        'Taxes', 'Insurance', 'Vehicle', 'Miscellaneous', 'LandAcquisition',
        'Development', 'Commissions'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Now create expenses table if it doesn't exist, or add missing columns
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'expenses') THEN
        CREATE TABLE expenses (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            category expense_category NOT NULL,
            amount DECIMAL(15, 2) NOT NULL,
            expense_date DATE NOT NULL,
            description TEXT,
            payment_method payment_method NOT NULL,
            receipt_url TEXT,
            land_batch_id UUID REFERENCES land_batches(id) ON DELETE SET NULL,
            sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
            tags TEXT[],
            status expense_status NOT NULL DEFAULT 'Pending',
            admin_notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    ELSE
        -- Table exists, check and add missing columns (add as nullable first, then update)
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'category') THEN
            ALTER TABLE expenses ADD COLUMN category expense_category;
            UPDATE expenses SET category = 'Miscellaneous' WHERE category IS NULL;
            ALTER TABLE expenses ALTER COLUMN category SET NOT NULL;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'amount') THEN
            ALTER TABLE expenses ADD COLUMN amount DECIMAL(15, 2);
            UPDATE expenses SET amount = 0 WHERE amount IS NULL;
            ALTER TABLE expenses ALTER COLUMN amount SET NOT NULL;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'expense_date') THEN
            ALTER TABLE expenses ADD COLUMN expense_date DATE;
            UPDATE expenses SET expense_date = CURRENT_DATE WHERE expense_date IS NULL;
            ALTER TABLE expenses ALTER COLUMN expense_date SET NOT NULL;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'payment_method') THEN
            ALTER TABLE expenses ADD COLUMN payment_method payment_method;
            UPDATE expenses SET payment_method = 'Cash' WHERE payment_method IS NULL;
            ALTER TABLE expenses ALTER COLUMN payment_method SET NOT NULL;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'status') THEN
            ALTER TABLE expenses ADD COLUMN status expense_status;
            UPDATE expenses SET status = 'Pending' WHERE status IS NULL;
            ALTER TABLE expenses ALTER COLUMN status SET NOT NULL;
            ALTER TABLE expenses ALTER COLUMN status SET DEFAULT 'Pending';
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'land_batch_id') THEN
            ALTER TABLE expenses ADD COLUMN land_batch_id UUID REFERENCES land_batches(id) ON DELETE SET NULL;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'sale_id') THEN
            ALTER TABLE expenses ADD COLUMN sale_id UUID REFERENCES sales(id) ON DELETE SET NULL;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'tags') THEN
            ALTER TABLE expenses ADD COLUMN tags TEXT[];
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'receipt_url') THEN
            ALTER TABLE expenses ADD COLUMN receipt_url TEXT;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'description') THEN
            ALTER TABLE expenses ADD COLUMN description TEXT;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'admin_notes') THEN
            ALTER TABLE expenses ADD COLUMN admin_notes TEXT;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'created_at') THEN
            ALTER TABLE expenses ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'updated_at') THEN
            ALTER TABLE expenses ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        END IF;
    END IF;
    
    -- Add user_id column if it doesn't exist
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'user_id') THEN
        ALTER TABLE expenses ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    
    -- Add approved_by column if it doesn't exist
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'approved_by') THEN
        ALTER TABLE expenses ADD COLUMN approved_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    
    -- Add approved_at column if it doesn't exist
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'approved_at') THEN
        ALTER TABLE expenses ADD COLUMN approved_at TIMESTAMPTZ;
    END IF;
END $$;

-- Add indexes for expenses (only if columns exist)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'user_id') THEN
        CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'category') THEN
        CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'expense_date') THEN
        CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date);
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'status') THEN
        CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'land_batch_id') THEN
        CREATE INDEX IF NOT EXISTS idx_expenses_land_batch_id ON expenses(land_batch_id);
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'sale_id') THEN
        CREATE INDEX IF NOT EXISTS idx_expenses_sale_id ON expenses(sale_id);
    END IF;
END $$;

-- 8. Create user_permissions table if it doesn't exist, or add missing columns
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_permissions') THEN
        CREATE TABLE user_permissions (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            permission_key VARCHAR(255) NOT NULL,
            has_permission BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(user_id, permission_key)
        );
    ELSE
        -- Table exists, check and add missing columns
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'user_permissions' AND column_name = 'user_id') THEN
            ALTER TABLE user_permissions ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
            -- Only set NOT NULL if table is empty or we can set a default
            IF (SELECT COUNT(*) FROM user_permissions) = 0 THEN
                ALTER TABLE user_permissions ALTER COLUMN user_id SET NOT NULL;
            ELSE
                -- Table has data, set default for existing rows
                UPDATE user_permissions SET user_id = (SELECT id FROM users LIMIT 1) WHERE user_id IS NULL;
                ALTER TABLE user_permissions ALTER COLUMN user_id SET NOT NULL;
            END IF;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'user_permissions' AND column_name = 'permission_key') THEN
            ALTER TABLE user_permissions ADD COLUMN permission_key VARCHAR(255);
            -- Only set NOT NULL if table is empty or we can set a default
            IF (SELECT COUNT(*) FROM user_permissions) = 0 THEN
                ALTER TABLE user_permissions ALTER COLUMN permission_key SET NOT NULL;
            ELSE
                -- Table has data, set default for existing rows
                UPDATE user_permissions SET permission_key = 'unknown' WHERE permission_key IS NULL;
                ALTER TABLE user_permissions ALTER COLUMN permission_key SET NOT NULL;
            END IF;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'user_permissions' AND column_name = 'has_permission') THEN
            ALTER TABLE user_permissions ADD COLUMN has_permission BOOLEAN NOT NULL DEFAULT TRUE;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'user_permissions' AND column_name = 'created_at') THEN
            ALTER TABLE user_permissions ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'user_permissions' AND column_name = 'updated_at') THEN
            ALTER TABLE user_permissions ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        END IF;
        
        -- Add UNIQUE constraint if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'user_permissions_user_id_permission_key_key'
        ) THEN
            -- Only add constraint if both columns exist and table is not too large
            IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'user_permissions' AND column_name = 'user_id')
               AND EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'user_permissions' AND column_name = 'permission_key') THEN
                ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_user_id_permission_key_key UNIQUE(user_id, permission_key);
            END IF;
        END IF;
    END IF;
END $$;

-- Create indexes for user_permissions (only if columns exist)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'user_permissions' AND column_name = 'user_id') THEN
        CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'user_permissions' AND column_name = 'permission_key') THEN
        CREATE INDEX IF NOT EXISTS idx_user_permissions_permission_key ON user_permissions(permission_key);
    END IF;
END $$;

-- 9. Create permission_templates table if it doesn't exist, or add missing columns
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'permission_templates') THEN
        CREATE TABLE permission_templates (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(255) UNIQUE NOT NULL,
            description TEXT,
            permissions JSONB NOT NULL DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    ELSE
        -- Table exists, check and add missing columns
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'permission_templates' AND column_name = 'name') THEN
            ALTER TABLE permission_templates ADD COLUMN name VARCHAR(255);
            -- Only set NOT NULL if table is empty or we can set a default
            IF (SELECT COUNT(*) FROM permission_templates) = 0 THEN
                ALTER TABLE permission_templates ALTER COLUMN name SET NOT NULL;
            ELSE
                -- Table has data, set default for existing rows
                UPDATE permission_templates SET name = 'template_' || id::text WHERE name IS NULL;
                ALTER TABLE permission_templates ALTER COLUMN name SET NOT NULL;
            END IF;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'permission_templates' AND column_name = 'description') THEN
            ALTER TABLE permission_templates ADD COLUMN description TEXT;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'permission_templates' AND column_name = 'permissions') THEN
            ALTER TABLE permission_templates ADD COLUMN permissions JSONB DEFAULT '{}';
            UPDATE permission_templates SET permissions = '{}' WHERE permissions IS NULL;
            ALTER TABLE permission_templates ALTER COLUMN permissions SET NOT NULL;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'permission_templates' AND column_name = 'created_at') THEN
            ALTER TABLE permission_templates ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'permission_templates' AND column_name = 'updated_at') THEN
            ALTER TABLE permission_templates ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        END IF;
        
        -- Add UNIQUE constraint on name if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'permission_templates_name_key'
        ) THEN
            IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'permission_templates' AND column_name = 'name') THEN
                ALTER TABLE permission_templates ADD CONSTRAINT permission_templates_name_key UNIQUE(name);
            END IF;
        END IF;
    END IF;
END $$;

-- Create index for permission_templates (only if column exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'permission_templates' AND column_name = 'name') THEN
        CREATE INDEX IF NOT EXISTS idx_permission_templates_name ON permission_templates(name);
    END IF;
END $$;

-- 10. Create cancellation_status ENUM first
DO $$ BEGIN
    CREATE TYPE cancellation_status AS ENUM ('Pending', 'Approved', 'Rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create cancellation_requests table if it doesn't exist, or add missing columns
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'cancellation_requests') THEN
        CREATE TABLE cancellation_requests (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
            requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            requested_at TIMESTAMPTZ DEFAULT NOW(),
            reason TEXT,
            proposed_refund_amount DECIMAL(15, 2),
            status cancellation_status NOT NULL DEFAULT 'Pending',
            approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
            approved_at TIMESTAMPTZ,
            admin_notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    ELSE
        -- Table exists, check and add missing columns
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'cancellation_requests' AND column_name = 'sale_id') THEN
            ALTER TABLE cancellation_requests ADD COLUMN sale_id UUID REFERENCES sales(id) ON DELETE CASCADE;
            IF (SELECT COUNT(*) FROM cancellation_requests) = 0 THEN
                ALTER TABLE cancellation_requests ALTER COLUMN sale_id SET NOT NULL;
            ELSE
                UPDATE cancellation_requests SET sale_id = (SELECT id FROM sales LIMIT 1) WHERE sale_id IS NULL;
                ALTER TABLE cancellation_requests ALTER COLUMN sale_id SET NOT NULL;
            END IF;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'cancellation_requests' AND column_name = 'requested_by') THEN
            ALTER TABLE cancellation_requests ADD COLUMN requested_by UUID REFERENCES users(id) ON DELETE RESTRICT;
            IF (SELECT COUNT(*) FROM cancellation_requests) = 0 THEN
                ALTER TABLE cancellation_requests ALTER COLUMN requested_by SET NOT NULL;
            ELSE
                UPDATE cancellation_requests SET requested_by = (SELECT id FROM users LIMIT 1) WHERE requested_by IS NULL;
                ALTER TABLE cancellation_requests ALTER COLUMN requested_by SET NOT NULL;
            END IF;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'cancellation_requests' AND column_name = 'requested_at') THEN
            ALTER TABLE cancellation_requests ADD COLUMN requested_at TIMESTAMPTZ DEFAULT NOW();
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'cancellation_requests' AND column_name = 'reason') THEN
            ALTER TABLE cancellation_requests ADD COLUMN reason TEXT;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'cancellation_requests' AND column_name = 'proposed_refund_amount') THEN
            ALTER TABLE cancellation_requests ADD COLUMN proposed_refund_amount DECIMAL(15, 2);
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'cancellation_requests' AND column_name = 'status') THEN
            ALTER TABLE cancellation_requests ADD COLUMN status cancellation_status;
            UPDATE cancellation_requests SET status = 'Pending' WHERE status IS NULL;
            ALTER TABLE cancellation_requests ALTER COLUMN status SET NOT NULL;
            ALTER TABLE cancellation_requests ALTER COLUMN status SET DEFAULT 'Pending';
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'cancellation_requests' AND column_name = 'approved_by') THEN
            ALTER TABLE cancellation_requests ADD COLUMN approved_by UUID REFERENCES users(id) ON DELETE RESTRICT;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'cancellation_requests' AND column_name = 'approved_at') THEN
            ALTER TABLE cancellation_requests ADD COLUMN approved_at TIMESTAMPTZ;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'cancellation_requests' AND column_name = 'admin_notes') THEN
            ALTER TABLE cancellation_requests ADD COLUMN admin_notes TEXT;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'cancellation_requests' AND column_name = 'created_at') THEN
            ALTER TABLE cancellation_requests ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'cancellation_requests' AND column_name = 'updated_at') THEN
            ALTER TABLE cancellation_requests ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        END IF;
    END IF;
END $$;

-- Create indexes for cancellation_requests (only if columns exist)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'cancellation_requests' AND column_name = 'sale_id') THEN
        CREATE INDEX IF NOT EXISTS idx_cancellation_requests_sale_id ON cancellation_requests(sale_id);
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'cancellation_requests' AND column_name = 'status') THEN
        CREATE INDEX IF NOT EXISTS idx_cancellation_requests_status ON cancellation_requests(status);
    END IF;
END $$;

-- Summary
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration Complete!';
    RAISE NOTICE 'All missing columns and tables have been added.';
    RAISE NOTICE '========================================';
END $$;
