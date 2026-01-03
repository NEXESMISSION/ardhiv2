-- ============================================
-- CREATE DEBTS TABLE
-- Migration: Add debt management functionality
-- ============================================
-- Purpose: Creates debts table for tracking company debts
-- Run this in Supabase SQL Editor
-- Dependencies: Requires users table and audit functions (from supabase_schema.sql)
-- ============================================

-- Create debts table
CREATE TABLE IF NOT EXISTS debts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creditor_name VARCHAR(255) NOT NULL,
    amount_owed DECIMAL(15, 2) NOT NULL,
    due_date DATE NOT NULL,
    check_number VARCHAR(100),
    reference_number VARCHAR(100),
    notes TEXT,
    status VARCHAR(50) DEFAULT 'Active', -- Active, Paid, Overdue
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_debts_due_date ON debts(due_date);
CREATE INDEX IF NOT EXISTS idx_debts_status ON debts(status);
CREATE INDEX IF NOT EXISTS idx_debts_creditor ON debts(creditor_name);

-- Add updated_at trigger
CREATE TRIGGER update_debts_updated_at BEFORE UPDATE ON debts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for debts
-- All authenticated users can view debts
CREATE POLICY "Debts are viewable by authenticated users"
    ON debts FOR SELECT
    TO authenticated
    USING (true);

-- All authenticated users can create debts
CREATE POLICY "Authenticated users can create debts"
    ON debts FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Owners and Managers can update debts
CREATE POLICY "Owners and Managers can update debts"
    ON debts FOR UPDATE
    TO authenticated
    USING (get_user_role() IN ('Owner', 'Manager'))
    WITH CHECK (get_user_role() IN ('Owner', 'Manager'));

-- Only Owners can delete debts
CREATE POLICY "Owners can delete debts"
    ON debts FOR DELETE
    TO authenticated
    USING (get_user_role() = 'Owner');

-- Add audit trigger
CREATE TRIGGER audit_debts AFTER INSERT OR UPDATE OR DELETE ON debts
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- =====================================================
-- VERIFICATION
-- =====================================================
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'debts'
ORDER BY ordinal_position;

