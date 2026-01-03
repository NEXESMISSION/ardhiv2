-- ============================================
-- ADD REAL ESTATE TAX NUMBER TO LAND BATCHES
-- Migration: Add real_estate_tax_number field
-- ============================================
-- Purpose: Adds real estate tax number tracking to land batches
-- Run this in Supabase SQL Editor
-- Dependencies: Requires land_batches table (from supabase_schema.sql)
-- ============================================

ALTER TABLE land_batches 
ADD COLUMN IF NOT EXISTS real_estate_tax_number VARCHAR(100);

COMMENT ON COLUMN land_batches.real_estate_tax_number IS 'الرسم العقاري عدد - Real Estate Tax Number';

-- ============================================
-- VERIFICATION
-- ============================================
-- Run this to verify the column was added:
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'land_batches' AND column_name = 'real_estate_tax_number';
-- ============================================

