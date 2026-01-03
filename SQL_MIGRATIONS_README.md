# SQL Migrations Guide

This directory contains all SQL migration scripts for the FULLLANDDEV database. Each script is documented with clear structure and purpose.

## 📁 File Structure

### Core Schema
- **`supabase_schema.sql`** - Main database schema (run this first!)
  - Creates all tables, enums, functions, triggers, and RLS policies
  - This is the foundation - run this before any other migrations

### Security & Constraints
- **`security_database_fixes.sql`** - Security enhancements
  - Adds database constraints for input validation
  - Completes audit trail with missing triggers
  - Adds server-side validation functions
  - **Run after:** `supabase_schema.sql`

### Feature Migrations (Historical - for reference)
These migrations were used during development. They're kept for reference but are likely already applied:

- **`create_debts_table.sql`** - Creates debts table for debt management
- **`add_debt_payments_table.sql`** - Creates debt_payments table
- **`add_real_estate_tax_number.sql`** - Adds real_estate_tax_number to land_batches
- **`fix_sales_confirmation.sql`** - Adds is_confirmed field to sales
- **`sales_enhancement_migration.sql`** - Comprehensive sales tracking enhancements
- **`split_multipiece_sales.sql`** - Splits multi-piece sales into individual records

### Data Management Scripts
- **`database_full_reset.sql`** - Full reset (deletes everything except users/roles)
- **`database_full_reset_keep_users.sql`** - Reset keeping users and roles
- **`database_full_reset_with_test_data.sql`** - Reset with test data
- **`database_reset_keep_land_clients.sql`** - Reset keeping clients and land data
- **`database_cleanup.sql`** - Cleanup script for test data
- **`fix_sale_prices.sql`** - Diagnostic script for price issues

## 🚀 Quick Start

### For New Database Setup:
```sql
1. Run: supabase_schema.sql
2. Run: security_database_fixes.sql
3. (Optional) Run: create_debts_table.sql
4. (Optional) Run: add_debt_payments_table.sql
```

### For Existing Database:
```sql
1. Check which migrations you've already run
2. Run any missing migrations in order
3. Always run: security_database_fixes.sql (if not already applied)
```

## 📝 Migration Order

1. **supabase_schema.sql** (Foundation)
2. **security_database_fixes.sql** (Security enhancements)
3. **create_debts_table.sql** (If using debt management)
4. **add_debt_payments_table.sql** (If using debt management)
5. Other feature migrations as needed

## ⚠️ Important Notes

- **Always backup** before running reset scripts
- **Test migrations** in a development environment first
- **Check dependencies** - some migrations depend on others
- **Read comments** in each SQL file for detailed information

## 🔍 Understanding the Structure

Each SQL file follows this structure:
```sql
-- ============================================
-- TITLE AND PURPOSE
-- Brief description of what this script does
-- ============================================

-- Step-by-step operations with comments
-- Verification queries at the end
-- Clear documentation of what's changed
```

## 📚 For Future Developers

- **Don't modify** `supabase_schema.sql` - it's the source of truth
- **Create new migration files** for schema changes
- **Document changes** clearly in comments
- **Test thoroughly** before applying to production
- **Keep migrations atomic** - one logical change per file

