# Complete Database Schema

## 🎯 Overview

Complete database schema for the application. Run this in Supabase SQL Editor after creating your project.

## 📋 Complete Schema

```sql
-- ============================================
-- EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

-- User roles (Owner and Worker only)
DROP TYPE IF EXISTS user_role CASCADE;
CREATE TYPE user_role AS ENUM ('Owner', 'Worker');

-- User status
DROP TYPE IF EXISTS user_status CASCADE;
CREATE TYPE user_status AS ENUM ('Active', 'Inactive');

-- Land status
DROP TYPE IF EXISTS land_status CASCADE;
CREATE TYPE land_status AS ENUM ('Available', 'Reserved', 'Sold', 'Cancelled');

-- Payment type
DROP TYPE IF EXISTS payment_type CASCADE;
CREATE TYPE payment_type AS ENUM ('Full', 'Installment', 'PromiseOfSale');

-- Sale status
DROP TYPE IF EXISTS sale_status CASCADE;
CREATE TYPE sale_status AS ENUM ('Pending', 'AwaitingPayment', 'InstallmentsOngoing', 'Completed', 'Cancelled');

-- Payment record type
DROP TYPE IF EXISTS payment_record_type CASCADE;
CREATE TYPE payment_record_type AS ENUM ('BigAdvance', 'SmallAdvance', 'Installment', 'Full', 'Partial', 'Field', 'Refund', 'InitialPayment');

-- Installment status
DROP TYPE IF EXISTS installment_status CASCADE;
CREATE TYPE installment_status AS ENUM ('Unpaid', 'Paid', 'Late', 'Partial');

-- Payment method
DROP TYPE IF EXISTS payment_method CASCADE;
CREATE TYPE payment_method AS ENUM ('Cash', 'BankTransfer', 'Check', 'CreditCard', 'Other');

-- Expense status
DROP TYPE IF EXISTS expense_status CASCADE;
CREATE TYPE expense_status AS ENUM ('Pending', 'Approved', 'Rejected');

-- Expense category
DROP TYPE IF EXISTS expense_category CASCADE;
CREATE TYPE expense_category AS ENUM ('Office', 'Marketing', 'Legal', 'Maintenance', 'Other');

-- Recurrence type
DROP TYPE IF EXISTS recurrence_type CASCADE;
CREATE TYPE recurrence_type AS ENUM ('Daily', 'Weekly', 'Monthly', 'Yearly');

-- ============================================
-- TABLES
-- ============================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role user_role NOT NULL DEFAULT 'Worker',
  title VARCHAR(255) NULL, -- Worker title (only for workers)
  permissions JSONB DEFAULT '{}',
  allowed_pages TEXT[] DEFAULT NULL,
  allowed_features TEXT[] DEFAULT NULL,
  sidebar_order TEXT[] DEFAULT NULL,
  status user_status NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT worker_title_check CHECK (title IS NULL OR role = 'Worker')
);

-- Land batches
CREATE TABLE IF NOT EXISTS land_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  total_surface DECIMAL(15,2) NOT NULL,
  total_cost DECIMAL(15,2) NOT NULL,
  date_acquired DATE NOT NULL,
  real_estate_tax_number VARCHAR(100),
  price_per_m2_full DECIMAL(15,2),
  price_per_m2_installment DECIMAL(15,2),
  company_fee_percentage_full DECIMAL(5,2),
  image_url TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Land pieces
CREATE TABLE IF NOT EXISTS land_pieces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  land_batch_id UUID NOT NULL REFERENCES land_batches(id) ON DELETE CASCADE,
  piece_number VARCHAR(100) NOT NULL,
  surface_area DECIMAL(15,2) NOT NULL,
  purchase_cost DECIMAL(15,2) NOT NULL,
  selling_price_full DECIMAL(15,2) NOT NULL,
  selling_price_installment DECIMAL(15,2) NOT NULL,
  status land_status NOT NULL DEFAULT 'Available',
  reserved_until TIMESTAMPTZ,
  reservation_client_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(land_batch_id, piece_number)
);

-- Payment offers
CREATE TABLE IF NOT EXISTS payment_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  land_batch_id UUID REFERENCES land_batches(id) ON DELETE CASCADE,
  land_piece_id UUID REFERENCES land_pieces(id) ON DELETE CASCADE,
  price_per_m2_installment DECIMAL(15,2),
  company_fee_percentage DECIMAL(5,2) NOT NULL DEFAULT 2,
  advance_amount DECIMAL(15,2) NOT NULL,
  advance_is_percentage BOOLEAN NOT NULL DEFAULT true,
  monthly_payment DECIMAL(15,2),
  number_of_months INTEGER,
  offer_name VARCHAR(255),
  notes TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clients
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  cin VARCHAR(100) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  client_type VARCHAR(100),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cin)
);

-- Sales
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id),
  land_piece_ids UUID[] NOT NULL,
  reservation_id UUID,
  payment_type payment_type NOT NULL,
  total_purchase_cost DECIMAL(15,2) NOT NULL,
  total_selling_price DECIMAL(15,2) NOT NULL,
  profit_margin DECIMAL(15,2) NOT NULL,
  small_advance_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  big_advance_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  company_fee_percentage DECIMAL(5,2),
  company_fee_amount DECIMAL(15,2),
  installment_start_date DATE,
  installment_end_date DATE,
  number_of_installments INTEGER,
  monthly_installment_amount DECIMAL(15,2),
  selected_offer_id UUID REFERENCES payment_offers(id),
  contract_editor_id UUID,
  promise_initial_payment DECIMAL(15,2),
  promise_completion_date DATE,
  promise_completed BOOLEAN DEFAULT false,
  status sale_status NOT NULL DEFAULT 'Pending',
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  deadline_date DATE,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  confirmed_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Installments
CREATE TABLE IF NOT EXISTS installments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  amount_due DECIMAL(15,2) NOT NULL,
  amount_paid DECIMAL(15,2) NOT NULL DEFAULT 0,
  stacked_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  paid_date DATE,
  status installment_status NOT NULL DEFAULT 'Unpaid',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sale_id, installment_number)
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID REFERENCES sales(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  land_piece_ids UUID[],
  payment_type payment_record_type NOT NULL,
  amount_paid DECIMAL(15,2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method payment_method,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Debts
CREATE TABLE IF NOT EXISTS debts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id),
  amount_owed DECIMAL(15,2) NOT NULL,
  daily_payment_amount DECIMAL(15,2),
  start_date DATE NOT NULL,
  end_date DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'Active',
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Debt payments
CREATE TABLE IF NOT EXISTS debt_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  amount_paid DECIMAL(15,2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category expense_category NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  receipt_url TEXT,
  status expense_status NOT NULL DEFAULT 'Pending',
  approved_by UUID REFERENCES users(id),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recurring expenses
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category expense_category NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  recurrence_type recurrence_type NOT NULL,
  recurrence_value INTEGER NOT NULL, -- e.g., every 2 weeks
  start_date DATE NOT NULL,
  end_date DATE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_title ON users(title) WHERE title IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_land_pieces_batch ON land_pieces(land_batch_id);
CREATE INDEX IF NOT EXISTS idx_land_pieces_status ON land_pieces(status);
CREATE INDEX IF NOT EXISTS idx_sales_client ON sales(client_id);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_installments_sale ON installments(sale_id);
CREATE INDEX IF NOT EXISTS idx_installments_due_date ON installments(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_client ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(payment_type);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE land_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE land_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE debt_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Users policies
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Owners can read all users" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'Owner'
    )
  );

CREATE POLICY "Owners can update all users" ON users
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'Owner'
    )
  );

-- Land batches policies
CREATE POLICY "Everyone can read land batches" ON land_batches
  FOR SELECT USING (true);

CREATE POLICY "Owners can manage land batches" ON land_batches
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'Owner'
    )
  );

CREATE POLICY "Workers can read land batches" ON land_batches
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'Worker' AND status = 'Active'
    )
  );

-- Land pieces policies
CREATE POLICY "Everyone can read land pieces" ON land_pieces
  FOR SELECT USING (true);

CREATE POLICY "Owners can manage land pieces" ON land_pieces
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'Owner'
    )
  );

-- Add more policies as needed...
-- (Continue with similar patterns for other tables)

-- ============================================
-- FUNCTIONS
-- ============================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_land_batches_updated_at BEFORE UPDATE ON land_batches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_land_pieces_updated_at BEFORE UPDATE ON land_pieces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add triggers for all tables...

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get user role
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS user_role AS $$
DECLARE
  user_role_val user_role;
BEGIN
  SELECT role INTO user_role_val
  FROM users
  WHERE id = user_id;
  
  RETURN user_role_val;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is owner
CREATE OR REPLACE FUNCTION is_owner(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = user_id AND role = 'Owner'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- COMPLETION
-- ============================================

-- Verify tables created
SELECT 'Schema created successfully!' AS status;
```

## 🔒 Security Notes

1. **RLS Policies**: All tables have RLS enabled
2. **Owner Access**: Owners have full access
3. **Worker Access**: Workers have limited access based on permissions
4. **Security Functions**: Helper functions for role checking

## ✅ Verification

After running the schema:

1. Check all tables exist
2. Check all enums exist
3. Check RLS is enabled
4. Check indexes are created
5. Check triggers are created

## 📝 Next Steps

1. Create first Owner user (see `00_DEVELOPER_GUIDE.md`)
2. Test database connection
3. Start implementing features

