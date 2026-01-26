# UUID Type Mismatch Fix - Step by Step Instructions

## Problem
Error: `operator does not exist: uuid = character varying` or `function notify_owners(...) does not exist`

This happens when updating sales because database triggers are comparing UUID with VARCHAR types.

## Solution

Run these SQL files **in order** in your Supabase SQL Editor:

### Step 1: Fix Database Triggers
**File:** `docs/sql/fix_sales_trigger_uuid_issue.sql`

This fixes the trigger functions to properly handle UUID types:
- Fixes `notify_sale_confirmed()` trigger
- Fixes `notify_sale_created()` trigger  
- Uses named parameters to avoid type inference issues

**How to run:**
1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy the entire contents of `fix_sales_trigger_uuid_issue.sql`
4. Paste and run it
5. You should see "CREATE FUNCTION" messages

### Step 2: Create RPC Function (Optional Fallback)
**File:** `docs/sql/fix_sales_update_uuid_issue.sql`

This creates an RPC function that can be used as a fallback if direct updates still fail:
- Creates `update_sale_safe()` function
- Handles UUID casting properly
- Used automatically by the application if direct update fails

**How to run:**
1. In the same SQL Editor
2. Copy the entire contents of `fix_sales_update_uuid_issue.sql`
3. Paste and run it
4. You should see "CREATE FUNCTION" message

### Step 3: Verify
After running both files:
1. Refresh your browser (hard refresh: Ctrl+Shift+R)
2. Try confirming a sale
3. The error should be resolved

## What These Fixes Do

### fix_sales_trigger_uuid_issue.sql
- Updates trigger functions to use named parameters (`p_type := ...`)
- Ensures UUID types are passed correctly to `notify_owners()`
- Fixes type inference issues in PostgreSQL

### fix_sales_update_uuid_issue.sql  
- Creates `update_sale_safe()` RPC function
- Accepts TEXT for sale_id (avoids type issues)
- Properly casts to UUID internally
- Used as automatic fallback by the application

## Troubleshooting

If you still get errors:

1. **Check if functions exist:**
```sql
SELECT proname, pronargs 
FROM pg_proc 
WHERE proname IN ('notify_owners', 'update_sale_safe', 'notify_sale_confirmed');
```

2. **Check trigger exists:**
```sql
SELECT tgname 
FROM pg_trigger 
WHERE tgname = 'trigger_notify_sale_confirmed';
```

3. **If notify_owners doesn't exist, run:**
   - `docs/sql/create_notifications_table.sql` (the notify_owners function is defined there)

4. **Check for RLS policies blocking updates:**
```sql
SELECT * FROM pg_policies WHERE tablename = 'sales';
```

## Notes

- The application code will automatically use the RPC function if direct updates fail
- The triggers will now work correctly with proper UUID handling
- All type casting is handled properly in the database layer

