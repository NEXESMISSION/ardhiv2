# Data Migration Guide

## Overview

This guide explains how to migrate client data from the old database to the new web application.

## Migration Files

1. **`docs/sql/migrate_clients_data.sql`** - Generated SQL file with all INSERT statements
2. **`scripts/migrate-clients.js`** - Script used to generate the SQL file from JSON data

## Field Mapping

The migration script automatically maps fields from the old database structure to the new one:

| Old Field | New Field | Notes |
|-----------|-----------|-------|
| `cin` | `id_number` | Normalized to exactly 8 characters |
| `name` | `name` | Truncated to 255 characters if needed |
| `phone` | `phone` | Truncated to 50 characters if needed. Missing values replaced with "N/A" |
| `email` | `email` | Preserved as-is (nullable) |
| `address` | `address` | Preserved as-is (nullable) |
| `notes` | `notes` | Preserved as-is (nullable) |
| `client_type` | `type` | Converted to lowercase: "Individual" → "individual", "Company" → "company" |
| `created_at` | `created_at` | Preserved as-is |
| `updated_at` | `updated_at` | Preserved as-is |
| `id` | *(not migrated)* | New UUIDs are auto-generated |
| `created_by` | *(not migrated)* | Field doesn't exist in new structure |

## How to Run the Migration

### Option 1: Using Supabase SQL Editor (Recommended)

1. Open your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open the file `docs/sql/migrate_clients_data.sql`
4. Copy the entire contents
5. Paste into the SQL Editor
6. Click **Run** to execute

### Option 2: Using psql Command Line

```bash
psql -h your-db-host -U your-username -d your-database -f docs/sql/migrate_clients_data.sql
```

### Option 3: Using Database Client

1. Open your database client (pgAdmin, DBeaver, etc.)
2. Connect to your database
3. Open and execute `docs/sql/migrate_clients_data.sql`

## Important Notes

### Data Safety

- The migration uses `ON CONFLICT (id_number) DO UPDATE` to handle duplicates
- If a client with the same `id_number` already exists, it will be updated with the new data
- The migration is wrapped in a transaction (`BEGIN`/`COMMIT`) for safety
- If any error occurs, you can rollback the entire migration

### Validation

- All `id_number` values are normalized to exactly 8 characters
- Missing phone numbers are replaced with "N/A" (since phone is required)
- Client types are converted to lowercase
- Names and phones are truncated if they exceed length limits

### After Migration

1. **Verify the data**: Check that all clients were imported correctly
   ```sql
   SELECT COUNT(*) FROM clients;
   -- Should match the number of records migrated (1218)
   ```

2. **Check for duplicates**: Verify no duplicate id_numbers exist
   ```sql
   SELECT id_number, COUNT(*) 
   FROM clients 
   GROUP BY id_number 
   HAVING COUNT(*) > 1;
   -- Should return no rows
   ```

3. **Verify client types**: Check that all types are lowercase
   ```sql
   SELECT DISTINCT type FROM clients;
   -- Should only show 'individual' and 'company'
   ```

## Regenerating the Migration File

If you need to regenerate the SQL file (e.g., after fixing data in MIGRATION-DATA.md):

```bash
node scripts/migrate-clients.js
```

This will:
- Read data from `MIGRATION-DATA.md`
- Parse the JSON
- Map fields correctly
- Generate `docs/sql/migrate_clients_data.sql`

## Troubleshooting

### Error: "duplicate key value violates unique constraint"

This means a client with the same `id_number` already exists. The migration script uses `ON CONFLICT` to handle this by updating existing records.

### Error: "value too long for type character varying"

This shouldn't happen as the script truncates values, but if it does, check the specific field and adjust the truncation logic in the script.

### Missing Data

If some records are missing after migration:
1. Check the error log in the SQL file (at the bottom)
2. Verify the source data in `MIGRATION-DATA.md`
3. Re-run the migration script if needed

## Migration Statistics

- **Total Records**: 1218 clients
- **Successfully Processed**: 1218
- **Errors**: 0
- **Records with Missing Phone**: 2 (replaced with "N/A")

## Next Steps

After successfully migrating clients, you may need to migrate:
- Land batches
- Land pieces
- Sales records (if applicable)

