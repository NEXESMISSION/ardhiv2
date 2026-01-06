-- ============================================
-- SQL Migration: Add sidebar_order to users table
-- ============================================
-- This script adds a sidebar_order column to the users table
-- to allow each user to customize the order of sidebar menu items
--
-- IMPORTANT: Run this script in Supabase SQL Editor
-- ============================================

DO $$
BEGIN
    -- Step 1: Add sidebar_order column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'sidebar_order'
    ) THEN
        ALTER TABLE users 
        ADD COLUMN sidebar_order JSONB DEFAULT NULL;
        
        RAISE NOTICE 'Column "sidebar_order" added to "users" table.';
    ELSE
        RAISE NOTICE 'Column "sidebar_order" already exists in "users" table.';
    END IF;

    -- Step 2: Add comment to document the column
    COMMENT ON COLUMN users.sidebar_order IS 
        'JSON array of pageId strings defining the custom order of sidebar menu items for this user. Example: ["land", "clients", "sales", ...]';
    
    RAISE NOTICE 'Comment added to "sidebar_order" column.';

END $$;

-- Step 3: Verify the changes
SELECT 
    column_name, 
    data_type, 
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'users' 
AND column_name = 'sidebar_order';

-- Expected result:
-- - sidebar_order should be present
-- - data_type should be jsonb
-- - column_default should be NULL
-- - is_nullable should be YES

