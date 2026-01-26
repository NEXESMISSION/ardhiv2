# Complete Authentication Workflow

## Overview

This document describes the complete secure authentication workflow implemented in the Land Management System.

## Architecture

### Components

1. **AuthContext** (`src/contexts/AuthContext.tsx`)
   - Manages authentication state
   - Handles login/logout
   - Loads system user data
   - Provides `useAuth` hook

2. **Login Page** (`src/pages/Login.tsx`)
   - Secure login form
   - Password visibility toggle
   - Error handling with Arabic messages
   - Form validation

3. **Protected Routes** (`src/App.tsx`)
   - Redirects to login if not authenticated
   - Shows loading states
   - Handles session validation

4. **RLS Policies** (`docs/sql/create_users_table.sql`)
   - Row Level Security on all tables
   - Owner-only access
   - Helper function to avoid recursion

## Authentication Flow

### 1. Initial Load

```
User visits app
  ↓
AuthContext checks session
  ↓
If session exists → Load system user
  ↓
If no session → Show login page
```

### 2. Login Process

```
User enters credentials
  ↓
Form validation (client-side)
  ↓
Call signIn(email, password)
  ↓
Supabase auth.signInWithPassword()
  ↓
If success → Load system user from users table
  ↓
If system user found → Redirect to home
  ↓
If system user not found → Sign out and show error
```

### 3. Session Management

- Sessions are persisted automatically by Supabase
- Auto-refresh tokens enabled
- Session expiry handled automatically
- On expiry, user is signed out

### 4. Logout Process

```
User clicks logout
  ↓
Call signOut()
  ↓
Supabase auth.signOut()
  ↓
Clear user state
  ↓
Redirect to login
```

## Security Features

### 1. Row Level Security (RLS)

All tables have RLS enabled with policies:
- **Owners**: Full access to all tables
- **Workers**: (To be implemented)

**Important**: Uses `is_current_user_owner()` function with `SECURITY DEFINER` to avoid infinite recursion.

### 2. Password Security

- Passwords are never logged
- Cleared from form on error
- Minimum 6 characters (enforced client-side)
- Stored securely by Supabase Auth

### 3. Error Handling

- All errors translated to Arabic
- User-friendly messages
- No sensitive information exposed
- Network errors handled gracefully

### 4. Session Security

- Sessions stored securely by Supabase
- Auto-refresh enabled
- Expired sessions automatically cleared
- No session data in localStorage (handled by Supabase)

## Error Messages

All authentication errors are translated to Arabic:

| Error | Arabic Message |
|-------|----------------|
| Invalid credentials | البريد الإلكتروني أو كلمة المرور غير صحيحة |
| Email not confirmed | يرجى تأكيد بريدك الإلكتروني قبل تسجيل الدخول |
| Too many requests | تم تجاوز عدد المحاولات المسموح بها. يرجى المحاولة لاحقاً |
| Network error | فشل الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت |
| User not found | المستخدم غير موجود |

## Database Setup

### Step 1: Run SQL Script

```sql
-- Run docs/sql/create_users_table.sql
-- This creates:
-- - users table
-- - RLS policies
-- - Helper functions
```

### Step 2: Create Owner Account

1. Create user in Supabase Auth Dashboard
2. Copy the User ID
3. Insert into users table:

```sql
INSERT INTO users (email, role, auth_user_id) 
VALUES ('owner@example.com', 'owner', '<user_id_from_auth>');
```

### Step 3: Fix RLS Recursion (if needed)

If you see "infinite recursion" error:

```sql
-- Run docs/sql/fix_rls_recursion.sql
```

## Troubleshooting

### "Infinite recursion detected in policy"

**Cause**: RLS policy queries users table, which triggers the same policy.

**Fix**: Run `docs/sql/fix_rls_recursion.sql` to use the helper function.

### "User authenticated but not found in system"

**Cause**: User exists in auth.users but not in users table.

**Fix**: Insert user record in users table with matching auth_user_id.

### "Session expired" errors

**Cause**: Token expired or invalid.

**Fix**: User will be automatically signed out. They need to log in again.

### Cannot log in after creating account

**Possible causes**:
1. Email confirmation required (disable in Supabase settings for development)
2. User not in users table
3. Wrong credentials

**Fix**: 
- Check Supabase Auth settings
- Verify user exists in users table
- Check credentials

## Best Practices

1. **Never expose service role key** in client-side code
2. **Always validate** user exists in users table after auth
3. **Handle errors gracefully** with user-friendly messages
4. **Clear sensitive data** (passwords) on errors
5. **Use helper functions** for RLS to avoid recursion
6. **Test authentication flow** after any RLS changes

## Future Enhancements

- [ ] Password reset functionality
- [ ] Email verification flow
- [ ] Two-factor authentication
- [ ] Session timeout warnings
- [ ] Remember me functionality
- [ ] Worker-specific RLS policies
- [ ] Activity logging
- [ ] Failed login attempt tracking

