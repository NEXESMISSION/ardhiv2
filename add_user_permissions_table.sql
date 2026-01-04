-- ============================================
-- USER PERMISSIONS ENHANCEMENT
-- Granular permission system for users
-- ============================================

-- Create permission templates table
CREATE TABLE IF NOT EXISTS permission_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_permissions table for custom permissions per user
CREATE TABLE IF NOT EXISTS user_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_type VARCHAR(50) NOT NULL, -- 'land', 'client', 'sale', 'payment', 'report', 'user', 'expense'
    permission_type VARCHAR(50) NOT NULL, -- 'view', 'create', 'edit', 'delete', 'export'
    granted BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, resource_type, permission_type)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_resource ON user_permissions(resource_type);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_resource ON user_permissions(user_id, resource_type);

-- Insert permission templates
INSERT INTO permission_templates (name, description, permissions) VALUES
('Seller', 'Can create sales, clients, view lands (no edit prices)', '{
    "view_dashboard": true,
    "view_land": true,
    "edit_land": false,
    "delete_land": false,
    "view_clients": true,
    "edit_clients": true,
    "delete_clients": false,
    "view_sales": true,
    "create_sales": true,
    "edit_sales": true,
    "edit_prices": false,
    "view_installments": true,
    "edit_installments": false,
    "view_payments": true,
    "record_payments": false,
    "view_financial": false,
    "view_profit": false,
    "manage_users": false,
    "view_audit_logs": false,
    "view_expenses": false,
    "edit_expenses": false
}'::jsonb),
('Accountant', 'View-only access to finances', '{
    "view_dashboard": true,
    "view_land": false,
    "edit_land": false,
    "delete_land": false,
    "view_clients": true,
    "edit_clients": false,
    "delete_clients": false,
    "view_sales": true,
    "create_sales": false,
    "edit_sales": false,
    "edit_prices": false,
    "view_installments": true,
    "edit_installments": false,
    "view_payments": true,
    "record_payments": false,
    "view_financial": true,
    "view_profit": true,
    "manage_users": false,
    "view_audit_logs": true,
    "view_expenses": true,
    "edit_expenses": false
}'::jsonb),
('Field Agent', 'Can only record payments', '{
    "view_dashboard": true,
    "view_land": false,
    "edit_land": false,
    "delete_land": false,
    "view_clients": true,
    "edit_clients": false,
    "delete_clients": false,
    "view_sales": true,
    "create_sales": false,
    "edit_sales": false,
    "edit_prices": false,
    "view_installments": true,
    "edit_installments": false,
    "view_payments": true,
    "record_payments": true,
    "view_financial": false,
    "view_profit": false,
    "manage_users": false,
    "view_audit_logs": false,
    "view_expenses": false,
    "edit_expenses": false
}'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Function to check if user has permission (checks both role and custom permissions)
CREATE OR REPLACE FUNCTION has_user_permission(permission_name TEXT, user_id_param UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
DECLARE
    user_role_val user_role;
    role_permissions JSONB;
    custom_permission BOOLEAN;
    resource_type_val TEXT;
    permission_type_val TEXT;
BEGIN
    -- Get user role
    SELECT role INTO user_role_val FROM users WHERE id = user_id_param;
    
    IF user_role_val IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Owner always has all permissions
    IF user_role_val = 'Owner' THEN
        RETURN TRUE;
    END IF;
    
    -- Parse permission name (format: resource_type_permission_type, e.g., "land_view", "sale_create")
    -- Or legacy format (e.g., "view_land", "create_sales")
    IF permission_name LIKE '%_view' OR permission_name LIKE 'view_%' THEN
        -- Legacy format: view_land, view_sales, etc.
        -- Check role permissions first
        SELECT permissions INTO role_permissions 
        FROM roles 
        WHERE name = user_role_val;
        
        IF role_permissions IS NOT NULL AND (role_permissions ->> permission_name)::BOOLEAN = TRUE THEN
            RETURN TRUE;
        END IF;
    ELSE
        -- New format: land_view, sale_create, etc.
        -- Extract resource and permission type
        resource_type_val := SPLIT_PART(permission_name, '_', 1);
        permission_type_val := SPLIT_PART(permission_name, '_', 2);
        
        -- Check custom user permissions first
        SELECT granted INTO custom_permission
        FROM user_permissions
        WHERE user_id = user_id_param
          AND resource_type = resource_type_val
          AND permission_type = permission_type_val;
        
        IF custom_permission IS NOT NULL THEN
            RETURN custom_permission;
        END IF;
        
        -- Fall back to role permissions (convert to legacy format for lookup)
        SELECT permissions INTO role_permissions 
        FROM roles 
        WHERE name = user_role_val;
        
        -- Try both formats
        IF role_permissions IS NOT NULL THEN
            IF (role_permissions ->> permission_name)::BOOLEAN = TRUE THEN
                RETURN TRUE;
            END IF;
            -- Try legacy format
            IF (role_permissions ->> (permission_type_val || '_' || resource_type_val))::BOOLEAN = TRUE THEN
                RETURN TRUE;
            END IF;
        END IF;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT SELECT ON permission_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_permissions TO authenticated;

