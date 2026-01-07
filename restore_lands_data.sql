-- ============================================
-- RESTORE SCRIPT FOR LANDS DATA
-- ============================================
-- This script restores data from backup tables
-- Use this if you need to restore after running clear_database_keep_lands.sql
-- ============================================
-- IMPORTANT: Only run this if backup tables exist!
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: Restore land_batches
-- ============================================
-- Check if backup table exists and restore
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'land_batches_backup') THEN
        -- Delete existing data first (optional - comment out if you want to keep existing)
        -- DELETE FROM land_batches;
        
        -- Restore from backup
        INSERT INTO land_batches (
            id, name, total_surface, total_cost, date_acquired, 
            real_estate_tax_number, location, notes, created_by, created_at, updated_at
        )
        SELECT 
            id, name, total_surface, total_cost, date_acquired,
            real_estate_tax_number, location, notes, created_by, created_at, updated_at
        FROM land_batches_backup
        ON CONFLICT (id) DO NOTHING; -- Skip if already exists
        
        RAISE NOTICE 'Restored % land batches', (SELECT COUNT(*) FROM land_batches_backup);
    ELSE
        RAISE EXCEPTION 'Backup table land_batches_backup does not exist!';
    END IF;
END $$;

-- ============================================
-- STEP 2: Restore land_pieces
-- ============================================
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'land_pieces_backup') THEN
        -- Delete existing data first (optional - comment out if you want to keep existing)
        -- DELETE FROM land_pieces;
        
        -- Restore from backup
        INSERT INTO land_pieces (
            id, land_batch_id, piece_number, surface_area, purchase_cost,
            selling_price_full, selling_price_installment, status, reserved_until,
            reservation_client_id, notes, created_at, updated_at
        )
        SELECT 
            id, land_batch_id, piece_number, surface_area, purchase_cost,
            selling_price_full, selling_price_installment, status, reserved_until,
            reservation_client_id, notes, created_at, updated_at
        FROM land_pieces_backup
        ON CONFLICT (land_batch_id, piece_number) DO NOTHING; -- Skip if already exists
        
        RAISE NOTICE 'Restored % land pieces', (SELECT COUNT(*) FROM land_pieces_backup);
    ELSE
        RAISE EXCEPTION 'Backup table land_pieces_backup does not exist!';
    END IF;
END $$;

-- ============================================
-- STEP 3: Restore payment_offers
-- ============================================
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'payment_offers_backup') THEN
        -- Delete existing data first (optional - comment out if you want to keep existing)
        -- DELETE FROM payment_offers;
        
        -- Restore from backup
        INSERT INTO payment_offers (
            id, land_batch_id, land_piece_id, price_per_m2_installment,
            company_fee_percentage, advance_amount, advance_is_percentage,
            monthly_payment, number_of_months, offer_name, notes, is_default,
            created_by, created_at, updated_at
        )
        SELECT 
            id, land_batch_id, land_piece_id, price_per_m2_installment,
            company_fee_percentage, advance_amount, advance_is_percentage,
            monthly_payment, number_of_months, offer_name, notes, is_default,
            created_by, created_at, updated_at
        FROM payment_offers_backup
        ON CONFLICT (id) DO NOTHING; -- Skip if already exists
        
        RAISE NOTICE 'Restored % payment offers', (SELECT COUNT(*) FROM payment_offers_backup);
    ELSE
        RAISE EXCEPTION 'Backup table payment_offers_backup does not exist!';
    END IF;
END $$;

COMMIT;

-- ============================================
-- VERIFICATION
-- ============================================
-- Check restored data counts
SELECT 
    'Restored' as status,
    (SELECT COUNT(*) FROM land_batches) as land_batches_count,
    (SELECT COUNT(*) FROM land_pieces) as land_pieces_count,
    (SELECT COUNT(*) FROM payment_offers) as payment_offers_count
UNION ALL
SELECT 
    'Backup' as status,
    (SELECT COUNT(*) FROM land_batches_backup) as land_batches_count,
    (SELECT COUNT(*) FROM land_pieces_backup) as land_pieces_count,
    (SELECT COUNT(*) FROM payment_offers_backup) as payment_offers_count;

-- ============================================
-- NOTES:
-- ============================================
-- 1. This script uses ON CONFLICT DO NOTHING to avoid duplicates
-- 2. If you want to replace existing data, uncomment the DELETE statements
-- 3. Make sure backup tables exist before running this script
-- 4. The script is wrapped in a transaction for safety
-- ============================================

