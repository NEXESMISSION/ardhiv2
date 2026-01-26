# SQL Data Extraction Request

## Context

I am working on migrating data from an **old web application** to a **new web application**. The old application has a different database structure than the new one I'm currently working on.

**IMPORTANT**: You have access to the **OLD PROJECT** structure only. The new project structure is different and you don't have access to it. Please base your SQL queries on the **OLD PROJECT's database schema** that you have access to.

## What I Need

I need SQL queries to extract all data from the old database for the following entities:

1. **Clients** - All client records
2. **Land Batches** - All land batch records  
3. **Land Pieces** - All land piece records

## New Project Structure (For Reference Only)

The new project uses the following table structures. This is provided **only for reference** to understand what data I'm trying to migrate to. **DO NOT use this structure** - use the old project structure you have access to.

### New Project: `clients` table
- `id` (UUID)
- `id_number` (VARCHAR(8))
- `name` (VARCHAR(255))
- `phone` (VARCHAR(50))
- `email` (VARCHAR(255), nullable)
- `address` (TEXT, nullable)
- `notes` (TEXT, nullable)
- `type` (VARCHAR(20): 'individual' or 'company')
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### New Project: `land_batches` table
- `id` (UUID)
- `name` (VARCHAR(255))
- `location` (VARCHAR(255), nullable)
- `title_reference` (VARCHAR(255), nullable)
- `price_per_m2_cash` (DECIMAL(15,2), nullable)
- `company_fee_percent_cash` (DECIMAL(5,2), nullable)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### New Project: `land_pieces` table
- `id` (UUID)
- `batch_id` (UUID, foreign key to land_batches)
- `piece_number` (VARCHAR(50))
- `surface_m2` (DECIMAL(10,2))
- `notes` (TEXT, nullable)
- `direct_full_payment_price` (DECIMAL(15,2), nullable)
- `status` (VARCHAR(20): 'Available', 'Reserved', or 'Sold')
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

## Request

Please provide SQL SELECT queries that will extract:

1. **All clients** from the old database (use the old project's client table structure)
2. **All land batches** from the old database (use the old project's batch table structure)
3. **All land pieces** from the old database (use the old project's pieces table structure)

The queries should return all columns from each table so I can map the data appropriately during migration.

**Remember**: Use the OLD PROJECT's table names and column names, not the new project structure shown above. The new project structure is only provided as a reference to understand the target format.

