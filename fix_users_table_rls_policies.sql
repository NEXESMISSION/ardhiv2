-- ============================================
-- Fix RLS Policies for Users Table
-- This allows Owners and users with manage_users permission to manage users
-- ============================================

-- First, enable RLS on users table if not already enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their own profile" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
DROP POLICY IF EXISTS "Owners can manage all users" ON users;
DROP POLICY IF EXISTS "Users with manage_users can view all users" ON users;
DROP POLICY IF EXISTS "Users with manage_users can insert users" ON users;
DROP POLICY IF EXISTS "Users with manage_users can update users" ON users;
DROP POLICY IF EXISTS "Users with manage_users can delete users" ON users;
DROP POLICY IF EXISTS "Allow authenticated users to view users" ON users;
DROP POLICY IF EXISTS "Allow authenticated users to insert users" ON users;
DROP POLICY IF EXISTS "Allow authenticated users to update users" ON users;
DROP POLICY IF EXISTS "Allow authenticated users to delete users" ON users;

-- Policy 1: Users can view their own profile
CREATE POLICY "Users can view their own profile"
ON users
FOR SELECT
USING (auth.uid() = id);

-- Policy 2: Owners can view all users
CREATE POLICY "Owners can view all users"
ON users
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'Owner'
    AND status = 'Active'
  )
);

-- Policy 3: Users with manage_users permission can view all users
-- This checks if the user has the manage_users permission through their role
CREATE POLICY "Users with manage_users can view all users"
ON users
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.status = 'Active'
    AND (
      u.role = 'Owner' OR
      EXISTS (
        SELECT 1 FROM user_permissions up
        WHERE up.user_id = u.id
        AND up.resource_type = 'user'
        AND up.permission_type IN ('view', 'create', 'edit', 'delete')
        AND up.granted = true
      )
    )
  )
);

-- Policy 4: Owners can insert new users
CREATE POLICY "Owners can insert users"
ON users
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'Owner'
    AND status = 'Active'
  )
);

-- Policy 5: Users with manage_users permission can insert users
CREATE POLICY "Users with manage_users can insert users"
ON users
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.status = 'Active'
    AND (
      u.role = 'Owner' OR
      EXISTS (
        SELECT 1 FROM user_permissions up
        WHERE up.user_id = u.id
        AND up.resource_type = 'user'
        AND up.permission_type IN ('create', 'edit')
        AND up.granted = true
      )
    )
  )
);

-- Policy 6: Owners can update all users
CREATE POLICY "Owners can update users"
ON users
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'Owner'
    AND status = 'Active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'Owner'
    AND status = 'Active'
  )
);

-- Policy 7: Users with manage_users permission can update users
CREATE POLICY "Users with manage_users can update users"
ON users
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.status = 'Active'
    AND (
      u.role = 'Owner' OR
      EXISTS (
        SELECT 1 FROM user_permissions up
        WHERE up.user_id = u.id
        AND up.resource_type = 'user'
        AND up.permission_type IN ('edit', 'delete')
        AND up.granted = true
      )
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.status = 'Active'
    AND (
      u.role = 'Owner' OR
      EXISTS (
        SELECT 1 FROM user_permissions up
        WHERE up.user_id = u.id
        AND up.resource_type = 'user'
        AND up.permission_type IN ('edit', 'delete')
        AND up.granted = true
      )
    )
  )
);

-- Policy 8: Owners can delete users (except themselves)
CREATE POLICY "Owners can delete users"
ON users
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'Owner'
    AND status = 'Active'
  )
  AND id != auth.uid() -- Prevent self-deletion
);

-- Policy 9: Users with manage_users permission can delete users
CREATE POLICY "Users with manage_users can delete users"
ON users
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.status = 'Active'
    AND (
      u.role = 'Owner' OR
      EXISTS (
        SELECT 1 FROM user_permissions up
        WHERE up.user_id = u.id
        AND up.resource_type = 'user'
        AND up.permission_type = 'delete'
        AND up.granted = true
      )
    )
  )
  AND id != auth.uid() -- Prevent self-deletion
);

-- ============================================
-- Alternative: Simpler approach if user_permissions table doesn't exist
-- Uncomment these if the above policies don't work
-- ============================================

/*
-- Simpler version: Only check role, no user_permissions table needed
DROP POLICY IF EXISTS "Owners can manage all users" ON users;

CREATE POLICY "Owners can manage all users"
ON users
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'Owner'
    AND status = 'Active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'Owner'
    AND status = 'Active'
  )
);

-- Allow users to view their own profile
CREATE POLICY "Users can view own profile"
ON users
FOR SELECT
USING (auth.uid() = id);
*/

-- ============================================
-- Grant necessary permissions
-- ============================================

-- Ensure authenticated users can access the users table
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- ============================================
-- Verify policies
-- ============================================

-- Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'users';

-- List all policies on users table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'users';

