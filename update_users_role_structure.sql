-- ============================================
-- SQL Migration: Update User Role Structure
-- ============================================
-- This script updates the user role structure from:
-- Owner, Manager, FieldStaff -> Owner, Worker
-- 
-- IMPORTANT: Run this script in Supabase SQL Editor
-- ============================================

-- Step 1: Drop all RLS policies that depend on the role column
-- We'll recreate them after updating the enum
DO $$ 
DECLARE
    pol record;
BEGIN
    -- Drop all policies that reference 'Manager' or 'FieldStaff' in their USING/WITH CHECK clauses
    -- This includes policies that check for role IN ('Owner', 'Manager')
    
    -- Drop specific policies that are known to reference Manager
    DROP POLICY IF EXISTS "Owners and Managers can view all users" ON users;
    DROP POLICY IF EXISTS "Owners and Managers can update clients" ON clients;
    DROP POLICY IF EXISTS "Owners and Managers can update reservations" ON reservations;
    DROP POLICY IF EXISTS "Owners and Managers can update sales" ON sales;
    DROP POLICY IF EXISTS "Owners and Managers can update installments" ON installments;
    DROP POLICY IF EXISTS "Owners and Managers can update payments" ON payments;
    DROP POLICY IF EXISTS "Owners and Managers can view audit logs" ON audit_logs;
    DROP POLICY IF EXISTS "Owners and Managers can insert land batches" ON land_batches;
    DROP POLICY IF EXISTS "Owners and Managers can update land batches" ON land_batches;
    DROP POLICY IF EXISTS "Owners and Managers can insert land pieces" ON land_pieces;
    DROP POLICY IF EXISTS "Owners and Managers can update land pieces" ON land_pieces;
    DROP POLICY IF EXISTS "Owners and Managers can update recurring templates" ON recurring_expenses_templates;
    DROP POLICY IF EXISTS "Owners can update recurring templates" ON recurring_expenses_templates;
    DROP POLICY IF EXISTS "Owners can delete recurring templates" ON recurring_expenses_templates;
    DROP POLICY IF EXISTS "Owners can insert recurring templates" ON recurring_expenses_templates;
    DROP POLICY IF EXISTS "Owners can view recurring templates" ON recurring_expenses_templates;
    DROP POLICY IF EXISTS "Owners and Managers can update debts" ON debts;
    DROP POLICY IF EXISTS "Owners and Managers can update debt payments" ON debt_payments;
    DROP POLICY IF EXISTS "Owners and Managers can manage worker profiles" ON worker_profiles;
    DROP POLICY IF EXISTS "Owners and Managers can update worker profiles" ON worker_profiles;
    
    -- Drop all policies on expenses table that might reference role
    DROP POLICY IF EXISTS "Users can update expenses" ON expenses;
    DROP POLICY IF EXISTS "Authenticated users can create expenses" ON expenses;
    DROP POLICY IF EXISTS "Authenticated users can insert expenses" ON expenses;
    DROP POLICY IF EXISTS "Expenses are viewable by authenticated users" ON expenses;
    DROP POLICY IF EXISTS "Owners can delete expenses" ON expenses;
    DROP POLICY IF EXISTS "Owners can update expenses" ON expenses;
    DROP POLICY IF EXISTS "Owners can create expenses" ON expenses;
    DROP POLICY IF EXISTS "Owners and Managers can update expenses" ON expenses;
    
    -- Drop all policies that use get_user_role() function (which depends on role column)
    -- This is a comprehensive approach to catch all policies that depend on role
    FOR pol IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE policyname LIKE '%Owner%' 
           OR policyname LIKE '%Manager%' 
           OR policyname LIKE '%FieldStaff%'
           OR policyname LIKE '%role%'
           OR policyname LIKE '%Role%'
    LOOP
        BEGIN
            EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
                pol.policyname, pol.schemaname, pol.tablename);
        EXCEPTION WHEN OTHERS THEN
            -- Continue if policy doesn't exist or can't be dropped
            NULL;
        END;
    END LOOP;
    
    -- Also drop policies that might be checking role through function calls
    -- We'll drop all policies on tables that commonly use role checks
    FOR pol IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies p
        JOIN pg_class c ON c.relname = p.tablename
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = p.schemaname
        WHERE EXISTS (
            SELECT 1 
            FROM pg_policies p2
            WHERE p2.tablename = p.tablename 
            AND p2.schemaname = p.schemaname
            AND (
                p2.policyname LIKE '%Owner%' 
                OR p2.policyname LIKE '%Manager%'
                OR p2.policyname LIKE '%FieldStaff%'
            )
        )
    LOOP
        BEGIN
            EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
                pol.policyname, pol.schemaname, pol.tablename);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;
END $$;

-- Step 2: First, add 'Worker' to the enum type
-- This allows us to use 'Worker' before removing old values
DO $$ 
BEGIN
    -- Add 'Worker' to the enum if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'Worker' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
        ALTER TYPE user_role ADD VALUE 'Worker';
    END IF;
END $$;

-- Step 3: Update existing Manager and FieldStaff users to Worker
-- First, we need to temporarily change the type to text, update, then change back
-- Also need to handle default value

-- Get and store the default value if it exists
DO $$ 
DECLARE
    default_val text;
BEGIN
    -- Get the current default value
    SELECT column_default INTO default_val
    FROM information_schema.columns
    WHERE table_name = 'users' 
    AND column_name = 'role'
    AND table_schema = 'public';
    
    -- Remove default if it exists
    IF default_val IS NOT NULL THEN
        ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
    END IF;
END $$;

-- Change type to text
ALTER TABLE users ALTER COLUMN role TYPE text;

-- Update values
UPDATE users 
SET role = 'Worker' 
WHERE role IN ('Manager', 'FieldStaff');

-- Step 4: Drop the old enum type and create a new one with only Owner and Worker
-- First, drop the old enum (this will fail if there are dependencies, so we use CASCADE)
DROP TYPE IF EXISTS user_role_old CASCADE;

-- Create new enum with only Owner and Worker
CREATE TYPE user_role_new AS ENUM ('Owner', 'Worker');

-- Step 5: Change the column type to the new enum
ALTER TABLE users 
ALTER COLUMN role TYPE user_role_new 
USING role::text::user_role_new;

-- Step 5.5: Restore default value (set to 'Worker' as default for new users)
ALTER TABLE users 
ALTER COLUMN role SET DEFAULT 'Worker'::user_role_new;

-- Step 6: Rename the enum types
-- We need to be careful here - if there are still dependencies, we'll handle them
DO $$ 
BEGIN
    -- Try to drop the old enum
    BEGIN
        DROP TYPE user_role CASCADE;
    EXCEPTION WHEN OTHERS THEN
        -- If it fails, rename it instead
        ALTER TYPE user_role RENAME TO user_role_old;
    END;
    
    -- Rename the new enum
    ALTER TYPE user_role_new RENAME TO user_role;
    
    -- Clean up old enum if it was renamed
    DROP TYPE IF EXISTS user_role_old CASCADE;
END $$;

-- Step 6.5: Recreate get_user_role() function with the new enum type
-- This function is needed by the RLS policies
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
BEGIN
    RETURN (
        SELECT role FROM users WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Recreate RLS policies with updated role references (Owner only, no Manager)
DO $$ 
BEGIN
    -- Recreate policies that were dropped, but now only check for Owner
    -- Users: Owners can view all users
    CREATE POLICY "Owners can view all users"
        ON users FOR SELECT
        TO authenticated
        USING (get_user_role() = 'Owner');
    
    -- Clients: Owners can update clients
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clients') THEN
        CREATE POLICY "Owners can update clients"
            ON clients FOR UPDATE
            TO authenticated
            USING (get_user_role() = 'Owner')
            WITH CHECK (get_user_role() = 'Owner');
    END IF;
    
    -- Reservations: Owners can update reservations
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reservations') THEN
        CREATE POLICY "Owners can update reservations"
            ON reservations FOR UPDATE
            TO authenticated
            USING (get_user_role() = 'Owner')
            WITH CHECK (get_user_role() = 'Owner');
    END IF;
    
    -- Sales: Owners can update sales
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales') THEN
        CREATE POLICY "Owners can update sales"
            ON sales FOR UPDATE
            TO authenticated
            USING (get_user_role() = 'Owner')
            WITH CHECK (get_user_role() = 'Owner');
    END IF;
    
    -- Installments: Owners can update installments
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'installments') THEN
        CREATE POLICY "Owners can update installments"
            ON installments FOR UPDATE
            TO authenticated
            USING (get_user_role() = 'Owner')
            WITH CHECK (get_user_role() = 'Owner');
    END IF;
    
    -- Payments: Owners can update payments
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payments') THEN
        CREATE POLICY "Owners can update payments"
            ON payments FOR UPDATE
            TO authenticated
            USING (get_user_role() = 'Owner')
            WITH CHECK (get_user_role() = 'Owner');
    END IF;
    
    -- Audit logs: Owners can view audit logs
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
        CREATE POLICY "Owners can view audit logs"
            ON audit_logs FOR SELECT
            TO authenticated
            USING (get_user_role() = 'Owner');
    END IF;
    
    -- Land batches: Owners can insert/update land batches
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'land_batches') THEN
        CREATE POLICY "Owners can insert land batches"
            ON land_batches FOR INSERT
            TO authenticated
            WITH CHECK (get_user_role() = 'Owner');
        
        CREATE POLICY "Owners can update land batches"
            ON land_batches FOR UPDATE
            TO authenticated
            USING (get_user_role() = 'Owner')
            WITH CHECK (get_user_role() = 'Owner');
    END IF;
    
    -- Land pieces: Owners can insert/update land pieces
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'land_pieces') THEN
        CREATE POLICY "Owners can insert land pieces"
            ON land_pieces FOR INSERT
            TO authenticated
            WITH CHECK (get_user_role() = 'Owner');
        
        CREATE POLICY "Owners can update land pieces"
            ON land_pieces FOR UPDATE
            TO authenticated
            USING (get_user_role() = 'Owner')
            WITH CHECK (get_user_role() = 'Owner');
    END IF;
    
    -- Recurring expenses templates: Owners can manage
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recurring_expenses_templates') THEN
        -- View
        CREATE POLICY "Owners can view recurring templates"
            ON recurring_expenses_templates FOR SELECT
            TO authenticated
            USING (get_user_role() = 'Owner');
        
        -- Insert
        CREATE POLICY "Owners can insert recurring templates"
            ON recurring_expenses_templates FOR INSERT
            TO authenticated
            WITH CHECK (get_user_role() = 'Owner');
        
        -- Update
        CREATE POLICY "Owners can update recurring templates"
            ON recurring_expenses_templates FOR UPDATE
            TO authenticated
            USING (get_user_role() = 'Owner')
            WITH CHECK (get_user_role() = 'Owner');
        
        -- Delete
        CREATE POLICY "Owners can delete recurring templates"
            ON recurring_expenses_templates FOR DELETE
            TO authenticated
            USING (get_user_role() = 'Owner');
    END IF;
    
    -- Debts: Owners can update debts
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'debts') THEN
        CREATE POLICY "Owners can update debts"
            ON debts FOR UPDATE
            TO authenticated
            USING (get_user_role() = 'Owner')
            WITH CHECK (get_user_role() = 'Owner');
    END IF;
    
    -- Debt payments: Owners can update debt payments
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'debt_payments') THEN
        CREATE POLICY "Owners can update debt payments"
            ON debt_payments FOR UPDATE
            TO authenticated
            USING (get_user_role() = 'Owner')
            WITH CHECK (get_user_role() = 'Owner');
    END IF;
    
    -- Worker profiles: Owners can manage worker profiles
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'worker_profiles') THEN
        CREATE POLICY "Owners can manage worker profiles"
            ON worker_profiles FOR ALL
            TO authenticated
            USING (get_user_role() = 'Owner')
            WITH CHECK (get_user_role() = 'Owner');
    END IF;
    
    -- Expenses: Recreate policies for expenses table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'expenses') THEN
        -- View expenses
        CREATE POLICY "Expenses are viewable by authenticated users"
            ON expenses FOR SELECT
            TO authenticated
            USING (true);
        
        -- Create expenses (all authenticated users)
        CREATE POLICY "Authenticated users can create expenses"
            ON expenses FOR INSERT
            TO authenticated
            WITH CHECK (true);
        
        -- Update own expenses (users can update their own expenses)
        CREATE POLICY "Users can update own expenses"
            ON expenses FOR UPDATE
            TO authenticated
            USING (created_by = auth.uid())
            WITH CHECK (created_by = auth.uid());
        
        -- Owners can update any expenses
        CREATE POLICY "Owners can update expenses"
            ON expenses FOR UPDATE
            TO authenticated
            USING (get_user_role() = 'Owner')
            WITH CHECK (get_user_role() = 'Owner');
        
        -- Owners can delete expenses
        CREATE POLICY "Owners can delete expenses"
            ON expenses FOR DELETE
            TO authenticated
            USING (get_user_role() = 'Owner');
    END IF;
END $$;

-- Step 8: Update any role references in audit_logs or other tables (if they exist)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'audit_logs' AND column_name = 'user_role') THEN
        ALTER TABLE audit_logs ALTER COLUMN user_role TYPE text;
        UPDATE audit_logs 
        SET user_role = 'Worker' 
        WHERE user_role IN ('Manager', 'FieldStaff');
        ALTER TABLE audit_logs 
        ALTER COLUMN user_role TYPE user_role USING user_role::text::user_role;
    END IF;
END $$;

-- Step 9: Update views that reference Manager role (if they exist)
DO $$ 
BEGIN
    -- Update sales_public view if it exists
    IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'sales_public') THEN
        DROP VIEW IF EXISTS sales_public CASCADE;
        -- Note: You may need to recreate this view manually if it was dropped
    END IF;
END $$;

-- Step 10: Remove status column if it exists and is not needed
-- WARNING: Only run this if you're sure you want to remove the status column
-- Uncomment the line below if you want to remove the status column:
-- ALTER TABLE users DROP COLUMN IF EXISTS status;

-- Step 11: Verify the changes
SELECT role, COUNT(*) as count 
FROM users 
GROUP BY role
ORDER BY role;

-- Expected result:
-- role   | count
-- -------|------
-- Owner  | X
-- Worker | Y
