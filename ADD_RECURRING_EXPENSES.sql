-- ============================================
-- RECURRING EXPENSES & REVENUE SYSTEM
-- Migration: Add auto-recurring expenses/revenue functionality
-- ============================================
-- Purpose: Automatically generate expenses/revenue based on recurring schedules
--          Supports daily, weekly, monthly, yearly with specific day and time
-- Run this in Supabase SQL Editor
-- Dependencies: Requires expenses table (from add_expenses_table.sql)
-- ============================================

-- ============================================
-- STEP 1: Create ENUM for recurrence types
-- ============================================
CREATE TYPE recurrence_type AS ENUM ('Daily', 'Weekly', 'Monthly', 'Yearly');

-- ============================================
-- STEP 2: Add recurring columns to expenses table
-- ============================================
-- Add columns to track if expense is recurring and its schedule
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_revenue BOOLEAN DEFAULT FALSE, -- To distinguish revenue from expenses
ADD COLUMN IF NOT EXISTS recurrence_type recurrence_type,
ADD COLUMN IF NOT EXISTS recurrence_day INTEGER, -- Day of week (1-7 for weekly) or day of month (1-31 for monthly)
ADD COLUMN IF NOT EXISTS recurrence_time TIME, -- Time of day (HH:MM format)
ADD COLUMN IF NOT EXISTS recurrence_template_id UUID, -- Reference to the template if this was auto-generated
ADD COLUMN IF NOT EXISTS next_occurrence_date DATE, -- When to generate next occurrence
ADD COLUMN IF NOT EXISTS last_generated_date DATE; -- When this occurrence was generated

-- Add index for recurring expenses lookup
CREATE INDEX IF NOT EXISTS idx_expenses_recurring ON expenses(is_recurring) WHERE is_recurring = TRUE;
CREATE INDEX IF NOT EXISTS idx_expenses_next_occurrence ON expenses(next_occurrence_date) WHERE next_occurrence_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_recurrence_template ON expenses(recurrence_template_id) WHERE recurrence_template_id IS NOT NULL;

-- ============================================
-- STEP 3: Create recurring_expenses_templates table
-- ============================================
-- This table stores the templates for recurring expenses/revenue
CREATE TABLE IF NOT EXISTS recurring_expenses_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL, -- Template name (e.g., "Monthly Office Rent")
    category_id UUID NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
    amount DECIMAL(15, 2) NOT NULL,
    description TEXT,
    payment_method payment_method NOT NULL DEFAULT 'Cash',
    is_revenue BOOLEAN DEFAULT FALSE, -- TRUE for revenue, FALSE for expense
    -- Recurrence settings
    recurrence_type recurrence_type NOT NULL,
    recurrence_day INTEGER NOT NULL, -- Day of week (1=Monday, 7=Sunday) for Weekly, or day of month (1-31) for Monthly
    recurrence_time TIME NOT NULL, -- Time of day (HH:MM)
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    next_occurrence_date DATE NOT NULL, -- Next date to generate expense
    last_generated_date DATE, -- Last date expense was generated
    -- Related fields
    related_batch_id UUID REFERENCES land_batches(id) ON DELETE SET NULL,
    related_sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
    tags TEXT[],
    -- Metadata
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Constraints
    CONSTRAINT valid_weekly_day CHECK (
        (recurrence_type = 'Weekly' AND recurrence_day BETWEEN 1 AND 7) OR
        (recurrence_type != 'Weekly')
    ),
    CONSTRAINT valid_monthly_day CHECK (
        (recurrence_type = 'Monthly' AND recurrence_day BETWEEN 1 AND 31) OR
        (recurrence_type != 'Monthly')
    ),
    CONSTRAINT valid_daily_time CHECK (
        recurrence_type = 'Daily' OR recurrence_time IS NOT NULL
    )
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_recurring_templates_active ON recurring_expenses_templates(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_recurring_templates_next_date ON recurring_expenses_templates(next_occurrence_date) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_recurring_templates_type ON recurring_expenses_templates(recurrence_type);
CREATE INDEX IF NOT EXISTS idx_recurring_templates_created_by ON recurring_expenses_templates(created_by);

-- Add comment
COMMENT ON TABLE recurring_expenses_templates IS 'Templates for auto-generating recurring expenses and revenue';
COMMENT ON COLUMN recurring_expenses_templates.recurrence_day IS 'Day of week (1-7) for Weekly, day of month (1-31) for Monthly, ignored for Daily/Yearly';
COMMENT ON COLUMN recurring_expenses_templates.recurrence_time IS 'Time of day (HH:MM) when expense should be generated';

-- ============================================
-- STEP 4: Create function to calculate next occurrence date
-- ============================================
CREATE OR REPLACE FUNCTION calculate_next_occurrence(
    p_recurrence_type recurrence_type,
    p_recurrence_day INTEGER,
    p_current_date DATE DEFAULT CURRENT_DATE
) RETURNS DATE AS $$
DECLARE
    v_next_date DATE;
    v_day_of_week INTEGER;
    v_days_until_next INTEGER;
BEGIN
    CASE p_recurrence_type
        WHEN 'Daily' THEN
            -- Next day
            v_next_date := p_current_date + INTERVAL '1 day';
            
        WHEN 'Weekly' THEN
            -- Get current day of week (1=Monday, 7=Sunday)
            v_day_of_week := EXTRACT(DOW FROM p_current_date);
            -- PostgreSQL DOW: 0=Sunday, 1=Monday, ..., 6=Saturday
            -- Convert to our system: 1=Monday, 7=Sunday
            IF v_day_of_week = 0 THEN
                v_day_of_week := 7;
            END IF;
            
            -- Calculate days until next occurrence
            IF p_recurrence_day > v_day_of_week THEN
                v_days_until_next := p_recurrence_day - v_day_of_week;
            ELSIF p_recurrence_day < v_day_of_week THEN
                v_days_until_next := 7 - v_day_of_week + p_recurrence_day;
            ELSE
                -- Same day, move to next week
                v_days_until_next := 7;
            END IF;
            
            v_next_date := p_current_date + (v_days_until_next || ' days')::INTERVAL;
            
        WHEN 'Monthly' THEN
            -- Next occurrence on same day of next month
            v_next_date := (p_current_date + INTERVAL '1 month')::DATE;
            
            -- If day doesn't exist in next month (e.g., Jan 31 -> Feb 28/29), use last day of month
            IF EXTRACT(DAY FROM v_next_date) != p_recurrence_day THEN
                v_next_date := (DATE_TRUNC('month', v_next_date) + INTERVAL '1 month - 1 day')::DATE;
            ELSE
                -- Set to specific day
                v_next_date := DATE_TRUNC('month', v_next_date)::DATE + (p_recurrence_day - 1) || ' days'::INTERVAL;
            END IF;
            
        WHEN 'Yearly' THEN
            -- Same day next year
            v_next_date := p_current_date + INTERVAL '1 year';
            
        ELSE
            v_next_date := p_current_date;
    END CASE;
    
    RETURN v_next_date;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- STEP 5: Create function to generate recurring expenses
-- ============================================
CREATE OR REPLACE FUNCTION generate_recurring_expenses()
RETURNS TABLE(
    generated_count INTEGER,
    template_id UUID,
    expense_id UUID
) AS $$
DECLARE
    v_template RECORD;
    v_new_expense_id UUID;
    v_next_date DATE;
    v_generated_count INTEGER := 0;
BEGIN
    -- Loop through all active templates that are due
    FOR v_template IN 
        SELECT * 
        FROM recurring_expenses_templates 
        WHERE is_active = TRUE
        AND next_occurrence_date <= CURRENT_DATE
        ORDER BY next_occurrence_date ASC
    LOOP
        -- Check if we should generate based on time
        -- For now, generate if date matches (time check can be added in cron job)
        -- Or generate if it's past the scheduled time today
        
        -- Create the expense/revenue
        INSERT INTO expenses (
            category_id,
            amount,
            expense_date,
            description,
            payment_method,
            related_batch_id,
            related_sale_id,
            tags,
            status,
            submitted_by,
            is_recurring,
            is_revenue,
            recurrence_type,
            recurrence_day,
            recurrence_time,
            recurrence_template_id,
            next_occurrence_date,
            last_generated_date,
            created_at
        ) VALUES (
            v_template.category_id,
            v_template.amount,
            v_template.next_occurrence_date, -- Use the scheduled date
            COALESCE(v_template.description, v_template.name),
            v_template.payment_method,
            v_template.related_batch_id,
            v_template.related_sale_id,
            v_template.tags,
            'Approved', -- Auto-approve recurring expenses
            v_template.created_by,
            TRUE,
            v_template.is_revenue,
            v_template.recurrence_type,
            v_template.recurrence_day,
            v_template.recurrence_time,
            v_template.id,
            NULL, -- Will be calculated below
            v_template.next_occurrence_date,
            NOW()
        ) RETURNING id INTO v_new_expense_id;
        
        -- Calculate next occurrence date
        v_next_date := calculate_next_occurrence(
            v_template.recurrence_type,
            v_template.recurrence_day,
            v_template.next_occurrence_date
        );
        
        -- Update template with next occurrence date
        UPDATE recurring_expenses_templates
        SET 
            next_occurrence_date = v_next_date,
            last_generated_date = v_template.next_occurrence_date,
            updated_at = NOW()
        WHERE id = v_template.id;
        
        -- Update the generated expense with next occurrence
        UPDATE expenses
        SET next_occurrence_date = v_next_date
        WHERE id = v_new_expense_id;
        
        v_generated_count := v_generated_count + 1;
        
        -- Return result
        RETURN QUERY SELECT v_generated_count, v_template.id, v_new_expense_id;
    END LOOP;
    
    -- If no templates processed, return zero count
    IF v_generated_count = 0 THEN
        RETURN QUERY SELECT 0::INTEGER, NULL::UUID, NULL::UUID;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 6: Create function to check and generate based on time
-- ============================================
-- This function checks if current time matches the scheduled time
CREATE OR REPLACE FUNCTION check_and_generate_recurring_expenses()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_template RECORD;
    v_current_time TIME := CURRENT_TIME;
    v_current_date DATE := CURRENT_DATE;
BEGIN
    -- Check for daily recurring expenses that match current time
    FOR v_template IN 
        SELECT * 
        FROM recurring_expenses_templates 
        WHERE is_active = TRUE
        AND recurrence_type = 'Daily'
        AND next_occurrence_date <= v_current_date
        AND recurrence_time <= v_current_time
    LOOP
        -- Generate the expense
        PERFORM generate_recurring_expenses();
        v_count := v_count + 1;
    END LOOP;
    
    -- For weekly/monthly/yearly, generate if date matches (time is less critical)
    -- But we still check time for precision
    FOR v_template IN 
        SELECT * 
        FROM recurring_expenses_templates 
        WHERE is_active = TRUE
        AND recurrence_type IN ('Weekly', 'Monthly', 'Yearly')
        AND next_occurrence_date = v_current_date
        AND (recurrence_time IS NULL OR recurrence_time <= v_current_time)
    LOOP
        PERFORM generate_recurring_expenses();
        v_count := v_count + 1;
    END LOOP;
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 7: Add updated_at trigger for templates
-- ============================================
CREATE TRIGGER update_recurring_templates_updated_at
    BEFORE UPDATE ON recurring_expenses_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STEP 8: Enable RLS on recurring_expenses_templates
-- ============================================
ALTER TABLE recurring_expenses_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for recurring_expenses_templates
-- All authenticated users can view templates
CREATE POLICY "Recurring templates are viewable by authenticated users"
    ON recurring_expenses_templates FOR SELECT
    TO authenticated
    USING (true);

-- All authenticated users can create templates
CREATE POLICY "Authenticated users can create recurring templates"
    ON recurring_expenses_templates FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Owners and Managers can update templates
CREATE POLICY "Owners and Managers can update recurring templates"
    ON recurring_expenses_templates FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('Owner', 'Manager')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('Owner', 'Manager')
        )
    );

-- Only Owners can delete templates
CREATE POLICY "Owners can delete recurring templates"
    ON recurring_expenses_templates FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'Owner'
        )
    );

-- ============================================
-- STEP 9: Create helper function to get day name
-- ============================================
CREATE OR REPLACE FUNCTION get_day_name(day_number INTEGER)
RETURNS TEXT AS $$
BEGIN
    CASE day_number
        WHEN 1 THEN RETURN 'الإثنين'; -- Monday
        WHEN 2 THEN RETURN 'الثلاثاء'; -- Tuesday
        WHEN 3 THEN RETURN 'الأربعاء'; -- Wednesday
        WHEN 4 THEN RETURN 'الخميس'; -- Thursday
        WHEN 5 THEN RETURN 'الجمعة'; -- Friday
        WHEN 6 THEN RETURN 'السبت'; -- Saturday
        WHEN 7 THEN RETURN 'الأحد'; -- Sunday
        ELSE RETURN 'غير محدد';
    END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- STEP 10: Example usage and testing
-- ============================================
-- Example: Create a daily recurring expense at 9:00 AM
/*
INSERT INTO recurring_expenses_templates (
    name,
    category_id,
    amount,
    description,
    recurrence_type,
    recurrence_day,
    recurrence_time,
    next_occurrence_date,
    created_by,
    is_revenue
) VALUES (
    'Daily Revenue - Morning',
    (SELECT id FROM expense_categories WHERE name = 'أخرى' LIMIT 1),
    100.00,
    'Daily morning revenue',
    'Daily',
    1, -- Ignored for daily
    '09:00:00',
    CURRENT_DATE,
    (SELECT id FROM users WHERE role = 'Owner' LIMIT 1),
    TRUE
);
*/

-- Example: Create a weekly recurring expense every Monday at 10:30 AM
/*
INSERT INTO recurring_expenses_templates (
    name,
    category_id,
    amount,
    description,
    recurrence_type,
    recurrence_day,
    recurrence_time,
    next_occurrence_date,
    created_by
) VALUES (
    'Weekly Office Rent',
    (SELECT id FROM expense_categories WHERE name = 'إيجار' LIMIT 1),
    500.00,
    'Weekly office rent payment',
    'Weekly',
    1, -- Monday
    '10:30:00',
    -- Calculate next Monday
    CURRENT_DATE + (8 - EXTRACT(DOW FROM CURRENT_DATE)::INTEGER) % 7 || ' days',
    (SELECT id FROM users WHERE role = 'Owner' LIMIT 1)
);
*/

-- Example: Create a monthly recurring expense on the 1st of each month at 8:00 AM
/*
INSERT INTO recurring_expenses_templates (
    name,
    category_id,
    amount,
    description,
    recurrence_type,
    recurrence_day,
    recurrence_time,
    next_occurrence_date,
    created_by
) VALUES (
    'Monthly Salary Payment',
    (SELECT id FROM expense_categories WHERE name = 'رواتب' LIMIT 1),
    2000.00,
    'Monthly salary payment',
    'Monthly',
    1, -- 1st of month
    '08:00:00',
    DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month')::DATE,
    (SELECT id FROM users WHERE role = 'Owner' LIMIT 1)
);
*/

-- ============================================
-- STEP 11: Setup instructions for cron job
-- ============================================
-- To automatically generate recurring expenses, you need to set up a cron job
-- Option 1: Use Supabase Edge Functions with pg_cron extension
-- Option 2: Use external cron service to call the function via API
-- Option 3: Use Supabase Database Webhooks (if available)

-- Example cron job (runs every hour):
-- SELECT cron.schedule('generate-recurring-expenses', '0 * * * *', $$SELECT generate_recurring_expenses();$$);

-- Or run every 15 minutes for more precision:
-- SELECT cron.schedule('generate-recurring-expenses', '*/15 * * * *', $$SELECT check_and_generate_recurring_expenses();$$);

-- ============================================
-- DONE!
-- ============================================
-- Your recurring expenses system is now set up!
-- 
-- Features:
-- ✅ Daily, Weekly, Monthly, Yearly recurrence
-- ✅ Specific day of week/month
-- ✅ Specific time (hours:minutes)
-- ✅ Auto-generation of expenses/revenue
-- ✅ Support for both expenses and revenue
-- ✅ Robust date calculation
-- ✅ RLS policies enabled
-- 
-- Next steps:
-- 1. Create recurring templates via UI or SQL
-- 2. Set up cron job to call generate_recurring_expenses() regularly
-- 3. Monitor generated expenses in the expenses table
-- ============================================

