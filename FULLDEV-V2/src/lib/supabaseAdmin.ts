import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseServiceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn('Missing Supabase service role key. Admin functions will not work.')
}

/**
 * Admin Supabase client with service role key
 * WARNING: Only use this in secure server-side contexts or Edge Functions
 * Never expose this in client-side code or commit it to version control
 * 
 * This client bypasses Row Level Security and should only be used for:
 * - Creating/deleting users programmatically
 * - Admin operations that require elevated privileges
 * - Server-side operations
 */
export const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null

