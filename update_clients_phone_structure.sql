-- ============================================
-- UPDATE CLIENTS PHONE FIELD STRUCTURE
-- ============================================
-- This script ensures the phone field can accommodate multiple numbers
-- separated by "/" (e.g., 5822092120192614/10/593)
-- ============================================

-- Check current phone column length
SELECT 
    column_name,
    data_type,
    character_maximum_length
FROM information_schema.columns
WHERE table_name = 'clients' 
  AND column_name = 'phone';

-- Increase phone field length if needed (from 50 to 100 to accommodate multiple numbers)
-- This allows for longer phone numbers with separators
DO $$
BEGIN
    -- Check if we need to alter the column
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'clients' 
          AND column_name = 'phone' 
          AND character_maximum_length < 100
    ) THEN
        ALTER TABLE clients ALTER COLUMN phone TYPE VARCHAR(100);
        RAISE NOTICE 'Phone field length increased to 100 characters';
    ELSE
        RAISE NOTICE 'Phone field is already 100 characters or longer';
    END IF;
END $$;

-- Verify the change
SELECT 
    column_name,
    data_type,
    character_maximum_length
FROM information_schema.columns
WHERE table_name = 'clients' 
  AND column_name = 'phone';

