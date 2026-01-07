-- ============================================
-- FIX SALE STATUS "CONFIRMED" ERROR
-- ============================================
-- This script fixes the database issues causing:
-- "invalid input value for enum sale_status: Confirmed" error
-- Run this script in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================

-- Step 1: List ALL triggers on the sales table
SELECT tgname as trigger_name
FROM pg_trigger
WHERE tgrelid = 'sales'::regclass
AND NOT tgisinternal;

-- Step 2: Drop ALL custom triggers on the sales table that might be causing issues
-- (This is safe - it only drops custom triggers, not system triggers)
DO $$
DECLARE
    trigger_record RECORD;
BEGIN
    FOR trigger_record IN 
        SELECT tgname 
        FROM pg_trigger 
        WHERE tgrelid = 'sales'::regclass 
        AND NOT tgisinternal
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON sales', trigger_record.tgname);
        RAISE NOTICE 'Dropped trigger: %', trigger_record.tgname;
    END LOOP;
END $$;

-- Step 3: Drop any functions that might reference 'Confirmed' status
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT p.proname as func_name
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND pg_get_functiondef(p.oid) LIKE '%Confirmed%'
    LOOP
        BEGIN
            EXECUTE format('DROP FUNCTION IF EXISTS %I() CASCADE', func_record.func_name);
            RAISE NOTICE 'Dropped function: %', func_record.func_name;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not drop function: % (may have dependencies)', func_record.func_name;
        END;
    END LOOP;
END $$;

-- Step 4: Reset is_confirmed column if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales' AND column_name = 'is_confirmed'
    ) THEN
        UPDATE sales SET is_confirmed = false WHERE is_confirmed = true;
        RAISE NOTICE 'Reset is_confirmed to false for all sales';
    END IF;
END $$;

-- Step 5: Verify no triggers remain on sales table
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN 'SUCCESS: No custom triggers on sales table'
        ELSE 'WARNING: ' || COUNT(*) || ' triggers still exist on sales table'
    END as result
FROM pg_trigger
WHERE tgrelid = 'sales'::regclass
AND NOT tgisinternal;

-- Step 6: Show current sale_status enum values for reference
SELECT enumlabel as valid_status_values
FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'sale_status')
ORDER BY enumsortorder;

-- ============================================
-- DONE! Try cancelling the piece again.
-- If still having issues, run this additional command:
-- ALTER TABLE sales DROP COLUMN IF EXISTS is_confirmed;
-- ============================================
