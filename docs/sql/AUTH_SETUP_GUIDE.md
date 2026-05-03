# Authentication Setup Guide

## Overview

This guide explains how to set up authentication for the Land Management System with owner and worker roles.

## Database Setup

### Step 1: Create Users Table and RLS Policies

Run the SQL file `docs/sql/create_users_table.sql` in your Supabase SQL Editor. This will:
- Create the `users` table
- Set up Row Level Security (RLS) policies
- Enable RLS on all existing tables
- Grant full access to owners only

### Step 2: Create Owner Account

Owners must be created manually through the Supabase Auth dashboard:

1. Go to Supabase Dashboard → Authentication → Users
2. Click "Add User" → "Create new user"
3. Enter owner email and password
4. **Important**: Copy the User ID (UUID) from the created user

5. Then, insert the owner record in the `users` table:

```sql
INSERT INTO users (email, role, auth_user_id) 
VALUES ('owner@example.com', 'owner', '<paste_user_id_here>');
```

Replace `<paste_user_id_here>` with the UUID you copied from step 4.

## Supabase Configuration

### Email Confirmation

For development, you may want to disable email confirmation:

1. Go to Supabase Dashboard → Authentication → Settings
2. Under "Email Auth", disable "Enable email confirmations"
3. This allows workers to be created without email verification

**Note**: For production, keep email confirmation enabled and handle it properly.

### Service Role Key (Optional - for future enhancements)

If you need to create/delete users programmatically (without email confirmation), you'll need to:
1. Create a Supabase Edge Function with service role key
2. Or use the service role key in a secure backend service

**Warning**: Never expose the service role key in client-side code!

## User Roles

### Owner
- Created manually through Supabase dashboard
- Has full access to all tables
- Can create, edit, and delete workers
- Can access the Users page

### Worker
- Created by owners through the Users page
- Currently has no specific permissions (will be implemented later)
- Cannot access the Users page

## Testing

1. Create an owner account as described above
2. Log in with the owner credentials
3. Navigate to the Users page (should be visible in sidebar)
4. Create a worker account
5. Log out and log in with worker credentials
6. Verify worker cannot access Users page

## Troubleshooting

### "Not authorized" errors
- Check that RLS policies are enabled on all tables
- Verify the owner's `auth_user_id` matches the Supabase Auth user ID
- Check that the user's role is set to 'owner' in the users table

### Cannot create workers
- Ensure email confirmation is disabled (for development)
- Check that you're logged in as an owner
- Verify the owner has the correct role in the users table

### Workers cannot log in
- Check that the worker was created successfully in both auth.users and users tables
- Verify the auth_user_id matches between tables
- Check email confirmation status if enabled

## Next Steps

- [ ] Implement worker-specific RLS policies
- [ ] Add password reset functionality
- [ ] Create Edge Function for secure user management
- [ ] Add user activity logging
- [ ] Implement role-based UI restrictions

