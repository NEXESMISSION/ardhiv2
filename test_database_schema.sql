-- ============================================
-- Database Schema Test Script
-- This script checks if all required columns and tables exist
-- Run this in Supabase SQL Editor to verify your database schema
-- ============================================

-- Test 1: Check if land_batches has price_per_m2 columns
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'land_batches' 
        AND column_name = 'price_per_m2_full'
    ) THEN
        RAISE NOTICE '✓ land_batches.price_per_m2_full exists';
    ELSE
        RAISE WARNING '✗ land_batches.price_per_m2_full MISSING - Run add_price_per_m2_to_land_batches.sql';
    END IF;

    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'land_batches' 
        AND column_name = 'price_per_m2_installment'
    ) THEN
        RAISE NOTICE '✓ land_batches.price_per_m2_installment exists';
    ELSE
        RAISE WARNING '✗ land_batches.price_per_m2_installment MISSING - Run add_price_per_m2_to_land_batches.sql';
    END IF;
END $$;

-- Test 2: Check if land_batches has location column
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'land_batches' 
        AND column_name = 'location'
    ) THEN
        RAISE NOTICE '✓ land_batches.location exists';
    ELSE
        RAISE WARNING '✗ land_batches.location MISSING - Run add_location_to_land_batches.sql';
    END IF;
END $$;

-- Test 3: Check if sales has company_fee columns
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'sales' 
        AND column_name = 'company_fee_percentage'
    ) THEN
        RAISE NOTICE '✓ sales.company_fee_percentage exists';
    ELSE
        RAISE WARNING '✗ sales.company_fee_percentage MISSING - Run add_company_fee_to_sales.sql';
    END IF;

    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'sales' 
        AND column_name = 'company_fee_amount'
    ) THEN
        RAISE NOTICE '✓ sales.company_fee_amount exists';
    ELSE
        RAISE WARNING '✗ sales.company_fee_amount MISSING - Run add_company_fee_to_sales.sql';
    END IF;
END $$;

-- Test 4: Check if sales has deadline_date column
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'sales' 
        AND column_name = 'deadline_date'
    ) THEN
        RAISE NOTICE '✓ sales.deadline_date exists';
    ELSE
        RAISE WARNING '✗ sales.deadline_date MISSING - Run add_deadline_to_sales.sql';
    END IF;
END $$;

-- Test 5: Check if expenses table exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'expenses'
    ) THEN
        RAISE NOTICE '✓ expenses table exists';
    ELSE
        RAISE WARNING '✗ expenses table MISSING - Run add_expenses_table.sql';
    END IF;
END $$;

-- Test 6: Check if user_permissions table exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'user_permissions'
    ) THEN
        RAISE NOTICE '✓ user_permissions table exists';
    ELSE
        RAISE WARNING '✗ user_permissions table MISSING - Run add_user_permissions_table.sql';
    END IF;
END $$;

-- Test 7: Check if permission_templates table exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'permission_templates'
    ) THEN
        RAISE NOTICE '✓ permission_templates table exists';
    ELSE
        RAISE WARNING '✗ permission_templates table MISSING - Run add_user_permissions_table.sql';
    END IF;
END $$;

-- Test 8: Check if cancellation_requests table exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'cancellation_requests'
    ) THEN
        RAISE NOTICE '✓ cancellation_requests table exists';
    ELSE
        RAISE WARNING '✗ cancellation_requests table MISSING - Run add_cancellation_requests_table.sql';
    END IF;
END $$;

-- Test 9: Check if land_batches has real_estate_tax_number column
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'land_batches' 
        AND column_name = 'real_estate_tax_number'
    ) THEN
        RAISE NOTICE '✓ land_batches.real_estate_tax_number exists';
    ELSE
        RAISE WARNING '✗ land_batches.real_estate_tax_number MISSING - Run add_real_estate_tax_number.sql';
    END IF;
END $$;

-- Test 10: Check if sales has is_confirmed and big_advance_confirmed columns
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'sales' 
        AND column_name = 'is_confirmed'
    ) THEN
        RAISE NOTICE '✓ sales.is_confirmed exists';
    ELSE
        RAISE WARNING '✗ sales.is_confirmed MISSING - Run update_sales_company_fee_migration.sql';
    END IF;

    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'sales' 
        AND column_name = 'big_advance_confirmed'
    ) THEN
        RAISE NOTICE '✓ sales.big_advance_confirmed exists';
    ELSE
        RAISE WARNING '✗ sales.big_advance_confirmed MISSING - Run update_sales_company_fee_migration.sql';
    END IF;
END $$;

-- Summary: Show all missing columns/tables
SELECT 
    'Missing Column/Table' as issue_type,
    table_name,
    column_name,
    CASE 
        WHEN column_name IS NULL THEN 'Table missing'
        ELSE 'Column missing'
    END as description
FROM information_schema.columns
WHERE (table_name = 'land_batches' AND column_name IN ('price_per_m2_full', 'price_per_m2_installment', 'location', 'real_estate_tax_number'))
   OR (table_name = 'sales' AND column_name IN ('company_fee_percentage', 'company_fee_amount', 'deadline_date', 'is_confirmed', 'big_advance_confirmed'))
   OR (table_name = 'expenses' AND column_name = 'id')
   OR (table_name = 'user_permissions' AND column_name = 'id')
   OR (table_name = 'permission_templates' AND column_name = 'id')
   OR (table_name = 'cancellation_requests' AND column_name = 'id')
GROUP BY table_name, column_name
ORDER BY table_name, column_name;

-- Final message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Schema Test Complete';
    RAISE NOTICE 'Check the warnings above for missing items';
    RAISE NOTICE 'Run the corresponding SQL migration files';
    RAISE NOTICE '========================================';
END $$;

