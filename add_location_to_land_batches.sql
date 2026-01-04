-- Add location field to land_batches table
ALTER TABLE land_batches 
ADD COLUMN IF NOT EXISTS location VARCHAR(255);

-- Add index for searchability
CREATE INDEX IF NOT EXISTS idx_land_batches_location ON land_batches(location);

