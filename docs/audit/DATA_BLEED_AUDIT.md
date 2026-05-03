# Data Bleed Audit — FULLDEV-V2

Audit date: 2026-05-02
Scope: Hunting **"weird unrelated data showing up between things"** in `src/`. Out of scope: pure security (RLS, service role), pure perf, items already covered in `docs/audit/CODE_QUALITY_AUDIT.md` unless still load-bearing for data confusion.

Severity legend:
- **Critical** = real data leak across users (data of one user visible to another)
- **High** = visibly wrong data shown to the right user (someone else's row attached to the current dialog/page)
- **Medium** = brief flicker / stale-then-correct, or wrong data only under a narrow race
- **Low** = theoretical / hard to reproduce in practice

Findings are sorted by severity within each section.

---

## 1. Stale-fetch overwrites (race conditions)

### 1.1 [High] `EditSaleDialog` post-fetch can overwrite a newer dialog open with older sale data
- **File:** `src/components/EditSaleDialog.tsx:108-133`
- **What:** The dialog re-fetches from `sales` by `sale.id` whenever it opens. There IS a `let cancelled = false` cleanup. **But** the cleanup only fires when `open` or `sale.id` changes via `useEffect` re-run — and `sale` is a brand-new object reference on every parent re-render, while `sale?.id` is the dep. If the parent (`Confirmation.tsx` line 99 `selectedSale`) replaces `selectedSale` with a different sale that **happens to have the same id** because the parent edited optimistically, the cleanup fires correctly. However, the **separate** init effect at line 136-169 reads `sale.payment_method`, `sale.deposit_amount`, etc. directly from props on every prop-identity change, so the form fields can flip from prop A → DB-fetched A → prop B → DB-fetched B if the parent thrashes the prop. There's no sequence-number guard tying the fetched DB row to the currently mounted sale identity.
- **Repro:** Owner clicks Edit on Sale X (Promise sale, deposit 5,000 DT). Slow network. Before fetch returns, owner closes dialog and clicks Edit on Sale Y (Full sale, deposit 0). Sale Y's prop init runs (fields show 0), then Sale X's slow fetch returns, finds `cancelled === false` (because the effect didn't re-run — same `sale.id` would not happen, but if the parent reuses the same selectedSale slot for two sales that are not actually different ids, fields stay correct). Real-world risk is lower than #1.2 below; flagged because the pattern of "fetch on open, write to state by closure" with no per-fetch sequence guard is fragile and the docs claim it "fixes stale list data" — it only fixes prop staleness, not request ordering.
- **Fix:** Add a monotonic sequence number ref that's bumped when `sale.id` changes, captured locally before the fetch, and checked when the response arrives.

### 1.2 [High] `InstallmentDetailsDialog::loadInstallments` has no cancellation guard
- **File:** `src/components/InstallmentDetailsDialog.tsx:150-216`
- **What:** `useEffect([open, sale])` calls `loadInstallments()` and `loadPaymentOffer(...)`. Neither has `cancelled` flag, AbortController, or sequence number. The functions then call `setInstallments`, `setLoadedPaymentOffer` directly on whatever state is current. If the user opens dialog on Sale A, switches to Sale B before Sale A's `installment_payments` query returns, Sale A's installments will be written into state while the dialog is showing Sale B.
- **Repro:** On Installments page, click "تفاصيل" on Sale A (installment plan with 96 monthly rows). Network slow. While loading, click another Sale's "تفاصيل" — the dialog re-mounts with `sale=B`; new `loadInstallments` fires for B. If A's response arrives after B's, the old `setInstallments(A's rows)` call still runs, and the user sees A's installments rows attached to B's header (B's piece number, B's client, but A's payment schedule). Since installments are sorted by `installment_number`, the columns "look right" — the bleed is invisible until the user clicks Pay and pays the wrong installment row.
- **Fix:** Wrap the effect body in `let cancelled = false` and check before every `setX`. Same pattern as `EditSaleDialog.tsx:111-132`.

### 1.3 [High] `Confirmation::loadPendingSales` is triggered by 3+ sources with no debounce or sequence guard
- **File:** `src/pages/Confirmation.tsx:148-185, 201-325`
- **What:** Three independent triggers call `loadPendingSales` with no cancellation guard: (a) URL/state effect on `[currentPage, batchFilter, batchesReady, debouncedSearchQuery]` (line 148-162), (b) `window.addEventListener('saleCreated' / 'saleUpdated', loadPendingSales)` (line 164-177), (c) `useSalesRealtime({ onSaleCreated: () => loadPendingSales(), onSaleUpdated: () => !loading && loadPendingSales() })` (line 180-185). The function reads `batchFilter`, `allBatches`, `searchQuery` from closure and writes 4 separate setters (`setSales`, `setClientGroups`, `setGroupedSales`, `setTotalCount`).
- **Repro:** Owner has filter "Batch X" applied. Worker confirms a sale in Batch Y. Three loads fire concurrently for the owner: (1) URL effect because nothing changed but realtime set off `setLoading(false)` cascade, (2) the window listener on `saleUpdated` from the worker's `dispatchEvent`, (3) realtime `onSaleUpdated`. Three queries with the **same** `batchFilter='X'` are ok in isolation but they overlap; the ordering in which `setSales(...)` arrives may briefly include then exclude rows depending on which response landed last. More concerning: while the third response is in flight, owner changes filter to "all", another load fires; if filter-X's response arrives last, the page reverts to filter-X data. Until next user action.
- **Fix:** Wrap `loadPendingSales` with an in-flight ref and a sequence number; the body bails if the captured `batchFilter` no longer matches current. Or coalesce all triggers into a single debounced + abortable loader. (`docs/audit/CODE_QUALITY_AUDIT.md:65-69` 2.2 already flags the storm; the *data bleed* angle is new.)

### 1.4 [High] `useSalesRealtime` triggers blanket reload that ignores the page's current scope
- **File:** `src/hooks/useSalesRealtime.ts:54-64`, consumers in `Confirmation.tsx:180-185`, `Installments.tsx:227-234`, `SalesRecords.tsx:138-153`, `Finance.tsx:131-138`, `ConfirmationHistory.tsx:79-87`
- **What:** The hook subscribes globally to all `INSERT/UPDATE/DELETE` on `public.sales` — no filter at the realtime layer. Every page that uses it reloads its full filtered query on every event from anywhere. For a Worker viewing a filtered view of one batch, an unrelated owner-confirmed sale in a different batch causes a fresh fetch, but with the existing `batchFilter='X'` closure it's still scoped, so it doesn't directly leak rows. **However**: the worker may have switched filter to "all" between issuing the query and the response; if filter changes and a stale-realtime-triggered fetch lands, see 1.3.
- **Repro:** Worker on Confirmation, batch filter = "Batch X". Owner in another tab confirms a sale in Batch Y. Worker's `onSaleUpdated` fires, refetch runs against current closure filter ("X"). Then worker quickly changes filter to "all" — second fetch fires from the URL effect. If the first ("X") response arrives second (it's smaller / faster), the page paints a Batch-X-only list while the URL says "all". Worker reports "I see only some sales" until next click.
- **Fix:** Either add postgres_changes filter parameter (`filter: 'batch_id=eq.<x>'`) tied to the consumer's scope, or short-circuit `onSaleUpdated` if the consumer is currently loading (already done partly with `if (!loading) loadPendingSales()` but the `loading` check uses stale closure too). Best fix: queue events in a ref and apply one debounced refresh per scope-change.

### 1.5 [Medium] `PieceDialog::loadPieces` no AbortController; rapid open of two different batches paints batch A's pieces on batch B
- **File:** `src/components/PieceDialog.tsx:239-286, 430-527`
- **What:** When the dialog opens with `batchId=A`, `loadPieces(1)` runs. Inside, it queries `land_pieces` ordered list, then a second `.in('id', pageIds)` for the page slice, then a background `getPiecesAvailabilityStatus(pageIds)`. None of these check whether the dialog is still mounted with `batchId=A`. Mid-flight, parent (`Land.tsx`) closes & reopens the dialog with `batchId=B`; the background `setPieces` from the still-running A fetch overwrites the just-mounted B view. Defensive code at line 506-509 checks `currentPieces[0]?.batch_id !== batchId` — but this is in the availability-status callback only, not in the main `setPieces(sorted)` at line 498.
- **Repro:** Owner clicks Pieces icon on Batch X (50 pieces, slow query because cold cache). Before it returns, owner clicks Pieces on Batch Y (5 pieces, returns first). Y renders. X's response arrives, `setPieces(X's 50 rows)` runs. User now sees X's piece numbers under "قطع الدفعة: Batch Y". The 15-second `setInterval` (line 272-276) eventually re-fetches with current `batchId` = Y, so it self-heals within 15 s — but during the bleed window the user can click Sell on a piece that's not in this batch.
- **Fix:** Capture `batchId` at fetch start and bail before each setState if `batchId !== currentBatchIdRef.current`. Same for the search effect at line 290-386 (which does have `cancelled` flag).

### 1.6 [Medium] `Land::loadAllBatchStats` updates parent batches without bailing if the batch list changed
- **File:** `src/pages/Land.tsx:527-565, 591-693`
- **What:** Background stats loader. It compares old/new id sets (line 533-538) — good — but if the list **shrunk and re-expanded back to the same ids** between issue and response (e.g. user toggled allowed_batches filter), the comparator passes and stale stats are written. More importantly the per-batch parallel queries inside `loadAllBatchStats` race against each other and against subsequent `loadBatches` calls; there is no in-flight guard for `loadAllBatchStats`.
- **Repro:** Multi-tab usage, or quick filter changes on the Land page. Stats counters can briefly show the previous filter's totals.
- **Fix:** Track an in-flight stats query token and bail in the `.then(...)` handler when the token changed.

### 1.7 [Medium] `SalesRecords::loadAllSales` triggered by 4 sources, no cancellation
- **File:** `src/pages/SalesRecords.tsx:111-153`
- **What:** Same pattern as Confirmation: filter-effect + window event + realtime triple-fires `loadAllSales`. There IS a small guard `setSelectedSales(new Set())` (line 122) on each trigger, but no cancellation of in-flight queries. With 1000-row search loads and rapid filter changes, two responses can race; the late one wins.
- **Repro:** Type a search, immediately change `paymentMethodFilter`. Old search response wins → page shows search-filtered set under the new filter label.
- **Fix:** Same as 1.3.

### 1.8 [Medium] `ConfirmationHistory::loadConfirmedSales` mount effect uses `[]` deps, fires once with stale closure, then a second effect (with proper deps) fires again
- **File:** `src/pages/ConfirmationHistory.tsx:68-76, 353-367`
- **What:** Two effects load the same data. The mount-only `[]` effect calls `loadConfirmedSales()` once, capturing initial empty `searchQuery` / `sellerFilter`. A second effect (line 353-367) calls it again when filters change — but on first mount **both** fire, causing two concurrent loads and the second overwrites the first. If the user changes filter while the first is still in flight, three loads can be racing.
- **Repro:** Open Confirmation History, immediately type in search box. The mount load (no filter) and the search load race. Because the mount load returns last in many cases (1000 rows vs. filtered <100), the search results flicker then revert to all rows.
- **Fix:** Drop the mount-only effect and let the filter-deps effect cover initial load.

### 1.9 [Medium] `Appointments::loadAppointments` triggered by 4 sources
- **File:** `src/pages/Appointments.tsx:99-149`
- **What:** Initial mount + `pageRefresh` window event + `appointmentCreated` window event + `visibilitychange` document event + realtime channel — all call `loadAppointments` with no in-flight guard. Same race profile as 1.3.
- **Fix:** Same pattern.

### 1.10 [Medium] `Layout::loadNotifications` "load more" closure reads stale `notifications.length`
- **File:** `src/components/Layout.tsx:66-126`
- **What:** Already documented in `CODE_QUALITY_AUDIT.md:126-129` (2.12). Restating because it's a real **data confusion** issue: the offset is `notifications.length` from the closed-over render. After realtime inserts have grown the list to N+5, "load more" still uses N as offset, so it re-fetches the page 0–N range and dedups against existing IDs — net effect: fetched rows mostly discarded, user sees no growth, gets the impression notifications are "missing".
- **Fix:** Use a `notificationsLengthRef` synced via separate effect.

---

## 2. State not reset on prop / id change (cross-row leakage)

### 2.1 [High] `FinanceDetailsDialog::expandedGroups` Set persists across reopens with different `details`
- **File:** `src/components/FinanceDetailsDialog.tsx:59-101`
- **What:** `expandedGroups` is `useState<Set<string>>(new Set())`. The Set is keyed by `groupKey = detail.sale.batch?.name`. On `onClose`, the parent (`Finance.tsx`) sets `detailsDialogOpen=false` but the dialog component **does not unmount** (it stays in the React tree, just hidden via `<Dialog open={false}>`). When the user reopens for a different `type` ("installments" → "deposits"), `expandedGroups` still contains the previous type's expanded batch names. Common batch names → group expanded with no user action; uncommon → no visible bug.
- **Repro:** Open Finance details for "Installments" type, expand "Batch A". Close. Open details for "Deposits". If "Batch A" appears in deposits too, it's already expanded with the new content (correct) — confusion-free. But if user expects "all collapsed by default", they get a different starting state per dialog opening.
- **Fix:** Reset `expandedGroups` to empty Set on `[open, type]` change via `useEffect`.

### 2.2 [High] `InstallmentDetailsDialog` `selectedIds` Set, `loadedPaymentOffer`, `editFirstDateValue` survive sale switch
- **File:** `src/components/InstallmentDetailsDialog.tsx:127-165`
- **What:** The component is reused per-sale with `sale` prop. The reset block at line 160-164 fires on `!open`, which clears `selectedIds`, `multiPayInstallments`, `showEditFirstDateDialog`. **It does NOT clear `loadedPaymentOffer`, `paymentAmount`, `paymentDate`, `editFirstDateValue`, `cancelPaymentInst`, `payNextCountInput`**. If parent (`Installments.tsx`) keeps the dialog mounted and only swaps the `sale` prop for the same `selectedSale` slot, the residual state from the previous sale is visible: e.g. `paymentAmount` (set from a previous "pay" click on Sale A's installment #3) is still in the input when the user opens the dialog on Sale B.
- **Repro:** Open Sale A's installments, click an installment to pay (paymentAmount input fills with that row's amount), close dialog without paying. Open Sale B's installments. Old `paymentAmount` is still in the field.
- **Fix:** Reset all per-sale state in the `if (!open) { ... }` branch, or run a reset effect on `[sale?.id]`.

### 2.3 [High] `EditSaleDialog::paymentOffers` array survives a sale switch when the new sale is in a different batch
- **File:** `src/components/EditSaleDialog.tsx:84, 281-285`
- **What:** `const [paymentOffers, setPaymentOffers]` is loaded by `loadPaymentOffers(batchId)` at line 158-160 on init AND by the effect at line 281-285. The init runs on `[open, sale]` and only loads if the new sale is `installment` AND its `batch_id` is set. **There is no clear of the old offers when switching sales.** So if user edits Sale A (installment, Batch X, 5 offers), closes, then edits Sale B (full payment, Batch Y) — Sale B's dialog still has Sale A's 5 Batch-X offers in `paymentOffers` state. When the user changes Sale B's payment_method to "installment" from inside the dialog, the effect at 281-285 sees `paymentOffers.length === 0`? **No** — it's 5 from Sale A — so it **doesn't reload**, and the dropdown shows Batch X's offers for a Batch Y sale.
- **Repro:** Edit Sale A in Batch X, switch view (close dialog). Edit Sale B in Batch Y (full payment). In dialog, change payment method to installment. The dropdown lists offers from Batch X, not Batch Y. User picks one; on save the sale gets a `payment_offer_id` that belongs to Batch X but is attached to a Batch Y sale → data corruption.
- **Fix:** The init effect must `setPaymentOffers([])` whenever `sale.id` changes, then conditionally `loadPaymentOffers(sale.batch_id)`. Also the effect at 281 should depend on `sale.batch_id` and force-reload when it changes.

### 2.4 [Medium] `ConfirmSaleDialog::loadedPaymentOffer` not always reset between sales
- **File:** `src/components/ConfirmSaleDialog.tsx:109-174`
- **What:** The init at line 147-162 is conditional: only sets `setLoadedPaymentOffer(null)` in the `else` branches. For an installment sale with `payment_offer_id` and an already-attached `payment_offer`, the code goes "Payment offer already loaded, clear any previously loaded offer" — good. But for an installment sale with neither `payment_offer_id` nor a fetch path, the previous `loadedPaymentOffer` from the previous sale remains.
- **Repro:** Open Confirm dialog on Sale A (installment with offer). Then close, open on Sale B (installment that's missing payment_offer_id, an edge case from #1.1's symptom). Sale B's dialog still uses Sale A's `loadedPaymentOffer` for its calculation preview.
- **Fix:** Unconditionally `setLoadedPaymentOffer(null)` at the top of the open block, then load if needed.

### 2.5 [Medium] `Confirmation::selectedSale`, `selectedSalesGroup` cleared late on dialog close (closure flash)
- **File:** `src/pages/Confirmation.tsx:99, 112, 941-1010`
- **What:** `setSelectedSale(null)` is called inside dialog `onClose`, but the dialog open prop is `confirmDialogOpen` (separate state). React batches the two state updates, but if the dialog uses the prop for `if (!sale) return null`-style early returns (`SaleDetailsDialog.tsx:66`), there's a single render where `confirmDialogOpen=false` while `selectedSale` is still set — visually invisible. **Real issue**: when re-opening the dialog for a different sale via `setSelectedSale(B); setConfirmDialogOpen(true)`, the dialog uses prop `sale=B` and React will reuse the same dialog instance. Internal state from prior B (e.g. `companyFee` text input) is preserved across opens because of #2.4 / #2.7.
- **Fix:** Set the dialog's `key={sale?.id}` so React unmounts on switch. Already partly mitigated by the dialog's own init effect, but `key` is the safety net.

### 2.6 [Medium] `SaleDetailsDialog` does not clear when sale becomes null
- **File:** `src/components/SaleDetailsDialog.tsx:65-66`
- **What:** Component returns null when `!sale`. Pure. **However**, the prop is read directly inside JSX so when parent's `onClose` calls `setDetailsDialogOpen(false)` BUT `setSelectedSale(null)` is not always called (e.g. `SalesRecords.tsx:1106` does call both, good), the dialog stays open with the same data. Verify each call site. In `Confirmation.tsx:1201-1209`, both are cleared. In `ConfirmationHistory.tsx`, the close handler is similar. **In `Installments.tsx`** the close clears. OK.

### 2.7 [Medium] `Confirmation` cancel/confirm dialogs share `selectedSale` slot — close-then-immediate-open of different action shows previous notes
- **File:** `src/pages/Confirmation.tsx:117-118, 451-498, 815-827`
- **What:** `selectedSale` is reused for confirm, cancel, edit, appointment, details — five dialogs. The `onClose` handlers do not all clear it. If user cancels the confirm dialog (no save) and then immediately clicks the appointment button on a *different* sale, the appointment dialog briefly sees the previous `selectedSale` until the new `setSelectedSale(otherSale)` lands.
- **Fix:** Use one `selectedSale` per dialog purpose, OR `setSelectedSale(null)` on every close, OR `key={selectedSale?.id}` so the dialog re-mounts on swap.

### 2.8 [Medium] `Land::selectedPiecesForSale` and `selectedClient` retained across sale flow attempts
- **File:** `src/pages/Land.tsx:147-160, 2868-2880`
- **What:** State is cleared in some "cancel" branches (line 1321, 1359, 2868, 2880) but the multi-flow has `isTransitioningToSaleRef` and ad-hoc resets. Particularly the dispatch of `clearPieceSelections` event (`PieceDialog.tsx:264-266`) is opt-in and only fires on certain success paths. After an error, the previous `selectedPiecesForSale` and `selectedClient` are left on the parent for the next sale attempt.
- **Repro:** Try to sell pieces, encounter an RLS / network error mid-flow. Close dialogs. Open Sell Pieces flow again on a different batch. Previous batch's selected pieces flash in the multi-piece dialog before being cleared.

---

## 3. Module-level mutable state

### 3.1 [Critical] `contractWritersCache` survives logout — Worker B sees Worker A's writers if anything else differs
- **File:** `src/utils/contractWritersCache.ts:10-14`
- **What:** `let cache`, `let cachePromise`, `let cacheTime` are module-level, never reset on `signOut`. If the deployed Supabase project has RLS that filters `contract_writers` per user (it doesn't today, but if it ever does), the cache would carry stale rows across user sessions on the same browser. Even without RLS, **the cache is never invalidated when ContractWriters page mutates** (already documented in `CODE_QUALITY_AUDIT.md:156-159` 2.17). After logout/login by a different user, the new user's first 5 minutes of browsing show the old user's last-fetched list.
- **Repro:** User A creates writer "X", uses the app. Logs out without closing the tab. User B logs in within 5 minutes. Opens Confirm dialog. Sees writer "X" in dropdown — even if writer X is supposed to be invisible to user B (e.g. once the codebase adds writer-ownership). Today the symptom is "stale list of writers" rather than cross-user data leak, but the architecture is wrong.
- **Fix:** Export `invalidateContractWritersCache()` and call from `AuthContext.signOut`. Also from ContractWriters CRUD operations.

### 3.2 [High] `dataIntegrity::activeOperationLocks` Set survives unmount, logout, page navigation
- **File:** `src/utils/dataIntegrity.ts:8-29`
- **What:** Module-level `const activeOperationLocks = new Set<string>()`. Used by `lockPieceForOperation` / `unlockPieceForOperation` / `isPieceLocked`. If a sale flow calls `lockPieceForOperation('piece-id-A')` and crashes / the user navigates away before the matching unlock, that piece id stays locked **for the lifetime of the tab**. Subsequent calls to `cleanupOrphanedReservations` will skip it (line 59). Cross-user effect: User A leaks a lock, doesn't log out, hands the device to User B (rare in this app's domain, but the device is shared in real-estate offices). User B sees pieces that should self-heal as orphans staying "Reserved".
- **Repro:** Crash a sale flow (network error during `reservePiecesImmediately`). Subsequent `cleanupOrphanedReservations` runs (if anyone wired it — see CODE_QUALITY_AUDIT 2.20) skip the locked piece forever.
- **Fix:** Lock cleanup should be in a `try { ... } finally { unlockPieceForOperation(id) }` everywhere. Plus a TTL on locks (auto-expire after e.g. 5 minutes).

### 3.3 [High] `AuthContext` system-user cache in localStorage keyed only by `authUserId` — vulnerable to ID collision but mainly to logout race
- **File:** `src/contexts/AuthContext.tsx:45-73, 105-115`
- **What:** Cache key is the literal string `'app_system_user'`, value is `{ authUserId, user }`. On signOut, `clearCachedSystemUser()` is called (line 848). **However**, between logout and login of a different user, if the new user's `loadSystemUser` is delayed, `getCachedSystemUser` is called at line 108 with the new auth ID. If the cache was not cleared in time (e.g. signOut path took the `try/catch` around `caches.delete(...)` and crashed before reaching `clearCachedSystemUser()`? Reviewing the code: clear runs at line 848 unconditionally before the catch wrapper, so this is fine in the happy path). The real risk is the **inverse**: on signIn the `getCachedSystemUser(session.user.id)` at line 108 trusts the cache for whichever auth id matches — if a malicious/curious tab already ran `localStorage.setItem('app_system_user', { authUserId: <newId>, user: <fakeOwnerRecord> })`, it would be honored as the systemUser **until the network revalidate finishes** (lines 113-115), giving a brief window of elevated permissions.
- **Repro:** Open DevTools → Application → Local Storage → set `app_system_user` to `{"authUserId":"<your-id>","user":{"role":"owner",...}}`. Reload. Until the background revalidate completes, the app behaves as if you're an owner. Typically <1 second, but on slow networks it's exploitable.
- **Fix:** Don't trust localStorage for role/permissions. Use it only for non-authoritative UI hints (display name, avatar). Re-fetch role from server before any sensitive action. Or sign the cached payload with a server-side HMAC.

### 3.4 [Medium] `Land.tsx::batchImageCacheRef` module-instance ref survives unmount but is per-instance
- **File:** `src/pages/Land.tsx:160`
- **What:** `useRef<Record<string, string>>({})` — fine, this is per-component instance, not module-level. Cleaned up on component unmount. Listed for completeness; no bleed.

### 3.5 [Low] `i18n/translations.ts:1866-1867` `arFlat` and `frFlat` are module-level — read-only, fine

### 3.6 [Low] `salePayments.ts:31` `parseLocalizedNumber` defined at module level as const — pure function, fine

---

## 4. localStorage / sessionStorage that persists across users

### 4.1 [High] `sessionStorage 'previousPage'` survives logout — next user's first page shows previous user's "back" target
- **File:** `src/components/Layout.tsx:50-56, 270-277`
- **What:** Layout sets `sessionStorage.setItem('previousPage', currentPage)` on every page change. `signOut` does NOT clear sessionStorage (only localStorage `app_system_user` and the SW caches). Next user logs in on the same tab; Layout reads `'previousPage'` and the back button now sends them to e.g. `#users` or `#finance` — pages they may not even have access to. The access-check at `App.tsx:234-240` redirects to home, but the URL flashes the restricted hash for one render.
- **Repro:** User A (owner) navigates Home → Users → Finance. Logs out (no tab close). User B (worker, no Users access) logs in. Clicks back arrow (the navigation back button in Layout). `previousPage` reads "users". Worker is briefly redirected to `#users`, sees the access-denied flow, lands on Home. URL bar shows `#users` momentarily and the worker sees "fragments" of the page they're not supposed to see (during the chunk load).
- **Fix:** Clear `sessionStorage` in `signOut`. Or scope the key by user id.

### 4.2 [Medium] `localStorage LANGUAGE_STORAGE_KEY` is global, not per-user
- **File:** `src/i18n/context.tsx:17, 31, 67`
- **What:** Language preference is stored under one global key. Two users on the same device may have different language preferences in `users.preferred_language` column, but the localStorage value of whoever was last on the device wins on first paint (line 15-21). The `useApplyUserLanguage` hook overrides once `systemUser` arrives, but there's a flash of the previous user's language during the auth bootstrap window. Annoying, not data-confusion-critical, but a documented data-bleed pattern.
- **Fix:** Either don't read localStorage until systemUser is known, or store under `lang_<authUserId>` key.

### 4.3 [Medium] `localStorage app_system_user` is cross-user keyed by id but never partitioned — see 3.3

### 4.4 [Low] `sessionStorage`-stored deletion confirmations or wizards: none found.

---

## 5. Queries missing an expected scope filter

### 5.1 [High] `Confirmation::loadAllBatches` returns ALL batches — workers see batches they're not allowed to filter by
- **File:** `src/pages/Confirmation.tsx:187-199`
- **What:** Workers may have `allowed_batches` restricting which batches they can see/sell on. `loadBatches` in `Land.tsx:474-476` correctly applies `query.in('id', systemUser.allowed_batches)`. But `loadAllBatches` here selects all batches with no scope filter. The worker's batch-filter dropdown therefore lists batch names they shouldn't know exist. They can pick one and see "no sales" for it (because the `sales` query is implicitly RLS-limited; if RLS is disabled, they'd see *those* sales too).
- **Repro:** Worker with `allowed_batches=['<some-id>']` opens Confirmation. Filter dropdown shows ALL batch names from the database (e.g. names of properties they shouldn't know about).
- **Fix:** Apply the same `if (systemUser.role !== 'owner') query.in('id', systemUser.allowed_batches)` filter here.

### 5.2 [High] `SalesRecords::useEffect` loading batches filter is not scoped to allowed_batches
- **File:** `src/pages/SalesRecords.tsx:105-109`
- **What:** Same issue as 5.1. `supabase.from('land_batches').select('id, name')` with no `.in('id', systemUser.allowed_batches)`.

### 5.3 [High] `Installments` and `Confirmation` sales queries don't filter by `batch_id IN allowed_batches` for workers
- **File:** `src/pages/Installments.tsx:245-254`, `src/pages/Confirmation.tsx:208-217`
- **What:** Sales loaders filter by `status='pending'` / `status='completed' AND payment_method='installment'` but NOT by worker's `allowed_batches`. If RLS on `sales` is disabled (per `DOCUMENTATION.md`), workers see every sale. The Confirmation/Installments page becomes a "leak everything" surface. Even if RLS is on, the absence of an explicit client-side scope means the worker sees a paginated mix when their `allowed_batches` is non-NULL.
- **Repro:** Worker with `allowed_batches=['X']` and RLS disabled visits `#confirmation`. Sees pending sales for Batches A, B, C, X — all batches.
- **Fix:** Add `if (workerScope) query.in('batch_id', workerScope)` to every sales loader on every page that workers can visit.

### 5.4 [Medium] `Finance::loadData` has no scope filter at all — but Finance is owner-only by convention
- **File:** `src/pages/Finance.tsx:140-171`
- **What:** Loads up to 2,000 sales + 5,000 installment_payments with no `.in('batch_id', ...)`. If a worker is ever granted `'finance'` in `allowed_pages`, they see the whole company's books. Page-access gating is the only protection.
- **Fix:** Defense in depth: even on an owner-only page, scope by `systemUser.role === 'owner' ? all : []` to fail-closed if access ever leaks.

### 5.5 [Medium] `pieceStatus::getPiecesAvailabilityStatus` queries sales joined to pieces with no user scope
- **File:** `src/utils/pieceStatus.ts:151-162`
- **What:** Used by `PieceDialog.tsx`. When called with the current page's `pageIds`, it returns availability based on **all** sales in the DB. If a worker is somehow viewing a piece they shouldn't see (defense in depth) the function would still resolve correctly — but the returned `reason: 'القطعة محجوزة لبيع معلق'` is a leak that a sale exists for that piece (without naming the buyer). Low risk.

### 5.6 [Medium] `notifications.ts notifyOwners` (referenced from many flows) — owner notification list isn't scoped to office/region in the codebase
- **File:** `src/utils/notifications.ts` (function `notifyOwners`)
- **What:** Sends notifications to all owners. If a future "office" or "region" model is added, the current code will leak. Today there's no bug because there's only one logical owner group.

---

## 6. Joining/foreign-key mismatches

### 6.1 [High] `formatSaleData` row-pickers blindly take `[0]` of foreign-key-array — sort dependency
- **File:** `src/utils/salesQueries.ts:105-114`
- **What:** `const row = (arr: any) => Array.isArray(arr) ? arr[0] : arr` — assumes the embed is a single row. With `payment_offers:payment_offer_id (...)`, `clients:client_id (...)`, etc. that's correct because these are 1:1 by FK. **However**, if a query path ever changes to embed a 1:N (e.g. multiple sale rows for one piece via a different join), `[0]` silently picks one and ignores the rest. The current schema has no 1:N embed in the sale query, so OK today, but the helper is brittle.
- **Fix:** Add a runtime warning when `arr.length > 1`.

### 6.2 [Medium] `Appointments::formattedAppointments` "infer payment method from offer" can attach a wrong piece if the embed shape is a list
- **File:** `src/pages/Appointments.tsx:227-273`
- **What:** Hand-rolled array-to-object normalization with `Array.isArray(...) ? [0] : ...` for `sales`, `clients`, `land_pieces`, `land_batches`, `payment_offers`. Same `[0]` brittleness as 6.1.

### 6.3 [Medium] `formatSalesWithSellers` enriches sales with `seller` from `users` table by a Map keyed on `sold_by` UUID — fine when UUIDs are unique, but the code populates fallback `name: 'غير معروف'` on missing fields, so a worker who later changed their name in `users` would have **all historical sales** show their **new** name (audit trail loss). Not a data bleed; flagged for awareness.

---

## 7. Window / document event handlers leaking across pages

### 7.1 [High] `clearPieceSelections` event handler in `PieceDialog` triggers `setSelectedPieces(new Set())` on the wrong batch's open dialog
- **File:** `src/components/PieceDialog.tsx:264-282`, dispatched from `src/pages/Land.tsx:2048`
- **What:** The event listener is registered when the dialog mounts for `batchId=A`. If `Land.tsx` opens a sale flow for batch A, then closes the dialog (PieceDialog unmounts, listener removed — good), then opens the dialog for `batchId=B`, then dispatches `clearPieceSelections` after a sale flow completes on a *different* batch, the **B**-dialog clears its selections — even if the sale was for A. Today only Land.tsx dispatches this event, and Land.tsx tracks one open dialog at a time, so the bleed is theoretical. But there's no scoping in the event payload (it's a parameterless `CustomEvent`).
- **Fix:** Include `batchId` in the event detail and check inside the handler.

### 7.2 [Medium] `pieceStatusChanged` and `saleUpdated` cause every open page in the app (across tabs even, via realtime echo) to refetch — no scoping
- **File:** Many; see grep dump
- **What:** Already documented in CODE_QUALITY_AUDIT 2.2. Re-flagging for the data-bleed angle: every event causes every page that listens to refetch with its current closure. Closures can be stale (1.3, 1.4, 1.7).

### 7.3 [Low] `appointmentCreated` dispatched only by `Confirmation.tsx:1113`, listened by `Appointments.tsx:123`. If two `Appointments` page instances are mounted (impossible in this app — single-page hash router), they'd both refetch. Theoretical.

---

## 8. Stale-closure useEffect

### 8.1 [Medium] `Land.tsx:264-341` huge `[]`-deps effect with stale `batches`/`pieceDialogOpen`/`selectedBatchForPieces` references
- **File:** `src/pages/Land.tsx:264-341`
- **What:** Documented in CODE_QUALITY_AUDIT 2.1 (data-blanking on safety-timeout). Restating because the same effect's `handlePieceStatusChanged` reads `pieceDialogOpen` and `selectedBatchForPieces` from closure — both are initial values forever. So when a sale event arrives, the conditional `if (pieceDialogOpen && selectedBatchForPieces)` always evaluates against the FIRST mount values. If the dialog was opened after mount (true 100% of the time), the closure says `false`, and `loadPieces` is **not** called — meaning the open piece dialog doesn't refresh on real-time sale events. The interval-based refresh (every 15s, line 411-420) papers over this.
- **Fix:** Use refs synced with these states, or restructure effect deps.

### 8.2 [Medium] `Confirmation.tsx::useEffect line 164-177` register-window-listeners with `[]` deps but the inner `loadPendingSales` reads current `batchFilter`/`searchQuery` from closure
- **File:** `src/pages/Confirmation.tsx:164-177, 201-325`
- **What:** Because `loadPendingSales` is **not** declared inside the effect, it's a stable function reference per render — except the function reads state via closure too. Wait, it's declared as a top-level `async function` in the component body (not memoized), so each render produces a new function with the current closure. The effect's `handleSaleCreated = () => loadPendingSales()` captures whichever `loadPendingSales` was current at effect-run time (mount, since deps are `[]`). On every subsequent render `loadPendingSales` is a new closure but the listener still calls the **mount-time** one. Net: window-event-driven reloads always use the initial filter (`batchFilter='all'`, `searchQuery=''`).
- **Repro:** Filter to "Batch X". Worker confirms a sale (window event fires). Listener calls the mount-time loader → loads ALL pending sales, ignoring filter. Page shows all batches' pending sales until the filter-effect at line 148 re-runs.
- **Fix:** Either move `loadPendingSales` inside the effect OR re-register listener whenever `loadPendingSales` identity changes (use a ref). Preferred: replace 3 triggers with a single source.

### 8.3 [Low] `Layout.tsx:66-268` huge effect on `[systemUser?.id]`. Most state is fresh because the dep covers the relevant axis; minor stale-closure risk on `notifications.length` (4.10) only.

### 8.4 [Low] `EditSaleDialog.tsx:281-285` effect on `[paymentMethod, open, sale.batch_id]` has stale `paymentOffers.length` check that's read in render — but since the dep covers it, fine.

---

## 9. State updates after unmount → cross-page event reaction

### 9.1 [Medium] `EditSaleDialog::handleSave` `onSave(updatedSale); onClose()` — parent navigation to a different page can land state into the new page
- **File:** `src/components/EditSaleDialog.tsx:493-494`
- **What:** When `handleSave` resolves, the calling page (`Confirmation.tsx`) updates `removeSalesFromState(...)`. If the user was switching pages while save was in flight, the page may have unmounted; `setSales` no-ops. **However**, the dispatched `window.dispatchEvent(new CustomEvent('saleUpdated'))` (not in this snippet, but Confirmation.tsx:490) is heard by *every* mounted page that listens — including the page the user just navigated to. That page reloads, fine. But the dispatched event fires before the previous page's data was reconciled, so the new page may briefly show pre-save data then post-save data.
- **Fix:** None needed individually — but the architecture of "fire global events, every page reloads" is the root cause of the cross-page data-confusion symptoms.

---

## 10. Hidden caching / debouncing / timers

### 10.1 [Medium] `PieceDialog` 30-second `setInterval` and `Land.tsx` 15-second `setInterval` overlap on the same data, both call `loadPieces`
- **File:** `src/components/PieceDialog.tsx:272-276`, `src/pages/Land.tsx:407-420`
- **What:** Both intervals fire `loadPieces(...)` on the same batch. They're not coordinated. Two in-flight `loadPieces` per batch every 15 seconds. Race conditions between them: late response wins. Visible symptom: piece statuses can flicker.
- **Fix:** Single source of truth (one timer, OR rely on realtime).

### 10.2 [Medium] `DeadlineCountdown.tsx:28` setInterval(60000) — fine, one per mounted countdown component, cleaned up on unmount.

### 10.3 [Medium] `Layout::refreshInterval` notifications poll every 60 s
- **File:** `src/components/Layout.tsx:248-252`
- **What:** Calls `loadNotifications(true, true)` (silent reset). The `loadNotifications` closure is the one captured at the start of the effect; if the user authenticated as a different user (which would re-trigger the effect because `systemUser?.id` changes — OK), the interval is replaced. Safe.

### 10.4 [Low] `App.tsx::SYSTEM_USER_MAX_WAIT_MS` 2500 ms timer is properly cleaned via `timeoutRef.current` clear paths.

---

## 11. AuthContext god-context bleed

### 11.1 [High] `AuthContext.signOut` does NOT clear `loadingSystemUserRef`, `currentLoadPromiseRef`, `loadTimeoutRef`, or other refs — a load in flight when sign-out fires can write to state after a different user logs in
- **File:** `src/contexts/AuthContext.tsx:135-152, 824-876`
- **What:** On `SIGNED_OUT` event handler (line 135-152), it aborts `abortControllerRef`, clears `loadTimeoutRef`. **It does NOT clear `loadingSystemUserRef.current`, `currentLoadPromiseRef.current`, or set `initialSessionLoadedRef.current = false` ... wait, it does set `initialSessionLoadedRef.current = false` at line 144. But `loadingSystemUserRef` is left as-is.** If `loadSystemUser` was deep in its `await Promise.race(...)` when the abort fires, the catch block at line 653-720 catches the abort and may schedule a retry via `setTimeout(() => loadSystemUser(authUserId, retryCount + 1), ...)` (line 714-718). That retry uses the **old** `authUserId` — and writes to `setSystemUser` if the abort handling somehow misses (the check at line 663-674 returns without setting state for aborted, so probably safe, but it's a single-line flaw away from cross-user contamination).
- **Repro:** Hard to trigger: sign-in (slow), immediately log out before systemUser resolves, then log in as different user. The first user's retry could fire after the second user's load completes; if the retry took the non-aborted path, it would call `setSystemUser(<user A's row>)` while user B is logged in.
- **Fix:** Track an "auth session generation" counter, captured at start of every `loadSystemUser`, checked before every `setX`. Clear all refs on `SIGNED_OUT`.

### 11.2 [High] `AuthContext::loadSystemUser` retry can fire AFTER signOut even with the abort, because the timeout-based retry doesn't check the controller
- **File:** `src/contexts/AuthContext.tsx:362-381, 714-718`
- **What:** The fallback timeout sets `setTimeout(() => loadSystemUser(authUserId, retryCount + 1), delay)`. If the user signs out during the delay, the new `loadSystemUser(authUserId, ...)` call begins fresh — it doesn't check `user`, doesn't check whether sign-out happened. It will run, query the DB, and write to `setSystemUser` for the previous user.
- **Repro:** Same as 11.1 but specifically on the retry path (network error during initial load → 300ms retry scheduled → user logs out in those 300ms → retry fires → if it succeeds before next user logs in, the old user's row briefly appears as `systemUser` in the not-logged-in state).
- **Fix:** Pass an `AbortSignal` from the effect into `loadSystemUser`, abort it in `SIGNED_OUT`, and check `signal.aborted` inside the retry timeout.

### 11.3 [Medium] `AuthContext::checkNetworkConnection` pings `google.com/favicon.ico` — orthogonal to data bleed but documented in CODE_QUALITY_AUDIT 5.4. Doesn't bleed data.

### 11.4 [Medium] `AuthContext` `localStorage`-cached systemUser is read **before** the network revalidate, briefly showing previous-user permissions until the fetch finishes — see 3.3 for the cross-user angle.

---

## 12. Other notable findings

### 12.1 [Medium] `Appointments` realtime channel name is hardcoded `'appointments-realtime'` — collision risk
- **File:** `src/pages/Appointments.tsx:127-141`
- **What:** Unlike `useSalesRealtime` which uses a randomized channel name, this hardcoded channel is reused across mounts. If two browser tabs of the same Supabase project share the channel (Supabase realtime dedups by channel name within a single client connection), they may share state. Within a single tab, fast unmount/remount could result in "removeChannel still in flight while new subscribe begins". Race-prone.
- **Fix:** Use `appointments-realtime-${userId}-${Date.now()}` like the sales hook does.

### 12.2 [Medium] `Layout` notifications subscription channel name `notifications-${userId}-${Date.now()}` is correct, but the auto-reconnect at line 230-238 schedules a re-`setupSubscription` without aborting the in-flight one — could double-subscribe under repeated CHANNEL_ERROR.
- **Fix:** Add an in-flight subscription guard.

### 12.3 [Low] `useSalesRealtime` channel name uses `Date.now()` AND `Math.random()` per mount (line 53). Re-runs per `enabled`/`resubscribeTick` change. Server-side accumulates orphaned channel registrations until the websocket tears down. Documented in CODE_QUALITY_AUDIT 4.3. Not a data-bleed; flagged for cleanup.

### 12.4 [Low] `prefetchContractWriters` is fired from `Confirmation.tsx:141` on mount — fine, but the cache it populates is the same module-level cache covered in 3.1.

---

## End

Total findings: **41**, of which **9 High**, **18 Medium**, **2 Critical** (#3.1 and #3.3 both architectural), rest Low.

Highest-leverage fixes (one-shot, multi-finding cleanup):
1. **Add a sequence-number / abort guard to every `loadX` function.** Eliminates 1.1–1.10 in one pattern.
2. **Reset all per-prop state in dialogs via `key={prop.id}`** (or explicit `useEffect([prop.id])` resets). Eliminates 2.1–2.8.
3. **Clear all sessionStorage and module-level caches on signOut.** Eliminates 3.1, 4.1, parts of 3.3, 11.1.
4. **Apply `allowed_batches` scope to every `from('sales')` and `from('land_batches')` query for non-owner users.** Eliminates 5.1–5.4 and is also a security defense-in-depth.
5. **Replace the global `saleUpdated` / `pieceStatusChanged` window events + realtime + URL effect triple with a single shared query layer (e.g. a tiny `useQuery` hook with cache + dedupe + abort).** Eliminates 1.3, 1.4, 1.7, 7.2, 8.2.
