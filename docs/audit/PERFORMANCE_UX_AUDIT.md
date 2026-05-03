# Performance / UX / i18n / Accessibility Audit

Audit date: 2026-05-02
Scope: React 19 + TS + Tailwind 3 + Supabase + vite-plugin-pwa SPA in `src/`.
Method: static read of `src/`, `vite.config.ts`, `index.html`, `docs/missed.md`.

Severity scale:
- **High** — daily user pain, data risk, or breaks core flows on real devices.
- **Medium** — annoying, slows interactions, or inconsistent experience.
- **Low** — nice-to-have polish.

---

## PERFORMANCE

### 1. [High] Confirmation page refetches up to 5,000 sales per keystroke
- File: `src/pages/Confirmation.tsx:119`, `:155`, `:194-318`, `:514-515`
- The `searchQuery` state is wired straight into `<Input onChange={(e) => setSearchQuery(e.target.value)}>`. The `useEffect` at line 141 lists `searchQuery` in its deps and calls `loadPendingSales(1)`, which runs the heavy `select(buildSaleQuery()).eq('status','pending').limit(5000)` query and then re-formats and re-groups every row by client. There is no debounce.
- User-visible impact: every keystroke in the search field hammers the DB (5000-row response, joined seller/piece/batch payloads, ~hundreds of KB per request) and stalls the UI on the post-fetch re-grouping loop. On 3G/Wi-Fi handoff this looks like the page is frozen.
- Fix: introduce a `debouncedSearchQuery` exactly like `Installments.tsx:177-199` (400 ms debounce), depend the loader on the debounced value, and consider doing the search server-side via `.or(...)` instead of client-side filter over 5000 rows.

### 2. [High] `Land.tsx` batch-stats loader is N+1 over batches
- File: `src/pages/Land.tsx:610-672` (`loadAllBatchStats`)
- For every batch returned by `loadBatches`, one `supabase.from('land_pieces').select('id, status, surface_m2').eq('batch_id', batchId)` is fired in parallel. With migration data showing batches up to 447 pieces and dozens of batches, you fan out to N round trips and download every piece on every render of the Land grid.
- User-visible impact: opening the Land page on a slow phone shows the spinner for several seconds, "Stats query timeout" warnings appear at line 619, and `requestIdleCallback` prefetches the same chunk again.
- Fix: collapse to one query — `select('id, batch_id, status, surface_m2').in('batch_id', batchIds)` — then group in memory. Alternative: a SQL view / RPC that returns the per-batch aggregate so you ship counts only.

### 3. [High] Finance recompute is O(installments × sales) on every filter change
- File: `src/pages/Finance.tsx:142-154`, `:226-369`
- `loadData` pulls `limit(2000)` sales + `limit(5000)` installments. The `stats` `useMemo` then does `installments.filter((i) => { const sale = sales.find((s) => s.id === i.sale_id); ... })` four times, plus more `find`s in the totals loops. Worst case: 5000 × 2000 = 10M lookups per recompute, repeated whenever `timeFilter`, `dateFilter`, or a realtime sale event fires.
- User-visible impact: noticeable input lag when toggling Today/Week/Month/All buttons; on phones it can pin the main thread for seconds.
- Fix: build a `Map<saleId, Sale>` once outside the `useMemo` and look up by `salesById.get(i.sale_id)` everywhere. Cuts each pass from O(n²) to O(n).

### 4. [High] Service worker caches Supabase responses for 24 h with no logout scrub
- File: `vite.config.ts:64-78`, `src/contexts/AuthContext.tsx:824-860`, `src/main.tsx`
- `runtimeCaching` registers `NetworkFirst` for every `*.supabase.co/*` URL with a 24 h `maxAgeSeconds` and 50 entries. `signOut` clears localStorage cache (`SYSTEM_USER_CACHE_KEY`) but never calls `caches.delete('supabase-cache')`.
- User-visible impact: on a shared / kiosk device or when one user logs out and another logs in offline (or before the network recovers), the worker can serve the previous user's clients/sales JSON from the SW cache. Already flagged in `docs/audit/SECURITY_AUDIT.md`.
- Fix: in the `SIGNED_OUT` branch of `onAuthStateChange` call `caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k))))`. Or change the workbox entry to `NetworkOnly` for `/rest/` and `/auth/` paths and `NetworkFirst` only for storage assets.

### 5. [High] LanguageProvider and AuthProvider context values are not memoized
- File: `src/i18n/context.tsx:46`, `src/contexts/AuthContext.tsx:908-919`
- Both `<...Provider value={{ ... }}>` allocate a new object literal on every render. Every consumer of `useLanguage()` / `useAuth()` re-renders whenever the provider re-renders, even when the actual content is unchanged. With 13 lazy pages, 25k LOC of components, and dozens of `useLanguage` calls per page, this is a steady tax.
- User-visible impact: noticeable input lag in heavy dialogs (`ConfirmGroupSaleDialog`, `MultiPieceSaleDialog`, `Land.tsx`) — typing in one field triggers a re-render of the whole dialog tree because every child reads `t`.
- Fix: wrap both `value` objects in `useMemo`. The `t` callback is already `useCallback`-d in i18n; `language`/`setLanguage` are stable. In Auth, also `useCallback` `signIn`/`signOut`/`refreshSystemUser` (currently allocated each render).

### 6. [High] `Land.tsx` is a 3,387-line monolith in a single lazy chunk
- File: `src/pages/Land.tsx` (3387 lines), `src/App.tsx:59`
- The biggest page in the app holds: list view, batch CRUD, multi-piece sale dialog mount, image zoom modal, drag handlers, sale offer rendering. Even though it's lazy-loaded, when the user opens Land the whole bundle (and inline dialog components imported from it) ships at once.
- User-visible impact: first-paint of the Land page on a cold cache is the slowest of any tab. Users report a delay between tap and content showing.
- Fix: split out `MultiPieceSaleDialog`, image-zoom viewer, and the create-batch flow into separate chunks dynamically imported only when their dialogs open. A 3,000-line file is also a chunk-too-coarse signal for `manualChunks` in vite config — consider an `if (id.includes('/pages/Land')) return 'page-land'` rule so route prefetch is more granular.

### 7. [High] No image lazy-loading or resizing anywhere
- Files: `src/pages/Home.tsx:336`, `:500`; `src/pages/Users.tsx:806`; `src/pages/Land.tsx:2535`, `:3358`; `src/components/PieceDialog.tsx:704`
- `grep loading="lazy"` returns zero matches across the entire app. All `<img>` tags fetch eagerly. Profile and batch images uploaded via `Home.tsx:268-273` and `Users.tsx:454-475` are stored at original resolution (no client-side resize, only `cacheControl: '3600'`). The viewer at `Land.tsx:3358` shows the full-size image even on phones.
- User-visible impact: Home page paints later when user has a profile photo. List pages with thumbnails (Users) request multi-MB JPEGs to display 64×64 circles. On poor connections this delays the click target appearing.
- Fix: add `loading="lazy"` to every non-LCP `<img>`. Resize uploaded photos to a sensible max (e.g. 512×512 for profile, 1600×1600 for batch) using a `<canvas>` before upload — no library needed.

### 8. [Medium] Notification list re-fetches all 20 every 60 s in addition to realtime
- File: `src/components/Layout.tsx:248-252`
- A `setInterval(loadNotifications, 60000)` fires on top of the postgres_changes realtime subscription. Belt-and-suspenders, but each tick re-renders the whole notification panel and the bell badge.
- User-visible impact: minor — but on a long-open desktop tab this is one extra round-trip a minute per logged-in owner. Adds load to the Supabase project.
- Fix: rely on realtime; reduce the interval to 5 min as a backstop, or trigger it only when realtime has been disconnected (status `CLOSED`/`TIMED_OUT`).

### 9. [Medium] `useSalesRealtime` recreates the channel on every prop change
- File: `src/hooks/useSalesRealtime.ts:16-114`
- The `useEffect` deps are `[enabled]` (good), but a new channel name with `Date.now()` is generated on every mount. When a parent component re-renders enough to remount the page (e.g. user navigates away and back), the previous channel is removed and a new subscribe round-trip happens. Also in `Confirmation.tsx`, `Finance.tsx`, `Layout.tsx` you have multiple realtime subscriptions running concurrently on the same tables.
- User-visible impact: a few hundred ms cost on page transitions, plus additional WebSocket open/close churn against Supabase realtime.
- Fix: deduplicate at a single shared subscription level (one global "sales-changed" emitter) instead of one channel per consumer page.

### 10. [Medium] `Clients.tsx` uses three count-only Supabase round-trips for stats
- File: `src/pages/Clients.tsx:534-538`
- Three sequential `select('*', { count:'exact', head:true })` calls (total, individuals, companies). Plus one more `setTimeout(... select('*', {count:'exact', head:true}))` at `:456-467` *after* the data fetch.
- User-visible impact: the stat tiles flicker 0 → approximate → exact, which is fine, but the "exact" round trips pile up on every page change of the paginator (`useEffect [currentPage]` at `:143`).
- Fix: a single `select('type', { count:'exact', head:false })` returns enough rows to bucket client-side; or a stored RPC returning `{ total, individuals, companies }` in one call.

### 11. [Medium] No virtualization on long piece lists
- File: `src/pages/Land.tsx:2693-2694`, `:2984-2985`; `src/components/PieceDialog.tsx`
- The pieces dialog renders `batchPieces.map(piece => …)` of up to 447 items with no windowing. Each piece is a Card with badges, text, etc. The container has `max-h-64 overflow-y-auto`, so the user scrolls inside a fixed box, but every piece is still in the DOM.
- User-visible impact: Opening a large batch causes a frame drop on the dialog open animation; scrolling inside the dialog is jankier on low-end Androids.
- Fix: virtualize via `react-virtual` or manual windowing (track scrollTop, slice the array). Avoid bringing in an extra dep — a 50-line manual implementation is enough.

### 12. [Low] Stat count-up animation in Clients fires 30-step setTimeout chain per stat
- File: `src/pages/Clients.tsx:175-239`
- Four stats × 30 timeouts = 120 setTimeouts queued each time stats change. Done inside a `setDisplayedStats` functional updater that queues another `setTimeout(animate, 0)`.
- User-visible impact: micro — but on an old phone this competes with input handling for the first second after the page renders.
- Fix: one `requestAnimationFrame` loop per stat with elapsed-time interpolation, or just drop the count-up.

---

## UX

### 13. [High] `confirm()` and `alert()` used for destructive actions
- Files:
  - `src/components/PieceDialog.tsx:633` — `confirm('هل أنت متأكد من حذف هذه القطعة؟')` and `:642` — `alert('فشل حذف القطعة: ' + e.message)` — also bypasses i18n.
  - `src/pages/Appointments.tsx:527`, `:565`
  - `src/pages/ContractWriters.tsx:128`, `:139`
  - `src/pages/Clients.tsx:810`, `src/pages/Users.tsx:676`
  - `src/pages/SalesRecords.tsx:447, 498, 552, 572`
- User-visible impact: native browser dialogs are not styled, can't be RTL-aligned, won't render Arabic punctuation correctly on some Android browsers, are blocking, and cannot include rich content. PieceDialog deletes a land piece behind the scenes after a single yes/no with no i18n. SalesRecords uses `alert()` to confirm bulk reverts/cancels/deletes.
- Fix: `<ConfirmDialog>` already exists in `src/components/ui/confirm-dialog.tsx`. Use it. For success/error, replace `alert()` with the existing `<NotificationDialog>` or a proper toast.

### 14. [High] Modal has no focus trap, no Escape-to-close, no backdrop click-to-close
- File: `src/components/ui/dialog.tsx:1-83`
- The `Dialog` primitive locks body scroll and renders `role="dialog" aria-modal="true"` but: no focus is moved into the dialog on open, focus can tab back to the underlying page, Escape does not close, clicking the backdrop does not close. There is also no `aria-labelledby` linking the title.
- User-visible impact: keyboard users cannot escape modals (`ConfirmGroupSaleDialog`, `EditSaleDialog`, etc.); tabbing through a long form pulls focus behind the modal. Mobile users can't tap-outside to dismiss.
- Fix: in `Dialog`, add (a) `useEffect` for `keydown` Escape → `onClose()`, (b) save active element on open and restore on close, (c) `onMouseDown` on the backdrop calls `onClose` if target === currentTarget, (d) move focus to the close button on open, (e) implement a tab cycle inside the panel.

### 15. [High] Hardcoded "موافق" button in success/error notifications
- File: `src/components/ui/notification-dialog.tsx:22`
- The OK button label is the literal string `موافق` regardless of `language`. Used by `Confirmation.tsx`, `PhoneCallAppointments.tsx`, etc.
- User-visible impact: French users see an Arabic OK button on every success/error toast.
- Fix: `const { t } = useLanguage()` then `t('common.confirm')` or add `common.ok`.

### 16. [Medium] Forms stay enabled while saving for some flows
- File: `src/pages/Clients.tsx:661-749` `handleSaveClient`
- `saving` is set true at `:669`, but the dialog form submit Buttons elsewhere don't guard against rapid double-tap. The auto-check effects on `idNumber` and `phone` ($:257-401$) keep firing while `saving` is true. The `setTimeout(() => loadClients(), 1500)` at `:738` keeps the dialog open for 1.5s with the success message — during which the user can press Enter again on the form.
- User-visible impact: on a slow connection a fast double-tap on "Save" can submit twice. The 1.5s success delay is a hidden window where Enter retriggers submit.
- Fix: short-circuit the form `onSubmit`/Enter-key path with `if (saving) return`; close the dialog immediately on success and show a toast instead of holding the dialog open. Disable Enter inside while `saving`.

### 17. [Medium] Confirmation page wipes pagination + reload on every search keystroke
- File: `src/pages/Confirmation.tsx:141-155`
- Same issue as #1 (perf) but also a UX issue: page jumps to `1`, the in-flight previous request can land after a newer one (no abort controller), so search results may flicker between two responses.
- User-visible impact: typing "Mohamed" can momentarily show results for "Mohame" landing after "Mohamed" finished, especially on mobile.
- Fix: debounce + AbortController, or use a single live filter against the already-loaded set when search query is short.

### 18. [Medium] Login error messages dump SQL/instructions to the user
- File: `src/pages/Login.tsx:120-150`
- Errors include literal SQL (`UPDATE users SET auth_user_id = …`), Supabase Dashboard step-by-step instructions, and a 70-line wall of text for "invalid credentials" (`:148-149`). The error pane has `max-h-[60vh] overflow-y-auto`.
- User-visible impact: end-users see a database hint instead of "Wrong email or password". The message is intimidating on a phone screen and shifts attention away from the actual issue.
- Fix: keep a short user-facing message ("Email ou mot de passe incorrect"). Send the diagnostic blob to `console.error` only.

### 19. [Medium] Refresh button does a full page reload
- File: `src/components/Layout.tsx:498-513`
- The header refresh icon dispatches a `pageRefresh` CustomEvent and then immediately calls `window.location.reload()`. Every page that subscribes to `pageRefresh` is bypassed because the reload happens synchronously after.
- User-visible impact: full reload re-downloads chunks, kills in-flight realtime subscriptions, scrolls to top, loses any unsaved form state. Users tap this often because the app's data refresh is opaque.
- Fix: pick one — either dispatch the event and let the page handle a soft refresh, or remove the event entirely. Don't both.

### 20. [Medium] Empty/error states inconsistent across pages
- Land has good empty/error states (`Land.tsx:2230-2310`). Clients, Confirmation, Appointments mostly do too.
- Finance fails silently when `loadData` throws — only `console.error` is called and the user sees stale or empty stats with no feedback (`src/pages/Finance.tsx:163-167`).
- PhoneCallAppointments shows `setError` but renders it via `NotificationDialog` set on `errorMessage`/`showErrorDialog`; load errors at `:130` just set string `error` but the page does not appear to render it consistently.
- Fix: standardize on the existing `<Alert variant="error">` pattern and a single empty-state component.

### 21. [Low] Sidebar logout button uses raw 🚪 emoji and color contrast
- File: `src/components/Sidebar.tsx:141-152`
- The logout button is `text-red-600 hover:bg-red-50`. On the white sidebar the contrast is fine; combined with `font-medium` it's borderline AA on `text-xs` (mobile size). Also relies on the door emoji rendering identically across iOS/Android.
- Fix: use `text-red-700` or wrap text in `text-sm` minimum.

---

## i18n

### 22. [High] Translation coverage: hundreds of strings still hardcoded
- Cross-reference `docs/missed.md` against current code — verified `PieceDialog.tsx:633`, `Land.tsx:3378`, `ConfirmGroupSaleDialog.tsx:556-571`, `notification-dialog.tsx:22` all still match the missed.md citations. The doc is current.
- Quantitative scan: `grep '[؀-ۿ]'` finds **1,828 Arabic literals across 44 files outside `translations.ts`**. The biggest offenders are:
  - `src/i18n/translations.ts` — 868 (legitimate, this is the dictionary)
  - `src/components/InstallmentDetailsDialog.tsx` — 107
  - `src/components/ConfirmSaleDialog.tsx` — 77
  - `src/components/PieceDialog.tsx` — 67
  - `src/components/MultiPieceSaleDialog.tsx` — 68
  - `src/components/ConfirmGroupSaleDialog.tsx` — 67
  - `src/pages/Land.tsx` — 51
  - `src/components/SaleDetailsDialog.tsx` — 46
  - `src/components/GroupSaleDetailsDialog.tsx` — 43
  - `src/pages/PhoneCallAppointments.tsx` — 40
  - `src/components/PaymentBreakdown.tsx` — 36
  - `src/components/ClientSelectionDialog.tsx` — 34
- Worst offenders for users (visible in everyday flows):
  - All notification titles and bodies in `ConfirmGroupSaleDialog.tsx:564-574` — confirmation messages literally include `تم تأكيد ${sales.length} بيع` regardless of language. French users get Arabic notifications.
  - `formatTimeAgo` in `src/utils/notifications.ts:548-559` — "منذ X دقيقة" hardcoded.
  - Currency suffix `دج` and `د/م²` are hardcoded in `Land.tsx:2334`, `:3016`; `dt`/`DT` is also mixed in (`Installments.tsx:843`, `Confirmation.tsx`).
- User-visible impact: French users see Arabic in confirmations, notifications, dialogs, error messages, currency labels, time-ago strings.
- Fix: continue the i18n migration following `docs/missed.md`; prioritize the four big dialogs and the notifications utility because they appear in every confirmed-sale flow.

### 23. [High] LTR alignment classes used in RTL-first app
- Files: `src/components/Sidebar.tsx:85` (`fixed top-0 left-0`, `-translate-x-full` for hidden state)
- The mobile sidebar is hardcoded to slide in from the left and sit on the left edge. In RTL the sidebar should appear on the right of the viewport. `lg:border-l-0 lg:border-r` is also LTR-thinking.
- User-visible impact: in Arabic on a phone, the menu hamburger lives at the top-right but the sidebar slides in from the left — mismatch with mental model.
- Fix: detect language from context, conditionally use `right-0`/`translate-x-full` for RTL, or use logical `start-0` (Tailwind 3.3+ supports `start-`/`end-` via `--tw-rtl` config).

### 24. [Medium] `ml-`/`mr-` directional classes throughout
- 61 occurrences across 16 files (`grep '\bml-[0-9]|\bmr-[0-9]|\bpl-[0-9]|\bpr-[0-9]|\bleft-[0-9]|\bright-[0-9]'`). Notable:
  - `src/pages/Confirmation.tsx:914`, `:650`
  - `src/pages/Installments.tsx:783`, `:931`
  - `src/components/Layout.tsx:475` (`lg:mr-0`), `:577` (`ml-1`), `:692` (`-ml-1 mr-2`)
  - `src/pages/Login.tsx:336` (`mr-2`), `:301` (eye icon position uses `pl-3` regardless of dir)
- User-visible impact: in RTL, spacing is on the wrong side of icons and badges, layout looks slightly "off" but rarely broken.
- Fix: switch to `ms-`/`me-`/`ps-`/`pe-` (logical) variants throughout.

### 25. [Medium] Dates formatted with `'en-US'` locale
- Files: `src/pages/Clients.tsx:1445`, `:1451`; `src/pages/Finance.tsx:1105`, `:1116`; `src/utils/notifications.ts:562`; `src/utils/priceCalculator.ts:94`; `src/utils/validation.ts:96`, `:100`; `src/pages/SalesRecords.tsx:616`
- `toLocaleDateString('en-US', …)` is used everywhere instead of resolving the active language.
- User-visible impact: dates appear as `May 2, 2026` in a UI that is otherwise Arabic or French. Validation errors interpolate the en-US date even in Arabic UI.
- Fix: pass the active language from `useLanguage()` to a thin `formatDate(date, language)` helper that uses `'fr-TN'` or `'ar-TN'`.

### 26. [Medium] Numbers formatted with implicit locale + currency suffix concatenated
- All `toLocaleString()` calls (78+ occurrences across 20 files) rely on browser default locale, then concatenate a hardcoded `DT` / `دت` / `دج` / `د/م²` suffix (`Land.tsx:2346`, `Confirmation.tsx:713`, `Installments.tsx:843`, `PaymentBreakdown.tsx:81-216`).
- User-visible impact: same number renders differently between users (1,234.56 vs 1 234,56). Currency suffix mixes Arabic and Latin abbreviations across the same screen (`دت`, `DT`, `د.ت`, `دج`). User sees inconsistent monetary display.
- Fix: a single `formatMoney(n, language)` returning `Intl.NumberFormat(language === 'ar' ? 'ar-TN' : 'fr-TN', { style:'currency', currency:'TND' }).format(n)`. Drop manual suffixes.

### 27. [Medium] Language switcher persists but updates user preference asynchronously without feedback
- File: `src/i18n/context.tsx:28-41`
- `setLanguage` writes to localStorage and DOM immediately (good), but the Supabase `update preferred_language` call at `:38` runs in `.catch(() => {})` with no error surfacing. If the column doesn't exist (the AuthContext fallback at `:610-624` notes it might not), the write silently fails and the user thinks their preference is saved cross-device but it isn't.
- User-visible impact: setting language on phone doesn't propagate to desktop next login. No visible failure; user is confused.
- Fix: at minimum log the failure or expose a state. Better: confirm `preferred_language` column exists before calling the update, and surface a toast on failure.

---

## ACCESSIBILITY

### 28. [High] Modal not keyboard-trappable, no Escape — see Performance/UX #14
- Same root cause as #14. Listed here because for screen-reader / keyboard-only users this is a blocker.

### 29. [High] Form `<label>` not connected to control in most pages
- File: `src/components/ui/label.tsx:1-16`
- The `<Label>` primitive accepts `htmlFor` (good) but most call sites omit it. Only 29 `htmlFor=` usages across 10 files for a project with hundreds of inputs. Examples:
  - `src/components/PieceDialog.tsx:744` — Labels for piece-add form fields are bare `<Label>` without `htmlFor`, inputs have no `id`.
  - `src/components/ConfirmSaleDialog.tsx`, `MultiPieceSaleDialog.tsx`, `EditSaleDialog.tsx` — labels rendered as `<Label>` then a separate `<Input>` not linked.
- User-visible impact: clicking the label doesn't focus the field. Screen readers announce the field type without context.
- Fix: every `<Label>` should have `htmlFor`; every `<Input>`/`<Select>`/`<Textarea>` should have a matching `id`.

### 30. [High] Icon-only buttons missing `aria-label`
- File: `src/components/Sidebar.tsx:95-102` (close button), `src/pages/Login.tsx:302-321` (show/hide password — has `title` but no `aria-label`), Layout header refresh / language switcher (`Layout.tsx:498-518`), Land's batch action buttons (`Land.tsx`).
- Only 14 `aria-label`/`aria-live`/`aria-invalid`/`role=` attributes in the entire `src/`. The `<Dialog>` close button at `dialog.tsx:61` does it correctly — that pattern is rare.
- User-visible impact: screen reader users hear "button" with no description.
- Fix: every `<IconButton>` should require `aria-label`. Consider making it a TS-required prop.

### 31. [Medium] No `aria-live` region for toasts/errors
- `<Alert>` at `src/components/ui/alert.tsx:21` has `role="alert"` (good). `<NotificationDialog>` and the in-page success/error states (e.g. `Login.tsx:230-251`) don't announce to screen readers when they appear.
- Fix: wrap dynamic feedback (form save success, list errors) in a `role="status" aria-live="polite"` region.

### 32. [Medium] Inputs lack `aria-invalid` / `aria-describedby` on error
- File: throughout. Login, Clients form, etc., set an `error` string but don't toggle `aria-invalid` on the affected `<Input>` or link it via `aria-describedby` to the error text.
- Fix: pass `aria-invalid={!!error}` and an `aria-describedby="email-error"` to the relevant input when validation fails.

### 33. [Low] Color contrast on subtle helper text
- `text-xs text-gray-500` on near-white backgrounds (e.g. `Login.tsx:381`, `Sidebar.tsx:138`) is borderline WCAG AA at small sizes. The shine-animated gold pill in `Home.tsx:357-373` puts white text on light yellow — fails AA.
- Fix: bump to `text-gray-600` minimum for helper text; the gold title pill needs a dark outline or darker background.

### 34. [Low] `inputMode` and `autoComplete` underused
- The CIN field (`Clients.tsx:257-401`) accepts an 8-digit national ID but doesn't set `inputMode="numeric"`. Phone fields don't set `inputMode="tel"`. Password field is fine.
- Fix: add `inputMode="numeric"` / `inputMode="tel"` so mobile keyboards open in the right mode.

---

## ADDITIONAL OBSERVATIONS

### 35. [Medium] `Cache-Control: no-cache` meta in index.html fights the service worker
- File: `index.html:36-39`
- The `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">` headers tell HTTP layers not to cache the HTML. But the same shell is the SPA entry point that workbox caches via `navigateFallback: '/index.html'`. So users get the SW-cached shell anyway, and the meta headers (which most browsers ignore from `<meta>` for caching purposes) just add bytes.
- User-visible impact: probably none, but if the deploy uses any CDN that respects them you risk doubling round-trips for the shell.
- Fix: remove the cache meta; rely on the PWA update banner (`Layout.tsx:454-465`) for stale-content handling.

### 36. [Low] `console.log` left in production realtime hook
- File: `src/hooks/useSalesRealtime.ts:56`, `:69`, `:82`, `:88`, plus 69 in `Land.tsx`. AuthContext `DEBUG_AUTH` is gated, but these aren't.
- User-visible impact: console spam on production; tiny perf overhead.
- Fix: gate behind a `DEBUG_REALTIME` flag like `DEBUG_AUTH` already is.

### 37. [Low] PWA manifest `start_url: '/#login'` always lands on login first
- File: `vite.config.ts:37`
- Even when a session exists the PWA opens to `#login`, then `App.tsx:225-231` redirects to `#home` once `user` resolves. The flicker is visible for ~200-500 ms.
- User-visible impact: open-from-home-screen always shows a login flash before redirecting.
- Fix: drop the `#login` from `start_url` and let `App.tsx`/the early script in `index.html:54-63` decide. `index.html` already does this for non-PWA cases.

---

*End of report. Generated by audit agent on 2026-05-02.*
