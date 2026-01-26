## LandDev Web App – Developer Guide

This document explains the **architecture, main features, data flow, and naming conventions** of the LandDev frontend so another developer can confidently extend or refactor it.

---

## 1. High‑Level Overview

- **Tech stack**
  - **Framework**: React + TypeScript
  - **Routing**: `react-router-dom`
  - **State / Context**: Custom `AuthContext`, `LanguageContext`
  - **Styling**: Tailwind CSS (via utility classes + `cn` helper)
  - **Backend**: Supabase (auth + database + RPC)
  - **Build**: Vite
  - **PWA**: Service worker in `public/sw.js`, registration in `src/lib/serviceWorker.ts`

- **App entry**
  - `src/main.tsx` mounts `<App />` and calls `registerServiceWorker()`.
  - `src/App.tsx` defines routes and wraps everything with:
    - `<LanguageProvider>`
    - `<AuthProvider>`
    - `<NotificationContainer />`

- **Main layout**
  - `src/components/layout/MainLayout.tsx`:
    - Renders the **persistent sidebar** (`<Sidebar />`) and top mobile header.
    - Uses `<Outlet />` to render the active page.
    - Integrates pull‑to‑refresh and swipe gestures for mobile UX.

---

## 2. Routing and Pages

### 2.1 Route Configuration (`src/App.tsx`)

- **Core components and hooks used**
  - `BrowserRouter`, `Routes`, `Route`, `Navigate` from `react-router-dom`.
  - `useAuth()` from `AuthContext` to protect routes.
  - `MainLayout` for the authenticated shell.

- **Important components / functions**
  - `AppRoutes()`
    - Reads from `useAuth()`:
      - `user`, `profile`, `loading`, `profileLoading`, `isReady`, `hasPermission`, `hasPageAccess`.
  - `ProtectedRoute`
    - Ensures:
      - Auth state and profile are fully loaded (avoids security “flashes”).
      - If `!user`, redirects to `/login`.
  - `PublicRoute`
    - Shows login page when **not** authenticated.
    - Redirects authenticated users to `/`.
  - `PermissionProtectedRoute`
    - Props:
      - `children: React.ReactNode`
      - `permission: string | null`
      - `pageId?: string`
    - Behavior:
      - Checks **page‑based access** via `profile.allowed_pages` and `hasPageAccess(pageId)`.
      - If no explicit `allowed_pages` are configured, falls back to **role‑based permissions** via `hasPermission(permission)`.

- **Defined routes (path → component & permissions)**
  - `/login` → `<Login />` (public)
  - `/account-disabled` → `<AccountDisabled />` (special auth state)
  - `/` → `<MainLayout />` (wrapped by `ProtectedRoute`)
    - index `/` → `<Home />`
    - `/land` → `<LandManagement />` (`permission="view_land"`, `pageId="land"`)
    - `/homes` → `<Homes />` (`view_land`, `pageId="homes"`)
    - `/clients` → `<Clients />` (`view_clients`, `pageId="clients"`)
    - `/sales` → `<SalesNew />` aliased as `Sales` (`view_sales`, `pageId="sales"`)
    - `/sale-confirmation` → `<SaleConfirmation />` (`edit_sales`, `pageId="confirm-sales"`)
    - `/sale-management` → `<SaleManagement />` (`edit_sales`, `pageId="sale-management"`)
    - `/installments` → `<Installments />` (`view_installments`, `pageId="installments"`)
    - `/financial` → `<FinancialNew />` (`view_financial`, `pageId="finance"`)
    - `/expenses` → `<Expenses />` (`view_financial`, `pageId="expenses"`)
    - `/users` → `<Users />` (`manage_users`, `pageId="users"`)
    - `/permissions` → `<UserPermissions />` (`manage_users`, `pageId="users"`)
    - `/contract-editors` → `<ContractEditors />` (`edit_clients`, `pageId="contract-editors"`)
    - `/security` → `<Security />` (`view_audit_logs`, `pageId="security"`)
    - `/debts` → `<Debts />` (`permission=null`, `pageId="debts"`)
    - `/real-estate-buildings` → `<RealEstateBuildings />` (`permission=null`, `pageId="real-estate"`)
    - `/workers` → `<Workers />` (`view_workers`, `pageId="workers"`)
    - `/messages` → `<Messages />` (`view_messages`, `pageId="messages"`)
    - `/calendar` → `<Calendar />` (`edit_sales`, `pageId="calendar"`)
    - `/phone-calls` → `<PhoneCalls />` (`permission=null`, `pageId="phone-calls"`)
    - `/download` → `<Download />` (`permission=null`, `pageId="download"`)
  - Fallback: `*` → redirects to `/`.

### 2.2 Adding a New Page (Pattern)

To add a new page:

1. **Create page component** under `src/pages/NewPageName.tsx`.
2. **Register route** in `AppRoutes`:
   - Add `<Route path="new-path" element={<PermissionProtectedRoute permission="some_permission" pageId="new-page-id"><NewPageName /></PermissionProtectedRoute>} />`.
3. **Add sidebar item** in `getNavItems` (see below).
4. **Add permission** in `rolePermissions` in `AuthContext.tsx` and DB if necessary.
5. Ensure `pageId` matches any `ALL_PAGES`/`allowed_pages` usage in `Users.tsx`.

---

## 3. Layout and Navigation

### 3.1 Main Layout (`src/components/layout/MainLayout.tsx`)

- **State & hooks**
  - `sidebarOpen: boolean` – controls mobile sidebar visibility.
  - `location` from `useLocation()`.
  - `navigate` from `useNavigate()`.
  - `profile` and `hasPageAccess` from `useAuth()`.
  - `useSwipeGesture` – registers a right‑swipe gesture to open sidebar on mobile.

- **Key variables / functions**
  - `canGoBack: boolean` – `location.pathname !== '/'`.
  - `pathToPageId: Record<string, string>` – map from path to `pageId` (kept in sync with sidebar and route config).
  - `handleGoBack: () => void`
    - Special handling for `/real-estate-buildings` (uses browser back).
    - For `profile.role === 'Worker'` with `allowed_pages` set, goes to `/` to avoid unauthorized pages.
  - `handleRefresh: () => Promise<void>`
    - Calls `window.location.reload()` on pull‑to‑refresh.
  - `useEffect` on `location.pathname` to scroll to top on route changes.

- **Structure**
  - Mobile header: burger menu, notification bell, back button.
  - `<Sidebar />` on the left.
  - `main` content:
    - `<PullToRefresh onRefresh={handleRefresh} />`
    - Container `div` with padding and `<Outlet />` (page content).

### 3.2 Sidebar (`src/components/layout/Sidebar.tsx`)

- **Key imports / hooks**
  - `NavLink` from `react-router-dom`.
  - `useAuth()` and `useLanguage()` contexts.
  - `NotificationBell`, lucide icons.
  - `cn` from `@/lib/utils` (class name helper).

- **Nav items definition**
  - `getNavItems(t)` returns an array of:
    - `{ to, icon, label, permission, pageId }`
  - `pageId` **must match**:
    - IDs in `Users.tsx` (`ALL_PAGES`, `allowed_pages`).
    - `pageId` used in `PermissionProtectedRoute` calls.

- **Profile‑driven navigation**
  - Reads from `profile`:
    - `allowed_pages: string[] | null`
    - `page_order: string[] | null`
    - `sidebar_order: string[] | null`
    - `role: 'Owner' | 'Worker'`
  - Important derived variables:
    - `allowedPages`
    - `pageOrder`
    - `sidebarOrder`
    - `customOrder` – `page_order` for Owner, `sidebar_order` for Worker.
    - `hasExplicitPageAccess` – true if non‑Owner and `allowed_pages` set.
    - `shouldRenderNav` – true when auth profile is fully loaded.

- **Ordering logic**
  - `getOrderedNavItems()`:
    - Owner:
      - If `pageOrder` exists, only show pages in `page_order` and in that order.
      - Else show all pages filtered by `hasPermission`.
    - Worker:
      - Prefer `allowed_pages` to determine visible items.
      - Fallback to `page_order`.
      - Else fall back to `hasPermission`.
    - Use `page_order` or `allowed_pages` as **order source** and sort nav items.

- **Language switcher**
  - Uses `setLanguage('ar' | 'fr')` from `LanguageContext`.
  - Updates the language and switches styles accordingly.

- **Sign out**
  - Button calls `signOut()` from `AuthContext`.

---

## 4. Authentication & Authorization

### 4.1 Auth Context (`src/contexts/AuthContext.tsx`)

- **Types**
  - `AuthContextType`:
    - `user: SupabaseUser | null`
    - `profile: User | null`
    - `session: Session | null`
    - `loading: boolean`
    - `profileLoading: boolean`
    - `isReady: boolean`
    - `signIn(email, password, captchaVerified?)`
    - `signOut()`
    - `refreshProfile()`
    - `hasPermission(permission: string): boolean`
    - `hasPageAccess(pageId: string): boolean`
    - `getPermissionDeniedMessage(permission: string): string`
    - `getFailedAttemptsCount(email: string): Promise<number>`
    - `requiresReAuth(): boolean`
    - `updateLastAuthTime(): void`

- **Role permissions**
  - `rolePermissions: Record<UserRole, Record<string, boolean>>`
    - `Owner` has nearly full access: `view_land`, `edit_clients`, `manage_users`, `view_audit_logs`, etc.
    - `Worker` has limited abilities (no `manage_users`, no `view_audit_logs`, restricted deletes, etc.).

- **Session / profile handling**
  - Uses Supabase `auth.getSession()` and `auth.onAuthStateChange`.
  - Profile fetched from Supabase `users` table with fields:
    - `id, name, email, role, status, created_at, updated_at`
    - `allowed_pages, page_order, sidebar_order, allowed_batches, allowed_pieces`
  - Profile caching:
    - `profileCacheRef` caches `{ userId, profile, timestamp }`.
    - `CACHE_DURATION_MS` (5 min).

- **Timeouts & security**
  - `SESSION_TIMEOUT_MS` – 8h.
  - `INACTIVITY_TIMEOUT_MS` – 15 min.
  - `TOKEN_REFRESH_INTERVAL_MS` – 7h.
  - `REAUTH_REQUIRED_TIMEOUT_MS` – 1h for sensitive operations.

- **Usage pattern**
  - Wrap app with `<AuthProvider>`.
  - Use in components:
    - `const { user, profile, hasPermission, hasPageAccess } = useAuth()`.

### 4.2 Language Context (`src/contexts/LanguageContext.tsx`)

- **Types**
  - `Language = 'ar' | 'fr'`
  - `LanguageContextType`:
    - `language: Language`
    - `setLanguage(lang: Language)`
    - `t(key: string, params?: Record<string, string | number>): string`

- **Behavior**
  - Persists language in `localStorage` under `LANGUAGE_STORAGE_KEY`.
  - Updates `document.documentElement.dir` to `'rtl'` for Arabic, `'ltr'` for French.
  - Translation function `t()` uses `getTranslation(language, key)` from `lib/translations`.

---

## 5. Data & Utilities

### 5.1 Supabase Client (`src/lib/supabase.ts`)

- Provides a configured singleton Supabase client used throughout the app.
- Pages like `Clients.tsx`, `SalesNew.tsx`, etc., import `supabase` and use:
  - `.from('table')`
  - `.select(...)`
  - `.insert(...)`
  - `.update(...)`
  - `.delete(...)`
  - `.rpc('function_name', params)` for custom Postgres functions.

### 5.2 Utility Functions (`src/lib/utils.ts`)

- `cn(...inputs: ClassValue[])` – merges class names with `clsx` and `tailwind-merge`.
- `formatCurrency(amount: number): string`
  - Uses `Intl.NumberFormat('fr-TN', { style: 'currency', currency: 'TND' })`.
- `formatDate(date: string | Date): string`
  - Arabic month names, returns `day month year`.
- `formatDateTime(date: string | Date): string`
  - Same as above with `HH:MM` appended.

### 5.3 Translations (`src/lib/translations.ts`)

- Contains a nested translation object for both `ar` and `fr`.
- Important keys:
  - `nav.*` – sidebar labels: `home`, `land`, `homes`, `clients`, `sales`, `confirmSales`, `installments`, `financial`, `expenses`, `debts`, `realEstate`, `workers`, `messages`, `calendar`, `phoneCalls`, `download`, `users`, `security`, etc.
  - `common.*` – shared UI strings (save, delete, loading, language, etc.).
  - Feature‑specific namespaces like `realEstate`, `installments`, etc.
- Usage:
  - `const { t } = useLanguage()`
  - `t('nav.clients')`, `t('common.save')`, etc.

---

## 6. Example Feature: Clients Management

File: `src/pages/Clients.tsx`

### 6.1 Data Types

- `ClientWithRelations extends Client`:
  - Inherits from `Client` interface in `src/types/database.ts`:
    - `id`, `name`, `cin`, `phone`, `email`, `address`, `client_type`, `notes`, `created_by`, timestamps.
  - Adds:
    - `sales?: Sale[]`
    - `reservations?: Reservation[]`

### 6.2 Core State Variables

- `clients: ClientWithRelations[]`
- `loading: boolean`
- Search:
  - `searchTerm: string`
  - `debouncedSearchTerm: string`
  - `debouncedSearchFn` (created with `debounce` from `lib/throttle`).
- CIM search & status:
  - `clientSearchStatus: 'idle' | 'searching' | 'found' | 'not_found'`
  - `searchingClient: boolean`
  - `foundClient: Client | null`
  - `debouncedCINSearch(cin: string, isEditing: boolean)`
- Dialog state:
  - `dialogOpen: boolean`
  - `editingClient: Client | null`
  - `form` object:
    - `name`, `cin`, `phone`, `email`, `address`, `client_type`, `notes`
  - `detailsOpen: boolean`
  - `selectedClient: ClientWithRelations | null`
- Persistence & errors:
  - `saving: boolean`
  - `errorMessage: string | null`
  - `deleteConfirmOpen: boolean`
  - `clientToDelete: string | null`
  - `deleting: boolean`

### 6.3 Fetching & Derived Data

- `useEffect(() => { fetchClients() }, [])`
- `fetchClients = async () => { ... }`
  - Supabase query:
    - `.from('clients').select('*, sales (*), reservations (*)')`
    - `.order('name', { ascending: true })`
  - Filters out cancelled sales client‑side.
  - Updates `clients` state.

- `filteredClients` (via `useMemo`):
  - Filters by `name`, `cin`, or `phone` matching `debouncedSearchTerm`.

- `clientStats` (via `useMemo`):
  - `total = clients.length`
  - `withSales = clients.filter(c => c.sales && c.sales.length > 0).length`
  - `individuals = clients.filter(c => c.client_type === 'Individual').length`
  - `companies = clients.filter(c => c.client_type === 'Company').length`
  - Used in the four stat cards at top:
    - إجمالي العملاء / لديهم مبيعات / أفراد / شركات.

### 6.4 CRUD Operations

- `openDialog(client?: Client)`
  - If `client` provided, fills form for edit.
  - Otherwise, clears form for new client.

- `saveClient = async () => { ... }`
  - Guards against double submissions using `saving` flag.
  - Permission checks:
    - `hasPermission('edit_clients')` client‑side.
    - `validatePermissionServerSide('edit_clients')` for server‑side validation.
  - Validation:
    - `form.name`, `form.cin`, `form.phone` required.
    - `sanitizeCIN`, `sanitizePhone`, `sanitizeText`, `sanitizeEmail`, `sanitizeNotes`.
    - Duplicate CIN check using Supabase query on `clients`.
  - Insert or update:
    - `.update(clientData).eq('id', editingClient.id)` or `.insert([clientData])`.
  - On success: closes dialog and calls `fetchClients()`.

- `deleteClient(clientId: string)` and `confirmDelete()`
  - Uses `ConfirmDialog` to guard delete.
  - Checks:
    - `hasPermission('delete_clients')`.
    - Server RPC `delete_client_completely` to remove client and related data.
    - Ensures no active sales/reservations before allow delete.
  - Updates local `clients` state to remove deleted client.

### 6.5 Details Dialog

- `viewDetails(client: ClientWithRelations)`
  - Sets `selectedClient` and opens details dialog.
  - Loads related land pieces and batches for each sale:
    - Queries `land_pieces` and `land_batches`.
    - Attaches computed `_landPieces` to each `sale`.
  - Displays:
    - Client info.
    - Sales history table with:
      - Columns: date, type (Full/Installment), pieces, price, status.
      - Uses `formatDate` and `formatCurrency`.

---

## 7. UI Components & Hooks

### 7.1 UI Components (`src/components/ui/*`)

Reusable components used across pages (buttons, cards, dialogs, tables, form inputs, notifications, etc.). Examples:

- `button.tsx`, `card.tsx`, `input.tsx`, `textarea.tsx`, `select.tsx`
- `dialog.tsx`, `confirm-dialog.tsx`
- `table.tsx`
- `loading-progress.tsx` – used in `AppRoutes` for loading screens.
- `notification-bell.tsx`, `notification.tsx` – global notification system.

### 7.2 Hooks

- `useSwipeGesture` (`src/hooks/useSwipeGesture.ts`)
  - Used in `MainLayout` to open sidebar with a swipe from left edge.

- `useOptimisticMutation` (`src/hooks/useOptimisticMutation.ts`)
  - Optimistic update helper (used in some data‑heavy pages like sales/installments).

---

## 8. PWA & Service Worker

- `src/lib/serviceWorker.ts`
  - `registerServiceWorker()` registers `/sw.js` on window load.
  - Triggers `registration.update()` every hour to check for new versions.

- `public/sw.js`
  - `CACHE_NAME` / `STATIC_CACHE_NAME` strings control cache version.
  - Strategy:
    - Network‑first for most requests, with cache fallback.
    - Supabase calls (`supabase.co`) are **not cached** to keep data live.
  - Static assets pre‑cached: `'/'`, `/manifest.json`, `/image.png`.

When you change the frontend bundle significantly, bump `CACHE_NAME` and `STATIC_CACHE_NAME` to force clients to download a fresh version.

---

## 9. Conventions & Best Practices

- **File structure**
  - `src/pages/*` – full pages/screens.
  - `src/components/*` – reusable UI and layout components.
  - `src/contexts/*` – app‑wide React context providers.
  - `src/lib/*` – utilities, Supabase client, service worker, translations, sanitization, etc.
  - `src/types/database.ts` – TypeScript interfaces for database tables.

- **Naming**
  - Components: `PascalCase` (`MainLayout`, `Clients`, `SaleManagement`).
  - Hooks: `camelCase` starting with `use` (`useAuth`, `useLanguage`, `useSwipeGesture`).
  - Context providers: `<SomethingProvider>` (`AuthProvider`, `LanguageProvider`).
  - Permission strings: `snake_case` style but stored as plain strings, e.g. `'view_clients'`, `'edit_sales'`.
  - Page IDs: `kebab-case` or simple ids (`'clients'`, `'sale-management'`, `'real-estate'`) – must stay consistent across:
    - `Sidebar` nav items.
    - `PermissionProtectedRoute pageId`.
    - `Users.tsx` `ALL_PAGES` and `allowed_pages` in DB.

- **Patterns to follow when adding features**
  - Protect new pages with `PermissionProtectedRoute` and a `pageId`.
  - Register the page in `Sidebar` with the same `pageId`.
  - If the page needs translations:
    - Add entries under `nav` and any feature‑specific namespace in `translations.ts`.
  - Use `useAuth()` to:
    - Check `hasPermission` or `hasPageAccess` for sensitive actions.
  - Keep forms sanitized:
    - Use `sanitizeText`, `sanitizeEmail`, `sanitizePhone`, etc. from `lib/sanitize`.

---

## 10. How to Extend the App Safely

- **Adding a new permissioned action**
  1. Define or reuse a permission key (e.g. `'edit_expenses'`).
  2. Add it to `rolePermissions` for `Owner`/`Worker` as needed.
  3. Use `hasPermission('edit_expenses')` before rendering the action button / running the action.

- **Adding a new data table**
  1. Add the interface to `src/types/database.ts`.
  2. Use Supabase migrations to create the table and RLS.
  3. Build a page under `src/pages`.
  4. Use Supabase client from `lib/supabase` for queries.

- **Communicating with other devs**
  - When discussing a feature, refer explicitly to:
    - **Page component name** (e.g. `Clients`, `Installments`).
    - **Route path** (e.g. `/clients`, `/installments`).
    - **`pageId`** (e.g. `clients`, `installments`).
    - **Permission string** (e.g. `'view_clients'`, `'edit_sales'`).
    - **State variable names** in the relevant file (e.g. `clients`, `clientStats`, `filteredClients`, `saving`, `errorMessage` in `Clients.tsx`).

This guide should give any new developer enough context to understand the structure, navigate the codebase, and safely add or modify features in LandDev.


