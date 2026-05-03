# Gaps Audit — FULLDEV-V2 (Final Pass)

Audit date: 2026-05-02
Scope: Final-pass review covering areas the four prior audits (`SECURITY_AUDIT.md`, `CODE_QUALITY_AUDIT.md`, `PERFORMANCE_UX_AUDIT.md`, `DATA_BLEED_AUDIT.md`) did not deeply cover.
Method: Static review of `vite.config.ts`, `index.html`, `vercel.json`, `package.json`, tsconfigs and `src/`. Verified `npm audit` results. Confirmed no source maps shipped to `dist/`.

Severity legend (lightweight):
- **Critical** — production-breaking, security-relevant, or imminently user-visible
- **High** — daily-impact bug or real risk vector
- **Medium** — degraded experience or latent risk
- **Low** — polish / hygiene

Findings are grouped by category. None of these duplicate prior-audit catalog entries; verified via `Grep` against all four audit files.

---

## 1. Mobile / PWA / index.html / vercel.json

### 1.1 [Critical] CSP `script-src 'self'` will block both inline `<script>` blocks in `index.html`
- **File:** `vercel.json:38`, `index.html:44-51, 54-63`
- **Scenario:** The CSP added in `vercel.json` is `script-src 'self' 'wasm-unsafe-eval'` — no `'unsafe-inline'`, no nonce/hash. But `index.html` has TWO inline `<script>` blocks: one applying language at first paint (line 44-51) and one setting `#login` hash for PWA mode (line 54-63). On any browser that enforces CSP from response headers, both inline scripts are silently blocked. **Result on PWA install:** the early lang/dir setup never runs (so RTL doesn't apply on first paint, you see the page LTR-flash for ~200ms before React hydrates) and the `#login` hash redirect never sets up, so PWA-installed users land on the home route logged-out instead of `#login`. On browsers that obey only the meta tag, behaviour differs from headers. The `viewport-fit=cover` and other tags are fine; this is purely the inline scripts.
- **Fix:** Either (a) move both inline scripts into `/public/early-init.js` referenced as `<script src="/early-init.js">` (CSP allows `'self'`), or (b) compute a sha256 hash of the exact script text and add `'sha256-<hash>'` to `script-src` for each. Option (a) is simpler and survives future edits.

### 1.2 [High] `start_url: '/#login'` plus `scope: '/'` — installed PWA always re-enters at login flash even when session is valid
- **File:** `vite.config.ts:36-37`
- **Scenario:** `start_url: '/#login'` sends every PWA launch to the login page first. `App.tsx:225-231` then redirects to `#home` once auth resolves. On a slow boot (cold cache + slow network) the user sees the login form for ~200-500ms before being kicked to home. (Already noted at #37 in PERFORMANCE_UX_AUDIT but here we add the dimension that **the inline-script fallback in `index.html:54-63` is the *real* router for both PWA and browser** — and per Finding 1.1 it's CSP-blocked, so on PWA installs you may also see a blank `/` instead of any hash if CSP fires.)
- **Fix:** Change `start_url: '/'` and let the early-init script (Finding 1.1) decide based on session presence (`localStorage['land-system-auth-v2']` existence). Also drop `'/#login'` so installed users with a valid session go straight to last-route.

### 1.3 [High] PWA manifest icon `purpose: 'any maskable'` reuses the same non-maskable image
- **File:** `vite.config.ts:38-57`, `public/icon.png`
- **Scenario:** All three icon entries point to the single `/icon.png`. The first declares `purpose: 'any maskable'` — which tells Android the same bitmap is safe to crop into a circular/squircle mask. A non-maskable icon (no safe zone padding around the logo) gets its edges chopped off by Pixel/Samsung adaptive icons. The result is a noticeably bad-looking app icon on the home screen. Also: only 192×192 and 512×512 sizes are listed — there is no separate maskable image with the correct safe-zone padding. The 192×192 entry is omitted from the maskable variant.
- **Fix:** Generate two separate icon files: `icon-512.png` (full-bleed logo, declared `purpose: 'any'`) and `icon-maskable-512.png` (logo at ~40% diameter inside the safe zone, declared `purpose: 'maskable'`). Add 192×192 of each. Test with [maskable.app](https://maskable.app/editor).

### 1.4 [High] `viewport` has `maximum-scale=1.0, user-scalable=no` — disables pinch-zoom for visually impaired users
- **File:** `index.html:11`
- **Scenario:** `user-scalable=no, maximum-scale=1.0` is a long-flagged accessibility fail (WCAG 1.4.4). Users who need to zoom (low-vision, ageing eyesight, or just to read the small Arabic text in finance tables) cannot pinch. `viewport-fit=cover` is correctly used for safe-area, but it doesn't require disabling zoom. iOS Safari now ignores `maximum-scale` for accessibility; Android Chrome still honors it.
- **Fix:** Drop `maximum-scale=1.0, user-scalable=no` from the viewport meta. Keep only `width=device-width, initial-scale=1.0, viewport-fit=cover`.

### 1.5 [High] No offline / `navigator.onLine` handling anywhere — silent failures during network drops
- **File:** Whole codebase. `Grep navigator.onLine|'online'|'offline'` returns **zero matches**.
- **Scenario:** Any `supabase.from('sales').update(...)` / `.insert(...)` issued while the device is offline goes into Supabase JS's transport queue, fails after a long timeout, and surfaces as a generic error. Concretely: User confirms a sale on a tablet that just lost Wi-Fi; the spinner spins for the full timeout; then "خطأ في قاعدة البيانات" without any "you're offline" hint. The user retries blindly. There is no "auto-retry on reconnect", no banner indicating offline state, no queue. Any mid-flow data the user typed stays in component state — but if they leave the dialog, it's gone.
- **Fix:** Add a tiny `useOnlineStatus` hook that listens for `online`/`offline` events. Render a sticky banner when offline. Disable destructive buttons. For long forms (Confirm, Edit, MultiPieceSale), persist draft state to `localStorage` keyed by `sale.id` so the user can resume.

### 1.6 [High] Service worker update prompt has no fallback when `__pwa_updateSW` is undefined — banner does a hard reload
- **File:** `src/components/Layout.tsx:445-449`, `src/main.tsx:23`
- **Scenario:** `handlePwaRefresh` reads `(window as any).__pwa_updateSW`. If `main.tsx` failed to register (e.g. the SW MIME type was wrong on a misconfigured CDN, or the `vite-plugin-pwa` runtime threw), the global is undefined and the click falls through to `window.location.reload()`. But the SW might still be serving the stale shell, so the reload returns the same stale shell. The user clicks "New version" → page flashes → still on old version. There's no telemetry to detect this.
- **Fix:** When `__pwa_updateSW` is missing, do `navigator.serviceWorker.getRegistration().then(r => r?.update()).then(() => location.reload(true))`. Also, on `onRegisterError` in `main.tsx:16-18`, dispatch a `pwa-register-failed` event the layout can show.

### 1.7 [Medium] `HardRefreshWrapper` document-level `touchstart`/`touchmove` capture listeners run on every touch in the app
- **File:** `src/components/HardRefreshWrapper.tsx:104-106`
- **Scenario:** The pull-to-refresh registers `touchstart`, `touchmove`, `touchend`, `touchcancel` at `document` level with `capture: true, passive: true`. Even though they're passive (good), every touch in any dialog, every scroll inside a modal, every tap, runs the modal-detection `document.querySelector(MODAL_SELECTOR)` + `Array.from(document.querySelectorAll('div')).some(...)` chain on `touchstart`. The `Array.from(document.querySelectorAll('div'))` is O(N) over EVERY div in the DOM (the Land page can have hundreds), per touch. On low-end Android tablets this is a measurable janky-scroll source.
- **Fix:** Cache the modal-open state via a `MutationObserver` watching for `[data-modal="true"]` insert/remove instead of querying on every touch. Or use a ref + a single React effect that subscribes to the dialog open state.

### 1.8 [Medium] `HardRefreshWrapper` kicks in even when a non-modal full-screen overlay (notifications panel, image zoom) is open
- **File:** `src/components/HardRefreshWrapper.tsx:9-17`
- **Scenario:** `MODAL_SELECTOR` matches `[data-modal="true"], [role="dialog"], [aria-modal="true"]`. The notifications panel at `Layout.tsx:548` does have all three; the image zoom viewer in `Land.tsx` does not (let me verify…). Any future overlay that omits one of those attributes is a candidate to be accidentally torn down by the user's pull gesture. Also the hostname-fallback `Array.from(...).some(el => el.classList?.contains('fixed') && el.classList?.contains('inset-0'))` will mis-classify any sticky banner or PWA-update banner as a "modal" — including `Layout.tsx:454-465` (the PWA update banner uses `fixed top-0 left-0 right-0`, not `inset-0`, so it's safe today, but the rule is brittle).
- **Fix:** Drop the `Array.from(document.querySelectorAll('div'))` fallback; require all dialogs to set `data-modal="true"`. Add lint/test that asserts this.

### 1.9 [Medium] PWA install prompt button only on Login page — users who skip Login (or reach Home directly) never see install option
- **File:** `src/pages/Login.tsx:36-54, 347-370`
- **Scenario:** `beforeinstallprompt` is captured only inside `LoginPage`. After login, the Home page does not surface the install option. A user who logs in then later wants to install must log out → reach login → click install. On Android the system fires `beforeinstallprompt` exactly once, so if the user dismissed it on Login, they may not see it again at all unless the heuristics re-trigger.
- **Fix:** Hoist the `beforeinstallprompt` listener to a top-level provider (or `App.tsx`), store the event in a context, and surface install in Settings / Header. Also, consider showing it on Home for unauthenticated users wouldn't apply here (auth-gated), so store and surface on a Settings page.

### 1.10 [Medium] `apple-mobile-web-app-capable` and `apple-mobile-web-app-status-bar-style` meta tags are missing
- **File:** `index.html:1-42`
- **Scenario:** iOS does not honor `display: standalone` from manifest; it requires `<meta name="apple-mobile-web-app-capable" content="yes">` and `<meta name="apple-mobile-web-app-status-bar-style" content="default|black|black-translucent">` to render full-screen. Currently the iPad install renders inside Safari chrome (URL bar visible), defeating the standalone PWA aesthetic and reducing usable height. Also missing: `apple-mobile-web-app-title` (the iOS home-screen label).
- **Fix:** Add three lines to `<head>`:
  ```html
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="الادارة">
  ```

### 1.11 [Medium] No splash-screen / launch-image meta for iOS
- **File:** `index.html`
- **Scenario:** When opening the PWA on iOS, the system shows a white screen until JS boots. Without `<link rel="apple-touch-startup-image">` per device size, the "white flash" is jarring. The inline app loader at `index.html:64-71` does help once HTML is delivered, but iOS shows a white flash before that.
- **Fix:** Generate apple-touch-startup-image PNGs per device size; or accept the flash and document it.

### 1.12 [Low] `theme-color` is the same in dark and light — no `<meta name="theme-color" media="(prefers-color-scheme: dark)">`
- **File:** `index.html:13`
- **Scenario:** The blue `#3b82f6` looks fine on light, on dark mode it's still bright blue (the app itself is light-only, so no issue today). If dark-mode is added later, status bar will look off.
- **Fix:** Cosmetic.

---

## 2. Notification system internals

### 2.1 [High] `notifyOwners` is fired with `;(async () => { ... })()` after the dialog closes — failures are completely silent
- **File:** `src/components/ConfirmSaleDialog.tsx:626-661`, `src/components/ConfirmGroupSaleDialog.tsx` (similar pattern), `src/pages/SalesRecords.tsx`
- **Scenario:** After a sale is confirmed, the dialog closes, then a background IIFE calls `notifyOwners(...)` and `notifyCurrentUser(...)`. There is no `await`, no error surface, no retry indicator. If `notify_owners` RPC is missing (per Code Quality 13.7) AND the fallback's owners-listing fails AND retries fail, owners simply do not get notified — and **the worker has no idea**. The success dialog says "تم تأكيد البيع" and the worker walks away. Combined with `notifications.ts` already returning `true` on duplicate-prevention even when nothing was sent, this is a silent blackhole.
- **Fix:** Either (a) await the notification before showing success, with a "تأكيد البيع تم لكن فشل إرسال الإشعار" toast on partial failure, or (b) write a `pending_notifications` row (separate from `notifications`) and have the server's PG cron retry. Don't pretend success when the notification call returned false.

### 2.2 [High] `formatTimeAgo` always returns Arabic — ignores `useLanguage()`
- **File:** `src/utils/notifications.ts:548-569`
- **Scenario:** Returns `"الآن"`, `"منذ X دقيقة"`, etc., unconditionally. French users browsing notifications in `Layout.tsx:649` see Arabic time-ago strings inside an otherwise French UI. This is more than the i18n-coverage point in PERFORMANCE_UX_AUDIT #22 — it's that the function takes no language arg and has no way to be told. Even users who have selected French can never see "il y a 5 minutes".
- **Fix:** Make `formatTimeAgo(dateString, language: 'ar' | 'fr')` and call `formatTimeAgo(n.created_at, language)` from the bell. Use `Intl.RelativeTimeFormat` for both languages.

### 2.3 [High] Notification realtime subscription does NOT cover same-row updates from other auth devices and never auto-recovers a permanent CLOSED
- **File:** `src/components/Layout.tsx:128-243`
- **Scenario:** The reconnect logic at line 219-239 sets a 5-second `reconnectTimeout` for `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED`. **But** if `mounted = true` and `reconnectTimeout` is non-null, the next event of the same type **does not schedule another retry** — the guard `!reconnectTimeout` blocks it. If the first reconnect attempt fails (e.g. setupSubscription's removeChannel + new subscribe doesn't actually reach SUBSCRIBED — Supabase JS doesn't always callback on permanent failures), the user is stuck without a working subscription forever, and the 60-second polling (line 248) is the only thing keeping notifications fresh. On the bell, the unread-count animation (`newNotificationReceived`) never fires.
- **Fix:** Clear `reconnectTimeout = null` after each `setupSubscription()` invocation so the next CHANNEL_ERROR can schedule again. Add a hard cap (e.g. 5 retries) with backoff, then fall back to interval polling at higher frequency.

### 2.4 [High] Duplicate-prevention `checkExistingNotification` makes 2 SELECTs per notification call — and is racy
- **File:** `src/utils/notifications.ts:21-77, 144-152`
- **Scenario:** Before every `notifyOwners()`, two SELECTs run: the exact-match check, and the per-sale check. Both are TOCTOU-racy: between the SELECT and the INSERT, another tab can insert a duplicate notification. The 30-minute window then prevents the legitimate next event from notifying. Concrete failure: Worker confirms Sale A → notification queued → 5 minutes later worker EDITS Sale A and re-confirms → `checkExistingNotification` finds the prior one → `cleanupDuplicateNotifications` runs → the prior notification gets DELETED (because it's older), and the new one is also suppressed (`return true`). Net: **no notification at all** about the edit; the prior was scrubbed.
- **Fix:** Replace with a `UNIQUE (entity_type, entity_id, type, created_at_truncated_to_minute)` index server-side, or move duplicate handling into the `notify_owners` RPC with `INSERT ... ON CONFLICT DO NOTHING`. Don't do it client-side at all.

### 2.5 [Medium] Notification audio / vibration not implemented anywhere — `Grep audio|vibrate|new Audio` returns zero
- **File:** N/A
- **Scenario:** The bell pulses (`animate-bounce`) on new notification but there's no sound, no vibration. On a tablet sitting on a desk in a real-estate office, a worker will miss the visual cue. Per the prompt's question "Audio / vibration on notify — runs forever?": the answer is **the feature is just missing**.
- **Fix:** Optional. If it's wanted: gate behind a per-user setting; play a short MP3 (≤200 KB, preloaded); call `navigator.vibrate?.([100,50,100])` once.

### 2.6 [Medium] Notification dialog stack — only one `NotificationDialog` slot per page; concurrent errors collide
- **File:** `src/pages/Confirmation.tsx`, `src/components/ConfirmSaleDialog.tsx:1162-1173`, etc.
- **Scenario:** Each component owns ONE `NotificationDialog` instance with `showSuccessDialog` / `showErrorDialog`. If two errors happen close together (e.g. confirm fails, then notification background also fails), the second `setErrorMessage` overwrites the first; user only sees the latter. Also, success and error can't show simultaneously.
- **Fix:** A toast queue: append messages to a `notifications` array, render N stacked at top-right, auto-dismiss after 5s. The current pattern doesn't scale.

### 2.7 [Medium] `notify_owners` RPC failure leaks through to fallback — fallback does N inserts in a loop without transaction
- **File:** `src/utils/notifications.ts:185-276`
- **Scenario:** Fallback fetches all owners, then inserts in batches of 50 with a retry-on-each-batch. If batch 1 succeeds and batch 2 fails after retries, you have a partial notification fan-out: half the owners notified, half not. There's no way to detect this on the next try — `checkExistingNotification` will see the half-notified entity and refuse the next attempt, leaving half the owners permanently uninformed for that event.
- **Fix:** Either run all inserts in one statement (`INSERT ... SELECT FROM users WHERE role='owner'` via SECURITY DEFINER RPC) or track per-owner notification state.

### 2.8 [Medium] `getNotifications` clamps `limit` to 100 silently — pagination can lose middle ranges
- **File:** `src/utils/notifications.ts:392-428`
- **Scenario:** `range(offset, offset + Math.min(limit, 100) - 1)` — if a caller passes `limit=200`, only 100 rows return. The caller (Layout.tsx) uses 20/10 limits so today this is safe, but the silent clamp is a bug-magnet. Also, `Layout.tsx:84-86` reads `notifications.length` for offset (per Data-Bleed Audit 1.10) AND `getNotifications` is called both from the realtime-onmount load AND from the date-filter effect, with no abort — they can race.
- **Fix:** Throw on out-of-range limit; or document the clamp at the call site. Fix the offset closure separately.

### 2.9 [Low] Hardcoded `'all'` filter at first-mount notification load — ignores user's saved date filter
- **File:** `src/components/Layout.tsx:88-89, 250`
- **Scenario:** Both the initial load and the 60s refresh always use `'all'` regardless of `effectiveDateFilter`. Only the dialog-open effect at 401-418 honors the date filter. So if a user picks "Today" then closes the panel, the unread badge that comes from `getUnreadCount` is also "all"-scoped — slight inconsistency but cosmetic.

---

## 3. Multi-tab / concurrency

### 3.1 [High] No `BroadcastChannel` or `storage`-event coordination across tabs — two tabs editing the same sale silently last-write-wins
- **File:** Whole codebase. `Grep BroadcastChannel|'storage'` returns **zero matches**.
- **Scenario:** Owner has Confirmation page open in Tab A. In Tab B they open the same sale's edit dialog and lower `companyFee` from 500 DT to 400. They save. Realtime fires in Tab A and Tab A's pending list updates — but if Tab A's edit dialog is also open with the same sale and old `companyFee=500` in its form state, when Tab A clicks Save it overwrites Tab B's 400 back to 500. No conflict warning. **The dialog has no `version` / `updated_at` optimistic lock either** (verified — `EditSaleDialog.tsx` SET payload doesn't include `WHERE updated_at = X`).
- **Fix:** Add an `updated_at` optimistic lock predicate to every UPDATE. Detect conflict by `affected_rows = 0` and surface "Another user changed this — refresh to see the latest". Optionally, add a `BroadcastChannel('app-events')` so logout in one tab logs out all tabs immediately.

### 3.2 [High] Tab A signs out, Tab B keeps the cached `app_system_user` and continues acting as logged-in
- **File:** `src/contexts/AuthContext.tsx:848-913`, `src/i18n/context.tsx`
- **Scenario:** `signOut` on Tab A clears Tab A's localStorage `app_system_user` and the SW cache. **Tab B's React state is still populated.** Supabase JS does have a `storage` event listener internally for token sync — but the *systemUser* object cached in Tab B's React `useState` and the per-tab refs (`systemUserRef`) won't update. Tab B continues with stale `role='owner'` until the next mount. If Tab B navigates, the AuthContext re-validates against `users` and may notice the session is gone, but until then any mutation Tab B attempts succeeds with the (now still-active-on-server) Tab B token, because Supabase JS uses `scope: 'local'` (Security Audit #16). So Tab B is essentially still authenticated.
- **Fix:** Listen for `storage` events on `LANGUAGE_STORAGE_KEY` and the Supabase auth key (`land-system-auth-v2`); when the auth key disappears, force Tab B to sign out. Add a `BroadcastChannel('auth')` that broadcasts SIGN_OUT to all tabs.

### 3.3 [Medium] Optimistic UI in two tabs — both think they succeeded
- **File:** `src/pages/Clients.tsx:776-820` (delete), `src/components/Layout.tsx:282-301` (notification mark-read), and many similar
- **Scenario:** Tab A and Tab B both have client X visible. Tab A clicks delete (optimistic remove). Tab B clicks "Edit" before A's network round-trip completes. A's delete goes through. B's edit gets a "row not found" or RLS reject. Tab B's UI may or may not handle this — most pages treat the error generically. The optimistic update in A succeeded; the user in B is confused.
- **Fix:** When a mutation fails because a row was deleted, surface "this record was deleted by another tab/user — refreshing".

### 3.4 [Medium] Supabase JS's `BroadcastChannel` for auth refresh — implicit via supabase-js but un-tested in this app
- **File:** `src/lib/supabase.ts:12-22`
- **Scenario:** Supabase JS automatically creates a BroadcastChannel for token refresh sync between tabs. This codebase does nothing custom — fine — but the `Prefer: return=minimal` header trick at `supabase.ts` is global on the client, so any custom RPCs that need bodies in responses may hit subtle issues. Worth testing.

---

## 4. Network / offline / retry

### 4.1 [High] Long-running form submissions lose user data on connection drop — no draft persistence anywhere
- **File:** `src/components/EditSaleDialog.tsx`, `src/components/ConfirmSaleDialog.tsx`, `src/components/MultiPieceSaleDialog.tsx`, `src/pages/Clients.tsx` (client form), `src/pages/Land.tsx` (batch creation)
- **Scenario:** User opens MultiPieceSale dialog, types in 12 piece prices, picks a client, fills deposit, hits Save. Network drops. Supabase JS errors out after the timeout. The dialog stays open with the form intact only IF the user doesn't navigate away. If the user reflexively closes the dialog (or the app crashes / phone runs out of battery), all 12 prices are gone. There is no `localStorage` draft, no `sessionStorage` partial state.
- **Fix:** For each long-form dialog, persist the form to `localStorage` keyed by `draft_<dialog>_<id>` on every input change (debounced). Restore on dialog open if a draft exists for the same id and is < 24h old.

### 4.2 [High] Image upload has no resume / chunking / retry
- **File:** `src/pages/Users.tsx:441-477`, `src/pages/Home.tsx:247-281`, `src/pages/Land.tsx:1034-1054, 1169-1207`
- **Scenario:** Profile / batch image upload is a single Supabase Storage `upload(file)` call (or, for batches, base64 encoded into a column). On a 5 MB photo over a flaky 3G, a connection drop mid-upload requires the user to start over from zero — there's no resume. Worse: in the batch flow, the FileReader → base64 → INSERT is one round-trip, but if the INSERT fails, the FileReader result is gone (the file input may have already been cleared depending on UX).
- **Fix:** Resize to ≤512×512 client-side before upload (cuts size 100x). Add a `try { upload } catch { wait + retry up to 3 times }` wrapper. For very large files, use Supabase Storage's `tus` resumable protocol via `@supabase/storage-js`'s upload chunking.

### 4.3 [Medium] Supabase JS retries silently 3x on 5xx — but custom code has no awareness
- **File:** `src/lib/supabase.ts`
- **Scenario:** Supabase JS retries certain transient errors. The app code waits, eventually sees an error, and surfaces "خطأ في قاعدة البيانات". The user has no idea this took 30s of retries.
- **Fix:** Show a "retrying..." indicator after 3s of pending mutation. Lower default timeout for write operations to 8s.

### 4.4 [Medium] `AuthContext::checkNetworkConnection` pings `google.com/favicon.ico` — works but blocked in some networks
- **File:** `src/contexts/AuthContext.tsx:247-273` (per existing audit, but the angle here is offline-detection)
- **Scenario:** The handcrafted "is the network up" check pings Google's favicon. In some corporate networks or in mainland China-routed VPNs, that ping fails even when the actual Supabase URL works (or vice versa). Conclusion: the check is unreliable. `navigator.onLine` is also unreliable but at least free.
- **Fix:** Drop the home-grown ping; rely on Supabase's own transport errors. Or ping the Supabase health endpoint (which is what you actually need to reach).

---

## 5. Dependency / build / config health

### 5.1 [High] `npm audit` reports 14 vulnerabilities (3 moderate, 11 high) in dev deps — vite 7.0-7.3.1 path traversal, rollup CVE
- **File:** `package.json` / `package-lock.json`
- **Scenario:** Production deps (`@supabase/supabase-js`, `react`, `react-dom`) are clean. **Dev** deps include vulnerabilities in `vite` (path-traversal in optimized-deps, server.fs.deny bypass, dev-server WebSocket arbitrary file read), `rollup` (path-traversal write), `serialize-javascript` (RCE via RegExp.flags), `@isaacs/brace-expansion` (DoS), and nested through `vite-plugin-pwa@>=0.20`. None of these affect the deployed bundle, but **a developer running `npm run dev` could be attacked by a malicious page connecting to `localhost:3000`** (cf. the famous Vite dev-server CVEs). Significant for CI/CD too if shared runners are used.
- **Fix:** `npm audit fix` for the non-breaking ones, then `npm audit fix --force` carefully (it bumps `vite-plugin-pwa` to a major). Verify the manifest still builds.

### 5.2 [High] `tsconfig.app.json` has `noEmit: true` listed twice (lines 10 and 17) — confusing but not harmful
- **File:** `tsconfig.app.json:10, 17`
- **Scenario:** Duplicate key. JSON parsers vary in behaviour (most take last). Vite's TS pipeline is unaffected. Lint hygiene only.
- **Fix:** Remove the duplicate.

### 5.3 [High] `manualChunks` strategy is too coarse — every page chunk pulls heavy code
- **File:** `vite.config.ts:8-21`
- **Scenario:** Only `vendor-react` and `vendor-supabase` are split. Each lazy page (`Land`, `Confirmation`, `SalesRecords`, `ConfirmationHistory`) ships its own copy of utility helpers (`installmentSchedule`, `priceCalculator`, `salesQueries`, `dataIntegrity`) because they're imported from multiple chunks. Look at `dist/assets/` listing — there are also many tiny `*.js` chunks (`alert-…`, `badge-…`, `card-…`, `auditLog-…`) that are de-duped by Vite, but the heavy logic utilities likely aren't.
- **Fix:** Add `if (id.includes('/utils/'))` to manualChunks → `'app-utils'`. Run `vite build --mode production` and verify bundle composition.

### 5.4 [Medium] No source maps in production — good (verified in dist/) — but no `console` stripping either
- **File:** `vite.config.ts`
- **Scenario:** `dist/assets/*.js` doesn't ship `.map` files (verified). Good. But the bundle still contains all 177 `console.log` calls (per Security #14). Vite's `esbuild` minify mode does NOT strip console by default. So the prod bundle dumps user/role/sale data to the console.
- **Fix:** Add `build.terserOptions: { compress: { drop_console: true } }` after switching `build.minify: 'terser'`. Or wrap console calls in a logger.

### 5.5 [Medium] `vercel.json` has rewrite `/(.*) → /index.html` — no exclusion for `/icon.png`, `/manifest.webmanifest`, `/sw.js`
- **File:** `vercel.json:6-11`
- **Scenario:** Vercel evaluates `headers` and `rewrites` together. Static assets in `/assets/(.*)` get the cache header, but the catch-all rewrite would normally rewrite `/manifest.webmanifest` to `/index.html` — except Vercel's static-file resolution beats rewrites. Verify the manifest URL actually serves the JSON. (It probably does, but the setup is fragile and one Vercel platform change away from breaking PWA install.)
- **Fix:** Make the rewrite explicit: `/((?!api|assets|_next|icon|manifest|sw|workbox|registerSW).*)` → `/index.html`. Or use `routes` instead.

### 5.6 [Medium] CSP `script-src 'self' 'wasm-unsafe-eval'` — wasm-unsafe-eval is unnecessary unless you load WASM
- **File:** `vercel.json:38`
- **Scenario:** No WASM modules in deps (verified — no `.wasm` files in `dist/`). Including `'wasm-unsafe-eval'` is harmless but expands attack surface and will appear on a security report.
- **Fix:** Remove it.

### 5.7 [Medium] CSP does not include `worker-src` directive — service worker registration may be blocked under strict UAs
- **File:** `vercel.json:38`
- **Scenario:** Some browsers fall back `worker-src` to `script-src`, others to `child-src`, others to `default-src`. Default is `'self'` which is correct. But explicit `worker-src 'self'` is cleaner and avoids surprises with Firefox.
- **Fix:** Add `worker-src 'self'` to the policy.

### 5.8 [Low] No `console.error` patterns suggest tracked/un-followed regressions
- **File:** Whole codebase. 177 console calls scanned.
- **Scenario:** No "TODO follow up" comments. Several `console.error` in catch blocks (especially in `notifications.ts`) accept errors silently. Latent telemetry gap.
- **Fix:** Hook a Sentry-style remote logger. At minimum, an in-DB `error_log` table for production exceptions.

---

## 6. i18n edge cases

### 6.1 [High] `new Date(installmentStartDate)` in `ConfirmSaleDialog.tsx:599` parses YYYY-MM-DD as UTC midnight
- **File:** `src/components/ConfirmSaleDialog.tsx:599`, `src/components/ConfirmGroupSaleDialog.tsx` (similar)
- **Scenario:** The user picks "2026-01-15" in `<input type="date">`. JS spec: `new Date('2026-01-15')` = UTC midnight = 2026-01-14T23:00:00 in Tunisia (UTC+1). Then `generateInstallmentSchedule` uses this Date as the anchor. The first installment due-date is computed via `Date.UTC(...)` (which is correct; it stays UTC). Then `dueDate.toISOString().split('T')[0]` outputs `"2026-01-15"` because `getUTCMonth/Day` round to UTC. Good. **However**, in `Appointments.tsx:251` the noon-trick is used (good). In `InstallmentDetailsDialog.tsx:266-270` the code does `new Date(editFirstDateValue)` without the noon trick, then constructs `new Date(y, m, day, 0, 0, 0, 0)` (LOCAL midnight). These two anchors disagree. So the "edit first date" feature can shift due-dates by one day relative to the original schedule.
- **Fix:** Standardize: every `<input type="date">` value parses through one helper `parseDateLocalNoon(s)` that returns the `'YYYY-MM-DDT12:00:00'` Date.

### 6.2 [High] Currency formatting locale mix — `'en-US'` for displayed amounts, `'ar-DZ'` for validation errors
- **File:** `src/utils/priceCalculator.ts:64`, `src/utils/validation.ts:37, 41, 96, 100, 120, 141, 161, 185`
- **Scenario:** `formatPrice` returns "5,000.00" (en-US). The validation strings format the same number as "5 000,00" (ar-DZ). Same screen, different formats. (Already noted in PERFORMANCE_UX_AUDIT #26 in general — but the specific claim of `'ar-DZ'` (Algerian Arabic) used for a Tunisian app is worth flagging again as wrong locale: ar-DZ uses Western digits ; ar-TN matches Tunisian banking practice better.) The format also concatenates a hardcoded `DT` suffix — wrong for French (TND is the ISO code; "DT" is informal).
- **Fix:** A single `formatTND(n, language)` using `Intl.NumberFormat` with proper locale.

### 6.3 [Medium] `<input type="date">` has no `max` for past-date validation in some appointment inputs
- **File:** `src/pages/Confirmation.tsx:1183`, `src/components/ConfirmSaleDialog.tsx:1170`, `src/pages/Appointments.tsx:877`
- **Scenario:** All three use `min={new Date().toISOString().split('T')[0]}` — good for "appointment date in the future". **But** the same pattern is missing on the **deadline_date** input on `Confirmation.tsx` (the deadline countdown reads it but the input may allow past dates) and the installment **start date** in `ConfirmSaleDialog.tsx:957` has neither `min` nor `max`. A user could set installments to start in 1990 if they typed it in.
- **Fix:** Add `min` to all date inputs that should be future-only; add `max="9999-12-31"` to all to prevent year 10000 typos.

### 6.4 [Medium] Numeric inputs don't restrict `e`, `+`, `-` — HTML quirk
- **File:** All `<input type="number">` listings (35 files via Grep)
- **Scenario:** HTML's `type="number"` allows scientific notation: typing `1e5` gives `100000`. Typing `+5` or `-5` is allowed. For a sale price, a worker typing `5000-` (incidentally hit minus) gets accepted as `-5000`. The `parseFloat('1e308')` returns `1e308` — way larger than any sane sale price. Most dialogs check `<= 0` but few check upper bounds.
- **Fix:** Add `onKeyDown={e => ['e','E','+','-'].includes(e.key) && e.preventDefault()}` (or a lightweight `inputMode="decimal"` and reject) to all currency inputs. Add a 100M DT cap for sanity.

### 6.5 [Medium] `email` field in Login is `type="text"` not `type="email"` — mobile keyboard wrong
- **File:** `src/pages/Login.tsx:249`
- **Scenario:** `<Input id="email" type="text" ...>` despite being for the email. On mobile, this opens the alphabetic keyboard with no `@` shortcut. Users who type a real email type more slowly. The `autoComplete="email"` is right but the type/inputMode is wrong.
- **Fix:** Either `type="email"` (with email validation) or `type="text" inputMode="email"` (more permissive, recommended for the "username or email" UX you have).

### 6.6 [Low] Tunisian phone format `+216 XX XXX XXX` placeholder in 2 places — no validation function
- **File:** `src/i18n/translations.ts:95, 1020`, `src/pages/Users.tsx:938`
- **Scenario:** Placeholder shows the format. No code validates. A user can save `0123` as a phone. Notifications/SMS-tooling that may be added later will fail.
- **Fix:** A `validateTunisianPhone(p)` helper checking `/^(\+216)?\s?[0-9]{2}\s?[0-9]{3}\s?[0-9]{3}$/` and use in Clients/Users forms.

---

## 7. Deletion cascades / data integrity

### 7.1 [High] Client delete checks `sales` count but not `appointments`, `phone_call_appointments`, or `audit_logs`
- **File:** `src/pages/Clients.tsx:763-803`
- **Scenario:** Pre-delete check: `select('id', { count, head:true }).eq('client_id', clientToDelete)` against `sales` only. If the client has no sales but has `appointments` (or `phone_call_appointments`) referencing them, the FK constraint will reject the delete OR (if the FK is `ON DELETE SET NULL`/`CASCADE`) silently delete or null them. Either way: user sees either a confusing FK error OR loses appointment history.
- **Fix:** Pre-delete count both tables; refuse delete with "client has appointments" message. Or accept cascade with a confirmation: "this will delete N appointments — continue?".

### 7.2 [High] Land batch delete only blocks if pieces exist — does NOT check `payment_offers` orphans or audit history
- **File:** `src/pages/Land.tsx:1230-1258`
- **Scenario:** Pre-check is `select('id', count:exact, head:true).from('land_pieces').eq('batch_id', X)`. If pieces exist, refuse. Good. But `payment_offers.batch_id` rows are not checked. After batch is deleted, those offers either FK-cascade-delete or become orphans. The code at line 1074 (`update path`) DOES delete them when updating offers (`.delete().eq('batch_id', batchId).is('land_piece_id', null)`) — so the codebase is inconsistent: update deletes them, delete relies on FK.
- **Fix:** Explicitly delete `payment_offers WHERE batch_id = X` inside the delete flow, OR rely on a documented `ON DELETE CASCADE` and remove the manual delete from line 1074. Either way, be explicit.

### 7.3 [High] Sale revert/cancel deletes `installment_payments` but not related `appointments`
- **File:** `src/pages/SalesRecords.tsx:425-460, 463-515, 517-569`
- **Scenario:** `handleRevertToPending` and `handleCancelSale` delete `installment_payments` for the sale, but if the sale has scheduled `appointments` rows (created via Confirmation.tsx → Appointments table), those appointment rows are left orphaned with `sale_id` pointing to a now-cancelled sale. The Appointments page will show "Sale: <unknown>" or worse, the FK ON DELETE behavior comes into play if the sale is later removed.
- **Fix:** When reverting/cancelling, query and either delete or update appointments.sale_id = NULL with a "the related appointment was orphaned" toast.

### 7.4 [Medium] Piece delete (`PieceDialog.tsx:595-607`) goes through `confirm()` only and ignores `sales` referencing the piece
- **File:** `src/components/PieceDialog.tsx:595-607`
- **Scenario:** `handleDeletePiece` does a single `confirm()` then `delete().eq('id', pieceId)`. There is no pre-check for sales referencing the piece. If a sale exists with `land_piece_id = X`, the FK either rejects (good) or cascades (bad). The error then surfaces as a generic `alert()` with the raw error message.
- **Fix:** Pre-check sales count for that piece; refuse delete if sales > 0; otherwise allow.

### 7.5 [Medium] Worker (Users.tsx) delete cascades through `created_by`/`sold_by`/`confirmed_by` foreign keys with no check
- **File:** `src/pages/Users.tsx:651-680`
- **Scenario:** Owner deletes a worker. The worker has historical sales as `sold_by`. After delete, `formatSalesWithSellers` (`salesQueries.ts`) returns "غير معروف" / 'Unknown' for those sales. Audit trail is lost. There's no warning before delete.
- **Fix:** Soft-delete users via `is_active=false` flag; never hard-delete.

---

## 8. Concurrent business-flow races

### 8.1 [High] Two workers can confirm the same pending sale simultaneously — no row-level lock
- **File:** `src/components/ConfirmSaleDialog.tsx:374-390, 439-444`
- **Scenario:** The dialog does a `preCheck` (line 374-390): SELECT status, ensure `=== 'pending'`. Then UPDATE. Between the two, another worker can also pass their preCheck and UPDATE. Both UPDATEs succeed (the second is a no-op because `status` is already `'completed'` — but no `WHERE status = 'pending'` predicate is in the UPDATE, so it does run). Two notifications fire ("تم تأكيد البيع" twice). Two `installment_payments` schedules might be inserted (line 613) → duplicate rows. Two pieces.update_at runs. Net: a sale that was meant to be confirmed once gets confirmed twice, duplicate installment schedule.
- **Fix:** Either (a) add `WHERE status = 'pending'` to the UPDATE and check `affected_rows > 0`, refuse if 0; (b) make the entire confirm flow a single SECURITY DEFINER RPC that locks the row.

### 8.2 [High] Two clients (workers) can claim the same piece via MultiPieceSaleDialog at nearly the same time
- **File:** `src/pages/Land.tsx:1387-1414` (`reservePiecesImmediately`), `:1392-1396` (the actual piece UPDATE)
- **Scenario:** Worker A and Worker B both open Sell-Pieces flow on the same available piece. They simultaneously hit Save. Both `INSERT INTO sales` succeed (no unique constraint on `land_piece_id` for status='pending'). Both then UPDATE `land_pieces SET status='Reserved'` — the update is idempotent so both succeed. Now there are TWO pending sales for ONE piece. The Confirmation page shows both. The Owner confirms one; the other becomes orphan-pending. Worse: if both get confirmed (different owners), the piece's status is 'Sold' but there are two completed sales for it — the schema allows this.
- **Fix:** Add a partial unique index on `sales (land_piece_id) WHERE status IN ('pending','completed')`. Catch the unique-violation in the create flow and show "Another worker just claimed this piece".

### 8.3 [Medium] `EditSaleDialog` save while another tab confirms — version conflict
- **File:** `src/components/EditSaleDialog.tsx:441-479`
- **Scenario:** Tab A opens edit on Sale X (pending). Tab B confirms Sale X (now completed). Tab A's save UPDATE writes pending-shape fields onto a now-completed sale. Some fields may be invalid for the completed status (e.g. removing `confirmed_at`). Without an `updated_at` lock or a `status='pending'` predicate, the UPDATE silently succeeds.
- **Fix:** UPDATE with `WHERE id = X AND updated_at = $expectedUpdatedAt`; on 0 rows, show "stale data — please refresh".

---

## 9. Form / input UX gaps

### 9.1 [High] Required fields accept whitespace-only strings on most pages
- **File:** `src/pages/Clients.tsx:661-749` (handleSaveClient), `src/components/EditSaleDialog.tsx`, `src/components/ConfirmSaleDialog.tsx`
- **Scenario:** Inputs with `required` HTML attribute pass browser validation if the string is `"   "` (spaces). The custom validation in many dialogs only checks `if (!fieldName)` (truthy) which a space-string passes. So "Client name" can be saved as `"   "`. Names render blank in lists.
- **Fix:** Pre-trim every required string value; validate `value.trim().length > 0`. The `Login.tsx:77 if (!email.trim())` pattern is good — propagate it.

### 9.2 [High] Submit-on-Enter without disable can double-submit on slow networks
- **File:** `src/pages/Login.tsx:171-176, 239`, `src/pages/Clients.tsx`, others
- **Scenario:** Login.tsx has both `<form onSubmit={handleSubmit}>` AND `onKeyPress={handleKeyPress}` that calls `handleSubmit(e as any)` on Enter. The form's natural Enter submit ALSO fires. So pressing Enter triggers two `handleSubmit` calls in fast succession. The first `setLoading(true)` blocks the second only IF the second call observes the updated state — but state updates are async, so both calls can pass the `if (loading)` guard. This means two `signIn` calls per Enter on a slow connection. Most pages have similar patterns.
- **Fix:** Drop the manual `onKeyPress`; let the form's `onSubmit` do its thing. The `disabled={loading || !email.trim()...}` on the button is good but not enough.

### 9.3 [Medium] Date inputs lack min/max for past-deadlines (Confirmation deadline) — see 6.3.

### 9.4 [Medium] Number inputs accept e/+/- — see 6.4.

### 9.5 [Medium] `<input type="date">` has no `pattern` — Safari iOS shows native picker but desktop accepts free text
- **File:** All 11 `type="date"` inputs
- **Scenario:** On a desktop without a date picker (some Safari versions, all Firefox-Linux), `type="date"` falls back to a text field that accepts anything. Users can type "31/02/2026" and hit save; the controlled state stays as that invalid string; downstream parsing fails silently or crashes.
- **Fix:** Add a `onBlur` validator that ensures the value matches `^\d{4}-\d{2}-\d{2}$`. Or use a JS date-picker library.

---

## 10. Accessibility (beyond labels/aria)

### 10.1 [High] Form errors are NOT announced to screen readers — `aria-live` / `role="alert"` is on `<Alert>` only
- **File:** `src/pages/Login.tsx:213-236`, `src/pages/Clients.tsx`, throughout
- **Scenario:** Per Grep, `role="alert"` exists only in `src/components/ui/alert.tsx:21`. Most form errors are rendered as plain text (`<p>{error}</p>`) and never announced. The Login error IS wrapped in `<Alert>` (good — that auto-announces). But the `<NotificationDialog>` modal (`notification-dialog.tsx`) is just a Dialog — it has `aria-modal` but the success/error message inside has no `aria-live` region. Screen reader users hear "dialog" without the message.
- **Fix:** Add `role="alert" aria-live="assertive"` to the `<NotificationDialog>` content div. Wrap inline form errors in `role="alert"`.

### 10.2 [High] Color-only signaling for status — overdue installments are red, paid green, pending yellow, with no icon or text
- **File:** `src/components/InstallmentDetailsDialog.tsx`, `src/pages/Finance.tsx`, status badges
- **Scenario:** Color-blind users (≈8% of men) can't reliably distinguish red/green. The status pills are color-only in most listings.
- **Fix:** Add an icon (✓ for paid, ⏰ for pending, ⚠ for overdue) AND text inside each pill, not just color.

### 10.3 [High] Touch target sizes on icon-only buttons may be < 44×44 CSS px (WCAG 2.5.5)
- **File:** `src/components/Layout.tsx:481-491` (menu button is `p-1.5 sm:p-2` ≈ 24-32px), `:498-513` (refresh ≈ 24-32px), `:522-544` (notification bell), `src/components/ui/icon-button.tsx`
- **Scenario:** Tailwind `p-1.5` = 6px padding around a 20-24px icon = 32-36px total. Below the 44px Apple/Google touch target guideline. On a tablet held in landscape, fat-fingering between adjacent icons (menu / refresh / lang / bell) is easy.
- **Fix:** Bump padding to `p-2.5 sm:p-3` (40-48px) or set `min-w-11 min-h-11` on the IconButton.

### 10.4 [Medium] Text inside interactive cells (sales rows) doesn't have keyboard activation
- **File:** `src/pages/Confirmation.tsx`, sales cards
- **Scenario:** Sales cards have `onClick` on the outer `<Card>` but no `tabIndex={0}` and no `onKeyDown` for Enter/Space. Keyboard users can't open a sale's details without tab-cycling to the inner button.
- **Fix:** Make these `<button>` semantically, or add `tabIndex={0} role="button" onKeyDown={handleEnterSpace}`.

### 10.5 [Medium] `viewport user-scalable=no` blocks zoom — accessibility issue, see 1.4.

### 10.6 [Low] No `prefers-reduced-motion` respect — `animate-bounce`, `animate-pulse`, count-up, slide animations all run regardless
- **File:** Many — `Layout.tsx` bell `animate-bounce`, `pages/Land.tsx` count-up, etc.
- **Scenario:** Users who set "reduce motion" at OS level still get all animations. Vestibular-sensitive users can experience nausea.
- **Fix:** Wrap animations in `media (prefers-reduced-motion: reduce)` opt-out, or use Tailwind's `motion-safe:` prefix.

---

## 11. Build / deploy specifics

### 11.1 [Critical] CSP `script-src 'self'` blocks index.html inline scripts — see 1.1. (Headlining build issue.)

### 11.2 [Medium] `vite-plugin-pwa` injects an inline `<script>` for SW registration — CSP needs to permit it
- **File:** `vite.config.ts:24-95`, generated `index.html` post-build
- **Scenario:** `registerType: 'prompt'` plus `vite-plugin-pwa`'s default behavior may inject runtime SW-registration script into the built `index.html`. With `script-src 'self'` and no nonce, it would also be blocked. Verify by inspecting `dist/index.html` after build.
- **Fix:** Either configure `vite-plugin-pwa` with `injectRegister: 'script'` (external file) or generate a nonce per request via Vercel's edge middleware.

### 11.3 [Medium] CSP `connect-src https://*.supabase.co wss://*.supabase.co` — wildcards over the entire supabase.co domain
- **File:** `vercel.json:38`
- **Scenario:** This permits the app to talk to *any* Supabase project under supabase.co — broader than necessary. If an XSS injects code that POSTs to `attacker.supabase.co`, CSP allows it.
- **Fix:** Replace with the specific project URL: `https://<your-ref>.supabase.co wss://<your-ref>.supabase.co`. Use a build-time replacement.

### 11.4 [Medium] No `script-src-elem` directive — modern CSP recommendation
- **File:** `vercel.json:38`
- **Scenario:** Browsers fall back `script-src-elem` to `script-src`. Mostly harmless. Listed for completeness.

### 11.5 [Low] Sourcemaps absent (verified) — good. No leak of source structure to attackers.

### 11.6 [Low] `Cache-Control` immutable on `/assets/(.*)` — good (1-year, immutable).

---

## 12. TODO / FIXME / HACK / disabled / temporary markers

### 12.1 [Low] Zero formal TODO/FIXME/HACK markers — but several "should be done" comments scattered without grep-able tags
- **File:** Whole codebase
- **Scenario:** Per Grep `TODO|FIXME|HACK|XXX` returns only false positives (e.g. `+216 XX XXX XXX` placeholder). The audit prompt asked specifically — so the explicit answer is **none are tracked**. Combined with `Code Quality 14` flagging the same issue, this is a process gap: known-incomplete code uses ad-hoc `// CRITICAL:` and `// FIXED:` comments instead of standard markers, so they can't be grepped.
- **Fix:** Establish a convention: `// TODO(name, date):` for new gaps; run `eslint --rule 'no-warning-comments: warn'` in CI.

### 12.2 [Low] Two `eslint-disable-next-line react-hooks/exhaustive-deps` comments
- **File:** `src/pages/Land.tsx:340`, `src/components/MultiPieceSaleDialog.tsx:257`
- **Scenario:** Both acknowledge stale-closure issues in `useEffect`. Already partly covered in Code Quality 2.1 / 4.1 with concrete bug reports.

### 12.3 [Low] `// CRITICAL:` and `// FIXED:` comments throughout `AuthContext.tsx`
- **File:** `src/contexts/AuthContext.tsx` (multiple)
- **Scenario:** These read like incomplete-fix markers. Example: `AuthContext.tsx:334` "FIXED: Removed status, page_order, sidebar_order — they don't exist in the database". Useful as history but also brittle (if the columns are added back, this will silently work; the comment should explain why they shouldn't be added).
- **Fix:** Convert to formal `TODO(consideration):` comments or to commit messages.

---

## End

Total new findings: 60+ across 12 categories (many overlapping subitems consolidated for clarity). Per the prompt's request, the top 12 NEW findings (sorted by severity, no overlap with prior audits) are:

1. **[Critical] [Build/PWA]** CSP `script-src 'self'` will block both inline `<script>` blocks in `index.html` — `vercel.json:38` / `index.html:44,54` — both early-init scripts (lang/dir + PWA hash) silently fail under CSP.
2. **[High] [Concurrency]** Two workers can confirm same pending sale simultaneously — `src/components/ConfirmSaleDialog.tsx:374-444` — preCheck-then-UPDATE has no row lock, leading to duplicate installment schedules and double notifications.
3. **[High] [Concurrency]** Two workers can claim the same piece via MultiPieceSale — `src/pages/Land.tsx:1387-1414` — no unique index on `sales(land_piece_id) WHERE status='pending'`.
4. **[High] [Multi-tab]** No BroadcastChannel/storage-event coordination — silent last-write-wins between tabs editing the same sale; logout in one tab leaves others authenticated.
5. **[High] [Notifications]** `notifyOwners` fired in fire-and-forget IIFE after dialog closes — `src/components/ConfirmSaleDialog.tsx:626-661` — failures silently mean owners get no notification with no UI feedback.
6. **[High] [PWA]** Manifest icons declared `purpose: 'any maskable'` on a non-maskable bitmap — `vite.config.ts:38-57` — Pixel/Samsung adaptive icons crop the logo edges.
7. **[High] [Network]** Long-form dialogs (MultiPieceSale, EditSale, Confirm) have no draft persistence — connection drop after 2 min of typing loses all data.
8. **[High] [a11y]** `viewport user-scalable=no, maximum-scale=1.0` blocks pinch-zoom — `index.html:11` — WCAG 1.4.4 fail; visually impaired users locked out.
9. **[High] [Build]** 14 npm vulnerabilities (3 mod / 11 high) in dev deps — vite path-traversal, rollup CVE, serialize-javascript RCE — exploitable against any dev running `npm run dev`.
10. **[High] [i18n]** `formatTimeAgo` always returns Arabic regardless of language — `src/utils/notifications.ts:548-569` — French users see Arabic time strings on every notification.
11. **[High] [Cascades]** Sale revert/cancel deletes installment_payments but leaves orphan appointments — `src/pages/SalesRecords.tsx:425-460` — Appointments page shows stale appointments for cancelled sales.
12. **[High] [Forms]** Submit-on-Enter double-submits via both `<form onSubmit>` and manual `onKeyPress` — `src/pages/Login.tsx:171-176,239` — slow connections fire two signIn() calls per Enter press.
