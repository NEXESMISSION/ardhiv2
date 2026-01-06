-- ============================================
-- SQL Migration: Remove Availability from Worker Profiles
-- ============================================
-- This script removes the availability column from worker_profiles table
-- 
-- IMPORTANT: Run this script in Supabase SQL Editor
-- ============================================

-- Step 1: Drop the availability column from worker_profiles table
ALTER TABLE worker_profiles 
DROP COLUMN IF EXISTS availability;

-- Step 2: Verify the changes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'worker_profiles' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Expected result: availability column should not appear in the list

