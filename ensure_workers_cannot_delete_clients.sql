-- ============================================
-- ENSURE WORKERS CANNOT DELETE CLIENTS
-- ============================================
-- This script ensures ONLY Owners can delete clients
-- Workers will be blocked at the database level
-- ============================================

-- Step 1: Drop any existing delete policies
DROP POLICY IF EXISTS "Owners can delete clients" ON clients;
DROP POLICY IF EXISTS "Owners and Managers can delete clients" ON clients;
DROP POLICY IF EXISTS "Authenticated users can delete clients" ON clients;

-- Step 2: Create strict policy that ONLY allows Owners to delete
CREATE POLICY "Only Owners can delete clients"
ON clients
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users
        WHERE id = auth.uid()
        AND role = 'Owner'::user_role
        AND status = 'Active'::user_status
    )
);

-- Step 3: Verify the policy
SELECT 
    policyname,
    cmd,
    qual as policy_condition
FROM pg_policies
WHERE tablename = 'clients' 
  AND cmd = 'DELETE';

-- ============================================
-- SUMMARY:
-- ============================================
-- ✅ ONLY Owners can delete clients (database-level protection)
-- ✅ Workers are completely blocked from deleting
-- ✅ Even if frontend is bypassed, database will reject deletion
-- ============================================

