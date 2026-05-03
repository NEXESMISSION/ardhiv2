// Supabase Edge Function: admin-users
// Performs privileged auth operations (create/delete user, reset password) on behalf of an authenticated Owner.
// The service-role key lives in this function's environment, never in the browser.
//
// Required env vars (auto-injected by Supabase except SERVICE_ROLE_KEY which you set via `supabase secrets set`):
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PASSWORD_MIN = 8

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // 1. Verify the caller's JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) {
      return json({ error: 'Invalid or expired session' }, 401)
    }
    const callerAuthId = userData.user.id

    // 2. Verify the caller has Owner role (using service-role to bypass any RLS on `users`)
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: callerProfile, error: profileErr } = await adminClient
      .from('users')
      .select('role')
      .eq('auth_user_id', callerAuthId)
      .single()
    if (profileErr || !callerProfile) {
      return json({ error: 'Caller profile not found' }, 403)
    }
    if (callerProfile.role !== 'owner') {
      return json({ error: 'Owner role required' }, 403)
    }

    // 3. Dispatch
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return json({ error: 'Invalid JSON body' }, 400)
    const action = (body as Record<string, unknown>).action

    switch (action) {
      case 'create':
        return await handleCreate(adminClient, body)
      case 'update_password':
        return await handleUpdatePassword(adminClient, body)
      case 'delete':
        return await handleDelete(adminClient, body, callerAuthId)
      default:
        return json({ error: `Unknown action: ${String(action)}` }, 400)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return json({ error: msg }, 500)
  }
})

async function handleCreate(adminClient: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) return json({ error: 'email and password are required' }, 400)
  if (password.length < PASSWORD_MIN) return json({ error: `Password must be at least ${PASSWORD_MIN} characters` }, 400)

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) {
    if (error.message.toLowerCase().includes('already registered') || error.message.toLowerCase().includes('already exists')) {
      return json({ error: 'EMAIL_EXISTS' }, 409)
    }
    return json({ error: error.message }, 400)
  }
  if (!data.user) return json({ error: 'Auth user creation returned no user' }, 500)
  return json({ user: { id: data.user.id, email: data.user.email } })
}

async function handleUpdatePassword(adminClient: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const password = typeof body.password === 'string' ? body.password : ''
  if (!password) return json({ error: 'password is required' }, 400)
  if (password.length < PASSWORD_MIN) return json({ error: `Password must be at least ${PASSWORD_MIN} characters` }, 400)

  const authUserId = typeof body.auth_user_id === 'string' ? body.auth_user_id : null
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : null

  let targetId = authUserId
  if (!targetId && email) {
    const { data, error } = await adminClient.auth.admin.listUsers()
    if (error) return json({ error: error.message }, 500)
    const found = data.users.find((u) => u.email === email)
    if (!found) return json({ error: 'Auth user not found for that email' }, 404)
    targetId = found.id
  }
  if (!targetId) return json({ error: 'auth_user_id or email is required' }, 400)

  const { error } = await adminClient.auth.admin.updateUserById(targetId, { password })
  if (error) return json({ error: error.message }, 400)
  return json({ ok: true })
}

async function handleDelete(adminClient: ReturnType<typeof createClient>, body: Record<string, unknown>, callerAuthId: string) {
  const authUserId = typeof body.auth_user_id === 'string' ? body.auth_user_id : ''
  if (!authUserId) return json({ error: 'auth_user_id is required' }, 400)
  if (authUserId === callerAuthId) {
    return json({ error: 'Cannot delete your own account' }, 400)
  }
  const { error } = await adminClient.auth.admin.deleteUser(authUserId)
  if (error) return json({ error: error.message }, 400)
  return json({ ok: true })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
