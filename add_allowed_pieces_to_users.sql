-- ============================================
-- ADD ALLOWED_PIECES COLUMN TO USERS TABLE
-- ============================================
-- This column stores the IDs of land pieces a user can access
-- If NULL or empty, user can access all pieces (within allowed batches)
-- If set, user can ONLY access these specific pieces
-- ============================================

-- Step 1: Add the column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'allowed_pieces'
    ) THEN
        ALTER TABLE users ADD COLUMN allowed_pieces UUID[] DEFAULT NULL;
        RAISE NOTICE 'Added allowed_pieces column to users table';
    ELSE
        RAISE NOTICE 'allowed_pieces column already exists';
    END IF;
END $$;

-- Step 2: Add comment
COMMENT ON COLUMN users.allowed_pieces IS 'Array of land_piece IDs the user can access. NULL or empty means access to all pieces (within allowed batches). If set, user can ONLY access these specific pieces.';

-- Step 3: Verify the column
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'allowed_pieces';

-- Step 4: Example usage - restrict user to specific pieces
-- UPDATE users SET allowed_pieces = ARRAY['piece-uuid-1', 'piece-uuid-2']::UUID[] WHERE id = 'user-uuid';

-- Step 5: Example query to check if user has access to a piece
-- SELECT * FROM users WHERE id = 'user-uuid' AND (allowed_pieces IS NULL OR 'piece-uuid' = ANY(allowed_pieces));

