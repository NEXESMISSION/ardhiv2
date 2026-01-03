-- ============================================
-- CREATE DEBT PAYMENTS TABLE
-- Migration: Add debt payment tracking
-- ============================================
-- Purpose: Creates debt_payments table to track individual debt payments
-- Run this in Supabase SQL Editor
-- Dependencies: Requires debts table (run create_debts_table.sql first)
-- ============================================

-- Create debt_payments table to track individual payments
CREATE TABLE IF NOT EXISTS debt_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
    amount_paid DECIMAL(15, 2) NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_debt_payments_debt ON debt_payments(debt_id);
CREATE INDEX IF NOT EXISTS idx_debt_payments_date ON debt_payments(payment_date);

-- Add updated_at trigger
CREATE TRIGGER update_debt_payments_updated_at BEFORE UPDATE ON debt_payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE debt_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for debt_payments
-- All authenticated users can view debt payments
CREATE POLICY "Debt payments are viewable by authenticated users"
    ON debt_payments FOR SELECT
    TO authenticated
    USING (true);

-- All authenticated users can create debt payments
CREATE POLICY "Authenticated users can create debt payments"
    ON debt_payments FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Owners and Managers can update debt payments
CREATE POLICY "Owners and Managers can update debt payments"
    ON debt_payments FOR UPDATE
    TO authenticated
    USING (get_user_role() IN ('Owner', 'Manager'))
    WITH CHECK (get_user_role() IN ('Owner', 'Manager'));

-- Only Owners can delete debt payments
CREATE POLICY "Owners can delete debt payments"
    ON debt_payments FOR DELETE
    TO authenticated
    USING (get_user_role() = 'Owner');

-- Add audit trigger
CREATE TRIGGER audit_debt_payments AFTER INSERT OR UPDATE OR DELETE ON debt_payments
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
WHERE table_name = 'debt_payments'
ORDER BY ordinal_position;

