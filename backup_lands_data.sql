-- ============================================
-- BACKUP SCRIPT FOR LANDS DATA
-- ============================================
-- This script creates a complete backup of:
-- 1. land_batches (all batches with all details)
-- 2. land_pieces (all pieces with all details)
-- 3. payment_offers (all offers for batches and pieces)
-- ============================================
-- IMPORTANT: Run this BEFORE running clear_database_keep_lands.sql
-- ============================================

-- ============================================
-- STEP 1: Create backup tables
-- ============================================

-- Backup table for land_batches
CREATE TABLE IF NOT EXISTS land_batches_backup AS
SELECT * FROM land_batches;

-- Backup table for land_pieces
CREATE TABLE IF NOT EXISTS land_pieces_backup AS
SELECT * FROM land_pieces;

-- Backup table for payment_offers
CREATE TABLE IF NOT EXISTS payment_offers_backup AS
SELECT * FROM payment_offers;

-- ============================================
-- STEP 2: Export data as INSERT statements
-- ============================================
-- This will generate SQL INSERT statements that you can save to a file

-- Export land_batches as INSERT statements
SELECT 
    'INSERT INTO land_batches_backup (id, name, total_surface, total_cost, date_acquired, real_estate_tax_number, location, notes, created_by, created_at, updated_at) VALUES (' ||
    '''' || id || ''', ' ||
    '''' || REPLACE(name, '''', '''''') || ''', ' ||
    COALESCE(total_surface::text, 'NULL') || ', ' ||
    COALESCE(total_cost::text, 'NULL') || ', ' ||
    '''' || date_acquired || ''', ' ||
    COALESCE('''' || REPLACE(real_estate_tax_number, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(location, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(notes, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || created_by || '''', 'NULL') || ', ' ||
    '''' || created_at || ''', ' ||
    '''' || updated_at || ''');' as backup_sql
FROM land_batches
ORDER BY created_at;

-- Export land_pieces as INSERT statements
SELECT 
    'INSERT INTO land_pieces_backup (id, land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status, reserved_until, reservation_client_id, notes, created_at, updated_at) VALUES (' ||
    '''' || id || ''', ' ||
    '''' || land_batch_id || ''', ' ||
    '''' || REPLACE(piece_number, '''', '''''') || ''', ' ||
    COALESCE(surface_area::text, 'NULL') || ', ' ||
    COALESCE(purchase_cost::text, 'NULL') || ', ' ||
    COALESCE(selling_price_full::text, 'NULL') || ', ' ||
    COALESCE(selling_price_installment::text, 'NULL') || ', ' ||
    '''' || status || ''', ' ||
    COALESCE('''' || reserved_until || '''', 'NULL') || ', ' ||
    COALESCE('''' || reservation_client_id || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(notes, '''', '''''') || '''', 'NULL') || ', ' ||
    '''' || created_at || ''', ' ||
    '''' || updated_at || ''');' as backup_sql
FROM land_pieces
ORDER BY land_batch_id, piece_number;

-- Export payment_offers as INSERT statements
SELECT 
    'INSERT INTO payment_offers_backup (id, land_batch_id, land_piece_id, price_per_m2_installment, company_fee_percentage, advance_amount, advance_is_percentage, monthly_payment, number_of_months, offer_name, notes, is_default, created_by, created_at, updated_at) VALUES (' ||
    '''' || id || ''', ' ||
    COALESCE('''' || land_batch_id || '''', 'NULL') || ', ' ||
    COALESCE('''' || land_piece_id || '''', 'NULL') || ', ' ||
    COALESCE(price_per_m2_installment::text, 'NULL') || ', ' ||
    COALESCE(company_fee_percentage::text, 'NULL') || ', ' ||
    COALESCE(advance_amount::text, 'NULL') || ', ' ||
    COALESCE(advance_is_percentage::text, 'NULL') || ', ' ||
    COALESCE(monthly_payment::text, 'NULL') || ', ' ||
    COALESCE(number_of_months::text, 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(offer_name, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(notes, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE(is_default::text, 'NULL') || ', ' ||
    COALESCE('''' || created_by || '''', 'NULL') || ', ' ||
    '''' || created_at || ''', ' ||
    '''' || updated_at || ''');' as backup_sql
FROM payment_offers
ORDER BY COALESCE(land_batch_id, land_piece_id), created_at;

-- ============================================
-- STEP 3: Alternative - Export as JSON (easier to read)
-- ============================================

-- Export land_batches as JSON
SELECT 
    json_agg(
        json_build_object(
            'id', id,
            'name', name,
            'total_surface', total_surface,
            'total_cost', total_cost,
            'date_acquired', date_acquired,
            'real_estate_tax_number', real_estate_tax_number,
            'location', location,
            'notes', notes,
            'created_by', created_by,
            'created_at', created_at,
            'updated_at', updated_at
        )
    ) as land_batches_json
FROM land_batches;

-- Export land_pieces as JSON
SELECT 
    json_agg(
        json_build_object(
            'id', id,
            'land_batch_id', land_batch_id,
            'piece_number', piece_number,
            'surface_area', surface_area,
            'purchase_cost', purchase_cost,
            'selling_price_full', selling_price_full,
            'selling_price_installment', selling_price_installment,
            'status', status,
            'reserved_until', reserved_until,
            'reservation_client_id', reservation_client_id,
            'notes', notes,
            'created_at', created_at,
            'updated_at', updated_at
        )
    ) as land_pieces_json
FROM land_pieces;

-- Export payment_offers as JSON
SELECT 
    json_agg(
        json_build_object(
            'id', id,
            'land_batch_id', land_batch_id,
            'land_piece_id', land_piece_id,
            'price_per_m2_installment', price_per_m2_installment,
            'company_fee_percentage', company_fee_percentage,
            'advance_amount', advance_amount,
            'advance_is_percentage', advance_is_percentage,
            'monthly_payment', monthly_payment,
            'number_of_months', number_of_months,
            'offer_name', offer_name,
            'notes', notes,
            'is_default', is_default,
            'created_by', created_by,
            'created_at', created_at,
            'updated_at', updated_at
        )
    ) as payment_offers_json
FROM payment_offers;

-- ============================================
-- STEP 4: Verification - Count records
-- ============================================

-- Verify backup counts match original
SELECT 
    'Original' as source,
    (SELECT COUNT(*) FROM land_batches) as land_batches_count,
    (SELECT COUNT(*) FROM land_pieces) as land_pieces_count,
    (SELECT COUNT(*) FROM payment_offers) as payment_offers_count
UNION ALL
SELECT 
    'Backup' as source,
    (SELECT COUNT(*) FROM land_batches_backup) as land_batches_count,
    (SELECT COUNT(*) FROM land_pieces_backup) as land_pieces_count,
    (SELECT COUNT(*) FROM payment_offers_backup) as payment_offers_count;

-- ============================================
-- STEP 5: Detailed backup with relationships
-- ============================================
-- This query shows batches with their pieces and offers

SELECT 
    json_build_object(
        'batch', json_build_object(
            'id', b.id,
            'name', b.name,
            'total_surface', b.total_surface,
            'total_cost', b.total_cost,
            'date_acquired', b.date_acquired,
            'real_estate_tax_number', b.real_estate_tax_number,
            'location', b.location,
            'notes', b.notes,
            'created_by', b.created_by,
            'created_at', b.created_at,
            'updated_at', b.updated_at
        ),
        'pieces', COALESCE(
            (SELECT json_agg(
                json_build_object(
                    'id', p.id,
                    'piece_number', p.piece_number,
                    'surface_area', p.surface_area,
                    'purchase_cost', p.purchase_cost,
                    'selling_price_full', p.selling_price_full,
                    'selling_price_installment', p.selling_price_installment,
                    'status', p.status,
                    'reserved_until', p.reserved_until,
                    'reservation_client_id', p.reservation_client_id,
                    'notes', p.notes,
                    'created_at', p.created_at,
                    'updated_at', p.updated_at,
                    'offers', COALESCE(
                        (SELECT json_agg(
                            json_build_object(
                                'id', o.id,
                                'price_per_m2_installment', o.price_per_m2_installment,
                                'company_fee_percentage', o.company_fee_percentage,
                                'advance_amount', o.advance_amount,
                                'advance_is_percentage', o.advance_is_percentage,
                                'monthly_payment', o.monthly_payment,
                                'number_of_months', o.number_of_months,
                                'offer_name', o.offer_name,
                                'notes', o.notes,
                                'is_default', o.is_default,
                                'created_at', o.created_at,
                                'updated_at', o.updated_at
                            )
                        ) FROM payment_offers o WHERE o.land_piece_id = p.id),
                        '[]'::json
                    )
                )
            ) FROM land_pieces p WHERE p.land_batch_id = b.id),
            '[]'::json
        ),
        'batch_offers', COALESCE(
            (SELECT json_agg(
                json_build_object(
                    'id', o.id,
                    'price_per_m2_installment', o.price_per_m2_installment,
                    'company_fee_percentage', o.company_fee_percentage,
                    'advance_amount', o.advance_amount,
                    'advance_is_percentage', o.advance_is_percentage,
                    'monthly_payment', o.monthly_payment,
                    'number_of_months', o.number_of_months,
                    'offer_name', o.offer_name,
                    'notes', o.notes,
                    'is_default', o.is_default,
                    'created_at', o.created_at,
                    'updated_at', o.updated_at
                )
            ) FROM payment_offers o WHERE o.land_batch_id = b.id),
            '[]'::json
        )
    ) as complete_backup
FROM land_batches b
ORDER BY b.created_at;

-- ============================================
-- NOTES:
-- ============================================
-- 1. The backup tables (land_batches_backup, etc.) are created in your database
-- 2. You can export the INSERT statements to a .sql file
-- 3. You can export the JSON to a .json file
-- 4. The complete_backup query shows everything in a nested structure
-- 5. To restore, you can use the INSERT statements or copy from backup tables
-- ============================================

