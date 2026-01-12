-- ============================================
-- UPDATE CLIENTS RLS POLICY FOR WORKERS
-- ============================================
-- This script updates the RLS policy for the clients table to allow
-- Workers to add and edit clients, but NOT delete them.
-- ============================================

-- Drop the existing update policy (may have different names)
DROP POLICY IF EXISTS "Owners and Managers can update clients" ON clients;
DROP POLICY IF EXISTS "Owners can update clients" ON clients;
DROP POLICY IF EXISTS "Owners and Workers can update clients" ON clients;

-- Create new policy that includes Workers
-- This allows Owners and Workers to update clients
CREATE POLICY "Owners and Workers can update clients"
    ON clients FOR UPDATE
    TO authenticated
    USING (get_user_role() IN ('Owner', 'Worker'))
    WITH CHECK (get_user_role() IN ('Owner', 'Worker'));

-- Verify the policies
-- INSERT: Already allows all authenticated users (including Workers) ✅
-- UPDATE: Now allows Owners and Workers ✅
-- DELETE: Only allows Owners (Workers cannot delete) ✅

-- Display current policies for verification
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'clients'
ORDER BY cmd, policyname;

-- ============================================
-- SUMMARY:
-- ============================================
-- ✅ SELECT: All authenticated users can view clients
-- ✅ INSERT: All authenticated users can insert clients (Workers can add)
-- ✅ UPDATE: Owners and Workers can update clients (Workers can edit)
-- ✅ DELETE: Only Owners can delete clients (Workers cannot delete)
-- ============================================

