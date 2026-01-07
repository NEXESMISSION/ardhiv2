-- ============================================
-- DELETE ALL PIECES FROM BATCH: "Terrain agricole"
-- ============================================
-- This script will:
-- 1. Delete all land_pieces from "Terrain agricole" batch
-- 2. Keep the batch (land_batches) intact
-- 3. Keep batch-level payment_offers (offers linked to batch, not pieces)
--
-- IMPORTANT: 
-- - This will delete ALL pieces from "Terrain agricole" batch
-- - Payment offers linked to pieces will be deleted automatically (CASCADE)
-- - Payment offers linked to the batch will be kept
-- ============================================

BEGIN;

-- Step 1: Delete all pieces from "Terrain agricole" batch
-- This will automatically delete piece-level offers (CASCADE)
DELETE FROM land_pieces
WHERE land_batch_id = (
    SELECT id FROM land_batches WHERE name = 'Terrain agricole'
);

COMMIT;

-- ============================================
-- VERIFICATION QUERIES (Run these after to verify)
-- ============================================

-- 1. Check remaining pieces (should be 0)
SELECT 
    'Remaining pieces' as status,
    COUNT(*) as count
FROM land_pieces
WHERE land_batch_id = (
    SELECT id FROM land_batches WHERE name = 'Terrain agricole'
);

-- 2. Check batch still exists (should show 1 row)
SELECT 
    'Batch exists' as status,
    id,
    name,
    total_surface,
    total_cost,
    created_at
FROM land_batches
WHERE name = 'Terrain agricole';

-- 3. Check batch offers still exist (should show all batch-level offers)
SELECT 
    'Batch offers kept' as status,
    COUNT(*) as count
FROM payment_offers
WHERE land_batch_id = (
    SELECT id FROM land_batches WHERE name = 'Terrain agricole'
)
AND land_piece_id IS NULL;

-- 4. List all batch offers (to verify they are kept)
SELECT 
    id,
    offer_name,
    price_per_m2_installment,
    company_fee_percentage,
    advance_amount,
    monthly_payment,
    is_default
FROM payment_offers
WHERE land_batch_id = (
    SELECT id FROM land_batches WHERE name = 'Terrain agricole'
)
AND land_piece_id IS NULL
ORDER BY created_at;

