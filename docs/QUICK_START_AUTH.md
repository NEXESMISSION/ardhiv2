# Quick Start: Fixing Login Issue

## Problem

You're getting a 406 error or "User not found in system" after logging in successfully.

**This means**: Your account exists in Supabase Auth but NOT in the `users` table.

## Solution

You need to add your account to the `users` table. Here's how:

### Step 1: Get Your Auth User ID

1. Go to Supabase Dashboard
2. Navigate to **Authentication** → **Users**
3. Find your user (test@gmail.com)
4. Click on the user
5. **Copy the UUID** (it looks like: `c6ad2fcf-de18-497f-ac08-51049567ef70`)

### Step 2: Add User to System

Run this SQL in Supabase SQL Editor (replace with your actual values):

```sql
INSERT INTO users (
  email,
  role,
  auth_user_id
) VALUES (
  'test@gmail.com',  -- Your email
  'owner',           -- Your role (owner or worker)
  'c6ad2fcf-de18-497f-ac08-51049567ef70'::uuid  -- Paste the UUID from Step 1
)
ON CONFLICT (auth_user_id) DO UPDATE
SET 
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  updated_at = NOW();
```

### Step 3: Verify

Check if it worked:

```sql
SELECT id, email, role, auth_user_id 
FROM users 
WHERE email = 'test@gmail.com';
```

### Step 4: Try Logging In Again

Now try logging in - it should work!

## Quick Copy-Paste Template

For test@gmail.com with UUID `c6ad2fcf-de18-497f-ac08-51049567ef70`:

```sql
INSERT INTO users (email, role, auth_user_id)
VALUES ('test@gmail.com', 'owner', 'c6ad2fcf-de18-497f-ac08-51049567ef70'::uuid)
ON CONFLICT (auth_user_id) DO UPDATE
SET email = EXCLUDED.email, role = EXCLUDED.role, updated_at = NOW();
```

**Just replace the UUID with your actual one!**

## Common Issues

### "duplicate key value violates unique constraint"

This means the user already exists. The `ON CONFLICT` clause will update it. This is fine.

### "permission denied"

Make sure you're running this as the database owner or using the service role key.

### Still getting 406 error

1. Make sure you ran `docs/sql/fix_rls_recursion.sql` first
2. Verify the UUID matches exactly
3. Check that the email matches

## Need Help?

See `docs/sql/create_owner_account.sql` for more detailed instructions.

