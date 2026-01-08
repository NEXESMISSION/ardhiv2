-- ============================================
-- CREATE CONTRACT EDITORS TABLE
-- محررين العقد - Contract Editors Management
-- ============================================

-- Create contract_editors table
CREATE TABLE IF NOT EXISTS contract_editors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(100) NOT NULL, -- نوع المحرر (Type of editor)
    name VARCHAR(255) NOT NULL, -- اسم المحرر (Editor name)
    place VARCHAR(255) NOT NULL, -- المكان (Place/Location)
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_contract_editors_type ON contract_editors(type);
CREATE INDEX IF NOT EXISTS idx_contract_editors_name ON contract_editors(name);

-- Add contract_editor_id column to sales table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales' AND column_name = 'contract_editor_id'
    ) THEN
        ALTER TABLE sales ADD COLUMN contract_editor_id UUID REFERENCES contract_editors(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_sales_contract_editor ON sales(contract_editor_id);
    END IF;
END $$;

-- Enable RLS
ALTER TABLE contract_editors ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Contract editors are viewable by authenticated users" ON contract_editors;
DROP POLICY IF EXISTS "Authenticated users can create contract editors" ON contract_editors;
DROP POLICY IF EXISTS "Owners and Managers can update contract editors" ON contract_editors;
DROP POLICY IF EXISTS "Owners can update contract editors" ON contract_editors;
DROP POLICY IF EXISTS "Owners can delete contract editors" ON contract_editors;

-- RLS Policies for contract_editors
-- All authenticated users can view editors
CREATE POLICY "Contract editors are viewable by authenticated users"
    ON contract_editors FOR SELECT
    TO authenticated
    USING (true);

-- All authenticated users can create editors
CREATE POLICY "Authenticated users can create contract editors"
    ON contract_editors FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Owners can update editors (only Owner role has update permission)
CREATE POLICY "Owners can update contract editors"
    ON contract_editors FOR UPDATE
    TO authenticated
    USING (get_user_role() = 'Owner'::user_role)
    WITH CHECK (get_user_role() = 'Owner'::user_role);

-- Only Owners can delete editors
CREATE POLICY "Owners can delete contract editors"
    ON contract_editors FOR DELETE
    TO authenticated
    USING (get_user_role() = 'Owner');

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON contract_editors TO authenticated;

-- Verify table creation
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'contract_editors'
    ) THEN
        RAISE NOTICE '✓ contract_editors table created successfully';
    ELSE
        RAISE WARNING '✗ contract_editors table may not have been created';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales' AND column_name = 'contract_editor_id'
    ) THEN
        RAISE NOTICE '✓ contract_editor_id column added to sales table';
    ELSE
        RAISE WARNING '✗ contract_editor_id column may not have been added';
    END IF;
END $$;

