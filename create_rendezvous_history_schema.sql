-- Create rendezvous_history table to track all changes to rendez-vous
CREATE TABLE IF NOT EXISTS sale_rendezvous_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rendezvous_id UUID NOT NULL REFERENCES sale_rendezvous(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES users(id),
  change_type TEXT NOT NULL CHECK (change_type IN ('created', 'updated', 'cancelled', 'rescheduled', 'completed', 'status_changed')),
  
  -- Old values (before change)
  old_rendezvous_date DATE,
  old_rendezvous_time TIME,
  old_notes TEXT,
  old_status TEXT,
  
  -- New values (after change)
  new_rendezvous_date DATE,
  new_rendezvous_time TIME,
  new_notes TEXT,
  new_status TEXT,
  
  -- Metadata
  change_description TEXT, -- Human-readable description of the change
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Additional context
  ip_address TEXT,
  user_agent TEXT
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_rendezvous_history_rendezvous_id ON sale_rendezvous_history(rendezvous_id);
CREATE INDEX IF NOT EXISTS idx_rendezvous_history_created_at ON sale_rendezvous_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rendezvous_history_changed_by ON sale_rendezvous_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_rendezvous_history_change_type ON sale_rendezvous_history(change_type);

-- Enable RLS
ALTER TABLE sale_rendezvous_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view rendezvous history" ON sale_rendezvous_history;
DROP POLICY IF EXISTS "Users can insert rendezvous history" ON sale_rendezvous_history;
DROP POLICY IF EXISTS "No one can delete rendezvous history" ON sale_rendezvous_history;

-- RLS Policies - Allow all authenticated users to view and insert history
CREATE POLICY "Users can view rendezvous history"
  ON sale_rendezvous_history FOR SELECT
  USING (true);

CREATE POLICY "Users can insert rendezvous history"
  ON sale_rendezvous_history FOR INSERT
  WITH CHECK (true);

-- Prevent deletion of history records (only allow updates if needed)
CREATE POLICY "No one can delete rendezvous history"
  ON sale_rendezvous_history FOR DELETE
  USING (false);

-- Function to create history entry
CREATE OR REPLACE FUNCTION log_rendezvous_change()
RETURNS TRIGGER AS $$
DECLARE
  change_desc TEXT;
  change_type_val TEXT;
  current_user_id UUID;
BEGIN
  -- Get current user ID - try multiple methods for robustness
  BEGIN
    current_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    current_user_id := NULL;
  END;
  
  -- If auth.uid() failed, try to get from session
  IF current_user_id IS NULL THEN
    BEGIN
      SELECT current_setting('request.jwt.claims', true)::json->>'sub' INTO current_user_id;
    EXCEPTION WHEN OTHERS THEN
      current_user_id := NULL;
    END;
  END IF;
  
  -- Determine change type
  IF TG_OP = 'INSERT' THEN
    change_type_val := 'created';
    change_desc := 'تم إنشاء الموعد';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Check what changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      change_type_val := 'status_changed';
      change_desc := format('تم تغيير الحالة من %s إلى %s', COALESCE(OLD.status, 'NULL'), COALESCE(NEW.status, 'NULL'));
    ELSIF OLD.rendezvous_date IS DISTINCT FROM NEW.rendezvous_date OR OLD.rendezvous_time IS DISTINCT FROM NEW.rendezvous_time THEN
      change_type_val := 'rescheduled';
      change_desc := format('تم تغيير الموعد من %s %s إلى %s %s', 
        COALESCE(OLD.rendezvous_date::TEXT, 'NULL'), COALESCE(OLD.rendezvous_time::TEXT, 'NULL'), 
        COALESCE(NEW.rendezvous_date::TEXT, 'NULL'), COALESCE(NEW.rendezvous_time::TEXT, 'NULL'));
    ELSIF OLD.notes IS DISTINCT FROM NEW.notes THEN
      change_type_val := 'updated';
      change_desc := 'تم تحديث ملاحظات الموعد';
    ELSE
      change_type_val := 'updated';
      change_desc := 'تم تحديث الموعد';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    change_type_val := 'cancelled';
    change_desc := 'تم حذف الموعد';
  END IF;

  -- Insert history record with error handling
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO sale_rendezvous_history (
        rendezvous_id,
        changed_by,
        change_type,
        new_rendezvous_date,
        new_rendezvous_time,
        new_notes,
        new_status,
        change_description
      ) VALUES (
        NEW.id,
        COALESCE(current_user_id, NEW.created_by, (SELECT id FROM users WHERE role = 'Owner' LIMIT 1)),
        change_type_val,
        NEW.rendezvous_date,
        NEW.rendezvous_time,
        NEW.notes,
        NEW.status,
        change_desc
      );
      RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
      INSERT INTO sale_rendezvous_history (
        rendezvous_id,
        changed_by,
        change_type,
        old_rendezvous_date,
        old_rendezvous_time,
        old_notes,
        old_status,
        new_rendezvous_date,
        new_rendezvous_time,
        new_notes,
        new_status,
        change_description
      ) VALUES (
        NEW.id,
        COALESCE(current_user_id, NEW.created_by, OLD.created_by, (SELECT id FROM users WHERE role = 'Owner' LIMIT 1)),
        change_type_val,
        OLD.rendezvous_date,
        OLD.rendezvous_time,
        OLD.notes,
        OLD.status,
        NEW.rendezvous_date,
        NEW.rendezvous_time,
        NEW.notes,
        NEW.status,
        change_desc
      );
      RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
      INSERT INTO sale_rendezvous_history (
        rendezvous_id,
        changed_by,
        change_type,
        old_rendezvous_date,
        old_rendezvous_time,
        old_notes,
        old_status,
        change_description
      ) VALUES (
        OLD.id,
        COALESCE(current_user_id, OLD.created_by, (SELECT id FROM users WHERE role = 'Owner' LIMIT 1)),
        change_type_val,
        OLD.rendezvous_date,
        OLD.rendezvous_time,
        OLD.notes,
        OLD.status,
        change_desc
      );
      RETURN OLD;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Failed to log rendezvous history: %', SQLERRM;
  END;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically log changes
DROP TRIGGER IF EXISTS trigger_log_rendezvous_change ON sale_rendezvous;
CREATE TRIGGER trigger_log_rendezvous_change
  AFTER INSERT OR UPDATE OR DELETE ON sale_rendezvous
  FOR EACH ROW
  EXECUTE FUNCTION log_rendezvous_change();

-- Grant necessary permissions
GRANT SELECT, INSERT ON sale_rendezvous_history TO authenticated;

