# Environment Variables Setup

## .env File

The `.env` file has been created with your Supabase credentials. **Never commit this file to version control!**

### Variables

- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Public/anonymous key (safe for browser)
- `VITE_SUPABASE_SERVICE_ROLE_KEY` - Service role key (SECRET - never expose!)

## Security Notes

### ⚠️ IMPORTANT: Service Role Key

The `VITE_SUPABASE_SERVICE_ROLE_KEY` is **SECRET** and should:
- ✅ Only be used in server-side code or Edge Functions
- ✅ Never be exposed in client-side code
- ✅ Never be committed to version control
- ❌ Never be used in React components
- ❌ Never be logged or displayed

### Current Implementation

Currently, the app uses:
- **Anon key** (`VITE_SUPABASE_ANON_KEY`) for all client-side operations
- This is safe because RLS policies are enabled

The service role key is available in `src/lib/supabaseAdmin.ts` but **should only be used in**:
- Supabase Edge Functions
- Secure backend services
- Server-side scripts

### For User Management

Currently, worker creation uses `supabase.auth.signUp()` which:
- Works with the anon key
- Requires email confirmation to be disabled (for development)
- Is the recommended approach for client-side user creation

If you need to create users without email confirmation or delete auth users, you'll need to:
1. Create a Supabase Edge Function
2. Use the service role key in that function
3. Call the function from your client code

## File Location

The `.env` file is in the project root and is already added to `.gitignore`.

## Verification

To verify your environment variables are loaded:

```typescript
console.log('URL:', import.meta.env.VITE_SUPABASE_URL)
console.log('Anon Key:', import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Set' : 'Missing')
// Never log the service role key!
```

