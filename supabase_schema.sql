-- ============================================
-- FULLLANDDEV - Land/Real Estate Management System
-- Supabase Database Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUM TYPES
-- ============================================

-- Land piece status
CREATE TYPE land_status AS ENUM ('Available', 'Reserved', 'Sold', 'Cancelled');

-- Payment type for sales
CREATE TYPE payment_type AS ENUM ('Full', 'Installment');

-- Sale status
CREATE TYPE sale_status AS ENUM ('Pending', 'Completed', 'Cancelled');

-- Reservation status
CREATE TYPE reservation_status AS ENUM ('Pending', 'Confirmed', 'Cancelled', 'Expired');

-- Installment status
CREATE TYPE installment_status AS ENUM ('Unpaid', 'Paid', 'Late', 'Partial');

-- Payment record type
CREATE TYPE payment_record_type AS ENUM ('BigAdvance', 'SmallAdvance', 'Installment', 'Full', 'Partial', 'Field', 'Refund');

-- User role
CREATE TYPE user_role AS ENUM ('Owner', 'Manager', 'FieldStaff');

-- User status
CREATE TYPE user_status AS ENUM ('Active', 'Inactive');

-- ============================================
-- TABLE: roles
-- Defines role permissions
-- ============================================
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name user_role UNIQUE NOT NULL,
    permissions JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default roles with permissions
INSERT INTO roles (name, permissions) VALUES
('Owner', '{
    "view_dashboard": true,
    "view_land": true,
    "edit_land": true,
    "delete_land": true,
    "view_clients": true,
    "edit_clients": true,
    "delete_clients": true,
    "view_sales": true,
    "edit_sales": true,
    "edit_prices": true,
    "view_installments": true,
    "edit_installments": true,
    "view_payments": true,
    "record_payments": true,
    "view_financial": true,
    "view_profit": true,
    "manage_users": true,
    "view_audit_logs": true
}'::jsonb),
('Manager', '{
    "view_dashboard": true,
    "view_land": true,
    "edit_land": true,
    "delete_land": false,
    "view_clients": true,
    "edit_clients": true,
    "delete_clients": false,
    "view_sales": true,
    "edit_sales": true,
    "edit_prices": false,
    "view_installments": true,
    "edit_installments": true,
    "view_payments": true,
    "record_payments": true,
    "view_financial": true,
    "view_profit": false,
    "manage_users": false,
    "view_audit_logs": true
}'::jsonb),
('FieldStaff', '{
    "view_dashboard": true,
    "view_land": true,
    "edit_land": false,
    "delete_land": false,
    "view_clients": true,
    "edit_clients": true,
    "delete_clients": false,
    "view_sales": true,
    "edit_sales": false,
    "edit_prices": false,
    "view_installments": true,
    "edit_installments": false,
    "view_payments": true,
    "record_payments": true,
    "view_financial": false,
    "view_profit": false,
    "manage_users": false,
    "view_audit_logs": false
}'::jsonb);

-- ============================================
-- TABLE: users
-- System users linked to Supabase Auth
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role user_role NOT NULL DEFAULT 'FieldStaff',
    status user_status NOT NULL DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: land_batches
-- Groups of land purchased together
-- ============================================
CREATE TABLE land_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    total_surface DECIMAL(15, 2) NOT NULL,
    total_cost DECIMAL(15, 2) NOT NULL,
    date_acquired DATE NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: clients
-- Customer information
-- ============================================
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    cin VARCHAR(50) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    client_type VARCHAR(50) DEFAULT 'Individual',
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on CIN for faster lookups
CREATE INDEX idx_clients_cin ON clients(cin);

-- ============================================
-- TABLE: land_pieces
-- Individual land plots within batches
-- ============================================
CREATE TABLE land_pieces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    land_batch_id UUID NOT NULL REFERENCES land_batches(id) ON DELETE CASCADE,
    piece_number VARCHAR(50) NOT NULL,
    surface_area DECIMAL(15, 2) NOT NULL,
    purchase_cost DECIMAL(15, 2) NOT NULL,
    selling_price_full DECIMAL(15, 2) NOT NULL,
    selling_price_installment DECIMAL(15, 2) NOT NULL,
    status land_status NOT NULL DEFAULT 'Available',
    reserved_until TIMESTAMPTZ,
    reservation_client_id UUID REFERENCES clients(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(land_batch_id, piece_number)
);

-- Create indexes
CREATE INDEX idx_land_pieces_status ON land_pieces(status);
CREATE INDEX idx_land_pieces_batch ON land_pieces(land_batch_id);

-- ============================================
-- TABLE: reservations
-- Preliminary reservations with small advance
-- ============================================
CREATE TABLE reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    land_piece_ids UUID[] NOT NULL,
    small_advance_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    reservation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reserved_until DATE NOT NULL,
    status reservation_status NOT NULL DEFAULT 'Pending',
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on client
CREATE INDEX idx_reservations_client ON reservations(client_id);
CREATE INDEX idx_reservations_status ON reservations(status);

-- ============================================
-- TABLE: sales
-- Sales records (full payment or installments)
-- ============================================
CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    land_piece_ids UUID[] NOT NULL,
    reservation_id UUID REFERENCES reservations(id),
    payment_type payment_type NOT NULL,
    -- Pricing
    total_purchase_cost DECIMAL(15, 2) NOT NULL,
    total_selling_price DECIMAL(15, 2) NOT NULL,
    profit_margin DECIMAL(15, 2) NOT NULL,
    -- Advances
    small_advance_amount DECIMAL(15, 2) DEFAULT 0,
    big_advance_amount DECIMAL(15, 2) DEFAULT 0,
    -- Installment details (if payment_type = 'Installment')
    installment_start_date DATE,
    installment_end_date DATE,
    number_of_installments INTEGER,
    monthly_installment_amount DECIMAL(15, 2),
    -- Status
    status sale_status NOT NULL DEFAULT 'Pending',
    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_sales_client ON sales(client_id);
CREATE INDEX idx_sales_status ON sales(status);
CREATE INDEX idx_sales_date ON sales(sale_date);

-- ============================================
-- TABLE: installments
-- Monthly payment schedules for installment sales
-- ============================================
CREATE TABLE installments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    installment_number INTEGER NOT NULL,
    amount_due DECIMAL(15, 2) NOT NULL,
    amount_paid DECIMAL(15, 2) DEFAULT 0,
    stacked_amount DECIMAL(15, 2) DEFAULT 0,
    due_date DATE NOT NULL,
    paid_date DATE,
    status installment_status NOT NULL DEFAULT 'Unpaid',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sale_id, installment_number)
);

-- Create indexes
CREATE INDEX idx_installments_sale ON installments(sale_id);
CREATE INDEX idx_installments_status ON installments(status);
CREATE INDEX idx_installments_due_date ON installments(due_date);

-- ============================================
-- TABLE: payments
-- All payment records including refunds
-- ============================================
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
    installment_id UUID REFERENCES installments(id) ON DELETE SET NULL,
    reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
    amount_paid DECIMAL(15, 2) NOT NULL,
    payment_type payment_record_type NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method VARCHAR(50) DEFAULT 'Cash',
    notes TEXT,
    recorded_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_payments_client ON payments(client_id);
CREATE INDEX idx_payments_sale ON payments(sale_id);
CREATE INDEX idx_payments_type ON payments(payment_type);
CREATE INDEX idx_payments_date ON payments(payment_date);

-- ============================================
-- TABLE: audit_logs
-- Activity tracking for accountability
-- ============================================
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_table ON audit_logs(table_name);
CREATE INDEX idx_audit_logs_date ON audit_logs(created_at);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to get current user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
BEGIN
    RETURN (
        SELECT role FROM users WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has permission
CREATE OR REPLACE FUNCTION has_permission(permission_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    user_role_val user_role;
    role_permissions JSONB;
BEGIN
    SELECT role INTO user_role_val FROM users WHERE id = auth.uid();
    
    IF user_role_val IS NULL THEN
        RETURN FALSE;
    END IF;
    
    SELECT permissions INTO role_permissions 
    FROM roles 
    WHERE name = user_role_val;
    
    RETURN COALESCE((role_permissions ->> permission_name)::BOOLEAN, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate profit for a sale
CREATE OR REPLACE FUNCTION calculate_sale_profit(piece_ids UUID[], use_installment_price BOOLEAN)
RETURNS TABLE(total_cost DECIMAL, total_price DECIMAL, profit DECIMAL) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(lp.purchase_cost), 0) AS total_cost,
        CASE 
            WHEN use_installment_price THEN COALESCE(SUM(lp.selling_price_installment), 0)
            ELSE COALESCE(SUM(lp.selling_price_full), 0)
        END AS total_price,
        CASE 
            WHEN use_installment_price THEN COALESCE(SUM(lp.selling_price_installment - lp.purchase_cost), 0)
            ELSE COALESCE(SUM(lp.selling_price_full - lp.purchase_cost), 0)
        END AS profit
    FROM land_pieces lp
    WHERE lp.id = ANY(piece_ids);
END;
$$ LANGUAGE plpgsql;

-- Function to calculate monthly revenue
CREATE OR REPLACE FUNCTION calculate_monthly_revenue(target_month INTEGER DEFAULT NULL, target_year INTEGER DEFAULT NULL)
RETURNS DECIMAL AS $$
DECLARE
    month_val INTEGER;
    year_val INTEGER;
BEGIN
    month_val := COALESCE(target_month, EXTRACT(MONTH FROM CURRENT_DATE));
    year_val := COALESCE(target_year, EXTRACT(YEAR FROM CURRENT_DATE));
    
    RETURN (
        SELECT COALESCE(SUM(total_selling_price), 0)
        FROM sales
        WHERE EXTRACT(MONTH FROM sale_date) = month_val
        AND EXTRACT(YEAR FROM sale_date) = year_val
        AND status = 'Completed'
    );
END;
$$ LANGUAGE plpgsql;

-- Function to update installment status based on due date
CREATE OR REPLACE FUNCTION update_overdue_installments()
RETURNS void AS $$
BEGIN
    UPDATE installments
    SET status = 'Late',
        stacked_amount = amount_due - amount_paid
    WHERE status = 'Unpaid'
    AND due_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Function to update reservation status when expired
CREATE OR REPLACE FUNCTION update_expired_reservations()
RETURNS void AS $$
BEGIN
    -- Mark reservations as expired
    UPDATE reservations
    SET status = 'Expired'
    WHERE status = 'Pending'
    AND reserved_until < CURRENT_DATE;
    
    -- Reset land pieces status back to Available
    UPDATE land_pieces lp
    SET status = 'Available',
        reserved_until = NULL,
        reservation_client_id = NULL
    WHERE lp.id IN (
        SELECT UNNEST(land_piece_ids) 
        FROM reservations 
        WHERE status = 'Expired'
    )
    AND lp.status = 'Reserved';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all relevant tables
CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_land_batches_updated_at BEFORE UPDATE ON land_batches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_land_pieces_updated_at BEFORE UPDATE ON land_pieces
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reservations_updated_at BEFORE UPDATE ON reservations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON sales
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_installments_updated_at BEFORE UPDATE ON installments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger function to log audit events
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values)
        VALUES (auth.uid(), 'INSERT', TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values)
        VALUES (auth.uid(), 'UPDATE', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values)
        VALUES (auth.uid(), 'DELETE', TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit triggers to sensitive tables
CREATE TRIGGER audit_sales AFTER INSERT OR UPDATE OR DELETE ON sales
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_payments AFTER INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_land_pieces AFTER INSERT OR UPDATE OR DELETE ON land_pieces
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_clients AFTER INSERT OR UPDATE OR DELETE ON clients
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_installments AFTER INSERT OR UPDATE OR DELETE ON installments
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE land_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE land_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES: roles
-- ============================================
-- Everyone can read roles
CREATE POLICY "Roles are viewable by authenticated users"
    ON roles FOR SELECT
    TO authenticated
    USING (true);

-- Only owners can modify roles
CREATE POLICY "Owners can manage roles"
    ON roles FOR ALL
    TO authenticated
    USING (get_user_role() = 'Owner')
    WITH CHECK (get_user_role() = 'Owner');

-- ============================================
-- RLS POLICIES: users
-- ============================================
-- Users can view their own profile
CREATE POLICY "Users can view own profile"
    ON users FOR SELECT
    TO authenticated
    USING (id = auth.uid());

-- Owners and Managers can view all users
CREATE POLICY "Owners and Managers can view all users"
    ON users FOR SELECT
    TO authenticated
    USING (get_user_role() IN ('Owner', 'Manager'));

-- Only owners can manage users
CREATE POLICY "Owners can manage users"
    ON users FOR INSERT
    TO authenticated
    WITH CHECK (get_user_role() = 'Owner');

CREATE POLICY "Owners can update users"
    ON users FOR UPDATE
    TO authenticated
    USING (get_user_role() = 'Owner')
    WITH CHECK (get_user_role() = 'Owner');

CREATE POLICY "Owners can delete users"
    ON users FOR DELETE
    TO authenticated
    USING (get_user_role() = 'Owner');

-- ============================================
-- RLS POLICIES: land_batches
-- ============================================
-- All authenticated users can view land batches
CREATE POLICY "Land batches are viewable by authenticated users"
    ON land_batches FOR SELECT
    TO authenticated
    USING (true);

-- Owners and Managers can insert land batches
CREATE POLICY "Owners and Managers can insert land batches"
    ON land_batches FOR INSERT
    TO authenticated
    WITH CHECK (get_user_role() IN ('Owner', 'Manager'));

-- Owners and Managers can update land batches
CREATE POLICY "Owners and Managers can update land batches"
    ON land_batches FOR UPDATE
    TO authenticated
    USING (get_user_role() IN ('Owner', 'Manager'))
    WITH CHECK (get_user_role() IN ('Owner', 'Manager'));

-- Only Owners can delete land batches
CREATE POLICY "Owners can delete land batches"
    ON land_batches FOR DELETE
    TO authenticated
    USING (get_user_role() = 'Owner');

-- ============================================
-- RLS POLICIES: land_pieces
-- ============================================
-- All authenticated users can view land pieces
CREATE POLICY "Land pieces are viewable by authenticated users"
    ON land_pieces FOR SELECT
    TO authenticated
    USING (true);

-- Owners and Managers can insert land pieces
CREATE POLICY "Owners and Managers can insert land pieces"
    ON land_pieces FOR INSERT
    TO authenticated
    WITH CHECK (get_user_role() IN ('Owner', 'Manager'));

-- Owners and Managers can update land pieces
CREATE POLICY "Owners and Managers can update land pieces"
    ON land_pieces FOR UPDATE
    TO authenticated
    USING (get_user_role() IN ('Owner', 'Manager'))
    WITH CHECK (get_user_role() IN ('Owner', 'Manager'));

-- Only Owners can delete land pieces
CREATE POLICY "Owners can delete land pieces"
    ON land_pieces FOR DELETE
    TO authenticated
    USING (get_user_role() = 'Owner');

-- ============================================
-- RLS POLICIES: clients
-- ============================================
-- All authenticated users can view clients
CREATE POLICY "Clients are viewable by authenticated users"
    ON clients FOR SELECT
    TO authenticated
    USING (true);

-- All authenticated users can insert clients
CREATE POLICY "Authenticated users can insert clients"
    ON clients FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Owners and Managers can update clients
CREATE POLICY "Owners and Managers can update clients"
    ON clients FOR UPDATE
    TO authenticated
    USING (get_user_role() IN ('Owner', 'Manager'))
    WITH CHECK (get_user_role() IN ('Owner', 'Manager'));

-- Only Owners can delete clients
CREATE POLICY "Owners can delete clients"
    ON clients FOR DELETE
    TO authenticated
    USING (get_user_role() = 'Owner');

-- ============================================
-- RLS POLICIES: reservations
-- ============================================
-- All authenticated users can view reservations
CREATE POLICY "Reservations are viewable by authenticated users"
    ON reservations FOR SELECT
    TO authenticated
    USING (true);

-- All authenticated users can create reservations
CREATE POLICY "Authenticated users can create reservations"
    ON reservations FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Owners and Managers can update reservations
CREATE POLICY "Owners and Managers can update reservations"
    ON reservations FOR UPDATE
    TO authenticated
    USING (get_user_role() IN ('Owner', 'Manager'))
    WITH CHECK (get_user_role() IN ('Owner', 'Manager'));

-- Only Owners can delete reservations
CREATE POLICY "Owners can delete reservations"
    ON reservations FOR DELETE
    TO authenticated
    USING (get_user_role() = 'Owner');

-- ============================================
-- RLS POLICIES: sales
-- ============================================
-- All authenticated users can view basic sale info
-- But sensitive fields (profit) are handled at application level
CREATE POLICY "Sales are viewable by authenticated users"
    ON sales FOR SELECT
    TO authenticated
    USING (true);

-- All authenticated users can create sales
CREATE POLICY "Authenticated users can create sales"
    ON sales FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Owners and Managers can update sales
CREATE POLICY "Owners and Managers can update sales"
    ON sales FOR UPDATE
    TO authenticated
    USING (get_user_role() IN ('Owner', 'Manager'))
    WITH CHECK (get_user_role() IN ('Owner', 'Manager'));

-- Only Owners can delete sales
CREATE POLICY "Owners can delete sales"
    ON sales FOR DELETE
    TO authenticated
    USING (get_user_role() = 'Owner');

-- ============================================
-- RLS POLICIES: installments
-- ============================================
-- All authenticated users can view installments
CREATE POLICY "Installments are viewable by authenticated users"
    ON installments FOR SELECT
    TO authenticated
    USING (true);

-- All authenticated users can create installments (via sale creation)
CREATE POLICY "Authenticated users can create installments"
    ON installments FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Owners and Managers can update installments
CREATE POLICY "Owners and Managers can update installments"
    ON installments FOR UPDATE
    TO authenticated
    USING (get_user_role() IN ('Owner', 'Manager'))
    WITH CHECK (get_user_role() IN ('Owner', 'Manager'));

-- Only Owners can delete installments
CREATE POLICY "Owners can delete installments"
    ON installments FOR DELETE
    TO authenticated
    USING (get_user_role() = 'Owner');

-- ============================================
-- RLS POLICIES: payments
-- ============================================
-- All authenticated users can view payments
CREATE POLICY "Payments are viewable by authenticated users"
    ON payments FOR SELECT
    TO authenticated
    USING (true);

-- All authenticated users can record payments
CREATE POLICY "Authenticated users can record payments"
    ON payments FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Owners and Managers can update payments
CREATE POLICY "Owners and Managers can update payments"
    ON payments FOR UPDATE
    TO authenticated
    USING (get_user_role() IN ('Owner', 'Manager'))
    WITH CHECK (get_user_role() IN ('Owner', 'Manager'));

-- Only Owners can delete payments
CREATE POLICY "Owners can delete payments"
    ON payments FOR DELETE
    TO authenticated
    USING (get_user_role() = 'Owner');

-- ============================================
-- RLS POLICIES: audit_logs
-- ============================================
-- Only Owners and Managers can view audit logs
CREATE POLICY "Owners and Managers can view audit logs"
    ON audit_logs FOR SELECT
    TO authenticated
    USING (get_user_role() IN ('Owner', 'Manager'));

-- Audit logs are inserted automatically via trigger
CREATE POLICY "System can insert audit logs"
    ON audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Audit logs cannot be updated or deleted
-- (No UPDATE or DELETE policies = denied by default)

-- ============================================
-- VIEWS FOR SENSITIVE DATA FILTERING
-- ============================================

-- View for sales without profit (for FieldStaff)
CREATE OR REPLACE VIEW sales_public AS
SELECT 
    id,
    client_id,
    land_piece_ids,
    reservation_id,
    payment_type,
    total_selling_price,
    small_advance_amount,
    big_advance_amount,
    installment_start_date,
    installment_end_date,
    number_of_installments,
    monthly_installment_amount,
    status,
    sale_date,
    notes,
    created_by,
    created_at,
    updated_at,
    -- Hide profit from unauthorized users
    CASE 
        WHEN get_user_role() IN ('Owner', 'Manager') THEN profit_margin
        ELSE NULL
    END AS profit_margin,
    CASE 
        WHEN get_user_role() IN ('Owner', 'Manager') THEN total_purchase_cost
        ELSE NULL
    END AS total_purchase_cost
FROM sales;

-- View for land pieces without purchase cost (for FieldStaff)
CREATE OR REPLACE VIEW land_pieces_public AS
SELECT 
    id,
    land_batch_id,
    piece_number,
    surface_area,
    selling_price_full,
    selling_price_installment,
    status,
    reserved_until,
    reservation_client_id,
    notes,
    created_at,
    updated_at,
    -- Hide purchase cost from unauthorized users
    CASE 
        WHEN get_user_role() IN ('Owner', 'Manager') THEN purchase_cost
        ELSE NULL
    END AS purchase_cost
FROM land_pieces;

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Additional composite indexes for common queries
CREATE INDEX idx_sales_client_status ON sales(client_id, status);
CREATE INDEX idx_installments_sale_status ON installments(sale_id, status);
CREATE INDEX idx_payments_client_date ON payments(client_id, payment_date);
CREATE INDEX idx_land_pieces_batch_status ON land_pieces(land_batch_id, status);

-- ============================================
-- END OF SCHEMA
-- ============================================
