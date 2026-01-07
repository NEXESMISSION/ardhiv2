-- ============================================
-- FIX CLIENTS DELETE RLS POLICY
-- ============================================
-- This script fixes the RLS policy for deleting clients
-- The issue is that get_user_role() might not be working correctly
-- ============================================

-- First, check if get_user_role function exists and works
DO $$
BEGIN
    -- Test the function
    PERFORM get_user_role();
    RAISE NOTICE 'get_user_role() function exists and works';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'get_user_role() function issue: %', SQLERRM;
END $$;

-- Drop the existing delete policy
DROP POLICY IF EXISTS "Owners can delete clients" ON clients;

-- Create a more robust delete policy
-- This policy allows Owners to delete clients
CREATE POLICY "Owners can delete clients"
ON clients
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users
        WHERE id = auth.uid()
        AND role = 'Owner'
        AND status = 'Active'
    )
);

-- Alternative: If the above doesn't work, try this simpler version
-- that checks the role directly without using get_user_role()
-- Uncomment if needed:
/*
DROP POLICY IF EXISTS "Owners can delete clients" ON clients;

CREATE POLICY "Owners can delete clients"
ON clients
FOR DELETE
TO authenticated
USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'Owner'
);
*/

-- Verify the policy was created
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
AND policyname = 'Owners can delete clients';

