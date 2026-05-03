# FULLDEV-V2 Code Quality & Bug Audit

Audit date: 2026-05-02
Scope: `src/` — React 19 + Vite 7 + TS strict + Supabase JS client. Hash-based routing, no router/no React Query.
Out of scope: security findings (separate agent), pure perf re-render tuning, i18n / a11y / mobile UX, items already known in `docs/archive/PROJECT_NOTES.md` unless still severe.

---

## Table of contents

1. Critical bugs
2. Bugs
3. Error handling at the user-facing surface
4. Race conditions, lifecycle, memory leaks
5. State management mistakes
6. Type safety abuses
7. Dead code / orphan files
8. Duplication
9. Date / timezone handling
10. Number / currency handling
11. Form validation gaps
12. Inconsistencies
13. Flagged-but-unverified DB objects (tables / RPCs not in source SQL)
14. TODO / FIXME / HACK comments
15. Architectural smells

---

## 1. Critical bugs

### 1.1 [Critical bug] Service-role key shipped to the browser
- **File:** `src/lib/supabaseAdmin.ts:1-27`, used by `src/pages/Users.tsx:3,429,510,516,549,589,665`
- **What:** The admin client is constructed with `import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY`. Any env var prefixed `VITE_` is inlined into the client bundle by Vite. This file's existence in `src/` and the existence of admin-only operations (`auth.admin.listUsers`, `auth.admin.createUser`, `auth.admin.updateUserById`, `auth.admin.deleteUser`) called from `Users.tsx` confirms intent: any visitor who opens DevTools → Sources can read the service-role JWT and gets full bypass-RLS access to the database and Auth admin API.
- **Why it matters:** Anyone (including non-logged-in visitors of ardhiv2.vercel.app) can read every table, modify every row, list all auth users, reset passwords, delete users. This is the worst possible security outcome and also a functional bug because the user-creation flow is ergonomically tied to that key — if the owner ever rotates or removes the key, the entire Users page breaks (the page already shows `t('users.serviceUnavailable')` when `supabaseAdmin` is null).
- **Fix:** Move all admin operations to a Supabase Edge Function authenticated by the user's session JWT. Delete `supabaseAdmin.ts` from `src/`. Replace the `VITE_SUPABASE_SERVICE_ROLE_KEY` env var with `SUPABASE_SERVICE_ROLE_KEY` set on the function, never on the client. Rotate the current key immediately. (Note: this overlaps with the security-agent's scope but is also a hard functional design bug — flagging here because it's structural.)

### 1.2 [Critical bug] New worker default permissions include the Users page
- **File:** `src/pages/Users.tsx:299-329` (`openCreateDialog`)
- **What:** When the owner clicks "Add user", the form pre-fills `allowed_pages: availablePages.map(p => p.id)` — and `availablePages` (line 83-96) includes `'users'`. Unless the owner manually unticks it, every new worker is created with full access to the Users page (which lets them create / edit / delete other users — tied via `supabaseAdmin` to direct Auth admin operations).
- **Why it matters:** Concretely: every worker created with the default form values can promote themselves, change other users' passwords, and (because of #1.1) is already running with the service-role key in their browser. The combination of #1.1 and #1.2 means the workflow as designed gives every worker root.
- **Fix:** Default `allowed_pages` to a safe baseline excluding `'users'` (and probably `'finance'`, `'sales-records'`, etc. depending on the role). At minimum, exclude `'users'` unconditionally for `role === 'worker'`.

### 1.3 [Critical bug] Login flow leaks DB schema, SQL, and internal UUIDs to end users
- **File:** `src/pages/Login.tsx:120-153`
- **What:** When `signInError.code === 'AUTH_USER_ID_MISMATCH'` or `'USER_NOT_IN_SYSTEM'`, the error rendered to the user is a multiline message that includes (a) the raw `auth.users.id` UUID, (b) literal SQL strings (`UPDATE users SET auth_user_id = '<uuid>'::uuid WHERE email = 'test@gmail.com';`), (c) Supabase Dashboard navigation hints, (d) raw `INSERT INTO users (...)` snippets. These are also baked into the bundled JS (so no auth required to read them). `AuthContext.tsx:778, 792, 803` constructs the same messages.
- **Why it matters:** Information disclosure and very poor UX for the legitimate "wrong password" case (the user gets a wall of Arabic SQL instructions instead of "wrong email or password"). It also tells anyone probing the app exactly the table/column names they need to attack.
- **Fix:** Replace the verbose strings with a generic Arabic/French "البريد الإلكتروني أو كلمة المرور غير صحيحة" / "Identifiants incorrects". Move the SQL hints to a console.log gated on `import.meta.env.DEV`. Drop the embedded UUIDs from anything user-visible.

### 1.4 [Critical bug] `sale_price` write is stringy / not validated
- **File:** `src/components/EditSaleDialog.tsx:350-415`, `src/components/ConfirmSaleDialog.tsx:425, 495, 501-509`
- **What:** Sale and payment amounts come from `<Input>` text fields and are converted with `parseFloat(salePrice)` / `parseFloat(companyFee)` / `parseFloat(promisePaymentAmount)`. There is some validation in EditSaleDialog (`isNaN(price) || price <= 0`), but ConfirmSaleDialog accepts any numeric string for `companyFee` without bounds, and the promise-payment amount is parsed via `parseFloat(cleanedAmount)` (line 508) without the `isNaN` check (the value flows straight into `updateData.partial_payment_amount = (sale.partial_payment_amount || 0) + paymentAmount`).
- **Why it matters:** A `parseFloat('')` returns `NaN`, which Postgres will reject — but a `parseFloat('1e308')` succeeds. More commonly: the user types `"5,000.00"` (locale separator), `parseFloat` returns `5`, the sale silently records 5 DT instead of 5,000 DT. That's an off-by-1000-DT bug per occurrence.
- **Fix:** Centralize all amount parsing through `validateAmount()` in `src/utils/validation.ts` (which already handles NaN, Infinity, precision). Remove the bare `parseFloat` calls in dialogs.

---

## 2. Bugs

### 2.1 [Bug] `loadBatches` event-listener `useEffect` reads stale `batches` from closure
- **File:** `src/pages/Land.tsx:264-341`
- **What:** This `useEffect` has `[]` deps (with an `eslint-disable-next-line` exempting it). Inside, the safety-timeout closure references `batches.length` (line 271) and `loadBatches()` is called debounced from event handlers — both capture the empty initial `batches` array forever. The mounted closure keeps using `batches.length === 0` to decide whether to set an empty array on timeout, which always evaluates against the initial empty value.
- **Why it matters:** After the initial load succeeds, if the safety-timeout fires (e.g. tab put to background long enough that the 16 s budget elapses on a re-render path), it will overwrite the populated `batches` state with `[]`, blanking the list.
- **Fix:** Read current state via a ref: `batchesRef.current` instead of the closed-over `batches`. Or restructure so the safety timeout lives in a separate effect with the right deps.

### 2.2 [Bug] `Confirmation.tsx` real-time + window event + URL-driven refetch storm
- **File:** `src/pages/Confirmation.tsx:132-178`
- **What:** Three independent triggers call `loadPendingSales()` on the same data: (a) a URL/state-driven `useEffect` on `[currentPage, batchFilter, batchesReady, searchQuery]`, (b) `window.addEventListener('saleCreated' / 'saleUpdated', loadPendingSales)`, (c) `useSalesRealtime({ onSaleCreated: () => loadPendingSales(), onSaleUpdated: () => loading || loadPendingSales() })`. There is no debouncing between them. A single confirm action emits all three.
- **Why it matters:** Three back-to-back full re-fetches of up to 5000 rows (`PENDING_SALES_LOAD_LIMIT`) per confirmation. That's the main reason confirm flows feel sluggish and likely the cause of the "race conditions" symptoms in `docs/known_issues.md`.
- **Fix:** Pick one source of truth (real-time or window events, not both). Wrap the loader in a debounced helper similar to the one in `Land.tsx:289-298`.

### 2.3 [Bug] `getSaleStats` and several other utility calls discard Supabase `error`
- **File:** `src/pages/Installments.tsx:395-413`, `src/pages/SalesRecords.tsx:352-360`, `src/components/InstallmentDetailsDialog.tsx:188-216` (`loadInstallments` swallows errors with only `console.error`), `src/utils/installmentSchedule.ts` (no DB calls but consumers don't), `src/utils/salesQueries.ts:49-69` (`fetchSeller` returns `null` on any error), `src/utils/contractWritersCache.ts:23-41` (caches an exception result to `null` but only in `prefetch`)
- **What:** Many calls destructure `{ data }` only, ignore `error`, and produce zero/empty results on failure. The user sees a "0 paid installments" or "no contract writers" UI without any indication something is broken.
- **Why it matters:** Concretely: if RLS blocks a user from reading `installment_payments`, `getSaleStats` returns `totalPaid = 0` and the Installments page shows the entire amount as outstanding. The user calls support thinking the system "lost" a payment.
- **Fix:** Surface errors to the caller (return `{ data, error }` shape, or throw). At the page level, render a banner instead of silently returning empty data.

### 2.4 [Bug] `Finance.tsx` swallows load errors entirely
- **File:** `src/pages/Finance.tsx:139-168`
- **What:** `loadData()` catches with `console.error('Error loading finance data:', e)` and never sets a user-visible error state (there isn't one). A failed load just turns off the spinner, leaving an empty page.
- **Why it matters:** The owner thinks the company has earned 0 DT today.
- **Fix:** Add an `error` state and an `<Alert>` like every other page. Same pattern in `loadAllBatches` in `Confirmation.tsx:180-192`, `loadAvailableSales` in `Appointments.tsx:285-309`.

### 2.5 [Bug] `SalesRecords.tsx` cancel/revert ignores half its own DB error returns
- **File:** `src/pages/SalesRecords.tsx:425-432, 488-496`
- **What:** `handleRevertToPending` and `handleCancelSale` issue `await supabase.from('installment_payments').delete()…` without capturing or checking `{ error }`. (Compare with `handleRemoveSale` line 528 which does check.) The function then `alert(✅ success)` even if the delete failed.
- **Why it matters:** A reverted sale can leave behind orphan installment rows that still appear in the Finance and Installments pages.
- **Fix:** Capture and check `{ error }` like the parallel `handleRemoveSale` does.

### 2.6 [Bug] Hash router silently routes unknown pages to `home` and forgets the URL
- **File:** `src/App.tsx:172-191`
- **What:** `getPageFromHash` falls back to `'home'` for any unknown hash but does NOT replace the URL. So a user with `#typo` in the bar ends up on Home with a misleading `#typo` URL. Worse: deep-linking to `#users` while not having access calls `console.warn('User doesn\'t have access to page: users')` and resets to `home` in an effect (lines 234-240) — but only after `systemUser` resolves. There's a brief flash of "denied" then home loads.
- **Why it matters:** Bookmarks pointing at restricted pages create a disorienting flash; deep links to admin pages briefly attempt to render before the access check.
- **Fix:** Inside `getPageFromHash`, if hash is unknown, also call `window.history.replaceState` to normalize. Resolve access checks synchronously when both `currentPage` and `systemUser` are present, and skip rendering the protected component until both are settled.

### 2.7 [Bug] `useSalesRealtime` reconnection logic is broken
- **File:** `src/hooks/useSalesRealtime.ts:86-103`
- **What:** When the channel returns `CHANNEL_ERROR` or `TIMED_OUT`, the code schedules a `setTimeout` that removes the channel and sets `channelRef.current = null` — but it never re-subscribes. The channel is gone forever; the page stops getting realtime updates.
- **Why it matters:** A flaky network or a Supabase realtime hiccup permanently disables realtime for the user; they rely on polling/window-events from then on (and as in 2.2, that's not always wired).
- **Fix:** Restructure so the cleanup-and-resubscribe is implemented properly, e.g. by bumping a state counter that the effect depends on, or by extracting the subscribe call into its own function and calling it again after `removeChannel`.

### 2.8 [Bug] `EditSaleDialog` post-update verify uses `single()` and crashes on RLS-zero-rows
- **File:** `src/components/EditSaleDialog.tsx:466-479`
- **What:** After updating, the code re-reads `sale_price` with `.single()`. If RLS blocked the SELECT, `.single()` returns an error and the catch throws `t('editSale.permissionError')` — but the update may have actually succeeded (the prior block at 452-463 retries the UPDATE without `.select()` to handle exactly that RLS scenario). The user sees a "permission error" for an action that worked.
- **Why it matters:** Confusing failure messaging on a happy-path mutation.
- **Fix:** Use `.maybeSingle()` and treat null+null as "RLS hides it but write succeeded".

### 2.9 [Bug] PWA chunk-retry `lazyWithRetry` silently double-imports on success of first retry
- **File:** `src/App.tsx:36-54`
- **What:** The retry loop returns the first success but in the prefetch effects (`useEffect` at 243-261) `import('./pages/Home')`, `import('./pages/Confirmation')`, `import('./pages/Land')` are called bare — each load triggers a fresh module fetch, separate from the lazy loader's cache. In dev with StrictMode (every effect runs twice), that's 6 unnecessary chunk fetches per session.
- **Why it matters:** Wasted bandwidth on slow / metered Tunisian mobile networks. Not a functional bug.
- **Fix:** Cache the prefetch results in a module-scope `WeakSet` of started imports, or use the same `lazyWithRetry`-returned ref.

### 2.10 [Bug] `loadSystemUser` retries can pile up because the timeout fires AND the `catch` retries
- **File:** `src/contexts/AuthContext.tsx:308-738`
- **What:** Two retry triggers exist: (a) the `loadTimeoutRef` callback (lines 362-380) which schedules `loadSystemUser(authUserId, retryCount + 1)`, and (b) the `catch` block's `setTimeout(() => loadSystemUser(authUserId, retryCount + 1), …)` (lines 714-718). If a slow query both times out (firing #a) and rejects with a non-network error (firing #b), two retries are scheduled with the same `retryCount + 1`. With `MAX_RETRIES = 1` they cancel each other via `loadingSystemUserRef.current`, but the abort-controller dance is fragile (see the `queryCompletedRef` checks at 386-419).
- **Why it matters:** Hard-to-reproduce "stuck loading" symptoms. PROJECT_NOTES.md confirms historical reports of this.
- **Fix:** Have one retry path. Replace the elaborate timeout/abort plumbing with a single `Promise.race([queryPromise, timeoutPromise])` and one centralized retry helper. Drop the `MAX_LOADING_TIME = 10000` safety effect (lines 889-906) once the primary path is reliable.

### 2.11 [Bug] `AuthContext` initial `useEffect` swallows changes in `mounted` between async steps
- **File:** `src/contexts/AuthContext.tsx:86-244`
- **What:** Inside the auth-state-change handler the code does `if (!mounted) return` checks at the top, then `await loadSystemUser(session.user.id)` (line 165, 221), then continues. If unmount happens during the await, subsequent `setUser/setSystemUser` calls inside `loadSystemUser` still run (those don't check mounted). React 19 will warn but more importantly state is updated on a destroyed provider.
- **Why it matters:** Memory leaks, stale state, and noisy dev warnings.
- **Fix:** Pass an `AbortSignal` from the effect into `loadSystemUser`, and skip every `setX` call if the signal is aborted.

### 2.12 [Bug] `Layout.tsx` notification-bell `loadNotifications` reads stale `notifications.length`
- **File:** `src/components/Layout.tsx:77-123`
- **What:** Inside `loadNotifications(false, false)` the offset is `notifications.length` (line 85) — but `notifications` is the closed-over state from the effect's render at line 66. Subsequent loads always use the offset from the first render, not the current list length.
- **Why it matters:** "Load more" pagination requests overlap windows of notifications and skip rows. The dedup at line 106 papers over it but the user can lose middle-page notifications when "Load more" requests collide with realtime inserts.
- **Fix:** Use a ref synced with `notifications.length`, or move `loadNotifications` outside the effect and accept current length as an argument.

### 2.13 [Bug] `LayoutTsx::handleDeleteNotification` revert is order-broken
- **File:** `src/components/Layout.tsx:329-357`
- **What:** On delete failure the code restores the deleted notification by appending to a fresh array and re-sorting, but the optimistic delete also potentially shrunk `displayedCount` (line 336-338); the revert doesn't restore `displayedCount`. So a failed delete restores the row but it stays hidden until the user reloads.
- **Why it matters:** User believes the delete worked.
- **Fix:** Capture `displayedCount` at start of optimistic update; on failure, restore it.

### 2.14 [Bug] Confirmation cleanup `cleanupOrphanedReservations` is N+1 queried
- **File:** `src/utils/dataIntegrity.ts:35-106`
- **What:** Loops over reserved pieces and issues a separate `supabase.from('sales').select('id').eq(land_piece_id, piece.id)` per piece (line 72-77). With 100 reserved pieces that's 101 round-trips.
- **Why it matters:** With the periodic cleanup running every 30 s mentioned in known_issues.md, that's hundreds of requests/minute against a single connection. Likely contributes to Supabase rate limits and the perceived "slow" Confirmation page.
- **Fix:** One `supabase.from('sales').select('land_piece_id').in('land_piece_id', pieceIds).eq('status', 'pending')` and diff the sets.

### 2.15 [Bug] `EditSaleDialog::handleResetAllPayments` is N round-trips, no transaction
- **File:** `src/components/InstallmentDetailsDialog.tsx:316-342, 346-385`
- **What:** Loops over `installments` and issues a separate UPDATE per row. If one fails halfway (network blip) you end up with a partially-reset table — half "paid", half "pending" — and the user has no way to know which.
- **Why it matters:** Silent data corruption.
- **Fix:** Use one `supabase.from('installment_payments').update(…).in('id', allIds)`. Same fix for `handleEditFirstDateConfirm` (line 252-257). For "cancel single payment" the cascade can stay as separate calls but should be wrapped in `executeTransaction` from `transactionUtils.ts`.

### 2.16 [Bug] `replaceVars` defined in 8 places — implementations drift slightly
- **Files:** `src/pages/Clients.tsx:47-49`, `src/pages/Confirmation.tsx:29-31`, `src/pages/ConfirmationHistory.tsx:20-22`, `src/pages/Installments.tsx:98-100`, `src/pages/SalesRecords.tsx:74-75`, `src/components/ConfirmGroupSaleDialog.tsx:19-21`, `src/components/ConfirmSaleDialog.tsx:80-82`, `src/components/EditSaleDialog.tsx:69-70`. The "real" shared one is in `src/utils/replaceVars.ts` and used by exactly one file (`src/pages/Appointments.tsx:18`).
- **What:** All eight inline copies are functionally identical. The shared util exists. Nobody has noticed.
- **Why it matters:** Maintenance hazard. If the utility changes (e.g. for escaping HTML), eight places must be updated.
- **Fix:** Delete every inline copy, replace with `import { replaceVars } from '@/utils/replaceVars'`. Trivial pass.

### 2.17 [Bug] `contractWritersCache` not invalidated when ContractWriters page mutates writers
- **File:** `src/utils/contractWritersCache.ts:10-48`, `src/pages/ContractWriters.tsx:75-141`
- **What:** The 5-minute module-scope cache `cache` is never reset when a writer is added/edited/deleted on the ContractWriters page. The Confirmation/ConfirmSale dialogs read from this cache.
- **Why it matters:** A user creates a new contract writer, opens the Confirm dialog within 5 minutes, and the new writer doesn't appear in the dropdown.
- **Fix:** Export `invalidateContractWritersCache()` from the cache module and call it from `handleSubmit`/`handleDelete` in `ContractWriters.tsx`. (The TS strict mode means the assignment `cache = (data || []) as ContractWriterCached[]` followed by `return cache` at line 32 also has a stale-narrowing risk — a re-entrant call could see the wrong value.)

### 2.18 [Bug] Login auto-appends `@gmail.com` for every email lacking `@`
- **File:** `src/pages/Login.tsx:84-86`, mirrored in `AuthContext.tsx:746-751`
- **What:** If a user types `omar` it becomes `omar@gmail.com`. There is no UI hint about this, and it makes Yahoo/Outlook users impossible without spelling out the full address. Worse: typing `omar@example` (typo, missing TLD) gets passed through unchanged and Supabase Auth rejects with a generic error.
- **Why it matters:** Locking out users with non-Gmail addresses without explanation.
- **Fix:** Only auto-append in dev mode, or add explicit UI text "If no email provider, we assume @gmail.com". Validate the email shape before appending.

### 2.19 [Bug] `Layout.tsx` notificationDateFilter has no `'date'` literal in its type
- **File:** `src/components/Layout.tsx:34, 41`
- **What:** Type is `'all' | 'today' | 'yesterday' | 'this_week' | string`. The check `notificationDateFilter === 'date'` works only because the `string` fallback in the union swallows the typo. There is no `'date'` literal defined anywhere — but the code at line 41 effectively means "if the user picked 'date'-mode, use the specific date instead".
- **Why it matters:** This appears to be an undeclared mode that was never made part of the union; if anyone tightens the type, this branch breaks. Currently it relies on a magic string with no source of truth.
- **Fix:** Add `'date'` to the `NotificationDateFilter` literal union in `notifications.ts:352`.

### 2.20 [Bug] `Confirmation.tsx` periodic cleanup mentioned in known_issues.md is not actually wired
- **File:** `src/pages/Confirmation.tsx`
- **What:** `docs/known_issues.md` claims "Periodic cleanup every 30 seconds in Confirmation page". A grep for `cleanupOrphanedReservations` and `setInterval` in `Confirmation.tsx` returns zero matches. The cleanup utility exists in `dataIntegrity.ts` but is not invoked here.
- **Why it matters:** Documentation falsely advertises a self-healing behavior that doesn't exist. Orphaned reservations accumulate.
- **Fix:** Either wire it up (debounced, not on a fixed interval, see 2.14) or correct the docs.

---

## 3. Error handling at the user-facing surface

### 3.1 `console.error` without UI
- `Finance.tsx:163-165` — silent
- `Confirmation.tsx:189-191` (`loadAllBatches`) — silent
- `Appointments.tsx:285-309` (`loadAvailableSales`) — silent
- `PhoneCallAppointments.tsx:106` — let me check…
- `Installments.tsx:395, 409` — `getSaleStats` query errors silent
- `Layout.tsx:115` notifications load errors silent
- `Users.tsx:127-129` (`loadBatchesForPermissions`) — silent
- `Users.tsx:245-251` (`loadPiecesForBatch`) — silent

Pattern: anywhere a load fails the user gets either an empty page or a stale page with no indication.

### 3.2 `alert()` used for both success and failure
- `src/pages/SalesRecords.tsx:447, 498, 552` — `alert("✅ ...")`
- `src/pages/Users.tsx:676` — `alert(...)` on delete failure
- `src/pages/ContractWriters.tsx:139` — `alert(...)` on delete failure
- `src/pages/PhoneCallAppointments.tsx:763, 797` (verify location)

Inconsistent with the rest of the app which uses `<Alert>` and `<NotificationDialog>`.

### 3.3 Silent UPDATEs that may have hit zero rows due to RLS
- `src/components/EditSaleDialog.tsx:441-479` — handles this by re-reading and comparing `sale_price`, but only EditSaleDialog is defensive. Every other UPDATE call elsewhere (`handleCancelSale`, `handleRevertToPending`, `handleResetAllPayments`, `handleEditFirstDateConfirm`, sale confirmation) trusts the lack-of-error to mean success. With RLS on, an UPDATE that affects zero rows returns no error.

---

## 4. Race conditions, lifecycle, memory leaks

### 4.1 [Bug] Land.tsx debug `useEffect` emits 7 console.logs every render
- **File:** `src/pages/Land.tsx:163-172`
- **What:** A `useEffect` that fires on changes to `selectedBatchForPieces`, `selectedClient`, `saleDialogOpen`, `clientSelectionDialogOpen`, `selectedPiecesForSale` and prints the entire object set to the console with `=== SALE DIALOG STATE CHANGED ===`. This is not dead code — it's live in production.
- **Why it matters:** Performance loss on every interaction in the largest page (3387 lines), plus production console pollution and a tiny info-disclosure (the dump includes client objects).
- **Fix:** Remove or gate behind `import.meta.env.DEV`.

### 4.2 [Bug] `Home.tsx` debug log of systemUser
- **File:** `src/pages/Home.tsx:39-49`
- **What:** Same pattern: production `console.log` of the entire systemUser including allowed_pages.
- **Fix:** Remove or gate on DEV.

### 4.3 [Bug] `useSalesRealtime` channel name uses `Date.now()` per mount → garbage channels
- **File:** `src/hooks/useSalesRealtime.ts:44`
- **What:** `const channelName = \`sales-realtime-${Date.now()}\`` — every effect re-run gets a new server-side channel. If the cleanup races (see 2.7), Supabase's realtime server accumulates orphan channel registrations until the websocket is forcibly torn down.
- **Why it matters:** Realtime quota usage, harder debugging.
- **Fix:** Use a stable channel name per consumer page, scoped by user ID.

### 4.4 [Bug] `Land.tsx` periodic 15-second piece refresh
- **File:** `src/pages/Land.tsx:407-420`
- **What:** A `setInterval` polling pieces every 15 s while the piece dialog is open, on top of the realtime subscription. If `loadPieces` takes longer than 15 s on a slow network, calls overlap.
- **Why it matters:** Wasteful traffic, race-condition-prone.
- **Fix:** Use the realtime subscription as the source of truth; or add an in-flight guard.

### 4.5 [Bug] `Land.tsx::loadAllBatchStats` issues a query per batch
- **File:** `src/pages/Land.tsx:591-693`
- **What:** Loops over batchIds and issues N parallel queries to count statuses. Comment claims "ultra-optimized: single aggregated query (FASTEST)" but the implementation actually does the opposite.
- **Why it matters:** With 50 batches that's 50 queries on every page load. Just use one aggregated query: `select batch_id, status, surface_m2 from land_pieces where batch_id in (…)` and reduce client-side.
- **Fix:** Single query + group reduce.

### 4.6 [Smell] Many useEffects with empty `[]` dep arrays + ref-mutated closures
Land.tsx has the explicit `eslint-disable-next-line react-hooks/exhaustive-deps` (line 340) acknowledging the closure issue. Several other places replicate the same pattern. These should be reviewed individually but are not severe.

---

## 5. State management mistakes

### 5.1 [Smell] `displayedStats` mirrored as both state and ref in `Land.tsx`
- **File:** `src/pages/Land.tsx:111-118, 343-346`
- **What:** `displayedStats` is in both `useState` and `useRef`, manually synced. The ref exists only to read the current value inside the animation closure — but the same effect already runs on `[stats]`, so a normal `useReducer` or even computing the diff from `stats` would suffice.
- **Why it matters:** Bug-prone synchronization.
- **Fix:** Use `useReducer` for the animator, or animate via CSS transition on a number child.

### 5.2 [Smell] `Confirmation.tsx` keeps `sales`, `clientGroups`, `groupedSales`, `totalCount` in parallel
- **File:** `src/pages/Confirmation.tsx:95, 110-111, 123`
- **What:** All four are derived from the same fetch. `groupedSales` is `clientGroups.flatMap(cg => cg.offerGroups.map(og => og.sales))` — pure derivation. `totalCount = clientGroups.length` — pure derivation.
- **Why it matters:** Easy to get out of sync if any future bugfix updates one but not the others.
- **Fix:** Compute via `useMemo` from `sales`.

### 5.3 [Smell] Forms keep numeric values as strings then `parseFloat` at submit
- **File:** `EditSaleDialog.tsx`, `ConfirmSaleDialog.tsx`, etc.
- **What:** `salePrice`, `depositAmount`, `companyFee`, `paymentAmount` are all `useState<string>('')`. Validation happens once at submit with `parseFloat`. Live UI cannot react to invalid input until submit.
- **Why it matters:** Fragile; see #1.4.
- **Fix:** Either use a `useReducer` that holds `{ raw: string; parsed: number | null; error: string | null }` per field, or adopt a small form helper.

### 5.4 [Smell] `AuthContext` is a god-context — confirmed
- **File:** `src/contexts/AuthContext.tsx` (932 lines)
- **What:** Mixes: Supabase session bootstrapping, retry/timeout/abort-controller plumbing, localStorage caching of the system user, fallback minimal-column queries, sign-in/out, refresh, "safety" max-loading effect. Also implements its own network-connectivity checker (lines 247-273) that pings `google.com/favicon.ico`.
- **Why it matters:** Unmaintainable; the documented retry/timeout/abort logic has at least 4 known race conditions (see 2.10, 2.11). Every change risks breaking initial-load of the app.
- **Fix:** Split into `useSession` (auth user only), `useSystemUser` (DB user, cached), `useAuthBootstrap` (loading orchestration). Drop the home-grown network checker — Supabase JS already retries on transport errors.

### 5.5 [Smell] `Users.tsx` is a 1374-line god-page — confirmed
- **File:** `src/pages/Users.tsx`
- **What:** Combines: list view, create/edit dialog, delete confirm dialog, image upload, batch & piece access-permission picker (~600 lines), natural-sort utility, password-show toggle, etc.
- **Why it matters:** No way to test pieces in isolation. Same `naturalSort` is duplicated in `Land.tsx:707-779` (see Duplication section).
- **Fix:** Extract `WorkerCard`, `WorkerForm`, `BatchPermissionsPicker`, `PiecePermissionsPicker` into separate files. Move `naturalSort` to `src/utils/naturalSort.ts`.

---

## 6. Type safety abuses

| File:line | Construct | Note |
|---|---|---|
| `src/main.tsx:23` | `(window as any).__pwa_updateSW = updateSW` | Acceptable — extending `Window` |
| `src/contexts/AuthContext.tsx:426` | `const { data, error } = result as any` | Race-shape from Promise.race; should be typed |
| `src/contexts/AuthContext.tsx:624` | `(data as any).preferred_language` | DB column may not exist; should be `Partial<…>` |
| `src/components/Layout.tsx:446` | `(window as any).__pwa_updateSW` | Same as main.tsx — declare on Window |
| `src/pages/ConfirmationHistory.tsx:673` | `sale={detailsSale as any}` | Type mismatch hidden — flag |
| `src/pages/Land.tsx:569, 570, 620, 852` | `(window as any).requestIdleCallback` | Use lib.dom.iterable types |
| `src/pages/Login.tsx:38, 165` | `(window.navigator as any).standalone` | iOS-only field; declare in `WindowEventMap`-style |
| `src/pages/Login.tsx:189` | `handleSubmit(e as any)` | KeyboardEvent → FormEvent cast — call signature mismatch |
| `src/pages/SalesRecords.tsx:1103` | `sale={detailsSale as any}` | Same as ConfirmationHistory |
| `src/i18n/translations.ts:9` | `typeof (v as any) !== 'string'` | Pointless cast |

Plus: `Users.tsx:490`, `EditSaleDialog.tsx:398`, `ConfirmSaleDialog.tsx:413, 482` have `const updateData: any = { … }` — losing the row schema. Should be typed via the Supabase generated types or hand-written `Partial<SaleRow>`.

`React.LazyExoticComponent<T>` in `App.tsx:53` is fine.

---

## 7. Dead code / orphan files

### 7.1 `src/utils/replaceVars.ts` is essentially orphan
- Only `Appointments.tsx` imports it. The other 8 callers reimplement it inline (see 2.16).

### 7.2 `loadBatchStats(batchId)` in Land.tsx is unused legacy
- **File:** `src/pages/Land.tsx:696-705` — the comment "Keep old function for backward compatibility (if needed elsewhere)" is followed by no callers in the codebase. ESLint `noUnusedLocals` doesn't catch it because it's `function` not `const`.

### 7.3 `dataIntegrity.ts` exports many never-used helpers
- `src/utils/dataIntegrity.ts` (823 lines) exports `lockPieceForOperation`, `unlockPieceForOperation`, `isPieceLocked`, `cleanupOrphanedReservations`, `verifyPieceStatusConsistency`, `fixPieceStatus`, `retryOperation`, `ensurePieceAvailable`, plus internal helpers. Several are referenced only from inside this file; some (per 2.20) are documented as auto-running but aren't.

### 7.4 `App.css` is presumably the leftover Vite default
- `src/App.css` is imported in `App.tsx:2` but `index.css` is the actual Tailwind entry point.

### 7.5 Dead `console.log` flood in Land.tsx and Home.tsx
- `Land.tsx:163-172, 479-481, 681-686, 432, 434, 454-456, 562-564, 658…` and many more
- `Home.tsx:39-49`
- `Confirmation.tsx:222-247, 246-269` — all gated on `process.env.NODE_ENV === 'development'` (good), but Vite uses `import.meta.env.DEV` — `process.env` is undefined in browser builds unless the bundler shims it. Verify whether Vite's define replacement covers this. If it doesn't, these console.logs always fire (the boolean condition is `undefined === 'development'` → false → never fires, so the only cost is dead code). Either way, replace with `import.meta.env.DEV`.

### 7.6 `useSalesRealtime` `payload.new`/`payload.old` console.logs
- `src/hooks/useSalesRealtime.ts:56, 69, 82` — `console.log('Real-time: Sale created', payload.new)`, etc. Always live in prod.

### 7.7 Unused state setter `setError` paths
- `Confirmation.tsx:194-196` — sets error but never displays it on this branch (uses a different mechanism elsewhere).

---

## 8. Duplication

### 8.1 `replaceVars` reimplemented 8 times — see 2.16

### 8.2 `naturalSort` reimplemented at least 2 times
- `src/pages/Land.tsx:707-779`
- `src/pages/Users.tsx:147-217`
Bit-for-bit identical algorithm. Should be `src/utils/naturalSort.ts`.

### 8.3 UUID validation regex repeated 3+ times
- `src/components/ConfirmSaleDialog.tsx:433, 517`
- `src/components/EditSaleDialog.tsx:420`

Same regex, same logic. Extract to `src/utils/uuid.ts`.

### 8.4 `SaleData formatter` (formatSaleData / row()) helper present in salesQueries
- `src/utils/salesQueries.ts:105-114` provides `formatSaleData` and `formatSalesWithSellers`. Good — used by Confirmation, Finance, SalesRecords, ConfirmationHistory. But Appointments.tsx (line 226-273) reimplements the same logic inline.

### 8.5 List-with-search-pagination boilerplate per page
- `Confirmation`, `Installments`, `Clients`, `SalesRecords`, `ConfirmationHistory`, `Appointments` all hand-roll: search input + filter + pagination + page change effect + scroll-to-top. The newer pages (`SalesRecords` Nov 2025+) look better organized but most of this should be a `usePaginatedList` hook.

### 8.6 Optimistic-update + revert-on-failure helper in Layout.tsx
- `Layout.tsx:279-357` does this for notifications. The dialogs do it for installments (e.g. `handleResetAllPayments`). Same pattern, no shared helper.

### 8.7 "stats animation" code duplicated
- `Land.tsx:343-404` and `Clients.tsx` both implement a count-up animation by holding `displayedStats` + `displayedStatsRef` + a Map of timeouts. Should be a `useCountUp` hook.

---

## 9. Date / timezone handling

### 9.1 [Smell] Many `new Date(string)` from Supabase without UTC awareness
- **Files:** `src/utils/notifications.ts:32, 89, 547-568`; `src/components/InstallmentDetailsDialog.tsx:201, 203` (`dueDate < now` comparison without timezone normalization); `src/pages/Installments.tsx:419-429`; `src/pages/Finance.tsx:172-194`; `src/pages/Appointments.tsx:251, 367-378`
- **What:** `new Date('2025-12-31')` is parsed as UTC midnight by JS spec (date-only ISO). `new Date('2025-12-31T00:00:00')` is parsed as local. Mixing these across the codebase yields off-by-one-day bugs depending on the user's timezone (Tunisia is UTC+1, so usually fine, but DST and travelers cause incidents).
- **Why it matters:** "Today" filter in Finance can show yesterday's sales for a worker logging in at 11pm; appointment dates can render off by one.
- **Fix:** Standardize on a `parseDateLocal(string)` helper that always parses `YYYY-MM-DD` as local-midnight. Existing `Appointments.tsx:251` uses the noon-trick (`+ 'T12:00:00'`) — generalize this.

### 9.2 [Smell] `formatTimeAgo` in `notifications.ts:548-569` produces grammatically wrong Arabic
- **File:** `src/utils/notifications.ts:556-560`
- **What:** Hardcodes Arabic strings with `${diffMins > 1 ? '' : ''}` (both sides empty — looks like a TODO that was never finished). Result: "منذ 1 دقيقة" and "منذ 5 دقيقة" instead of "منذ 5 دقائق" (proper plural).
- **Why it matters:** Grammar bug visible to every user on every notification. (This is borderline i18n scope but it's a real bug, not a translation gap.)
- **Fix:** Implement Arabic plural rules.

### 9.3 [Smell] Old date math in `getDateRange`
- **File:** `src/utils/notifications.ts:354-387`
- The "this_week" branch sets Sunday-as-end-of-week (`day === 0 ? 6 : day - 1`) but the "today" branch does not align. Locale of "first day of week" varies (Tunisia = Sunday in some apps, Monday in others).

### 9.4 [Smell] `installmentSchedule.ts` correctly uses UTC
- **File:** `src/utils/installmentSchedule.ts:60-87`
- **What:** Good — uses `Date.UTC(…)` consistently and clamps day-of-month for short months.
- **Note:** This is the gold standard for date-handling in this codebase. Other files should emulate.

---

## 10. Number / currency handling

### 10.1 [Smell] All money is JS-Number `number`, not integer cents
- **File:** Pervasive — `priceCalculator.ts`, `installmentCalculator.ts`, `salesQueries.ts`, every dialog
- **What:** Examples: `installmentCalculator.ts:41` `remainingAmount = basePrice - advanceAmount`, `installmentSchedule.ts:91-92` `calc.remainingForInstallments - (monthlyPayment * (numberOfMonths - 1))`. These are floats. Real-world repro: a 96-month installment plan with `monthlyPayment = 416.6666…` accumulates a sub-cent rounding error that the "last installment adjustment" hides — but the schedule sum equals base price only by approximation.
- **Why it matters:** With Tunisian Dinar (millimes precision = 0.001 DT), a year of installments can drift by tens of millimes. Postgres `numeric(15,2)` stores 2 decimals, so the rounding happens at write — but the in-memory total never matches the row sum. The validation `validateDepositAndAdvance` in `validation.ts:151-166` compares with `>` directly, no epsilon — a deposit of `0.1 + 0.2` would be rejected as exceeding `0.3`.
- **Fix:** Either move all money to integer millimes (`Math.round(value * 1000)`) and divide only at format time; or add a `±0.01 DT` epsilon to every comparison. The latter is already done in some places (`installmentCalculator.ts:61` uses `+ 0.01`) but inconsistently.

### 10.2 [Smell] `formatPrice` uses `'en-US'` locale unconditionally
- **File:** `src/utils/priceCalculator.ts:60-68`
- **What:** Forces English numerals and US grouping (1,234.56). The validation strings use `'ar-DZ'` (Algerian Arabic) for `toLocaleString`. So error messages say "5 000,00 DT" while displays say "5,000.00 DT".
- **Why it matters:** Inconsistent UX; Tunisia uses `'ar-TN'` (Western Arabic numerals, French-style spaces in some contexts).
- **Fix:** Decide one format (English numerals + space-grouped works for both Arabic and French UIs). Define `formatTND()` once.

### 10.3 [Smell] Validation `validateAmount` defaults `min = 0` — accepts zero
- **File:** `src/utils/validation.ts:17-51`
- **What:** When called for a sale price, zero passes. The dialog adds an additional `<= 0` check, but the utility itself wouldn't catch it.
- **Fix:** Document this or split into `validateAmount` (>=0) and `validatePositiveAmount` (>0).

### 10.4 [Smell] No bounds check in `parseFloat(companyFee)`
- **File:** `src/components/ConfirmSaleDialog.tsx:425, 495, 501`
- **What:** Company fee can be input as anything. No upper bound (e.g. "must be ≤ sale_price * 0.05" or whatever the business rule is).
- **Why it matters:** Off-by-1000 typos.

---

## 11. Form validation gaps

### 11.1 `Users.tsx` form — many missing client-side checks
- `src/pages/Users.tsx:409-432` — only checks email and (for create) password length 6. No phone format, no display_order numeric validation, no email format. Image size check is at line 392 (good) but no MIME content sniff.

### 11.2 `Login.tsx` — minimum password 6 chars (line 97)
- The legacy `PROJECT_NOTES.md` says weak password policy was bumped to 8 + complexity. Current Login still enforces 6. Workers created via Users.tsx also use 6 (line 424).

### 11.3 `EditSaleDialog.tsx::handleSave` — accepts NaN for `partialPaymentAmount` and `remainingPaymentAmount`
- Lines 379-380 use `parseFloat(…) || 0`. A user typing `"abc"` silently becomes 0. The mismatch check at 387-390 then passes if their intent was 0, hiding the typo.

### 11.4 `ContractWriters.tsx` — Arabic literal validation messages bypass i18n
- Lines 79, 83, 89: `setError('النوع مطلوب')`, etc. Hardcoded Arabic — should be `t('contractWriters.errorXRequired')`. (Yes, missed.md scope, but these are also a logical bug: French-language users see Arabic.)

### 11.5 `ContractWriters.tsx:200` — terrible string-replace UX hack
- `t('contractWriters.deleteError').replace('فشل حذف محرر العقد', 'حذف')` — the developer wanted the word "delete" but reused the error key, replacing the prefix. Will break on translation updates.

### 11.6 No server-side validation visible
- All checks are client-side. RLS policies (per `PROJECT_NOTES.md`) are reportedly disabled in FULLDEV-V2. No `CHECK` constraints visible from frontend. A user with the service-role key (see 1.1) bypasses everything.

---

## 12. Inconsistencies

### 12.1 Two different "loading" patterns
- **Newer (Confirmation, Installments, SalesRecords, Finance):** `loading` state + spinner card
- **Older (Land):** `loading` + `loadingBatchesRef.current` (synchronous guard) + safety timeouts + abort controller
The Land pattern is more defensive but more bug-prone. Newer pages should adopt the safety timeouts; older pages should adopt the simpler structure.

### 12.2 Two different error UX
- Most pages: `<Alert variant="error">{error}</Alert>` at top
- ContractWriters / SalesRecords (some flows) / Users delete: `alert()` browser dialog
- Confirmation / Land: `<NotificationDialog>` modal
Pick one.

### 12.3 Two different table-render patterns
- Card grids (Users, Clients, Land, ContractWriters)
- Tabular rows (SalesRecords, Installments)
- Hybrid grouped (Confirmation, Installments)
This is mostly intentional but makes shared filtering/pagination hard.

### 12.4 Confirmation dialog uses `.match({id})` while Edit uses `.eq('id', …)`
- `ConfirmSaleDialog.tsx:443, 528` uses `.match({ id: saleId })`
- `EditSaleDialog.tsx:444, 457, 487` uses `.eq('id', saleId)`
Both work, but mixing is confusing.

### 12.5 Two ways to detect access to a page
- `App.tsx:157-168` — `hasAccessToPage`
- `Sidebar.tsx:42-48` — inline filter
- `Home.tsx:91-115` — inline filter + sort
- `Layout.tsx` — implicit
All three reimplement "owners see all; workers see allowed_pages with confirmation-history mapped to confirmation". Extract to `useUserPagePermissions` hook.

---

## 13. Flagged-but-unverified DB objects

The user's audit prompt identified these as referenced in code but absent from any source SQL. I confirmed:

### 13.1 `users.auth_user_id` column
- **References:** `src/contexts/AuthContext.tsx:341, 465, 580`; `src/pages/Users.tsx:580, 631, 664-665`; `docs/sql/AUTH_SETUP_GUIDE.md:29` (mentions it in docs); `docs/sql/UUID_FIX_INSTRUCTIONS.md` references it.
- **No `CREATE TABLE users` definition found anywhere in `src/` or `docs/`.** The fallback query at `AuthContext.tsx:462-468` queries this column too, so removing it would break login completely (the entire AuthContext flow assumes `users.auth_user_id` is the link to `auth.users.id`).
- **What user sees if column missing:** `error.code === '42703'` (column does not exist) → AuthContext goes through the fallback path, which also queries `auth_user_id` → fails again → `clearCachedSystemUser()` → `setSystemUser(null)` → in Login.tsx, the user gets the multi-line "AUTH_USER_ID_MISMATCH / USER_NOT_IN_SYSTEM" wall of SQL hints (see 1.3).

### 13.2 `installment_payments` table
- **References:** `Finance.tsx:150`, `Installments.tsx:396, 410, 554`, `SalesRecords.tsx:353, 429, 493, 529`, `InstallmentDetailsDialog.tsx:193, 254, 321, 349, 365, 446, 499`, `ConfirmSaleDialog.tsx:613`, `ConfirmGroupSaleDialog.tsx:536`
- **No source SQL** for the table.
- **What user sees if missing:** Confirming an installment-mode sale triggers `installmentsErr` at `ConfirmSaleDialog.tsx:616` → `throw err` → user sees "خطأ في قاعدة البيانات…" or the raw Supabase error. The piece is left in `'Reserved'` (because the cancellation-on-error code at ~620 doesn't roll back the prior sale-status update, which already set `status='completed'`). State drift.

### 13.3 `appointments` table
- **References:** `Confirmation.tsx:1060`, `Appointments.tsx:175, 469, 478, 550, 983, 1016`
- **No source SQL.**
- **User-visible:** Appointments page shows "خطأ في تحميل المواعيد" (load error). New appointments on Confirmation page silently fail.

### 13.4 `phone_call_appointments` table
- **References:** `PhoneCallAppointments.tsx:106, 269, 278, 763, 797`
- **No source SQL.**
- **User-visible:** PhoneCallAppointments page is broken end-to-end if the table is missing.

### 13.5 `contract_writers` table
- **References:** `ContractWriters.tsx:44, 97, 110, 132`, `contractWritersCache.ts:28`
- **No source SQL.**
- **User-visible:** Contract-writer dropdown empty in confirm dialog → owner can't fully complete a sale (the field is required at confirm time per the dialog UI).

### 13.6 RPC `update_sale_safe(p_sale_id, p_update_data)`
- **References:** `ConfirmSaleDialog.tsx:450, 539`
- **No source SQL.**
- **User-visible:** Only called as a fallback when the direct UPDATE returns a UUID type error. If the RPC doesn't exist, the user gets "خطأ في قاعدة البيانات: يرجى تشغيل ملفات SQL المطلوبة في Supabase. راجع ملفات docs/sql/fix_sales_trigger_uuid_issue.sql و fix_sales_update_uuid_issue.sql" — pointing to files that don't exist either.

### 13.7 RPC `notify_owners(p_type, p_title, p_message, p_entity_type, p_entity_id, p_metadata)`
- **References:** `notifications.ts:157`
- **No source SQL.**
- **User-visible:** Per the code, the function falls back to `notifyOwnersFallback` (line 173) which manually inserts notifications. So the missing RPC degrades performance but does not break the feature — UNLESS the RLS on `notifications` requires the SECURITY DEFINER context that only the RPC provides. `docs/sql/NOTIFICATION_FIX_GUIDE.md` confirms the RPC is required for RLS to permit cross-user inserts.
- **User-visible if RLS blocks fallback:** Owners stop receiving notifications about new sales. Silent — the fallback returns false, but no UI indicates failure.

### 13.8 Tables/RPCs that DO exist (as seen referenced AND in DOCUMENTATION.md):
- `clients`, `land_batches`, `land_pieces`, `payment_offers`, `sales`, `users` (the table itself, contested column auth_user_id) — confirmed in the README schema. Plus `notifications` (per NOTIFICATION_FIX_GUIDE.md), `audit_logs` (referenced in `auditLog.ts` with explicit "if table exists" defensive code).

---

## 14. TODO / FIXME / HACK comments

A search for `TODO`, `FIXME`, `HACK`, `XXX` returns essentially nothing actionable: the only matches are in placeholder strings (`'+216 XX XXX XXX'`). **Zero `TODO`/`FIXME` markers exist in the codebase.**

This is itself a smell — the code has many obvious open questions (the `// FIXED: Removed status, page_order, sidebar_order - they don't exist in the database` comment in `AuthContext.tsx:334`, the "// CRITICAL:" comments throughout `AuthContext.tsx`, the "// HACK"-equivalent string-replace at `ContractWriters.tsx:200`) but none use the conventional markers, so they can't be tracked.

---

## 15. Architectural smells

### 15.1 [Smell] God context: `AuthContext.tsx` (932 lines) — see 5.4

### 15.2 [Smell] God page: `Land.tsx` (3387 lines)
Mixes batch list, batch CRUD, image viewer with zoom/drag, piece management dialog launcher, multi-piece sale flow, client selection, sale-creation transaction, debounced refresh, periodic 15s polling, stats with animated count-up, prefetch.

This is the single hardest file in the codebase. It is not testable. Any change is a regression risk.

**Recommended split:**
- `LandListPage.tsx` (list + stats + search)
- `LandBatchDialog.tsx` (create/edit batch form + offers)
- `LandImageViewer.tsx` (zoom/drag image viewer)
- `LandSaleFlow.tsx` (the "sell pieces" multi-step: select pieces → select client → create sales)
- `useLandStats.ts`
- `useLandBatches.ts` (data hook)

### 15.3 [Smell] God page: `Users.tsx` (1374 lines) — see 5.5

### 15.4 [Smell] PieceDialog (1299 lines) and ConfirmSaleDialog (1192 lines) and InstallmentDetailsDialog (1151 lines) and ConfirmGroupSaleDialog (1029 lines)
All over 1000 lines, all dialogs. Each could be split into a thin wrapper + inner panels. The duplication between ConfirmSaleDialog and ConfirmGroupSaleDialog (about 80% overlap) is the most fixable.

### 15.5 [Smell] No data-fetching abstraction
- Every page rolls its own `useEffect(() => loadX(), [deps])` + `loading` + `error` + AbortController-or-not + retry-or-not + cache-or-not. The codebase already has 91 `setTimeout` and 58 `addEventListener` instances trying to compensate for the lack of a query layer.
- A 100-line `useQuery(key, fetcher)` hook with cache + dedupe + abort would replace easily 1500 lines across the pages.

### 15.6 [Smell] Hash router is fine but co-mingled with auth gating
- `App.tsx` has 4 `useEffect`s (lines 217-261) coordinating auth state ↔ URL hash. They overlap in conditions and have produced bugs in the past per PROJECT_NOTES.md.
- A single state machine (e.g. xstate, or a small reducer) for `pre-auth | loading-system-user | authenticated(page)` would eliminate the cross-effect coordination.

### 15.7 [Smell] Service worker / PWA update detection wires through `window.dispatchEvent`
- `main.tsx:8` dispatches `pwa-update-available`; `Layout.tsx:60-63` listens. Works but spreads the contract. A dedicated `usePwaUpdate` hook would centralize.

### 15.8 [Smell] Cross-cutting "events" via `window.dispatchEvent('saleCreated')` etc.
- `Land.tsx`, `Confirmation.tsx`, `SalesRecords.tsx`, `Finance.tsx` all listen on these. There are 5 known event names: `saleCreated`, `saleUpdated`, `saleConfirmed`, `saleCancelled`, `pieceStatusChanged`. The string contract is enforced nowhere.
- Combined with realtime subscriptions and direct refetches, this gives at least 3 mechanisms doing the same thing (see 2.2).
- Replace with a single small pub/sub or with a shared query cache that invalidates on mutation.

### 15.9 [Smell] No tests
- `package.json` has no test runner configured; no `__tests__` directories; no `.test.ts` files.
- Combined with file sizes >1000 lines and bug-prone date/money/race code, this is a major concern.

---

## End

Total findings catalogued: ~50 across 15 sections.
