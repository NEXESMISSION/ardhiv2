# Notification System Fix Guide

## Problem
Notifications are not appearing after sales or confirmations.

## Root Causes
1. **RLS Policy Mismatch**: The RLS policies were checking `auth.uid() = user_id`, but:
   - `auth.uid()` is the Supabase Auth user ID
   - `user_id` in notifications is the `users.id` (system user ID)
   - These are different! The fix joins with the `users` table to match correctly.

2. **Missing `notify_owners` Function**: The RPC function might not exist in your database.

3. **UUID Type Mismatch in Triggers**: Database triggers were passing wrong types to `notify_owners()`.

## Solution - Run These SQL Files in Order

### Step 1: Create the `notify_owners` RPC Function
**File:** `docs/sql/create_notify_owners_function.sql`

This creates the database function that creates notifications for all owners.

### Step 2: Fix RLS Policies
**File:** `docs/sql/fix_notifications_rls.sql`

This fixes the RLS policies to correctly match notifications with authenticated users by joining with the `users` table.

### Step 3: Fix Database Triggers (if you haven't already)
**File:** `docs/sql/fix_sales_trigger_uuid_issue.sql`

This fixes the triggers that create notifications when sales are created or confirmed. It ensures proper UUID type casting.

### Step 4: (Optional) Create RPC Fallback Function
**File:** `docs/sql/fix_sales_update_uuid_issue.sql`

This creates an RPC function that can be used as a fallback if direct updates fail.

## Testing

After running all SQL files, test the system:

1. **Test the function directly:**
   ```sql
   -- Run docs/sql/test_notifications.sql
   ```

2. **Create a test notification:**
   ```sql
   SELECT notify_owners(
     'test'::VARCHAR,
     'Test Notification'::TEXT,
     'This is a test'::TEXT,
     'test'::VARCHAR,
     NULL::UUID,
     '{}'::JSONB
   );
   ```

3. **Check if notifications were created:**
   ```sql
   SELECT * FROM notifications 
   WHERE type = 'test' 
   ORDER BY created_at DESC 
   LIMIT 5;
   ```

4. **Verify you can see your notifications:**
   ```sql
   SELECT * FROM notifications 
   WHERE user_id IN (
     SELECT id FROM users WHERE auth_user_id = auth.uid()
   )
   ORDER BY created_at DESC 
   LIMIT 10;
   ```

## What to Check in Browser Console

After running the SQL files, open your browser console and look for:

1. **When creating a sale:**
   - `[notifyOwners] Attempting RPC call: ...`
   - `[notifyOwners] RPC call succeeded: true` OR `[notifyOwners] RPC failed, using fallback: ...`
   - `[notifyOwnersFallback] Found X owner(s) to notify`
   - `[notifyOwnersFallback] Successfully created X notification(s)`

2. **When loading notifications:**
   - `Notification subscription active`
   - No errors about RLS policies

3. **Common errors to watch for:**
   - `function notify_owners(...) does not exist` → Run Step 1
   - `permission denied for table notifications` → Run Step 2
   - `operator does not exist: uuid = character varying` → Run Step 3

## Quick Fix (All-in-One)

If you want to run everything at once, copy and paste all SQL files in this order:

1. `create_notify_owners_function.sql`
2. `fix_notifications_rls.sql`
3. `fix_sales_trigger_uuid_issue.sql`
4. `fix_sales_update_uuid_issue.sql` (optional)

## Still Not Working?

1. **Check if you have owners in the users table:**
   ```sql
   SELECT id, email, role FROM users WHERE role = 'owner';
   ```
   If empty, you need to create owner accounts first.

2. **Check if notifications are being created (even if not visible):**
   ```sql
   SELECT COUNT(*) FROM notifications;
   SELECT * FROM notifications ORDER BY created_at DESC LIMIT 10;
   ```

3. **Check RLS is enabled:**
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'notifications';
   ```
   Should return `rowsecurity = true`

4. **Check your user's auth_user_id matches:**
   ```sql
   SELECT id, email, auth_user_id FROM users WHERE email = 'your-email@example.com';
   ```
   Then verify in Supabase Auth dashboard that the User ID matches `auth_user_id`.

