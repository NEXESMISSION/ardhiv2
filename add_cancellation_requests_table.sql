-- Add cancellation requests table for managing sale cancellations
CREATE TABLE IF NOT EXISTS cancellation_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES users(id),
    cancellation_reason TEXT NOT NULL,
    requested_refund_amount DECIMAL(15, 2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'Pending', -- Pending, Approved, Rejected
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    final_refund_amount DECIMAL(15, 2),
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_sale ON cancellation_requests(sale_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_status ON cancellation_requests(status);
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_requested_by ON cancellation_requests(requested_by);

-- Add comment
COMMENT ON TABLE cancellation_requests IS 'Tracks cancellation requests for sales, requires Owner approval';

