## LandDev – UX & User Flows Guide

This guide describes the **user experience**, main **screens**, and key **buttons / actions** from a business and UX point of view (not a technical one).  
Use it to understand how the app should feel and behave for end‑users, and to brief designers or product people.

---

## 1. Global Experience

- **Target users**
  - Real‑estate company owner and staff managing:
    - Land pieces and houses
    - Clients
    - Sales, reservations, installments
    - Expenses, debts, projects, workers

- **General layout**
  - **Left sidebar** (on desktop): main navigation between pages.
  - **Top bar on mobile**:
    - Left: burger menu to open/close sidebar.
    - Right: notification bell + back button (returns to previous page or home).
  - **Main content area**:
    - Page title + short description.
    - Primary action button (e.g. “إضافة عميل”) near the top right.
    - Filters / search.
    - List/table/cards with data and row‑level actions.

- **Language & direction**
  - Supports **Arabic** and **French**.
  - Switching language:
    - Use the language buttons at the bottom of the sidebar:
      - “العربية / Français”.
    - Switching updates all texts and also flips layout direction:
      - Arabic: **RTL** (right‑to‑left).
      - French: **LTR** (left‑to‑right).

- **Navigation & permissions**
  - Users see only pages they are allowed to access:
    - Some users see all pages (e.g. owner).
    - Workers may see only selected pages.
  - If they try to open a page they are not allowed to:
    - They see an “unauthorized” message explaining they should contact the admin.

- **Pull‑to‑refresh (mobile)**
  - On mobile, pulling down in the main content triggers a **full page reload**.
  - Use this if data seems outdated.

- **Notifications**
  - Notification bell appears:
    - In sidebar header (desktop).
    - In mobile top bar.
  - UX intent: inform user of new messages / system events.

- **Loading experience**
  - On first open or when switching accounts:
    - A full‑screen loader appears: “جاري تحميل بيانات المستخدم…” or similar.
  - When saving or deleting important items:
    - Buttons show a **loading state** (e.g. “جاري الحفظ…”).

---

## 2. Authentication & Access

### 2.1 Login Screen

- **Purpose**
  - Allow users to enter their credentials and access the system.

- **Main elements**
  - App title and subtitle:
    - Arabic example: “LandDev – نظام إدارة الأراضي والعقارات”.
  - **Email field** – placeholder asking to enter an email.
  - **Password field** – password input.
  - **Login button** – main call to action:
    - Shows loading text while sign‑in is in progress.
    - On success: redirect to **Home**.
    - On failure: show a clear error message.

- **UX expectations**
  - If the user is already logged in and visits `/login`, they should be redirected to home.
  - Error messages should be short and clear (wrong password, unexpected error, etc.).

### 2.2 Account Disabled

- **Purpose**
  - Inform users whose account is disabled that they cannot use the system.
- **Behavior**
  - Normally not shown in daily flow (status check currently disabled in code).
  - If activated in future:
    - Only users with a disabled status should see this page with a clear explanation.

---

## 3. Navigation & Layout UX

### 3.1 Sidebar

- **Role**
  - Main way to move between features.
  - Shows only pages the user is allowed to see.

- **Content**
  - A vertical list of items such as:
    - Home, Land, Houses, Clients, Sales, Sale Confirmation, Installments, Financial, Expenses, Debts, Real Estate Projects, Workers, Messages, Calendar, Phone Calls, Download App, Users, Permissions, Security.
  - Each item has:
    - Icon + label.
    - Highlight color when active.

- **Bottom section**
  - **Language selector** – two small buttons:
    - Arabic button and French button.
    - Active language appears highlighted.
  - **User identity**
    - Shows logged‑in user name.
    - Shows role label (Owner / Manager / Field staff, localized).
  - **Logout button**
    - Clearly labeled (e.g. “تسجيل الخروج / Déconnexion”).
    - Takes the user back to login screen and clears session.

### 3.2 MainLayout (All Pages)

- **Mobile header**
  - Left: burger button toggles sidebar.
  - Right:
    - Notification bell.
    - Back arrow:
      - Returns to previous page or to home (especially for restricted workers).

- **Scrolling**
  - On every route change:
    - Page scroll resets to top (no confusing partial scroll positions).

---

## 4. Key Feature Pages and UX Flows

> Note: Only the most important functional pages are detailed. Others follow similar patterns (list + filters + actions).

### 4.1 Home / Dashboard

- **Purpose**
  - Give a quick overview of the business: key statistics, shortcuts to important modules.

- **Expected content (general UX, exact cards may vary)**
  - Statistic cards for:
    - Number of lands / houses available.
    - Total clients.
    - Number of active sales or reservations.
    - Upcoming installments / deadlines.
  - Shortcuts:
    - Buttons or links to quickly open:
      - Add new client.
      - Add new sale.
      - View installments for today / this week.

### 4.2 Land Management (`/land`)

- **User goal**
  - View all land batches and individual land pieces.
  - See status: Available, Reserved, Sold, Cancelled.
  - Start reservations or sales.

- **Main UX elements**
  - Filters:
    - By status (available / reserved / sold).
    - By batch or location.
  - Table or grid of land pieces:
    - Each row: piece number, batch, surface, price, status.
    - Colors or badges for status.
  - Actions per land (depending on permissions):
    - “Reserve” or “Sell now”.
    - “Edit land details”.

### 4.3 Homes Management (`/homes`)

- **User goal**
  - Manage **houses** in a similar way to land pieces.

- **UX patterns (similar to Land)**
  - Filters: by project, location, status.
  - List / grid of houses:
    - Name, place, surface, full price, installment price, status.
  - Actions:
    - Start sale or reservation.
    - Edit house details.

### 4.4 Clients (`/clients`)

This page is a major part of daily operations and has a carefully designed UX.

- **Header**
  - Title: “إدارة العملاء” (Manage Clients).
  - Subtitle: “إدارة عملائك ومعلوماتهم” (Manage your clients and their information).
  - On the right (if user has permission to edit clients):
    - **Button: “إضافة عميل” (Add Client)**
      - Opens a form dialog for creating a new client.

- **Statistics cards**
  - Four small colored cards showing:
    - **إجمالي العملاء** – total number of clients.
    - **لديهم مبيعات** – how many clients have at least one sale.
    - **أفراد** – number of individual clients.
    - **شركات** – number of company clients.
  - These numbers **update live** based on current data (no hardcoding).

- **Search**
  - Search input on its own card with placeholder:
    - “البحث بالاسم، رقم الهوية، أو الهاتف…”
  - Typing in this box filters the list in real time (with a small delay to avoid flicker).

- **List of clients**
  - **Mobile view**:
    - Clients are shown as cards, one per client.
    - Each card shows:
      - Name + CIN (identity number).
      - Client type badge: “فردي” or “شركة”.
      - Phone number.
      - Number of sales icon + count.
    - Buttons at bottom of card:
      - “التفاصيل” (Details) – opens detailed dialog with client info and sales history.
      - “تعديل” (Edit) – opens edit dialog (if user has permission).
      - Trash icon – delete (if user has delete permission), with confirmation.
  - **Desktop view**:
    - Table with columns:
      - Name, CIN, Phone, Type, Sales, Actions.
    - Actions column uses icon buttons:
      - Eye (view details), Edit, Delete (if allowed).

- **Client form dialog (Add / Edit)**
  - Opens from “إضافة عميل” or from row‑level “تعديل”.
  - **Fields:**
    - **رقم الهوية \*** – CIN (ID) – first field at top.
      - When adding a new client:
        - Typing at least 8 characters triggers automatic lookup of existing clients.
        - If found, shows a green line with the existing client and auto‑fills the form.
        - If not found, shows a blue message: “لا يوجد عميل بهذا الرقم - يمكنك المتابعة لإضافة عميل جديد”.
      - When editing:
        - CIN is fixed and disabled (not editable).
    - **الاسم \*** – Client name.
    - **الهاتف \*** – Phone (required).
    - **البريد الإلكتروني** – Optional.
    - **العنوان** – Optional.
    - **ملاحظات** – Bigger text area for notes.
    - **النوع** – Select between “فردي” and “شركة”.
  - **Validation UX**
    - Required fields show clear error messages if empty (e.g. “الاسم مطلوب”).
    - Duplicate CIN:
      - If another client has the same CIN:
        - Show a red error with the existing client name.
    - All errors shown inside the dialog in a red message box.
  - **Buttons**
    - “إلغاء” – closes the dialog.
    - “حفظ” – validates and saves:
      - Shows “جاري الحفظ…” during saving.
      - On success:
        - Dialog closes.
        - Clients list refreshes and stats update.

- **Delete flow**
  - Clicking the trash icon opens a **confirmation dialog**:
    - Title: e.g. “تأكيد الحذف”.
    - Message: explains deletion is permanent.
    - Buttons:
      - “إلغاء”.
      - “حذف” / “جاري الحذف…” while deleting.
  - Additional UX safeguards:
    - If client has **active sales or reservations**, show a message saying deletion is not allowed because of linked data.

- **Details dialog**
  - Shows:
    - Client info (name, CIN, phone, email, address).
    - If there are sales:
      - “سجل المبيعات” section with a table:
        - Date, payment type (full or installments), pieces, price, status (e.g. مباع / بالتقسيط / محجوز).
      - For each sale, shows the involved land pieces and their batch names when available.

### 4.5 Sales & Installments

Even without reading all code, we can define the **intended UX** for these key flows.

- **Sales creation (`/sales`)**
  - User can:
    - Choose a client (existing or new).
    - Choose land pieces or houses to sell.
    - Choose payment type:
      - Full payment.
      - Installment plan.
    - See an automatic calculation of:
      - Total price, company fee, monthly payment amount, etc.
  - Buttons:
    - “حفظ البيع” or similar (save sale).
    - Optionally “معاينة العقد” (view contract) if integrated with contract editors.

- **Sale confirmation (`/sale-confirmation`)**
  - Target for admins or supervisors:
    - List of **pending** sales requiring confirmation.
  - UX:
    - Each row: client, pieces, amount, requested date.
    - Buttons:
      - “تأكيد” to approve and finalize.
      - Possibly “رفض” or “تعديل”.

- **Sale management (`/sale-management`)**
  - Overview of all sales:
    - Filters by status (pending, ongoing installments, completed, cancelled).
  - Actions:
    - Open a sale to see details.
    - Adjust deadlines or mark as completed.

- **Installments (`/installments`)**
  - **Main goals**:
    - See upcoming and overdue installments.
    - Record payments.
  - UX elements:
    - Filters: by time window (today, this week, this month, overdue).
    - Cards or table rows per installment:
      - Client name, sale reference, due date, amount due, amount paid, status (Unpaid / Late / Paid).
    - Color cues:
      - Red / orange for late or near deadlines.
      - Green for fully paid.
  - Actions:
    - Record a payment:
      - Opens a small form (payment date, amount, notes).
      - Updates status and recalculates remaining amount.

### 4.6 Financial & Expenses (`/financial`, `/expenses`)

- **Financial overview**
  - Show high‑level financial metrics:
    - Total revenue.
    - Pending installments.
    - Profit margins per project or period.
  - May include a date filter at the top.

- **Expenses**
  - List of company expenses:
    - Supplier or description, amount, date, category, project (if relevant).
  - Actions:
    - Add expense (form dialog).
    - Edit / delete expense, with confirmation on delete.

### 4.7 Debts (`/debts`)

- **User goal**
  - Track money the company owes to others (creditors).

- **UX**
  - Table of debts:
    - Creditor name, amount owed, due date, reference, status.
  - Actions:
    - Add / edit / mark as paid.

### 4.8 Real Estate Projects (`/real-estate-buildings`)

- **User goal**
  - Manage development projects and their internal "boxes" and expenses.

- **UX**
  - Tabs or subtabs:
    - Projects, Boxes, Expenses.
  - Each tab:
    - Shows a list with add/edit/delete actions.
  - High emphasis on grouping:
    - For example, each box belongs to a project; each expense belongs to a box or project.

### 4.9 Workers (`/workers`)

- **User goal**
  - Manage worker records: availability, role, assignments.

- **UX**
  - List of workers with:
    - Name, role, availability status (Available / Busy / Unavailable).
  - Actions:
    - Add worker, update availability, edit details.

### 4.10 Messages (`/messages`)

- **User goal**
  - Internal messaging or notifications tracking.

- **UX**
  - A list or inbox style:
    - Conversations or messages, status (open / closed).
  - Clicking a row opens message details, replies, or logs.

### 4.11 Calendar & Phone Calls (`/calendar`, `/phone-calls`)

- **Calendar**
  - Focus on **sale finalization appointments**.
  - Day or week view:
    - Each entry shows client, sale, place/time.
  - Actions:
    - Add appointment.
    - Drag or edit existing ones to change date/time.

- **Phone Calls**
  - Track follow‑up calls with potential or existing clients.
  - UX:
    - A list of planned calls:
      - Client, phone, purpose, scheduled time, status.
    - Ability to mark them as done or reschedule.

### 4.12 Download App (`/download`)

- **Purpose**
  - Explain how to install LandDev as a PWA on phone or desktop.

- **Content**
  - Step‑by‑step instructions:
    - Android: open in Chrome → menu → “Install app” or “Add to Home Screen”.
    - iOS: open in Safari → share icon → “Add to Home Screen”.
    - Desktop: Chrome/Edge install icon or “Create shortcut”.
  - Benefits list:
    - Works offline, fast, no app store, auto‑updates.

### 4.13 Users, Permissions & Security (`/users`, `/permissions`, `/security`)

- **Users**
  - Manage application users:
    - List: name, email, role, status.
  - Actions:
    - Add user, change role, activate/deactivate.

- **Permissions**
  - Configure which pages and features each user can access.
  - UX:
    - For each user, see all pages (land, clients, sales, etc.).
    - Toggle access on/off per page (checkboxes or switches).
    - Save changes and immediately affect sidebar/menu visibility.

- **Security / Audit Logs**
  - For admins:
    - View history of sensitive actions (e.g. deleting clients, editing sales).
  - Table with:
    - User, action, affected table / record, timestamp, maybe old/new values.

---

## 5. Summary for UX / Product People

- **Always think in terms of:**
  - “What does the user try to accomplish on this page?”
  - “What is the primary action?” (e.g. add client, record payment, confirm sale).
  - “What information does the user need before acting?” (stats, filters, warnings).

- **Buttons and flows should be:**
  - **Clear** (short, descriptive Arabic/French labels).
  - **Safe** for destructive actions (always confirm delete, show why an action is not allowed).
  - **Responsive**:
    - Show loading states.
    - Show success or error messages near the action.

Use this guide as a reference when redesigning or extending the product so that new features remain consistent with the existing user experience of LandDev. 


