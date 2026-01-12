-- ============================================
-- ENSURE WORKERS CANNOT DELETE CLIENTS
-- ============================================
-- This script ensures Workers can edit clients but NOT delete them
-- ============================================

-- Step 1: Ensure RLS policy prevents Workers from deleting clients
-- Drop any existing delete policy
DROP POLICY IF EXISTS "Owners can delete clients" ON clients;
DROP POLICY IF EXISTS "Owners and Managers can delete clients" ON clients;

-- Create policy that ONLY allows Owners to delete clients
CREATE POLICY "Owners can delete clients"
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

-- Step 2: Try to update Worker role permissions (if roles table structure allows)
-- This step is optional - the RLS policy above is the critical protection
DO $$
DECLARE
    has_name_column BOOLEAN;
    column_name_val TEXT;
BEGIN
    -- Check what columns exist in roles table
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'roles' 
        AND column_name = 'name'
    ) INTO has_name_column;
    
    -- If name column exists, try to update Worker role
    IF has_name_column THEN
        BEGIN
            -- Try to update using dynamic SQL to avoid column name issues
            EXECUTE 'UPDATE roles 
                     SET permissions = COALESCE(permissions, ''{}''::jsonb) 
                         || ''{"edit_clients": true, "delete_clients": false}''::jsonb
                     WHERE name::text = ''Worker''';
            
            IF NOT FOUND THEN
                RAISE NOTICE 'Worker role not found in roles table';
            ELSE
                RAISE NOTICE 'Worker role permissions updated successfully';
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not update Worker role: %', SQLERRM;
            RAISE NOTICE 'This is OK - RLS policy will still prevent deletion';
        END;
    ELSE
        RAISE NOTICE 'Roles table structure is different - skipping role update';
        RAISE NOTICE 'RLS policy is the critical protection and is already in place';
    END IF;
END $$;

-- Step 4: Verify RLS policy is correct
SELECT 
    policyname,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'clients' 
  AND cmd = 'DELETE';

-- ============================================
-- SUMMARY:
-- ============================================
-- ✅ RLS policy ensures ONLY Owners can delete clients
-- ✅ Workers are blocked from deleting at database level
-- ✅ Frontend already hides delete button for Workers
-- ============================================
