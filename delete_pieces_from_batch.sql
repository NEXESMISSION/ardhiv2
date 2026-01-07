-- ============================================
-- DELETE ALL PIECES FROM A SPECIFIC BATCH
-- ============================================
-- This script will:
-- 1. Delete all land_pieces from the batch "Terrain agricole"
-- 2. Keep the batch (land_batches) intact
-- 3. Keep batch-level payment_offers (offers linked to the batch, not to pieces)
--
-- IMPORTANT: 
-- - This will delete ALL pieces from the specified batch
-- - Payment offers linked to pieces will be deleted (CASCADE)
-- - Payment offers linked to the batch will be kept
-- - Run this script in Supabase SQL Editor
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: Find the batch ID
-- ============================================
-- First, let's verify the batch exists and get its ID
DO $$
DECLARE
    batch_id_var UUID;
    pieces_count INTEGER;
    batch_offers_count INTEGER;
    piece_offers_count INTEGER;
BEGIN
    -- Find the batch ID
    SELECT id INTO batch_id_var
    FROM land_batches
    WHERE name = 'Terrain agricole';
    
    IF batch_id_var IS NULL THEN
        RAISE EXCEPTION 'Batch "Terrain agricole" not found!';
    END IF;
    
    -- Count pieces before deletion
    SELECT COUNT(*) INTO pieces_count
    FROM land_pieces
    WHERE land_batch_id = batch_id_var;
    
    -- Count batch-level offers (will be kept)
    SELECT COUNT(*) INTO batch_offers_count
    FROM payment_offers
    WHERE land_batch_id = batch_id_var
    AND land_piece_id IS NULL;
    
    -- Count piece-level offers (will be deleted with pieces)
    SELECT COUNT(*) INTO piece_offers_count
    FROM payment_offers
    WHERE land_piece_id IN (
        SELECT id FROM land_pieces WHERE land_batch_id = batch_id_var
    );
    
    -- Display information
    RAISE NOTICE 'Batch ID: %', batch_id_var;
    RAISE NOTICE 'Pieces to be deleted: %', pieces_count;
    RAISE NOTICE 'Batch offers to be kept: %', batch_offers_count;
    RAISE NOTICE 'Piece offers to be deleted: %', piece_offers_count;
END $$;

-- ============================================
-- STEP 2: Delete all pieces from the batch
-- ============================================
-- This will automatically delete:
-- - All payment_offers linked to these pieces (CASCADE)
-- - All reservations linked to these pieces (if any)
-- - All sales linked to these pieces (if any)
-- But will KEEP:
-- - The batch itself (land_batches)
-- - Payment offers linked to the batch (land_batch_id IS NOT NULL, land_piece_id IS NULL)

DELETE FROM land_pieces
WHERE land_batch_id = (
    SELECT id FROM land_batches WHERE name = 'Terrain agricole'
);

-- ============================================
-- STEP 3: Verification
-- ============================================
-- Run these queries after the script to verify:

-- Check remaining pieces (should be 0)
SELECT 
    'Remaining pieces' as check_type,
    COUNT(*) as count
FROM land_pieces
WHERE land_batch_id = (
    SELECT id FROM land_batches WHERE name = 'Terrain agricole'
);

-- Check batch still exists (should be 1)
SELECT 
    'Batch exists' as check_type,
    COUNT(*) as count,
    name,
    total_surface,
    total_cost
FROM land_batches
WHERE name = 'Terrain agricole';

-- Check batch offers still exist (should be the same count as before)
SELECT 
    'Batch offers kept' as check_type,
    COUNT(*) as count
FROM payment_offers
WHERE land_batch_id = (
    SELECT id FROM land_batches WHERE name = 'Terrain agricole'
)
AND land_piece_id IS NULL;

-- Check piece offers deleted (should be 0)
SELECT 
    'Piece offers deleted' as check_type,
    COUNT(*) as count
FROM payment_offers
WHERE land_piece_id IN (
    SELECT id FROM land_pieces WHERE land_batch_id = (
        SELECT id FROM land_batches WHERE name = 'Terrain agricole'
    )
);

COMMIT;

-- ============================================
-- SUMMARY
-- ============================================
-- After running this script:
-- ✓ All pieces from "Terrain agricole" batch are deleted
-- ✓ The batch "Terrain agricole" is kept
-- ✓ All batch-level payment offers are kept
-- ✓ All piece-level payment offers are deleted (CASCADE)
-- ============================================

