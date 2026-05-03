# Security Audit — Ardhi (FULLDEV-V2)

**Auditor:** Claude (security-focused review)
**Scope:** React + Vite + Supabase webapp at `C:\Users\Med Saief Allah\Desktop\Ardhi\`
**Boundaries:** Confidentiality, integrity, availability, authn, authz. Code-quality, performance, accessibility, and i18n explicitly out of scope (other audits cover those).
**Methodology:** Static review of all `src/` files; cross-referenced with the team's own `docs/DOCUMENTATION.md`, `docs/archive/PROJECT_NOTES.md`, `docs/archive/DATABASE_SCHEMA_REFERENCE.md`. Verified each prior open issue was either fixed or still present in code.

---

## Executive summary

This deployment is **catastrophically compromised**. The single most important finding is that the Supabase **service-role key is shipped in the browser bundle** and used by client-side code to perform privileged admin operations. Anyone who loads the public site can extract that key from `dist/assets/*.js` (or from `import.meta.env` at runtime in DevTools) and from that point on has **unrestricted, RLS-bypassing read/write/delete access to every table in the database, plus full Supabase Auth admin powers** (create, delete, change password of any user — including all Owners).

Everything below this finding is essentially academic until the service-role key is rotated and removed from the frontend, because an attacker with that key can defeat every other control. With that said, there are also significant secondary issues: brute-force protection on login is non-existent, all authorization is enforced only client-side via React state that any user can mutate in DevTools, the PWA service worker caches authenticated Supabase responses on disk for 24 hours (cross-account leakage on shared devices), Supabase JWTs live in `localStorage` (XSS exfiltration), the storage bucket upload paths use unscoped filenames (any authenticated user can read/overwrite anyone's profile image), and `vercel.json` ships zero security headers.

---

## Findings

### 1. [CRITICAL] Service-role key shipped to the browser

- **Title:** Service-role JWT exposed via `VITE_SUPABASE_SERVICE_ROLE_KEY` and bundled into client JS
- **Severity:** Critical
- **File(s):** `.env:3`, `src/lib/supabaseAdmin.ts:4`, `src/lib/supabaseAdmin.ts:20-27`
- **What's wrong:** `.env` contains `VITE_SUPABASE_SERVICE_ROLE_KEY=...` (a JWT decoded as `"role":"service_role"`). Any environment variable prefixed with `VITE_` is inlined by Vite at build time into the JavaScript bundle that is served to every browser. `src/lib/supabaseAdmin.ts:4` reads it via `import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY` and constructs a client with it. The string ends up verbatim in `dist/assets/*.js`, viewable by anyone who opens DevTools → Sources, or by `curl https://ardhiv2.vercel.app/assets/<chunk>.js | grep service_role`. The "WARNING: Only use this in secure server-side contexts" comment on lines 11-19 is moot — Vite has no concept of "server-side" for a frontend project, this code IS in the browser.
- **Why it matters (concrete attacker scenario):**
  1. Attacker loads the production site, opens DevTools, types `import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY` (or just searches the JS chunks for `service_role`). Gets the key.
  2. From their own machine, they instantiate `createClient(SUPABASE_URL, SERVICE_ROLE_KEY)`. This client **bypasses every RLS policy** on the entire database.
  3. They can now: dump every row of `clients` (CIN, phone, address, notes — PII for every customer of the business), `sales` (every sale price, deposit, profit), `users` (every staff member's email + role + permissions), `payments`, `installment_payments`, `appointments`, `notifications`, `audit_logs`. They can also `UPDATE` anything, `DELETE` anything, `INSERT` anything.
  4. With the service-role key they can also call `supabase.auth.admin.*`: **delete any user** (including the Owner — locking out the business), **change any password** (full account takeover of the Owner — they then log in as Owner, see/modify everything in the UI), **create new Owner-role users** for a backdoor.
  5. Since the JWT in `.env:3` decodes to `exp: 2084471697` (year 2036), the key remains valid for ~10 years unless rotated.
- **Recommended fix:** **Treat the key as compromised — it has been publicly accessible from the production deploy.** Immediately (a) regenerate the service-role key in Supabase Dashboard → Settings → API, (b) delete `VITE_SUPABASE_SERVICE_ROLE_KEY` from `.env`, from `.env.example` if present, from the Vercel project's environment variables, and from any `.env.production`, (c) delete `src/lib/supabaseAdmin.ts` entirely, (d) remove every `import` of `supabaseAdmin` from `src/pages/Users.tsx`. Move the three privileged operations currently performed by `supabaseAdmin` (`auth.admin.createUser`, `auth.admin.updateUserById` for password change, `auth.admin.deleteUser`, `auth.admin.listUsers`) into Supabase Edge Functions (or any server endpoint) that authenticate the caller, verify their `users.role = 'owner'`, then perform the operation server-side using the key from a *non-VITE* env var. Audit `git log`/blame to determine how long the key has been in `.env` (i.e. when it was first leaked) and rotate any other credentials touched by anyone who had repo access during that window.

### 2. [CRITICAL] Authorization is client-side only and trivially bypassable

- **Title:** Owner vs Worker, `allowed_pages`, `allowed_batches`, `allowed_pieces` are enforced exclusively by React state with no server-side check
- **Severity:** Critical
- **File(s):** `src/App.tsx:157-168`, `src/App.tsx:264-291`, `src/components/Sidebar.tsx:42-69`, `src/pages/Land.tsx:474-476`, `src/pages/Clients.tsx:1052`, `src/pages/Users.tsx:769`, `src/contexts/AuthContext.tsx:610-635`
- **What's wrong:** The role and the `allowed_*` arrays come from a single `SELECT … FROM users WHERE auth_user_id = ?` and are stored in React state (`systemUser`). Every gate is then `if (systemUser?.role === 'owner')` or `systemUser.allowed_pages.includes(...)` — pure JavaScript that runs in the user's own browser. The `users` table is read with the anon key, so RLS is *the* defense; if RLS on `users` lets a worker `UPDATE` their own row, they can promote themselves to Owner with one network call. Even without that: any worker can open DevTools, run `Object.assign(window, { __reactSomeFiber }).systemUser = { role: 'owner', allowed_pages: [...], allowed_batches: null, allowed_pieces: null }` (or just edit the cached object in `localStorage['app_system_user']` — see Finding #6), reload, and the entire UI now treats them as Owner. They can also bypass the UI entirely and call `supabase.from('sales').delete().eq('id', X)` from the console — RLS is the only thing that would stop them, and per `docs/DOCUMENTATION.md` "RLS is configured but disabled," and per `docs/archive/DATABASE_SCHEMA_REFERENCE.md` §2.3 most current RLS uses `USING (true)` for SELECT on most tables.
- **Why it matters:** A Worker who is restricted to a single batch + a single piece can: (a) read every batch/piece/client/sale by issuing direct `supabase.from(...)` calls; (b) edit prices on batches they don't "own" (Land.tsx allows updates to `land_batches` from any role on the network — only the *button* is hidden); (c) delete clients/sales by calling `.delete()` directly. This makes the entire `allowed_pages`/`allowed_batches`/`allowed_pieces` mechanism security theater.
- **Recommended fix:** Write Postgres RLS policies that enforce the same rules *server-side*: for `land_batches`/`land_pieces` use a `SECURITY DEFINER` helper `can_access_land_batch(uuid)` / `can_access_land_piece(uuid)` (already designed in `FIX_allowed_pieces_RLS_SECURITY.sql` per the archive notes — verify it's actually applied to the live DB). For `users`: only Owners can `INSERT`/`UPDATE` anyone's row except their own non-privileged columns; in particular `role`, `allowed_pages`, `allowed_batches`, `allowed_pieces` must be deny-by-default for non-Owners. For `sales`/`clients`/`payments`: write/update/delete only by users whose `role='owner'` OR (for INSERT) by Workers via SECURITY DEFINER RPCs that validate the worker has access to the involved batch/piece. Keep the client-side gates as UX hints, but treat every server call as if the user were unauthenticated and willing to lie. Once RLS is enforced, the leaked anon key is no longer a write-everywhere primitive (only the service-role key from Finding #1 is).

### 3. [CRITICAL] Workers can self-promote by writing to `users.role`

- **Title:** `users.preferred_language` update path is open and not column-scoped — combined with weak RLS lets workers escalate to Owner
- **Severity:** Critical (assumes RLS is the broad `USING (true)` pattern documented for the live DB)
- **File(s):** `src/i18n/context.tsx:35-40`, `src/contexts/AuthContext.tsx:339-342`
- **What's wrong:** `i18n/context.tsx:38` runs `supabase.from('users').update({ preferred_language: lang, updated_at: ... }).eq('auth_user_id', user.id)`. This is fine in itself, but it proves that workers have an UPDATE path into their own `users` row. Per `DATABASE_SCHEMA_REFERENCE.md` §2.3, the live RLS for `users` is the `users_select_own` / Owner-only-writes pattern, but other tables relax that to allow authenticated UPDATE. If the real `users` UPDATE policy is `USING (auth_user_id = auth.uid())` without a `WITH CHECK` that whitelists columns, a worker can in DevTools issue: `await supabase.from('users').update({ role: 'owner', allowed_pages: null, allowed_batches: null }).eq('auth_user_id', currentAuthUserId)`. The next time they reload (or after `refreshSystemUser()`), the app treats them as Owner.
- **Why it matters:** Trivial privilege escalation by any logged-in worker, with no exotic skills required. Combined with Finding #1 it's a moot point (attacker has service role anyway), but if Finding #1 is fixed this becomes the next-best escalation primitive.
- **Recommended fix:** RLS policy on `users` UPDATE for non-Owners must use `WITH CHECK (role = OLD.role AND allowed_pages IS NOT DISTINCT FROM OLD.allowed_pages AND allowed_batches IS NOT DISTINCT FROM OLD.allowed_batches AND allowed_pieces IS NOT DISTINCT FROM OLD.allowed_pieces AND created_by IS NOT DISTINCT FROM OLD.created_by)`. Or split the table: a `users_self_settings` view that exposes only `preferred_language`, `image_url`, `name`, `phone`, `place`, `title`, `notes` and is the only thing a worker can write to. Owners write to the full `users` table.

### 4. [CRITICAL] PWA service worker caches authenticated Supabase responses across users

- **Title:** Workbox `runtimeCaching` for `*.supabase.co/*` is `NetworkFirst` with 24h fallback, including `/rest/v1/*` and `/auth/v1/*`
- **Severity:** Critical (on shared devices)
- **File(s):** `vite.config.ts:64-78`
- **What's wrong:** The PWA config caches every `https://*.supabase.co/*` response in IndexedDB (the workbox cache) for up to 24 hours, **with no key on user identity, no `Vary: Authorization` handling, and the cache is shared by every user that opens the app on that device**. So if user A logs in on a shared tablet, navigates around (filling the cache with their `/rest/v1/clients`, `/rest/v1/sales`, `/rest/v1/users` JSON responses), then logs out, then user B logs in on the same device — when user B navigates while offline, or even online if `NetworkFirst` falls back during a flaky network blip, **B sees A's data**. The cache also persists *after logout* (the SW eviction is by age, not by auth event). The bucket also stores `/auth/v1/token` responses (which contain JWTs) — these are short-lived but still cacheable.
- **Why it matters:** This app is explicitly designed for Android tablet PWA install (see `index.html:55-62`, the Capacitor planning notes). Field workers sharing a tablet, or an Owner using the same device as a Worker, will leak data across sessions. Worse: an attacker who briefly gets physical access to a logged-out tablet can dump the SW cache via `chrome://serviceworker-internals` and recover the previous user's full client list / sales records.
- **Recommended fix:** Either (a) entirely exclude `*.supabase.co/rest/*` and `*.supabase.co/auth/*` from `runtimeCaching` (cache only the static asset CDN if any), or (b) use `NetworkOnly` for those paths. In addition, listen for `SIGNED_OUT` in `AuthContext`'s `onAuthStateChange` and call `caches.keys().then(keys => keys.forEach(k => caches.delete(k)))` to scrub on logout.

### 5. [HIGH] No login rate limiting / brute-force protection

- **Title:** `signInWithPassword` is called with no client-side throttle, no CAPTCHA, no lockout, no IP backoff
- **Severity:** High
- **File(s):** `src/pages/Login.tsx:72-184`, `src/contexts/AuthContext.tsx:740-822`
- **What's wrong:** The login handler takes the email/password, calls `supabase.auth.signInWithPassword`, and on error simply re-renders the form. There is no incrementing failure counter, no per-email lockout, no captcha after N failures, no exponential backoff, no IP throttling. Per the legacy notes (`PROJECT_NOTES.md` §3 row 4), an `add_login_attempts_tracking.sql` table + helper functions exist at the database level — but no code in `src/` references `login_attempts`, `should_lock_account`, `get_failed_attempts`, or any captcha component. So whatever protection exists is the Supabase Auth default rate limit (which can be tuned per-project but is not enforced at the application layer).
- **Why it matters:** An attacker can script `supabase.auth.signInWithPassword` calls against `nexesmission@gmail.com` (or other guessable Owner emails — note `.toLowerCase()` and the auto-`@gmail.com` append on line 86 of Login.tsx make enumeration even easier) at whatever rate Supabase's tenant-wide rate limit allows (typically 30/sec across all `/auth/*` operations unless tightened in Settings → API → Rate Limiting). With no per-account lockout, weak Owner passwords (the app's own UI requires only 6 chars, see Finding #11) are likely to fall in hours-to-days.
- **Recommended fix:** Implement the legacy `login_attempts` table + `should_lock_account()` design in code. Before each `signInWithPassword` call, RPC `should_lock_account(email)`; if it returns true, refuse. After every failure, INSERT into `login_attempts`. After 3 failures show a CAPTCHA (a local math captcha is enough). After 5 failures lock the account for 15 minutes. Also tighten the Supabase Dashboard → Settings → API → Rate Limiting for `/auth/*` to ~10/min/IP.

### 6. [HIGH] Sensitive data persisted in `localStorage` (JWT + full user profile)

- **Title:** Supabase JWT stored under `land-system-auth-v2`, full system-user profile cached as plaintext under `app_system_user`
- **Severity:** High
- **File(s):** `src/lib/supabase.ts:15`, `src/contexts/AuthContext.tsx:45-73`
- **What's wrong:** Supabase's JS client persists the access + refresh JWT in `localStorage['land-system-auth-v2']` (set explicitly at supabase.ts:15). Additionally `AuthContext.tsx:45-65` caches the entire `systemUser` object — including `id`, `email`, `role`, `allowed_pages`, `allowed_batches`, `allowed_pieces` — as plaintext JSON in `localStorage['app_system_user']`. localStorage is accessible from any JavaScript that runs on the same origin: a single XSS, a malicious npm dep doing supply-chain injection, or even a bookmarklet a phished user pastes from a "fix the bug" support article, can exfiltrate the JWT (full account takeover) + the role data. The cache also persists *after logout if anything fails* — `signOut()` calls `clearCachedSystemUser()` only in the happy path; if the network is offline or `supabase.auth.signOut()` errors, the cached user can remain until the next successful sign-in.
- **Why it matters:** Browsers do not isolate localStorage from JS. Any script (your own, a third party, or one injected via XSS) can `localStorage.getItem('land-system-auth-v2')` and use the bearer token to call Supabase as the logged-in user from anywhere on the internet, until the refresh token expires. Also, in DevTools, it takes 5 seconds for a worker to set `localStorage.setItem('app_system_user', JSON.stringify({ authUserId, user: { ...realUser, role: 'owner' } }))`, reload, and the cached path makes the app trust them as Owner until `loadSystemUser` revalidates (which can take seconds, or fail silently — see fallback path at AuthContext.tsx:483-507).
- **Recommended fix:** Browser-only apps without a backend cannot get httpOnly cookies, so localStorage is mostly forced. Mitigations: (a) shorten access-token TTL in Supabase Dashboard (1h is reasonable), (b) verify session age and re-authenticate Owners before any destructive operation, (c) **stop caching `systemUser` in localStorage** — it's used purely to make UI snappier; remove that cache layer and accept the 200-300ms revalidation cost, OR sign + verify the cached blob with a server-issued HMAC so it can't be forged client-side, (d) implement a strict Content-Security-Policy (Finding #10) so no third-party JS can read storage, (e) make `signOut` always clear localStorage even on network failure.

### 7. [HIGH] Storage uploads use unscoped filenames — any user can read/overwrite anyone's profile image

- **Title:** `profile-images` bucket uploads use `${Date.now()}-${randomShort()}.${ext}` with no per-user folder; bucket is `public read`
- **Severity:** High
- **File(s):** `src/pages/Users.tsx:441-477`, `src/pages/Home.tsx:247-281`
- **What's wrong:** Both upload paths construct a filename from `Date.now() + Math.random().toString(36).substring(7)` and put it directly at the root of the `profile-images` bucket (no `userId/` prefix). Per `DATABASE_SCHEMA_REFERENCE.md` §3, the bucket is configured public-read. Per the same docs, storage RLS for this bucket was set via the Dashboard (not in SQL) — likely the same `bucket_id = 'profile-images'` pattern that grants any authenticated user `INSERT`/`UPDATE`/`DELETE` on any object. Result: (a) any user knowing the URL of another user's photo (which they get from `users.image_url` SELECT) can `supabase.storage.from('profile-images').remove([fileName])` to vandalize it, or `.upload(fileName, evilFile, { upsert: true })` to swap their photo for something offensive/NSFW that then renders on the Owner's screen; (b) since the bucket is public-read and the URL is in every `users` row, profile images are accessible to anyone on the internet who guesses or scrapes them — there is no expiring signed URL.
- **Why it matters:** Reputational sabotage between workers, inappropriate-content injection into the Owner's UI (low confidentiality impact, medium integrity impact). On a worse axis: if `image_url` is ever swapped for something the Owner clicks ("download me"), a worker can phish the Owner via the photo column.
- **Recommended fix:** Change the upload path to `${authUserId}/profile.${ext}` (one folder per user), then write a storage RLS policy: `(bucket_id = 'profile-images' AND (storage.foldername(name))[1] = auth.uid()::text)` for `INSERT`/`UPDATE`/`DELETE`; keep public read if you must, or switch to signed URLs. Validate the file's actual MIME via a magic-byte check (see Finding #8) — `file.type.startsWith('image/')` only checks the user-supplied MIME header.

### 8. [HIGH] File upload validation is type-string-only (MIME-spoofable)

- **Title:** Profile-image uploads validate `file.type.startsWith('image/')` and size, but never check actual file bytes
- **Severity:** High
- **File(s):** `src/pages/Users.tsx:386-395`, `src/pages/Home.tsx:213-223`
- **What's wrong:** The check `if (!file.type.startsWith('image/'))` reads the MIME type from the `<input type=file>` API, which is determined by the browser from the file extension. An attacker renames `payload.svg` to `image.png`, the browser reports `image/png`, the check passes, the file is uploaded to the bucket as `.png`, but the file contents are SVG. Since `profile-images` is served with the original `Content-Type` (or as `application/octet-stream` depending on bucket config), and SVGs can contain `<script>`, an attacker can craft an SVG that, when opened directly, runs JavaScript on the `*.supabase.co` origin — limited blast radius but still a stored-XSS vector against anyone who follows the public URL. Same applies for HTML disguised as `image.png` if served with sniffing enabled.
- **Why it matters:** Stored XSS / payload hosting under the legitimate Supabase domain (good for phishing). Combined with Finding #7 (no per-user folder), one user can poison another user's profile image with a malicious SVG.
- **Recommended fix:** Reject `image/svg+xml` outright (it's almost always a security footgun). For other types, read the first 12 bytes on upload and check the magic number against `89 50 4E 47` (PNG), `FF D8 FF` (JPEG), `47 49 46 38` (GIF), `52 49 46 46 ?? ?? ?? ?? 57 45 42 50` (WebP). Reject anything else. Set the bucket's allowed MIME types in Supabase to the same whitelist.

### 9. [HIGH] Supabase RPC `update_sale_safe` is called with attacker-controllable `p_update_data`

- **Title:** Frontend RPC takes a free-form JSON `p_update_data` and forwards it to a stored procedure
- **Severity:** High (depends on the RPC's body — not in the captured SQL files)
- **File(s):** `src/components/ConfirmSaleDialog.tsx:450-453`, `src/components/ConfirmSaleDialog.tsx:539-542`
- **What's wrong:** The frontend calls `supabase.rpc('update_sale_safe', { p_sale_id, p_update_data: updateData })` where `updateData` is a JS object built from form state. Per `DATABASE_SCHEMA_REFERENCE.md` §0, `update_sale_safe` is "not defined in any SQL file — lives only in the live Supabase DB." If that RPC simply does `UPDATE sales SET (column_list) = (json_to_record(p_update_data))` it is effectively a column-level mass-assignment vulnerability: a worker can pass `p_update_data: { status: 'completed', confirmed_by: '<owner_uuid>', sale_price: 1, profit_margin: -99999 }` to forge a sale completion, attribute it to the Owner, and rewrite financial figures. Even if the RPC whitelists columns, the `p_update_data` is opaque to this audit and there's no client-side validation — the RPC is the only line of defense.
- **Why it matters:** Sale-state forgery is the heart of the business: a worker who can "confirm" a sale with arbitrary payment amounts can siphon deposit money, fake completed sales for commission, etc.
- **Recommended fix:** Inspect the RPC's `pg_get_functiondef()` (the SQL_REFERENCE doc gives the exact query). It should explicitly list each updatable column, validate values, check the caller's permission via `get_user_role()`, and refuse if the row's current `status != 'pending'`. Better: split into per-action RPCs (`confirm_sale(p_sale_id, p_contract_writer_id, p_company_fee_amount, p_notes)`, `partial_payment(p_sale_id, p_amount)`) that each take only the parameters needed.

### 10. [HIGH] Zero security headers in Vercel config; PWA `index.html` has none either

- **Title:** `vercel.json` has no `headers` block; no CSP, HSTS, Referrer-Policy, X-Frame-Options, X-Content-Type-Options, Permissions-Policy
- **Severity:** High
- **File(s):** `vercel.json:1-13`, `index.html:3-42`
- **What's wrong:** `vercel.json` defines only `buildCommand`, `outputDirectory`, `installCommand`, `framework`, `rewrites`. There is no `headers` array, so Vercel sends only its defaults. `index.html` similarly has only `Cache-Control: no-cache` meta tags. No CSP means any XSS gets the full origin's powers (read localStorage with the JWT, etc.). No HSTS means a network-level downgrade attack on first visit could MITM the page (low risk over Vercel HTTPS but free to enable). No `X-Frame-Options` / `frame-ancestors` means the app can be iframed for clickjacking — the dialogs that confirm sale completion or delete clients are juicy targets. No `Referrer-Policy` leaks page state via Referer to image hosts and any external links. No `Permissions-Policy` leaves geolocation/camera/etc. open.
- **Why it matters:** Defense-in-depth. CSP in particular would significantly mitigate the impact of an XSS or a supply-chain-compromised npm dependency (which is the real-world attack pattern for SPA apps).
- **Recommended fix:** Add a `headers` block to `vercel.json` like:
  ```json
  "headers": [{
    "source": "/(.*)",
    "headers": [
      {"key":"Content-Security-Policy","value":"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"},
      {"key":"Strict-Transport-Security","value":"max-age=63072000; includeSubDomains; preload"},
      {"key":"X-Content-Type-Options","value":"nosniff"},
      {"key":"X-Frame-Options","value":"DENY"},
      {"key":"Referrer-Policy","value":"strict-origin-when-cross-origin"},
      {"key":"Permissions-Policy","value":"camera=(), microphone=(), geolocation=(), interest-cohort=()"}
    ]
  }]
  ```
  Test the CSP carefully — the inline `<script>` blocks in `index.html:44-63` will need to be hashed (`'sha256-…'`) or moved to external files since `'unsafe-inline'` defeats most of CSP's value.

### 11. [HIGH] Weak password policy and no password reset

- **Title:** Login accepts 6-char passwords (UI requirement); user creation in `Users.tsx` requires only 6 chars; no complexity, no reuse check
- **Severity:** High
- **File(s):** `src/pages/Login.tsx:97-100`, `src/pages/Users.tsx:424-427`
- **What's wrong:** Login.tsx:97 only validates `password.length < 6` client-side. Users.tsx:424 (where Owners create new workers) similarly enforces only 6 chars, no upper/lower/digit/symbol mix. Supabase Auth's default is 6 chars too unless raised in Dashboard. Combined with Finding #5 (no rate limiting), 6-char passwords are crackable. There's no password reset email flow in the app — when a worker forgets, the Owner has to manually reset via the Users page (which uses the leaked service role — Finding #1 — to call `auth.admin.updateUserById`).
- **Why it matters:** Brute-force is realistic given no lockout; a single weak Owner password = full app compromise.
- **Recommended fix:** Bump the minimum to 12 chars and require at least 3 of {upper, lower, digit, symbol}. Validate both client-side (UX) and in Supabase Auth Dashboard → Settings → Auth → Password (server-enforced). Implement a password reset email flow using Supabase's `auth.resetPasswordForEmail`. Show password strength feedback in the Users.tsx form.

### 12. [MEDIUM] `i18n/context.tsx` allows worker to UPDATE their own `users` row — column whitelist not enforced

- **Title:** Same as Finding #3 but lower severity if RLS already restricts column-level changes
- **Severity:** Medium
- **File(s):** `src/i18n/context.tsx:35-40`
- **What's wrong:** Already covered in Finding #3 — `supabase.from('users').update({ preferred_language: lang })` sends a whole-row UPDATE with the bearer token. If RLS doesn't have a `WITH CHECK` clause limiting which columns a non-Owner can change, attackers swap `preferred_language` for `role: 'owner'` in DevTools.
- **Why it matters:** See Finding #3.
- **Recommended fix:** See Finding #3.

### 13. [MEDIUM] `Clients.tsx` search builds `.or()` filter with un-escaped user input

- **Title:** `filterClientsBySearch` interpolates user input into PostgREST `.or(...)` string
- **Severity:** Medium
- **File(s):** `src/pages/Clients.tsx:493-498`
- **What's wrong:** `or(`name.ilike.%${query}%,id_number.ilike.%${query}%,phone.ilike.%${query}%${query.includes('@') ? `,email.ilike.%${query}%` : ''}`)`. The `query` is `searchQuery.trim().toLowerCase()` — never escaped. If the user types a search like `foo,phone.eq.+216123,email.is.null` (note the comma + new filter), they extend the `or(...)` expression to query columns and operators they weren't meant to. PostgREST does parse this — the `,` separates clauses inside `or()`. So a worker who's restricted to seeing limited clients can craft `query="x,id.gt.0"` to pull every row. If an attacker crafts `query="x,sales.id.eq.foo"` they may be able to chain into joined tables depending on the policy. The `%` and `_` chars are also not escaped (the form on line 321 escapes them for ILIKE elsewhere but not here), enabling SQL-LIKE wildcard abuse.
- **Why it matters:** Defense-in-depth bypass of the intended query shape; expands the attack surface of every authenticated user's data exfiltration capability beyond what the UI implies. Combined with weak/no RLS this is an enumeration primitive.
- **Recommended fix:** Reject any `,` or `(` or `)` in the search query before building the `.or(...)`; or escape them (`replace(/,/g, '\\,')` is not a documented PostgREST escape — safer to whitelist `[A-Za-z0-9 .@_-]+`). Better still: use PostgREST's `.textSearch()` against a `tsvector` column, or chain individual `.ilike()` calls inside an `OR` constructed by `.or([...])` array form (which escapes internally).

### 14. [MEDIUM] Production `console.log` of full user object including role/permissions

- **Title:** `console.log('HomePage - systemUser:', { email, role, allowed_pages, ... })` runs on every Home mount in prod
- **Severity:** Medium
- **File(s):** `src/pages/Home.tsx:39-49`, `src/contexts/AuthContext.tsx:630`, `src/hooks/useSalesRealtime.ts:56,69,82,88`, plus 173 other `console.log` calls per Grep
- **What's wrong:** Home.tsx:41 is unconditional `console.log` (no `DEBUG_AUTH` guard) and dumps `email`, `role`, `allowed_pages`, `allowed_pages_type`, `allowed_pages_is_array` to the production console on every mount. AuthContext.tsx:630 logs `formattedUser.allowed_pages` and the raw `data` (which contains `email`, `role`, etc.) outside the `DEBUG_AUTH` guard. `useSalesRealtime.ts` logs every realtime payload (`Sale created`, `Sale updated`, `Sale deleted`) including the full row in `payload.new` — that's `client_id`, `total_selling_price`, `profit_margin`, etc. There are 177 `console.log` calls total in `src/`.
- **Why it matters:** (a) Browser-extension malware reads the console; (b) the Owner using the app on a screen-shared call (e.g. tech support, a customer demo) leaks data; (c) prod logs in Vercel's runtime tab if SSR was added later; (d) makes attacker reconnaissance trivial — they don't need to read source, they just open DevTools and see what the app is doing.
- **Recommended fix:** Wrap a `logger.ts` that no-ops in production: `export const log = import.meta.env.PROD ? () => {} : console.log`. Replace all 177 `console.log` calls with `log(...)`. Same for `console.warn`/`console.error` of sensitive data. Add an ESLint rule (`no-console`) that fails CI.

### 15. [MEDIUM] Audit log `user_id`/`user_email`/`user_name` is supplied by the client and trusted

- **Title:** `auditLog.ts::logAuditEvent` accepts `userId` / `userEmail` / `userName` as function args from the caller and writes them to `audit_logs` directly
- **Severity:** Medium
- **File(s):** `src/utils/auditLog.ts:34-119`, called from `src/pages/Appointments.tsx:451-476` and others
- **What's wrong:** The caller passes `userId` (and email/name) as a string, the function does `supabase.from('audit_logs').insert({ user_id: userId, user_email: userEmail, ... })`. There's no server-side check that `userId === auth.uid()`. A Worker can call any audit-logged operation while passing the Owner's UUID, producing audit-log entries that frame the Owner for the action. Worse: an attacker can spam audit_logs with arbitrary entries to drown out their real footprint, or to forge a paper trail in a dispute.
- **Why it matters:** Destroys the integrity of the audit trail — the one mechanism that's supposed to give the business non-repudiation. In a fraud investigation, the Owner can't trust their own logs.
- **Recommended fix:** Either (a) drop the function-arg `userId`/`userEmail`/`userName` and have the audit RPC read `auth.uid()` server-side via a SECURITY DEFINER `log_user_action(action, table, record_id, old, new)` (the legacy schema docs mention this exists — use it instead), or (b) add an `INSERT` RLS policy on `audit_logs` of `WITH CHECK (user_id = auth.uid())` so a worker cannot forge entries as someone else.

### 16. [MEDIUM] `signOut` uses `scope: 'local'` — refresh token remains valid server-side

- **Title:** `supabase.auth.signOut({ scope: 'local' })` invalidates only the local session, not the server-side refresh token
- **Severity:** Medium
- **File(s):** `src/contexts/AuthContext.tsx:834`
- **What's wrong:** Per Supabase docs, `scope: 'local'` only clears localStorage; the refresh token remains valid until its TTL (default 1 week, sometimes longer). If the JWT was already exfiltrated (XSS, malware, lost device), logout doesn't actually invalidate the attacker's stolen token. The comment on line 833 says "Use local scope to avoid 403 errors with global scope" — that's papering over an Auth misconfiguration; the right fix is to make global scope work.
- **Why it matters:** Logout is a security control that users expect to revoke their session. With `scope: 'local'` it doesn't.
- **Recommended fix:** Default to `supabase.auth.signOut({ scope: 'global' })`. If 403 errors occur, debug the underlying Auth setup (the legacy notes say `get_user_role()` returning null was the root cause of similar 403s — that's already fixed per the notes). Fall back to `local` only on failure.

### 17. [MEDIUM] `Land.tsx` stores batch images as base64 inside `land_batches.image_url`

- **Title:** Image upload converts to base64 and inserts into a TEXT column, "to avoid RLS issues with Storage" (per inline comment)
- **Severity:** Medium
- **File(s):** `src/pages/Land.tsx:1034-1054`, `src/pages/Land.tsx:1169-1207`
- **What's wrong:** The team gave up on Storage RLS and instead reads the entire image into a base64 data URL and dumps it into `land_batches.image_url` (a TEXT column). No size or MIME validation precedes this. A malicious or buggy worker can upload a 50 MB "image" file, blow up the row size, exhaust Postgres TOAST limits, force every query that fetches batches to transfer megabytes per row. From a security angle: (a) integrity/availability — a single huge upload wedges the app for everyone; (b) the code path differs from the (correctly bounded) Users/Home image flow, so any size limit added later will be missed here; (c) base64 in the DB is shipped out via `select('*')`-style queries — see the realtime payload in useSalesRealtime — to every subscribed user.
- **Why it matters:** DoS via storage cost / payload size, and an exfiltration channel since the image bytes appear in normal SELECT responses (which the SW also caches per Finding #4).
- **Recommended fix:** Move batch images back into the `land-images` Storage bucket with proper RLS (the legacy SQL `SETUP_STORAGE_POLICIES.sql` exists for this). Validate MIME + size like Findings #7/#8. Stop storing binary blobs in TEXT columns.

### 18. [MEDIUM] `Users.tsx` lists ALL Supabase auth users with service-role to find one by email

- **Title:** Password change path calls `supabaseAdmin.auth.admin.listUsers()` and scans the entire list in JS for a matching email
- **Severity:** Medium (subsumed by Finding #1, but worth flagging independently)
- **File(s):** `src/pages/Users.tsx:510-521`
- **What's wrong:** When an Owner changes a worker's password, the code uses `listUsers()` to fetch every row in `auth.users` and scans it client-side. Aside from the catastrophic Finding #1, this means the entire `auth.users` directory (every email + last_sign_in_at + raw user metadata) is loaded into the Owner's browser memory and console-loggable. As the user count grows, this becomes O(N) with no pagination — listUsers default returns 50, so beyond that the password change silently fails for users not on page 1.
- **Why it matters:** Information disclosure (full user directory in the Owner's browser memory; exfil via XSS); functional bug at scale; relies on the leaked service role key.
- **Recommended fix:** Once the service-role key is moved to an Edge Function (Finding #1), the function can `getUserByEmail` directly (Supabase Admin API supports this) — no listing required.

### 19. [LOW] Anon key shipped in build (expected, but worth confirming exposure model is understood)

- **Title:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are public by design; this is expected, but the app's security model relies on RLS, which per docs is "disabled" — making the anon key effectively a service-role key
- **Severity:** Low (expected exposure) → escalates to Critical if RLS is not enforced
- **File(s):** `.env:1-2`, `src/lib/supabase.ts:3-10`
- **What's wrong:** Shipping the anon key is normal Supabase practice — Supabase intends the anon key to be public, with RLS doing all the protection. The problem is that this codebase's `DOCUMENTATION.md` says "RLS is configured but disabled," and the DATABASE_SCHEMA_REFERENCE.md says SELECT is `USING (true)` on most tables. With no RLS, the public anon key gives the world read access to every row in every table. The audit team has presumably validated this with the live DB; if RLS is *not* turned on, this is a Critical finding on its own (independent of Finding #1).
- **Why it matters:** Defines the boundary between "expected public key" and "data leak via public key." The team needs to either (a) enable strict RLS everywhere and treat the anon key as the only public surface, or (b) accept that the anon key allows arbitrary SELECT.
- **Recommended fix:** Audit the live DB with `SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename, cmd;` (the query in DATABASE_SCHEMA_REFERENCE.md §2.3). For every table, ensure SELECT has a meaningful predicate (not `USING (true)`). At a minimum: `clients`, `sales`, `payments`, `installment_payments`, `users`, `audit_logs`, `notifications`, `appointments`, `phone_call_appointments`, `land_batches`, `land_pieces`. Remove the `Prefer: return=minimal` header trick at supabase.ts:18-20 and verify policies actually bite.

### 20. [LOW] Verbose error messages reveal database schema and SQL fix file paths to login users

- **Title:** Login error UI dumps SQL hints, file paths, schema-recovery instructions to anyone seeing an error
- **Severity:** Low (info disclosure)
- **File(s):** `src/pages/Login.tsx:120-153`, `src/contexts/AuthContext.tsx:771-808`
- **What's wrong:** When login fails for a user who doesn't have a row in `users`, the UI literally shows `INSERT INTO users (email, role, auth_user_id, name) VALUES ('${finalEmail}', 'worker', '(auth_user_id من Supabase)', 'اسم المستخدم');` to the *user* — including the table name, column list, role values, and a reference to `docs/sql/fix_auth_user_id.sql`. An attacker hitting this error page learns: the table is `users`, columns include `auth_user_id`, valid roles include `worker`, and they can iterate emails to enumerate which already exist (the error is different for "not in users table" vs "wrong password"). Also AuthContext.tsx:778-780 leaks the literal `${result.error.message}` from Supabase, which can include schema details.
- **Why it matters:** Reconnaissance for an attacker; also leaks email-enumeration (different error message for "exists in auth.users but not in public.users" vs "wrong password" vs "user doesn't exist").
- **Recommended fix:** Show users a single generic message: "Login failed. Check email and password." Log the specific reason to a Sentry-style remote logger (or just to the dev console gated behind `import.meta.env.DEV`). Remove the SQL snippets entirely from the UI.

### 21. [LOW] No CSRF protection on the sign-in flow's redirect-after-success

- **Title:** Login.tsx forces full navigation in PWA mode via `window.location.href` based on auth state
- **Severity:** Low
- **File(s):** `src/pages/Login.tsx:165-170`
- **What's wrong:** Not really CSRF in the classic sense (Supabase JWT auth), but the open-redirect-style assignment `window.location.href = base + '#home'` has no validation; a future change that lets the post-login destination be set by a query param would silently become an open-redirect. Worth flagging as a code-shape risk.
- **Why it matters:** Defense-in-depth.
- **Recommended fix:** Hard-code the post-login route. Never accept a destination from the URL query.

### 22. [LOW] PWA manifest `start_url: '/#login'` defaults installed app to login screen even for logged-in users

- **Title:** Cosmetic, not a security flaw, but worth noting because it forces an extra auth round-trip and may push users to "remember me" patterns
- **Severity:** Low
- **File(s):** `vite.config.ts:37`
- **What's wrong:** Not a real security problem. Listed for completeness because the PWA notes (section 4) interact with how often the cached JWT is exercised.
- **Why it matters:** N/A.
- **Recommended fix:** N/A — leave as is unless you adopt `remember me` behavior, in which case make it explicit.

---

## What was checked and found clean

- `npm audit --production` reports **0 vulnerabilities** in the runtime dependency tree (only `@supabase/supabase-js`, React, React-DOM). Build-time dev deps were not deeply audited but are not in the production bundle.
- No `dangerouslySetInnerHTML`, no `innerHTML` assignments anywhere in `src/`. React's default escaping is in effect, so reflected XSS is unlikely (the SVG-upload Finding #8 is the practical XSS path).
- Sale ID UUID validation in `ConfirmSaleDialog.tsx:434, 517` does correctly regex-test before sending to the DB — defense-in-depth done right in this one spot.
- The user provides `email.toLowerCase()` and `trim()` consistently before login, which avoids easy account-de-duplication bugs.

---

## Verification of prior `PROJECT_NOTES.md` issues

- **Service role key in frontend** (legacy "fixed" claim): **STILL PRESENT and worse** — actively used in 4 spots in `Users.tsx`. See Finding #1.
- **Client-side `hasPermission()` bypassable**: **STILL PRESENT** in `App.tsx`, `Sidebar.tsx`, `Land.tsx`. No `validate_user_permission()` RPC calls in current `src/`. See Finding #2.
- **`get_user_role()` NULL for inactive Owners**: Cannot verify from frontend code alone; per the archive notes the SQL fix exists. Would need to inspect live DB.
- **Login rate limiting / CAPTCHA**: **STILL ABSENT** in current code. Legacy `add_login_attempts_tracking.sql` is referenced but no frontend code references the `login_attempts` table or `should_lock_account` RPC. See Finding #5.
- **Session timeout 24h → 8h, idle 15min, etc.**: **NOT IMPLEMENTED** in current `AuthContext.tsx`. There is no idle timer, no `requiresReAuth()`, no 7h refresh logic. The only timeouts are query timeouts (3s).
- **Admin functions in frontend**: **STILL PRESENT** (Users.tsx). See Finding #1/18.
- **Generic error leakage**: **STILL PRESENT** (Login.tsx leaks SQL snippets to the user). See Finding #20.
- **Console.log in production**: **STILL PRESENT** at scale (177 calls). See Finding #14.
- **Weak password (6 chars)**: **STILL 6 CHARS** in Login.tsx and Users.tsx. See Finding #11.
- **Audit triggers**: Cannot verify from frontend; assume present per archive notes.
- **Input sanitization**: No `sanitize.ts` exists in current `src/lib/`. React escaping is the only defense.
- **`allowed_pieces` RLS bypass**: **STILL OPEN at the application layer** — even if the SQL helper functions were applied, the frontend trusts `systemUser.allowed_pieces` for gates, which is mutable in DevTools (Finding #2).
- **Password reset, 2FA**: **NOT IMPLEMENTED**.
- **`select('*')` everywhere**: Many tables use specific column lists now (good); `notifications`, `audit_logs`, and a few `payments` queries still use `select('*')`.
- **localStorage JWT vulnerability to XSS**: **STILL PRESENT**. Finding #6.
- **Missing CSP / HSTS / etc.**: **STILL MISSING** — `vercel.json` has no `headers` block at all (the legacy notes claimed `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection` were set; in this current `vercel.json` they are not). Finding #10.
- **File upload validation extension-only**: **STILL EXTENSION-ONLY** (Finding #8); also predictable filenames (Finding #7).

---

## Suggested remediation priority

1. **Today:** Rotate the service-role key, delete `supabaseAdmin.ts`, delete the env var, redeploy. Move admin operations to an Edge Function. (Findings #1, #18.)
2. **This week:** Enforce server-side RLS on every table, with column-level WITH CHECK on `users` so workers can't escalate. Fix `update_sale_safe` RPC. Disable Supabase response caching in the SW. (Findings #2, #3, #4, #9, #19.)
3. **Next sprint:** Login rate limiting + CAPTCHA + lockout. Storage bucket per-user paths + magic-byte MIME check. Strict CSP + security headers in `vercel.json`. (Findings #5, #7, #8, #10.)
4. **Soon after:** Replace `console.log` with prod-noop logger; harden audit log `user_id` source; fix `Clients.tsx` `.or()` injection; password policy bump + reset flow; SW cache purge on logout. (Findings #11-#16.)

---

*End of report.*
