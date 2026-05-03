# SQL Files Documentation

This directory contains essential SQL files for understanding and setting up the database structure.

## 📁 Essential Files (KEPT)

### Core Schema Files

1. **`database_schema.sql`** ⭐
   - **Purpose**: Complete database schema with all tables, indexes, and constraints
   - **Use**: Reference for understanding the database structure
   - **When to use**: When setting up a new database or understanding the schema

2. **`clean_database_setup.sql`**
   - **Purpose**: Clean database setup with sample test data
   - **Use**: Setting up a fresh database with test data
   - **When to use**: For development/testing environments

### Table Creation Files

3. **`create_appointments_table.sql`**
   - **Purpose**: Creates the appointments table structure
   - **Use**: Reference for appointments table schema

4. **`create_phone_call_appointments_table.sql`**
   - **Purpose**: Creates the phone call appointments table structure
   - **Use**: Reference for phone call appointments table schema

### Migration History Files (Important for Understanding Changes)

5. **`add_deposit_column.sql`**
   - **Purpose**: Adds deposit_amount column to sales table
   - **Use**: Reference for understanding schema evolution

6. **`update_database_for_promise_sales.sql`**
   - **Purpose**: Updates database to support promise sales
   - **Use**: Reference for understanding schema evolution

7. **`update_phone_call_appointments_type.sql`**
   - **Purpose**: Updates phone call appointments table type
   - **Use**: Reference for understanding schema evolution

8. **`remove_company_fee_migration.sql`**
   - **Purpose**: Removes company_fee_percent_cash column
   - **Use**: Reference for understanding schema evolution

### Additional Structure Files

9. **`contract_writers_table.sql`**
   - **Purpose**: Creates contract_writers table structure
   - **Use**: Reference for contract_writers table schema

10. **`installment_payments_table.sql`**
    - **Purpose**: Creates installment_payments table structure
    - **Use**: Reference for installment_payments table schema

11. **`fix_payment_method_constraint.sql`**
    - **Purpose**: Fixes payment_method constraint
    - **Use**: Reference for understanding constraints

## 📊 Summary

**Total Files Kept:** 11 SQL files
- 1 Core schema file (`database_schema.sql`)
- 1 Setup file (`clean_database_setup.sql`)
- 2 Table creation files (appointments)
- 4 Migration history files (schema evolution)
- 3 Additional structure files (tables and constraints)

**Total Files Deleted:** ~30+ files
- All one-time migration files
- All reset/cleanup files
- All test/development files

## 🗑️ Deleted Files

The following types of files have been removed as they were one-time use:

### Migration Files (Already Executed)
- All `migrate_*` files (clients, batches, pieces)
- All chunk files (`migrate_pieces_chunk_*.sql`)
- All data part files (`migrate_pieces_data_part_*.sql`)

### Reset/Cleanup Files (One-Time Use)
- All `reset_*` files
- All `clean_*` files
- All `quick_*` files
- All `full_reset_*` files

### Test/Development Files
- All `test_*` files
- `create_fresh_data.sql`
- `simple_fix.sql`
- `manual_insert_guide.sql`
- `database_migration.sql`

## 📝 Usage Guidelines

### Setting Up a New Database

1. Run `database_schema.sql` to create all tables
2. (Optional) Run `clean_database_setup.sql` for test data

### Understanding the Schema

- Start with `database_schema.sql` for the complete structure
- Check migration files to understand schema evolution
- Refer to table-specific creation files for detailed table structures

### Making Schema Changes

1. Create a new migration file following the naming pattern: `migration_description.sql`
2. Document the change in this README
3. Update `database_schema.sql` to reflect the new structure

## 🔄 Schema Evolution History

The database schema has evolved over time. Key changes are documented in:

- `add_deposit_column.sql` - Added deposit support
- `update_database_for_promise_sales.sql` - Added promise sales support
- `remove_company_fee_migration.sql` - Removed company fee column
- `update_phone_call_appointments_type.sql` - Updated appointments type

## 📚 Related Documentation

- See `DOCUMENTATION.md` in the root directory for complete system documentation
- See `docs/MIGRATION_GUIDE.md` for data migration information (if needed)

