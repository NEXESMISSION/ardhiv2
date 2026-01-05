-- ============================================
-- SETUP CRON JOB FOR RECURRING EXPENSES
-- ============================================
-- This script sets up automatic generation of recurring expenses
-- Run this AFTER running ADD_RECURRING_EXPENSES.sql
-- ============================================

-- ============================================
-- OPTION 1: Using pg_cron extension (if available in Supabase)
-- ============================================
-- Note: Supabase may not have pg_cron enabled. Check with Supabase support.

-- Enable pg_cron extension (if available)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule job to run every hour
-- SELECT cron.schedule(
--     'generate-recurring-expenses-hourly',
--     '0 * * * *', -- Every hour at minute 0
--     $$SELECT generate_recurring_expenses();$$
-- );

-- Schedule job to run every 15 minutes for more precision (checks time)
-- SELECT cron.schedule(
--     'generate-recurring-expenses-precise',
--     '*/15 * * * *', -- Every 15 minutes
--     $$SELECT check_and_generate_recurring_expenses();$$
-- );

-- ============================================
-- OPTION 2: Manual execution (for testing)
-- ============================================
-- Run this manually to generate recurring expenses:
-- SELECT * FROM generate_recurring_expenses();

-- Or with time checking:
-- SELECT check_and_generate_recurring_expenses();

-- ============================================
-- OPTION 3: Using Supabase Edge Functions + Database Webhooks
-- ============================================
-- Create an Edge Function that calls the database function
-- Then set up a webhook or external cron service (like cron-job.org)
-- to call your Edge Function endpoint

-- Example Edge Function code (edge-functions/generate-recurring-expenses/index.ts):
/*
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { data, error } = await supabase.rpc('generate_recurring_expenses')

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
*/

-- ============================================
-- OPTION 4: External Cron Service
-- ============================================
-- Use services like:
-- - cron-job.org
-- - EasyCron
-- - GitHub Actions (scheduled workflows)
-- - Vercel Cron Jobs
-- 
-- Set them to call your Supabase Edge Function or API endpoint
-- that executes: SELECT generate_recurring_expenses();

-- ============================================
-- View scheduled jobs (if using pg_cron)
-- ============================================
-- SELECT * FROM cron.job;

-- ============================================
-- Remove a scheduled job (if using pg_cron)
-- ============================================
-- SELECT cron.unschedule('generate-recurring-expenses-hourly');

-- ============================================
-- Test the function manually
-- ============================================
-- Test next occurrence calculation:
-- SELECT calculate_next_occurrence('Weekly', 1, CURRENT_DATE); -- Next Monday
-- SELECT calculate_next_occurrence('Monthly', 15, CURRENT_DATE); -- Next 15th of month
-- SELECT calculate_next_occurrence('Daily', NULL, CURRENT_DATE); -- Tomorrow

-- ============================================
-- Monitor recurring templates
-- ============================================
-- View all active templates:
-- SELECT 
--     id,
--     name,
--     amount,
--     recurrence_type,
--     recurrence_day,
--     recurrence_time,
--     next_occurrence_date,
--     last_generated_date,
--     is_active
-- FROM recurring_expenses_templates
-- WHERE is_active = TRUE
-- ORDER BY next_occurrence_date ASC;

-- ============================================
-- View generated expenses from templates
-- ============================================
-- SELECT 
--     e.id,
--     e.amount,
--     e.expense_date,
--     e.description,
--     e.is_revenue,
--     t.name as template_name,
--     t.recurrence_type
-- FROM expenses e
-- JOIN recurring_expenses_templates t ON e.recurrence_template_id = t.id
-- WHERE e.is_recurring = TRUE
-- ORDER BY e.expense_date DESC
-- LIMIT 50;

