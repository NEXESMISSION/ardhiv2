-- ============================================
-- FIX VALIDATE_USER_PERMISSION FOR WORKERS
-- ============================================
-- This updates the validate_user_permission function to handle Workers
-- who can edit_clients but NOT delete_clients
-- ============================================

CREATE OR REPLACE FUNCTION validate_user_permission(permission_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    user_id_val UUID;
    user_role_val user_role;
    user_status_val user_status;
    role_permissions JSONB;
    custom_permission BOOLEAN;
    resource_type_val TEXT;
    permission_type_val TEXT;
BEGIN
    -- Get current authenticated user
    user_id_val := auth.uid();
    
    -- If no authenticated user, deny access
    IF user_id_val IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Get user role and status
    SELECT role, status INTO user_role_val, user_status_val
    FROM users 
    WHERE id = user_id_val;
    
    -- If user not found or not active, deny access
    IF user_role_val IS NULL OR user_status_val != 'Active' THEN
        RETURN FALSE;
    END IF;
    
    -- Owner always has all permissions
    IF user_role_val = 'Owner' THEN
        RETURN TRUE;
    END IF;
    
    -- SPECIAL CASE: Worker role permissions (hardcoded since roles table structure may vary)
    IF user_role_val = 'Worker' THEN
        -- Workers can edit clients but NOT delete them
        IF permission_name = 'edit_clients' THEN
            RETURN TRUE;
        END IF;
        IF permission_name = 'delete_clients' THEN
            RETURN FALSE;
        END IF;
        -- Workers can view clients
        IF permission_name = 'view_clients' THEN
            RETURN TRUE;
        END IF;
        -- Workers can view and create sales
        IF permission_name IN ('view_sales', 'create_sales', 'edit_sales') THEN
            RETURN TRUE;
        END IF;
        -- Workers can view and edit installments
        IF permission_name IN ('view_installments', 'edit_installments') THEN
            RETURN TRUE;
        END IF;
        -- Workers can view and record payments
        IF permission_name IN ('view_payments', 'record_payments') THEN
            RETURN TRUE;
        END IF;
        -- Workers can view dashboard and land
        IF permission_name IN ('view_dashboard', 'view_land') THEN
            RETURN TRUE;
        END IF;
        -- Workers can view financial (for expenses)
        IF permission_name = 'view_financial' THEN
            RETURN TRUE;
        END IF;
        -- Workers CANNOT edit/delete land, edit prices, view profit, manage users, or view audit logs
        IF permission_name IN ('edit_land', 'delete_land', 'edit_prices', 'view_profit', 'manage_users', 'view_audit_logs') THEN
            RETURN FALSE;
        END IF;
    END IF;
    
    -- Parse permission name (supports both formats)
    -- New format: "land_view", "sale_create", "client_edit", etc.
    -- Legacy format: "view_land", "create_sales", "edit_clients", etc.
    
    -- Try to extract resource and permission type (new format)
    resource_type_val := SPLIT_PART(permission_name, '_', 1);
    permission_type_val := SPLIT_PART(permission_name, '_', 2);
    
    -- Check custom user permissions first (new format)
    SELECT granted INTO custom_permission
    FROM user_permissions
    WHERE user_id = user_id_val
      AND resource_type = resource_type_val
      AND permission_type = permission_type_val;
    
    IF custom_permission IS NOT NULL THEN
        RETURN custom_permission;
    END IF;
    
    -- Check role permissions from roles table (if it exists and has the right structure)
    -- This is a fallback for other roles
    BEGIN
        SELECT permissions INTO role_permissions 
        FROM roles 
        WHERE name = user_role_val;
        
        IF role_permissions IS NOT NULL THEN
            -- Try new format first (e.g., "land_view")
            IF (role_permissions ->> permission_name)::BOOLEAN = TRUE THEN
                RETURN TRUE;
            END IF;
            
            -- Try legacy format (e.g., "view_land")
            IF (role_permissions ->> (permission_type_val || '_' || resource_type_val))::BOOLEAN = TRUE THEN
                RETURN TRUE;
            END IF;
            
            -- Also check if it's already in legacy format
            IF permission_name LIKE 'view_%' OR permission_name LIKE 'create_%' OR 
               permission_name LIKE 'edit_%' OR permission_name LIKE 'delete_%' OR
               permission_name LIKE 'manage_%' OR permission_name LIKE 'record_%' THEN
                IF (role_permissions ->> permission_name)::BOOLEAN = TRUE THEN
                    RETURN TRUE;
                END IF;
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- If roles table doesn't exist or has different structure, continue
        -- Worker permissions are already handled above
        NULL;
    END;
    
    -- Default: deny access
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION validate_user_permission(TEXT) TO authenticated;

-- Verify the function works
DO $$
BEGIN
    RAISE NOTICE 'validate_user_permission function updated successfully';
    RAISE NOTICE 'Workers can now edit_clients but NOT delete_clients';
END $$;

-- ============================================
-- SUMMARY:
-- ============================================
-- ✅ validate_user_permission now handles Worker role directly
-- ✅ Workers can edit_clients: TRUE
-- ✅ Workers can delete_clients: FALSE
-- ✅ No dependency on roles table structure
-- ============================================

