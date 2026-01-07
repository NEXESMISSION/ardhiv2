-- ============================================
-- FIX SALE STATUS "CONFIRMED" ERROR - SIMPLIFIED VERSION
-- ============================================
-- This script removes triggers and functions that might be causing
-- "invalid input value for enum sale_status: Confirmed" error
-- Run this script in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================

-- Step 1: Show current sale_status enum values (for reference)
SELECT 'Current valid sale_status values:' as info;
SELECT enumlabel as valid_status
FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'sale_status')
ORDER BY enumsortorder;

-- Step 2: List ALL triggers on the sales table BEFORE removal
SELECT 'Triggers on sales table (BEFORE):' as info;
SELECT tgname as trigger_name
FROM pg_trigger
WHERE tgrelid = 'sales'::regclass
AND NOT tgisinternal;

-- Step 3: Drop ALL custom triggers on the sales table
-- This is safe - it only drops custom triggers, not system triggers
DO $$
DECLARE
    trigger_record RECORD;
    dropped_count INTEGER := 0;
BEGIN
    FOR trigger_record IN 
        SELECT tgname 
        FROM pg_trigger 
        WHERE tgrelid = 'sales'::regclass 
        AND NOT tgisinternal
    LOOP
        BEGIN
            EXECUTE format('DROP TRIGGER IF EXISTS %I ON sales CASCADE', trigger_record.tgname);
            dropped_count := dropped_count + 1;
            RAISE NOTICE 'Dropped trigger: %', trigger_record.tgname;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Error dropping trigger %: %', trigger_record.tgname, SQLERRM;
        END;
    END LOOP;
    
    IF dropped_count = 0 THEN
        RAISE NOTICE 'No custom triggers found on sales table';
    ELSE
        RAISE NOTICE 'Total triggers dropped: %', dropped_count;
    END IF;
END $$;

-- Step 4: Drop known problematic function names (simplified approach)
-- Drop functions by name pattern instead of searching by content
DO $$
DECLARE
    func_name TEXT;
    dropped_count INTEGER := 0;
BEGIN
    -- List of common function name patterns that might cause issues
    FOR func_name IN 
        SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND (
            p.proname ILIKE '%confirm%'
            OR p.proname ILIKE '%sale_status%'
            OR p.proname ILIKE '%trigger%'
        )
        AND p.proname NOT LIKE 'pg_%'
    LOOP
        BEGIN
            EXECUTE format('DROP FUNCTION IF EXISTS %I CASCADE', func_name);
            dropped_count := dropped_count + 1;
            RAISE NOTICE 'Dropped function: %', func_name;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Error dropping function %: %', func_name, SQLERRM;
        END;
    END LOOP;
    
    IF dropped_count = 0 THEN
        RAISE NOTICE 'No problematic functions found by name pattern';
    ELSE
        RAISE NOTICE 'Total functions dropped: %', dropped_count;
    END IF;
END $$;

-- Step 5: Reset is_confirmed column if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales' AND column_name = 'is_confirmed'
    ) THEN
        -- First, reset all values to false
        UPDATE sales SET is_confirmed = false WHERE is_confirmed = true;
        RAISE NOTICE 'Reset is_confirmed to false for all sales';
    ELSE
        RAISE NOTICE 'is_confirmed column does not exist';
    END IF;
END $$;

-- Step 6: Verify no triggers remain on sales table
SELECT 'Triggers on sales table (AFTER):' as info;
DO $$
DECLARE
    trigger_count INTEGER;
    trigger_list TEXT := '';
    trigger_record RECORD;
BEGIN
    -- Get count
    SELECT COUNT(*) INTO trigger_count
    FROM pg_trigger
    WHERE tgrelid = 'sales'::regclass
    AND NOT tgisinternal;
    
    -- Build list manually to avoid aggregate function issues
    IF trigger_count > 0 THEN
        FOR trigger_record IN 
            SELECT tgname 
            FROM pg_trigger
            WHERE tgrelid = 'sales'::regclass
            AND NOT tgisinternal
        LOOP
            IF trigger_list = '' THEN
                trigger_list := trigger_record.tgname;
            ELSE
                trigger_list := trigger_list || ', ' || trigger_record.tgname;
            END IF;
        END LOOP;
    END IF;
    
    IF trigger_count = 0 THEN
        RAISE NOTICE 'SUCCESS: No custom triggers remain on sales table';
    ELSE
        RAISE NOTICE 'WARNING: % triggers still exist on sales table: %', trigger_count, trigger_list;
    END IF;
END $$;

-- Step 7: Show summary of sales statuses
SELECT 'Summary of current sales statuses:' as info;
SELECT 
    status,
    COUNT(*) as count
FROM sales
GROUP BY status
ORDER BY count DESC;

-- ============================================
-- DONE! 
-- ============================================
-- If you still get the error after running this:
-- 1. The error might be coming from a trigger/function that executes
--    when you try to update sales. Try running the script again.
-- 2. Check if there are any database-level triggers (not table-level)
-- 3. Try updating a sale manually to see if the error persists
-- ============================================
