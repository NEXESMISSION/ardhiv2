-- Create phone_calls table for tracking phone call appointments
CREATE TABLE IF NOT EXISTS phone_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  name TEXT NOT NULL,
  rendezvous_time TIMESTAMP WITH TIME ZONE NOT NULL,
  land_batch_id UUID REFERENCES land_batches(id) ON DELETE SET NULL,
  motorized TEXT NOT NULL CHECK (motorized IN ('motorisé', 'non motorisé')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'not_done')),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_phone_calls_rendezvous_time ON phone_calls(rendezvous_time);
CREATE INDEX IF NOT EXISTS idx_phone_calls_land_batch_id ON phone_calls(land_batch_id);
CREATE INDEX IF NOT EXISTS idx_phone_calls_status ON phone_calls(status);
CREATE INDEX IF NOT EXISTS idx_phone_calls_created_by ON phone_calls(created_by);

-- Enable RLS
ALTER TABLE phone_calls ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view phone calls" ON phone_calls;
DROP POLICY IF EXISTS "Users can create phone calls" ON phone_calls;
DROP POLICY IF EXISTS "Users can update phone calls" ON phone_calls;
DROP POLICY IF EXISTS "Users can delete phone calls" ON phone_calls;

-- RLS Policies
CREATE POLICY "Users can view phone calls"
  ON phone_calls FOR SELECT
  USING (true);

CREATE POLICY "Users can create phone calls"
  ON phone_calls FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update phone calls"
  ON phone_calls FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete phone calls"
  ON phone_calls FOR DELETE
  USING (true);

-- Trigger to update updated_at
DROP TRIGGER IF EXISTS update_phone_calls_updated_at ON phone_calls;
CREATE TRIGGER update_phone_calls_updated_at
  BEFORE UPDATE ON phone_calls
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON phone_calls TO authenticated;

