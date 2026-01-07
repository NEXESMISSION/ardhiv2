-- Create sales_history table to track all changes to sales
CREATE TABLE IF NOT EXISTS sales_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES users(id),
  change_type TEXT NOT NULL CHECK (change_type IN ('created', 'updated', 'cancelled', 'confirmed', 'status_changed', 'payment_updated')),
  
  -- Old values (before change)
  old_status TEXT,
  old_payment_type TEXT,
  old_total_selling_price DECIMAL(15, 2),
  old_small_advance_amount DECIMAL(15, 2),
  old_big_advance_amount DECIMAL(15, 2),
  old_notes TEXT,
  
  -- New values (after change)
  new_status TEXT,
  new_payment_type TEXT,
  new_total_selling_price DECIMAL(15, 2),
  new_small_advance_amount DECIMAL(15, 2),
  new_big_advance_amount DECIMAL(15, 2),
  new_notes TEXT,
  
  -- Metadata
  change_description TEXT, -- Human-readable description of the change
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Additional context
  ip_address TEXT,
  user_agent TEXT
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_sales_history_sale_id ON sales_history(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_history_created_at ON sales_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_history_changed_by ON sales_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_sales_history_change_type ON sales_history(change_type);

-- Enable RLS
ALTER TABLE sales_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view sales history" ON sales_history;
DROP POLICY IF EXISTS "Users can insert sales history" ON sales_history;
DROP POLICY IF EXISTS "No one can delete sales history" ON sales_history;

-- RLS Policies - Allow all authenticated users to view and insert history
CREATE POLICY "Users can view sales history"
  ON sales_history FOR SELECT
  USING (true);

CREATE POLICY "Users can insert sales history"
  ON sales_history FOR INSERT
  WITH CHECK (true);

-- Prevent deletion of history records (only allow updates if needed)
CREATE POLICY "No one can delete sales history"
  ON sales_history FOR DELETE
  USING (false);

-- Function to create history entry
CREATE OR REPLACE FUNCTION log_sale_change()
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
    change_desc := 'تم إنشاء البيع';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Check what changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      change_type_val := 'status_changed';
      change_desc := format('تم تغيير حالة البيع من %s إلى %s', COALESCE(OLD.status::TEXT, 'NULL'), COALESCE(NEW.status::TEXT, 'NULL'));
      
      -- Special handling for confirmation
      IF NEW.status = 'Confirmed' AND OLD.status IS DISTINCT FROM 'Confirmed' THEN
        change_type_val := 'confirmed';
        change_desc := 'تم تأكيد البيع';
      END IF;
      
      -- Special handling for cancellation
      IF NEW.status = 'Cancelled' AND OLD.status IS DISTINCT FROM 'Cancelled' THEN
        change_type_val := 'cancelled';
        change_desc := 'تم إلغاء البيع';
      END IF;
    ELSIF OLD.total_selling_price IS DISTINCT FROM NEW.total_selling_price OR 
          OLD.small_advance_amount IS DISTINCT FROM NEW.small_advance_amount OR
          OLD.big_advance_amount IS DISTINCT FROM NEW.big_advance_amount THEN
      change_type_val := 'payment_updated';
      change_desc := 'تم تحديث معلومات الدفع';
    ELSIF OLD.payment_type IS DISTINCT FROM NEW.payment_type THEN
      change_type_val := 'updated';
      change_desc := format('تم تغيير نوع الدفع من %s إلى %s', COALESCE(OLD.payment_type::TEXT, 'NULL'), COALESCE(NEW.payment_type::TEXT, 'NULL'));
    ELSIF OLD.notes IS DISTINCT FROM NEW.notes THEN
      change_type_val := 'updated';
      change_desc := 'تم تحديث ملاحظات البيع';
    ELSE
      change_type_val := 'updated';
      change_desc := 'تم تحديث البيع';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    change_type_val := 'cancelled';
    change_desc := 'تم حذف البيع';
  END IF;

  -- Insert history record with error handling
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO sales_history (
        sale_id,
        changed_by,
        change_type,
        new_status,
        new_payment_type,
        new_total_selling_price,
        new_small_advance_amount,
        new_big_advance_amount,
        new_notes,
        change_description
      ) VALUES (
        NEW.id,
        COALESCE(current_user_id, NEW.created_by, (SELECT id FROM users WHERE role = 'Owner' LIMIT 1)),
        change_type_val,
        NEW.status::TEXT,
        NEW.payment_type::TEXT,
        NEW.total_selling_price,
        NEW.small_advance_amount,
        NEW.big_advance_amount,
        NEW.notes,
        change_desc
      );
      RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
      INSERT INTO sales_history (
        sale_id,
        changed_by,
        change_type,
        old_status,
        old_payment_type,
        old_total_selling_price,
        old_small_advance_amount,
        old_big_advance_amount,
        old_notes,
        new_status,
        new_payment_type,
        new_total_selling_price,
        new_small_advance_amount,
        new_big_advance_amount,
        new_notes,
        change_description
      ) VALUES (
        NEW.id,
        COALESCE(current_user_id, NEW.created_by, OLD.created_by, (SELECT id FROM users WHERE role = 'Owner' LIMIT 1)),
        change_type_val,
        OLD.status::TEXT,
        OLD.payment_type::TEXT,
        OLD.total_selling_price,
        OLD.small_advance_amount,
        OLD.big_advance_amount,
        OLD.notes,
        NEW.status::TEXT,
        NEW.payment_type::TEXT,
        NEW.total_selling_price,
        NEW.small_advance_amount,
        NEW.big_advance_amount,
        NEW.notes,
        change_desc
      );
      RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
      INSERT INTO sales_history (
        sale_id,
        changed_by,
        change_type,
        old_status,
        old_payment_type,
        old_total_selling_price,
        old_small_advance_amount,
        old_big_advance_amount,
        old_notes,
        change_description
      ) VALUES (
        OLD.id,
        COALESCE(current_user_id, OLD.created_by, (SELECT id FROM users WHERE role = 'Owner' LIMIT 1)),
        change_type_val,
        OLD.status::TEXT,
        OLD.payment_type::TEXT,
        OLD.total_selling_price,
        OLD.small_advance_amount,
        OLD.big_advance_amount,
        OLD.notes,
        change_desc
      );
      RETURN OLD;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Failed to log sale history: %', SQLERRM;
  END;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically log changes
DROP TRIGGER IF EXISTS trigger_log_sale_change ON sales;
CREATE TRIGGER trigger_log_sale_change
  AFTER INSERT OR UPDATE OR DELETE ON sales
  FOR EACH ROW
  EXECUTE FUNCTION log_sale_change();

-- Grant necessary permissions
GRANT SELECT, INSERT ON sales_history TO authenticated;

