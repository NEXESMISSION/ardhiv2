# Security Architecture - Comprehensive Access Control

## Overview

This system implements **multi-layer security** with **database-level enforcement** to prevent any workarounds. All access control is enforced at the **Row Level Security (RLS)** level in PostgreSQL, making it impossible to bypass restrictions even if the UI is manipulated.

## Security Layers

### 1. Authentication Layer
- **Supabase Auth**: All users must authenticate
- **Session Management**: Tokens are validated on every request
- **No Anonymous Access**: All tables require authentication

### 2. Authorization Layer (Database Level - RLS)

#### Page-Level Access Control
Every operation checks if the user has access to the required page:
- **'land'** → Required for: `land_batches`, `land_pieces`, `sales`, `payment_offers`
- **'clients'** → Required for: `clients`
- **'installments'** → Required for: `installment_payments`
- **'appointments'** → Required for: `appointments`
- **'phone-call-appointments'** → Required for: `phone_call_appointments`
- **'contract-writers'** → Required for: `contract_writers`
- **'users'** → Required for: `users` (except viewing own profile)

#### Resource-Level Access Control
- **Batch Access**:** Users can only access batches in their `allowed_batches` array
- **Piece Access**: Users can only access pieces in their `allowed_pieces` array (or all pieces in allowed batches if `allowed_pieces` is empty)

### 3. Role-Based Access Control

#### Owners
- **Full Access**: Bypass all checks
- **Can Manage**: All tables, all operations
- **No Restrictions**: Owners have complete control

#### Workers
- **Restricted Access**: Must pass all checks
- **Page Access Required**: Must have page in `allowed_pages` array
- **Resource Access Required**: Must have batch/piece in `allowed_batches`/`allowed_pieces` arrays
- **Limited Operations**: Can only perform allowed operations (e.g., can't create batches/pieces)

## Security Functions

### `is_current_user_owner()`
- Checks if current user is an owner
- Returns `TRUE` for owners (bypasses all checks)
- Returns `FALSE` for workers or unauthenticated users

### `is_current_user_authenticated()`
- Checks if current user is authenticated
- Returns `TRUE` if user exists in `users` table
- Returns `FALSE` if not authenticated

### `user_has_page_access(required_page TEXT)`
- Checks if user has access to a specific page
- Returns `TRUE` for owners
- Returns `TRUE` for workers if `required_page` is in `allowed_pages` array
- Returns `FALSE` otherwise

### `worker_has_batch_access(batch_id_param UUID)`
- Checks if worker has access to a specific batch
- Returns `TRUE` for owners
- Returns `TRUE` for workers if `batch_id` is in `allowed_batches` array
- Returns `FALSE` otherwise

### `worker_has_piece_access(piece_id_param UUID)`
- Checks if worker has access to a specific piece
- Returns `TRUE` for owners
- Returns `TRUE` for workers if:
  - Piece's batch is in `allowed_batches` AND
  - (`allowed_pieces` is empty OR piece is in `allowed_pieces`)
- Returns `FALSE` otherwise

## Security Enforcement Examples

### Example 1: Worker Without 'land' Page Access
```sql
-- Worker tries to query land_batches
SELECT * FROM land_batches;
-- Result: EMPTY (RLS policy blocks access)

-- Worker tries to query land_pieces
SELECT * FROM land_pieces;
-- Result: EMPTY (RLS policy blocks access)

-- Worker tries to create a sale
INSERT INTO sales (land_piece_id, ...) VALUES (...);
-- Result: ERROR (RLS policy blocks insert)
```

### Example 2: Worker With 'land' Page But No Batch Access
```sql
-- Worker has 'land' in allowed_pages but batch_id not in allowed_batches
SELECT * FROM land_batches WHERE id = 'some-batch-id';
-- Result: EMPTY (RLS policy blocks - batch not in allowed_batches)

-- Worker tries to query pieces in that batch
SELECT * FROM land_pieces WHERE batch_id = 'some-batch-id';
-- Result: EMPTY (RLS policy blocks - batch not accessible)
```

### Example 3: Worker With Batch Access But No Piece Access
```sql
-- Worker has batch in allowed_batches but specific piece not in allowed_pieces
SELECT * FROM land_pieces WHERE id = 'restricted-piece-id';
-- Result: EMPTY (RLS policy blocks - piece not in allowed_pieces)

-- Worker tries to create sale for that piece
INSERT INTO sales (land_piece_id, ...) VALUES ('restricted-piece-id', ...);
-- Result: ERROR (RLS policy blocks - piece not accessible)
```

## Installation Order

**IMPORTANT**: Run these SQL files in this exact order:

1. **First**: `docs/sql/secure_worker_restrictions.sql`
   - Creates helper functions for batch/piece access
   - Sets up basic RLS policies for batches and pieces

2. **Second**: `docs/sql/comprehensive_security_policies.sql`
   - Creates `user_has_page_access()` function
   - Updates all RLS policies to include page-level checks
   - Ensures all operations check page access

3. **Third**: `docs/sql/add_allowed_pieces.sql` (if not already run)
   - Adds `allowed_pieces` column to `users` table

## Security Guarantees

✅ **No UI Bypass**: Even if someone manipulates the frontend, database rejects unauthorized access

✅ **No Direct API Access**: Supabase client library enforces RLS policies automatically

✅ **No SQL Injection**: All checks use parameterized functions, not string concatenation

✅ **No Race Conditions**: Functions use `SECURITY DEFINER` with proper locking

✅ **No Privilege Escalation**: Workers cannot become owners through any operation

✅ **Comprehensive Coverage**: All tables have appropriate RLS policies

## Testing Security

To verify security is working:

1. **Create a test worker** without 'land' page access
2. **Try to query** `land_batches` - should return empty
3. **Try to query** `land_pieces` - should return empty
4. **Try to create** a sale - should fail with permission error
5. **Try to update** a piece - should fail with permission error

## Maintenance

- **Adding New Tables**: Update `comprehensive_security_policies.sql` with appropriate policies
- **Adding New Pages**: Update `user_has_page_access()` function if needed
- **Changing Access Logic**: Update helper functions, all policies will automatically use new logic

## Notes

- All security functions use `SECURITY DEFINER` to bypass RLS when checking user permissions
- This prevents infinite recursion when RLS policies check user permissions
- Functions are marked as `STABLE` for query optimization
- All checks happen at the database level - no client-side security

