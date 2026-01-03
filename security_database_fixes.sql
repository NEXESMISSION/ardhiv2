-- ============================================
-- SECURITY DATABASE FIXES
-- Add constraints and complete audit trail
-- ============================================

-- ============================================
-- ADD DATABASE CONSTRAINTS FOR INPUT VALIDATION
-- ============================================

-- Users table constraints
ALTER TABLE users 
  ALTER COLUMN name SET DATA TYPE VARCHAR(255),
  ALTER COLUMN email SET DATA TYPE VARCHAR(254);

-- Clients table constraints
ALTER TABLE clients 
  ALTER COLUMN name SET DATA TYPE VARCHAR(255),
  ALTER COLUMN cin SET DATA TYPE VARCHAR(50),
  ALTER COLUMN phone SET DATA TYPE VARCHAR(20),
  ALTER COLUMN email SET DATA TYPE VARCHAR(254),
  ALTER COLUMN address SET DATA TYPE VARCHAR(500);

-- Land batches constraints
ALTER TABLE land_batches 
  ALTER COLUMN name SET DATA TYPE VARCHAR(255);

-- Land pieces constraints
ALTER TABLE land_pieces 
  ALTER COLUMN piece_number SET DATA TYPE VARCHAR(50);

-- Add CHECK constraints for validation
ALTER TABLE clients 
  ADD CONSTRAINT clients_name_length CHECK (LENGTH(name) <= 255),
  ADD CONSTRAINT clients_cin_length CHECK (LENGTH(cin) <= 50),
  ADD CONSTRAINT clients_phone_length CHECK (phone IS NULL OR LENGTH(phone) <= 20),
  ADD CONSTRAINT clients_email_length CHECK (email IS NULL OR LENGTH(email) <= 254),
  ADD CONSTRAINT clients_address_length CHECK (address IS NULL OR LENGTH(address) <= 500);

ALTER TABLE users 
  ADD CONSTRAINT users_name_length CHECK (LENGTH(name) <= 255),
  ADD CONSTRAINT users_email_length CHECK (LENGTH(email) <= 254);

ALTER TABLE land_batches 
  ADD CONSTRAINT land_batches_name_length CHECK (LENGTH(name) <= 255);

ALTER TABLE land_pieces 
  ADD CONSTRAINT land_pieces_piece_number_length CHECK (LENGTH(piece_number) <= 50);

-- ============================================
-- COMPLETE AUDIT TRAIL - ADD MISSING TRIGGERS
-- ============================================

-- Add audit trigger for land_batches (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'audit_land_batches'
  ) THEN
    CREATE TRIGGER audit_land_batches AFTER INSERT OR UPDATE OR DELETE ON land_batches
      FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
  END IF;
END $$;

-- Add audit trigger for reservations (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'audit_reservations'
  ) THEN
    CREATE TRIGGER audit_reservations AFTER INSERT OR UPDATE OR DELETE ON reservations
      FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
  END IF;
END $$;

-- Add audit trigger for users (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'audit_users'
  ) THEN
    CREATE TRIGGER audit_users AFTER INSERT OR UPDATE OR DELETE ON users
      FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
  END IF;
END $$;

-- Add audit trigger for debts (if table exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'debts') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'audit_debts'
    ) THEN
      CREATE TRIGGER audit_debts AFTER INSERT OR UPDATE OR DELETE ON debts
        FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
    END IF;
  END IF;
END $$;

-- Add audit trigger for debt_payments (if table exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'debt_payments') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'audit_debt_payments'
    ) THEN
      CREATE TRIGGER audit_debt_payments AFTER INSERT OR UPDATE OR DELETE ON debt_payments
        FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
    END IF;
  END IF;
END $$;

-- ============================================
-- ADD SERVER-SIDE VALIDATION FUNCTIONS
-- ============================================

-- Function to validate email format
CREATE OR REPLACE FUNCTION validate_email(email_text TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  IF email_text IS NULL OR email_text = '' THEN
    RETURN TRUE; -- NULL/empty is allowed
  END IF;
  RETURN email_text ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to validate phone format (basic)
CREATE OR REPLACE FUNCTION validate_phone(phone_text TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  IF phone_text IS NULL OR phone_text = '' THEN
    RETURN TRUE; -- NULL/empty is allowed
  END IF;
  RETURN phone_text ~ '^[+]?[0-9]{1,20}$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add validation constraints
ALTER TABLE clients 
  ADD CONSTRAINT clients_email_format CHECK (email IS NULL OR validate_email(email)),
  ADD CONSTRAINT clients_phone_format CHECK (phone IS NULL OR validate_phone(phone));

ALTER TABLE users 
  ADD CONSTRAINT users_email_format CHECK (validate_email(email));

-- ============================================
-- ADD NOTES LENGTH CONSTRAINTS
-- ============================================

-- Add constraint for notes fields (if they exist as TEXT)
DO $$ 
BEGIN
  -- Clients notes
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'notes') THEN
    ALTER TABLE clients 
      ADD CONSTRAINT clients_notes_length CHECK (notes IS NULL OR LENGTH(notes) <= 5000);
  END IF;

  -- Land batches notes
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'land_batches' AND column_name = 'notes') THEN
    ALTER TABLE land_batches 
      ADD CONSTRAINT land_batches_notes_length CHECK (notes IS NULL OR LENGTH(notes) <= 5000);
  END IF;

  -- Land pieces notes
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'land_pieces' AND column_name = 'notes') THEN
    ALTER TABLE land_pieces 
      ADD CONSTRAINT land_pieces_notes_length CHECK (notes IS NULL OR LENGTH(notes) <= 5000);
  END IF;

  -- Sales notes
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'notes') THEN
    ALTER TABLE sales 
      ADD CONSTRAINT sales_notes_length CHECK (notes IS NULL OR LENGTH(notes) <= 5000);
  END IF;

  -- Installments notes
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'installments' AND column_name = 'notes') THEN
    ALTER TABLE installments 
      ADD CONSTRAINT installments_notes_length CHECK (notes IS NULL OR LENGTH(notes) <= 5000);
  END IF;

  -- Payments notes
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'notes') THEN
    ALTER TABLE payments 
      ADD CONSTRAINT payments_notes_length CHECK (notes IS NULL OR LENGTH(notes) <= 5000);
  END IF;
END $$;

-- ============================================
-- TIGHTEN RLS POLICIES
-- ============================================

-- Update sales policy to restrict creation based on permissions
-- Note: This requires application-level enforcement, but we can add a check function
CREATE OR REPLACE FUNCTION can_create_sales()
RETURNS BOOLEAN AS $$
DECLARE
  user_role_val user_role;
BEGIN
  SELECT role INTO user_role_val FROM users WHERE id = auth.uid();
  -- FieldStaff cannot create sales according to permissions
  RETURN user_role_val IN ('Owner', 'Manager');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update sales INSERT policy to use the function
DROP POLICY IF EXISTS "Authenticated users can create sales" ON sales;
CREATE POLICY "Owners and Managers can create sales"
  ON sales FOR INSERT
  TO authenticated
  WITH CHECK (can_create_sales());

-- Update installments INSERT policy
DROP POLICY IF EXISTS "Authenticated users can create installments" ON installments;
CREATE POLICY "Owners and Managers can create installments"
  ON installments FOR INSERT
  TO authenticated
  WITH CHECK (get_user_role() IN ('Owner', 'Manager'));

-- ============================================
-- END OF SECURITY FIXES
-- ============================================

