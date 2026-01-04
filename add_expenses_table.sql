-- ============================================
-- EXPENSES MANAGEMENT TABLE
-- Migration: Add expenses tracking system
-- ============================================
-- Purpose: Track business expenses with categories, approval workflow, and reporting
-- Run this in Supabase SQL Editor
-- Dependencies: Requires users table (from supabase_schema.sql)
-- ============================================

-- Create ENUM for expense status
CREATE TYPE expense_status AS ENUM ('Pending', 'Approved', 'Rejected');

-- Create ENUM for payment method
CREATE TYPE payment_method AS ENUM ('Cash', 'BankTransfer', 'Check', 'CreditCard', 'Other');

-- Create table for expense categories (customizable)
CREATE TABLE expense_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default categories
INSERT INTO expense_categories (name, description) VALUES
('إيجار', 'إيجار المكتب أو المستودع'),
('رواتب', 'رواتب الموظفين'),
('كهرباء', 'فاتورة الكهرباء'),
('ماء', 'فاتورة الماء'),
('هاتف', 'فاتورة الهاتف والإنترنت'),
('نقل', 'مصاريف النقل والوقود'),
('صيانة', 'صيانة المعدات والمباني'),
('تسويق', 'مصاريف التسويق والإعلان'),
('مستلزمات مكتبية', 'مستلزمات المكتب'),
('ضرائب', 'الضرائب والرسوم'),
('أخرى', 'مصاريف أخرى');

-- Create table for expenses
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
    amount DECIMAL(15, 2) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    payment_method payment_method NOT NULL DEFAULT 'Cash',
    receipt_url TEXT, -- For future file upload support
    related_batch_id UUID REFERENCES land_batches(id) ON DELETE SET NULL,
    related_sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
    tags TEXT[], -- Array of tags for organization
    status expense_status NOT NULL DEFAULT 'Pending',
    submitted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_expenses_category ON expenses(category_id);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_expenses_submitted_by ON expenses(submitted_by);
CREATE INDEX idx_expenses_related_batch ON expenses(related_batch_id) WHERE related_batch_id IS NOT NULL;
CREATE INDEX idx_expenses_related_sale ON expenses(related_sale_id) WHERE related_sale_id IS NOT NULL;

-- Add comment
COMMENT ON TABLE expenses IS 'Business expenses tracking with approval workflow';
COMMENT ON TABLE expense_categories IS 'Customizable expense categories';

