-- ============================================
-- FUNCTION: Delete sale and all related data
-- This function bypasses RLS to ensure complete deletion
-- ============================================

CREATE OR REPLACE FUNCTION delete_sale_completely(sale_id_to_delete UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    sale_record RECORD;
    piece_ids UUID[];
    house_ids_array UUID[];
BEGIN
    -- Check if user is Owner (for security)
    IF get_user_role() != 'Owner' THEN
        RAISE EXCEPTION 'Only Owners can delete sales completely';
    END IF;
    
    -- Get the sale record
    SELECT s.id, s.land_piece_ids INTO sale_record
    FROM sales s
    WHERE s.id = sale_id_to_delete;
    
    -- If sale doesn't exist, return false
    IF sale_record.id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Get house_ids separately - handle type conversion safely
    BEGIN
        -- Try to get house_ids directly
        SELECT house_ids INTO house_ids_array
        FROM sales
        WHERE id = sale_id_to_delete;
        
        -- If NULL, set to empty array
        IF house_ids_array IS NULL THEN
            house_ids_array := ARRAY[]::UUID[];
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            -- If there's any error (type mismatch, etc.), use empty array
            house_ids_array := ARRAY[]::UUID[];
    END;
    
    -- Delete payments for this sale
    DELETE FROM payments WHERE sale_id = sale_id_to_delete;
    
    -- Delete installments for this sale
    DELETE FROM installments WHERE sale_id = sale_id_to_delete;
    
    -- Reset piece status if land_piece_ids exist
    IF sale_record.land_piece_ids IS NOT NULL AND array_length(sale_record.land_piece_ids, 1) > 0 THEN
        UPDATE land_pieces 
        SET status = 'Available', reservation_client_id = NULL
        WHERE id = ANY(sale_record.land_piece_ids);
    END IF;
    
    -- Reset house status if house_ids exist (use the variable directly, not the record field)
    IF house_ids_array IS NOT NULL AND array_length(house_ids_array, 1) > 0 THEN
        UPDATE houses 
        SET status = 'Available', 
            reservation_client_id = NULL,
            reserved_until = NULL
        WHERE id = ANY(house_ids_array);
    END IF;
    
    -- Finally, delete the sale
    DELETE FROM sales WHERE id = sale_id_to_delete;
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error deleting sale: %', SQLERRM;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_sale_completely(UUID) TO authenticated;

-- Test the function exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM pg_proc 
        WHERE proname = 'delete_sale_completely'
    ) THEN
        RAISE NOTICE 'delete_sale_completely() function created successfully';
    ELSE
        RAISE WARNING 'delete_sale_completely() function may not have been created';
    END IF;
END $$;

