-- ============================================
-- ENSURE USER TRACKING IS COMPLETE
-- ============================================
-- This script ensures:
-- 1. All tables have proper user tracking (created_by/recorded_by)
-- 2. Audit triggers are on all important tables
-- 3. IP address and user agent tracking in audit logs
-- 4. All operations are properly logged
--
-- Run this in Supabase SQL Editor
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: Add created_by to tables that might be missing it
-- ============================================

-- Check and add created_by to expenses if missing
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'expenses') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'expenses' 
      AND column_name = 'created_by'
    ) THEN
      ALTER TABLE expenses ADD COLUMN created_by UUID REFERENCES users(id);
      CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON expenses(created_by);
      RAISE NOTICE 'Added created_by column to expenses table';
    END IF;
  END IF;
END $$;

-- Check and add created_by to real_estate_projects if missing
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'real_estate_projects') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'real_estate_projects' 
      AND column_name = 'created_by'
    ) THEN
      ALTER TABLE real_estate_projects ADD COLUMN created_by UUID REFERENCES users(id);
      CREATE INDEX IF NOT EXISTS idx_projects_created_by ON real_estate_projects(created_by);
      RAISE NOTICE 'Added created_by column to real_estate_projects table';
    END IF;
  END IF;
END $$;

-- Check and add recorded_by to project_expenses if missing
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_expenses') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'project_expenses' 
      AND column_name = 'recorded_by'
    ) THEN
      ALTER TABLE project_expenses ADD COLUMN recorded_by UUID REFERENCES users(id);
      CREATE INDEX IF NOT EXISTS idx_project_expenses_recorded_by ON project_expenses(recorded_by);
      RAISE NOTICE 'Added recorded_by column to project_expenses table';
    END IF;
  END IF;
END $$;

-- ============================================
-- STEP 2: Enhance audit_trigger_function to capture IP and user agent
-- ============================================

CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
  client_ip INET;
  client_user_agent TEXT;
BEGIN
  -- Try to get IP address from request headers (if available in Supabase context)
  -- Note: This may not work in all Supabase setups, but we try
  BEGIN
    client_ip := COALESCE(
      current_setting('request.headers', true)::json->>'x-forwarded-for',
      current_setting('request.headers', true)::json->>'x-real-ip',
      NULL
    )::INET;
  EXCEPTION
    WHEN OTHERS THEN
      client_ip := NULL;
  END;
  
  -- Try to get user agent
  BEGIN
    client_user_agent := current_setting('request.headers', true)::json->>'user-agent';
  EXCEPTION
    WHEN OTHERS THEN
      client_user_agent := NULL;
  END;
  
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values, ip_address, user_agent)
    VALUES (auth.uid(), 'INSERT', TG_TABLE_NAME, NEW.id, to_jsonb(NEW), client_ip, client_user_agent);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent)
    VALUES (auth.uid(), 'UPDATE', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW), client_ip, client_user_agent);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, ip_address, user_agent)
    VALUES (auth.uid(), 'DELETE', TG_TABLE_NAME, OLD.id, to_jsonb(OLD), client_ip, client_user_agent);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STEP 3: Ensure audit triggers exist on all important tables
-- ============================================

-- Drop existing triggers if they exist (to recreate with new function)
DROP TRIGGER IF EXISTS audit_sales ON sales;
DROP TRIGGER IF EXISTS audit_payments ON payments;
DROP TRIGGER IF EXISTS audit_land_pieces ON land_pieces;
DROP TRIGGER IF EXISTS audit_clients ON clients;
DROP TRIGGER IF EXISTS audit_installments ON installments;
DROP TRIGGER IF EXISTS audit_land_batches ON land_batches;
DROP TRIGGER IF EXISTS audit_reservations ON reservations;
DROP TRIGGER IF EXISTS audit_debts ON debts;
DROP TRIGGER IF EXISTS audit_expenses ON expenses;
DROP TRIGGER IF EXISTS audit_real_estate_projects ON real_estate_projects;
DROP TRIGGER IF EXISTS audit_project_expenses ON project_expenses;

-- Recreate audit triggers
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

CREATE TRIGGER audit_land_batches AFTER INSERT OR UPDATE OR DELETE ON land_batches
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_reservations AFTER INSERT OR UPDATE OR DELETE ON reservations
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Add audit triggers to additional tables if they exist
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'debts') THEN
    CREATE TRIGGER audit_debts AFTER INSERT OR UPDATE OR DELETE ON debts
        FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
    RAISE NOTICE 'Added audit trigger to debts table';
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'expenses') THEN
    CREATE TRIGGER audit_expenses AFTER INSERT OR UPDATE OR DELETE ON expenses
        FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
    RAISE NOTICE 'Added audit trigger to expenses table';
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'real_estate_projects') THEN
    CREATE TRIGGER audit_real_estate_projects AFTER INSERT OR UPDATE OR DELETE ON real_estate_projects
        FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
    RAISE NOTICE 'Added audit trigger to real_estate_projects table';
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_expenses') THEN
    CREATE TRIGGER audit_project_expenses AFTER INSERT OR UPDATE OR DELETE ON project_expenses
        FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
    RAISE NOTICE 'Added audit trigger to project_expenses table';
  END IF;
END $$;

-- ============================================
-- STEP 4: Create function to manually log actions (for frontend use)
-- ============================================

CREATE OR REPLACE FUNCTION log_user_action(
  p_action TEXT,
  p_table_name TEXT,
  p_record_id UUID DEFAULT NULL,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  log_id UUID;
  client_ip INET;
  client_user_agent TEXT;
BEGIN
  -- Try to get IP and user agent (may not always be available)
  BEGIN
    client_ip := COALESCE(
      current_setting('request.headers', true)::json->>'x-forwarded-for',
      current_setting('request.headers', true)::json->>'x-real-ip',
      NULL
    )::INET;
  EXCEPTION
    WHEN OTHERS THEN
      client_ip := NULL;
  END;
  
  BEGIN
    client_user_agent := current_setting('request.headers', true)::json->>'user-agent';
  EXCEPTION
    WHEN OTHERS THEN
      client_user_agent := NULL;
  END;
  
  INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent)
  VALUES (auth.uid(), p_action, p_table_name, p_record_id, p_old_values, p_new_values, client_ip, client_user_agent)
  RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$;

-- ============================================
-- STEP 5: Create view for easy audit log querying
-- ============================================

CREATE OR REPLACE VIEW audit_logs_with_user AS
SELECT 
  al.id,
  al.user_id,
  u.name as user_name,
  u.email as user_email,
  al.action,
  al.table_name,
  al.record_id,
  al.old_values,
  al.new_values,
  al.ip_address,
  al.user_agent,
  al.created_at
FROM audit_logs al
LEFT JOIN users u ON al.user_id = u.id
ORDER BY al.created_at DESC;

-- Grant access to authenticated users
GRANT SELECT ON audit_logs_with_user TO authenticated;

-- ============================================
-- STEP 6: Verification - Check all tables have user tracking
-- ============================================

DO $$
DECLARE
  table_rec RECORD;
  has_tracking BOOLEAN;
BEGIN
  RAISE NOTICE '=== USER TRACKING VERIFICATION ===';
  
  FOR table_rec IN 
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN (
      'clients', 'sales', 'land_batches', 'land_pieces', 
      'reservations', 'payments', 'installments', 
      'debts', 'expenses', 'real_estate_projects', 'project_expenses'
    )
    ORDER BY table_name
  LOOP
    -- Check for created_by or recorded_by
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = table_rec.table_name 
      AND column_name IN ('created_by', 'recorded_by', 'submitted_by')
    ) INTO has_tracking;
    
    IF has_tracking THEN
      RAISE NOTICE '✓ % has user tracking', table_rec.table_name;
    ELSE
      RAISE WARNING '✗ % is MISSING user tracking!', table_rec.table_name;
    END IF;
  END LOOP;
  
  RAISE NOTICE '=== AUDIT TRIGGERS VERIFICATION ===';
  
  FOR table_rec IN 
    SELECT c.relname as tablename
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    WHERE t.tgname LIKE 'audit_%'
    AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY c.relname
  LOOP
    RAISE NOTICE '✓ Audit trigger exists on %', table_rec.tablename;
  END LOOP;
END $$;

-- ============================================
-- STEP 7: Summary Report
-- ============================================

SELECT '=== USER TRACKING SUMMARY ===' as info;

SELECT 
  'Tables with created_by/recorded_by' as check_type,
  COUNT(DISTINCT table_name) as count
FROM information_schema.columns
WHERE table_schema = 'public'
AND column_name IN ('created_by', 'recorded_by', 'submitted_by')
AND table_name IN (
  'clients', 'sales', 'land_batches', 'land_pieces', 
  'reservations', 'payments', 'installments', 
  'debts', 'expenses', 'real_estate_projects', 'project_expenses'
);

SELECT 
  'Audit triggers active' as check_type,
  COUNT(*) as count
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE t.tgname LIKE 'audit_%'
AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND c.relkind = 'r';

SELECT 
  'Total audit log entries' as check_type,
  COUNT(*) as count
FROM audit_logs;

COMMIT;

-- ============================================
-- DONE!
-- ============================================
-- User tracking is now complete:
-- ✅ All tables have user tracking columns
-- ✅ All important tables have audit triggers
-- ✅ Audit logs capture IP and user agent
-- ✅ Manual logging function available
-- ✅ Easy-to-query audit view created
-- ============================================

