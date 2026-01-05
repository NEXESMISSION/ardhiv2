# FULLLANDDEV - Complete Development Documentation

## 📚 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Project Structure](#project-structure)
4. [Development Setup](#development-setup)
5. [Code Patterns & Conventions](#code-patterns--conventions)
6. [Database Schema](#database-schema)
7. [Frontend Development](#frontend-development)
8. [Backend/Database Development](#backenddatabase-development)
9. [UI/UX Guidelines](#uiux-guidelines)
10. [Security & Permissions](#security--permissions)
11. [Testing & Debugging](#testing--debugging)
12. [Deployment](#deployment)
13. [Common Tasks](#common-tasks)
14. [Troubleshooting](#troubleshooting)

---

## 🎯 Project Overview

**FULLLANDDEV** is a comprehensive land and real estate management system designed for managing:
- Land batches and individual pieces
- Client relationships and sales
- Payment installments and tracking
- Financial reports and analytics
- Debt management
- User permissions and audit logs

### Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS v4
- **UI Components**: Custom components (shadcn/ui style)
- **Icons**: Lucide React
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Routing**: React Router v7
- **State Management**: React Context API + React Query

---

## 🏗️ Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────┐
│           React Frontend (Vite)                 │
│  ┌──────────────┐  ┌─────────────────────────┐ │
│  │   Pages      │  │   Components            │ │
│  │   - Sales    │  │   - UI Components       │ │
│  │   - Clients  │  │   - Layout              │ │
│  │   - Land     │  │   - Forms               │ │
│  └──────────────┘  └─────────────────────────┘ │
│  ┌───────────────────────────────────────────┐ │
│  │   Contexts & Hooks                        │ │
│  │   - AuthContext (Permissions)             │ │
│  │   - Custom Hooks                          │ │
│  └───────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────┐ │
│  │   Lib Utilities                           │ │
│  │   - Supabase Client                       │ │
│  │   - Sanitization                          │ │
│  │   - Formatting                            │ │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
                    ↕ HTTP/WebSocket
┌─────────────────────────────────────────────────┐
│           Supabase Backend                      │
│  ┌───────────────────────────────────────────┐ │
│  │   PostgreSQL Database                     │ │
│  │   - Tables (sales, clients, etc.)        │ │
│  │   - RLS Policies                          │ │
│  │   - Triggers & Functions                 │ │
│  └───────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────┐ │
│  │   Authentication                          │ │
│  │   - Email/Password                        │ │
│  │   - JWT Tokens                            │ │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Data Flow

1. **User Action** → React Component
2. **Component** → Calls Supabase Client
3. **Supabase Client** → Sends request to Supabase API
4. **Supabase API** → Validates RLS policies
5. **PostgreSQL** → Executes query/trigger
6. **Response** → Returns to Component
7. **Component** → Updates UI

---

## 📁 Project Structure

```
FULLLANDDEV/
├── frontend/
│   ├── src/
│   │   ├── components/          # Reusable UI components
│   │   │   ├── layout/          # Layout components
│   │   │   │   ├── MainLayout.tsx      # Main app layout with sidebar
│   │   │   │   ├── Sidebar.tsx         # Navigation sidebar
│   │   │   │   └── PullToRefresh.tsx   # Mobile pull-to-refresh
│   │   │   └── ui/              # Base UI components
│   │   │       ├── button.tsx
│   │   │       ├── card.tsx
│   │   │       ├── dialog.tsx
│   │   │       ├── input.tsx
│   │   │       ├── table.tsx
│   │   │       ├── notification.tsx    # Toast notifications
│   │   │       └── ...
│   │   ├── contexts/            # React Context providers
│   │   │   └── AuthContext.tsx  # Authentication & permissions
│   │   ├── hooks/               # Custom React hooks
│   │   │   ├── useSwipeGesture.ts
│   │   │   └── useOptimisticMutation.ts
│   │   ├── lib/                 # Utility libraries
│   │   │   ├── supabase.ts      # Supabase client setup
│   │   │   ├── sanitize.ts      # Input sanitization
│   │   │   ├── throttle.ts      # Debounce/throttle utilities
│   │   │   ├── utils.ts         # General utilities
│   │   │   ├── retry.ts         # Retry logic for API calls
│   │   │   └── queryCache.ts    # React Query cache config
│   │   ├── pages/               # Page components
│   │   │   ├── Home.tsx         # Dashboard/home page
│   │   │   ├── Login.tsx        # Authentication page
│   │   │   ├── LandManagement.tsx
│   │   │   ├── Clients.tsx
│   │   │   ├── SalesNew.tsx
│   │   │   ├── SaleConfirmation.tsx
│   │   │   ├── Installments.tsx
│   │   │   ├── FinancialNew.tsx
│   │   │   ├── Debts.tsx
│   │   │   ├── Expenses.tsx
│   │   │   ├── Users.tsx
│   │   │   ├── Security.tsx     # Audit logs
│   │   │   └── ...
│   │   ├── types/               # TypeScript type definitions
│   │   │   └── database.ts      # Database types
│   │   ├── App.tsx              # Main app component & routing
│   │   ├── main.tsx             # App entry point
│   │   └── index.css           # Global styles
│   ├── public/                  # Static assets
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── supabase_schema.sql          # Main database schema
├── ENSURE_USER_TRACKING_COMPLETE.sql
├── RESET_DATABASE_KEEP_USER.sql
├── FIX_*.sql                    # Database migration scripts
└── README.md
```

---

## 🚀 Development Setup

### Prerequisites

- **Node.js** 18+ (recommended: 20+)
- **npm** or **yarn**
- **Supabase Account** (free tier works)
- **Git**

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/NEXESMISSION/fulldevland.git
   cd FULLLANDDEV
   ```

2. **Set up Supabase Database**
   - Go to [Supabase Dashboard](https://app.supabase.com)
   - Create a new project
   - Open **SQL Editor**
   - Run `supabase_schema.sql` to create all tables
   - Run `ENSURE_USER_TRACKING_COMPLETE.sql` for user tracking
   - (Optional) Run other migration scripts as needed

3. **Configure Environment Variables**
   ```bash
   cd frontend
   cp .env.example .env  # If exists, or create .env
   ```
   
   Edit `.env`:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

4. **Install Dependencies**
   ```bash
   npm install
   ```

5. **Run Development Server**
   ```bash
   npm run dev
   ```
   App runs at `http://localhost:5173`

6. **Create First User**
   - Go to Supabase Dashboard → Authentication → Users
   - Create a user with email/password
   - Go to SQL Editor and run:
     ```sql
     INSERT INTO users (id, name, email, role, status)
     VALUES (
       'user-uuid-from-auth',
       'Your Name',
       'your-email@example.com',
       'Owner',
       'Active'
     );
     ```

---

## 💻 Code Patterns & Conventions

### TypeScript Conventions

- **Always use TypeScript** - No `any` types unless absolutely necessary
- **Define interfaces** for all data structures
- **Use type imports**: `import type { User } from '@/types/database'`
- **Strict mode enabled** in `tsconfig.json`

### Component Structure

```typescript
// 1. Imports (grouped)
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'

// 2. Types/Interfaces
interface MyComponentProps {
  id: string
}

// 3. Component
export function MyComponent({ id }: MyComponentProps) {
  // 4. Hooks
  const { user, hasPermission } = useAuth()
  const [data, setData] = useState(null)
  
  // 5. Effects
  useEffect(() => {
    fetchData()
  }, [id])
  
  // 6. Functions
  const fetchData = async () => {
    // ...
  }
  
  // 7. Render
  return (
    <div>
      {/* JSX */}
    </div>
  )
}
```

### Naming Conventions

- **Components**: PascalCase (`SalesNew.tsx`, `ClientDetails.tsx`)
- **Files**: Match component name
- **Functions**: camelCase (`fetchData`, `handleSubmit`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`)
- **Types/Interfaces**: PascalCase (`User`, `SaleData`)

### State Management

- **Local State**: `useState` for component-specific state
- **Global State**: `AuthContext` for user/auth data
- **Server State**: Direct Supabase calls (consider React Query for complex cases)
- **Form State**: Controlled components with `useState`

### Error Handling

```typescript
try {
  const { data, error } = await supabase
    .from('table')
    .select('*')
  
  if (error) throw error
  
  // Use data
} catch (error: any) {
  console.error('Error:', error)
  setErrorMessage('خطأ في العملية')
  // Show user-friendly error
}
```

### Input Sanitization

**Always sanitize user inputs** before saving to database:

```typescript
import { sanitizeText, sanitizePhone, sanitizeEmail, sanitizeCIN } from '@/lib/sanitize'

const cleanName = sanitizeText(form.name)
const cleanPhone = sanitizePhone(form.phone)
const cleanEmail = sanitizeEmail(form.email)
const cleanCIN = sanitizeCIN(form.cin)
```

---

## 🗄️ Database Schema

### Core Tables

#### `users`
- Links to Supabase Auth
- Stores: name, email, role, status, allowed_pages
- **User tracking**: Created automatically via Auth trigger

#### `clients`
- Customer information
- Fields: name, cin, phone, email, address, client_type, notes
- **User tracking**: `created_by` (UUID → users.id)

#### `land_batches`
- Groups of land purchased together
- Fields: name, total_surface, total_cost, date_acquired, location, notes
- **User tracking**: `created_by`

#### `land_pieces`
- Individual land plots
- Fields: piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status
- **User tracking**: Via land_batches.created_by

#### `sales`
- Sales records
- Fields: client_id, land_piece_ids[], payment_type, total_selling_price, status
- **User tracking**: `created_by`

#### `installments`
- Monthly payment schedules
- Fields: sale_id, installment_number, amount_due, amount_paid, due_date, status
- **User tracking**: Via sales.created_by

#### `payments`
- All payment records
- Fields: client_id, sale_id, amount_paid, payment_type, payment_date
- **User tracking**: `recorded_by`

#### `expenses`
- Business expenses
- Fields: category, amount, expense_date, description, status
- **User tracking**: `submitted_by`, `approved_by`

#### `debts`
- Company debts
- Fields: creditor_name, amount_owed, due_date, status
- **User tracking**: `created_by`

#### `audit_logs`
- Activity tracking
- Fields: user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent
- **Auto-populated** via triggers

### Relationships

```
users
  ├── clients (created_by)
  ├── land_batches (created_by)
  ├── sales (created_by)
  ├── payments (recorded_by)
  ├── expenses (submitted_by, approved_by)
  └── debts (created_by)

clients
  ├── sales (client_id)
  ├── payments (client_id)
  └── reservations (client_id)

land_batches
  └── land_pieces (land_batch_id)

sales
  ├── installments (sale_id)
  ├── payments (sale_id)
  └── land_pieces (via land_piece_ids[])
```

### Row Level Security (RLS)

All tables have RLS enabled. Policies check:
- User role (Owner/Manager/FieldStaff)
- User permissions (via `has_permission()` function)
- Ownership (via `created_by` fields)

---

## 🎨 Frontend Development

### Adding a New Page

1. **Create the page component**
   ```typescript
   // frontend/src/pages/MyNewPage.tsx
   import { useState, useEffect } from 'react'
   import { supabase } from '@/lib/supabase'
   import { useAuth } from '@/contexts/AuthContext'
   import { Card, CardContent } from '@/components/ui/card'
   
   export function MyNewPage() {
     const { user, hasPermission } = useAuth()
     const [data, setData] = useState([])
     
     useEffect(() => {
       fetchData()
     }, [])
     
     const fetchData = async () => {
       const { data, error } = await supabase
         .from('my_table')
         .select('*')
       
       if (error) {
         console.error('Error:', error)
         return
       }
       
       setData(data || [])
     }
     
     return (
       <div className="space-y-4 p-4">
         <h1 className="text-2xl font-bold">My New Page</h1>
         {/* Your content */}
       </div>
     )
   }
   ```

2. **Add route in App.tsx**
   ```typescript
   import { MyNewPage } from '@/pages/MyNewPage'
   
   // In AppRoutes component:
   <Route
     path="/my-new-page"
     element={
       <PermissionProtectedRoute permission="view_my_page" pageId="my-page">
         <MyNewPage />
       </PermissionProtectedRoute>
     }
   />
   ```

3. **Add to Sidebar navigation**
   ```typescript
   // frontend/src/components/layout/Sidebar.tsx
   {
     id: 'my-page',
     name: 'My New Page',
     icon: YourIcon,
     path: '/my-new-page',
     permission: 'view_my_page'
   }
   ```

### Creating Reusable Components

```typescript
// frontend/src/components/ui/my-component.tsx
import { cn } from '@/lib/utils'

interface MyComponentProps {
  className?: string
  children: React.ReactNode
  variant?: 'default' | 'primary'
}

export function MyComponent({ 
  className, 
  children, 
  variant = 'default' 
}: MyComponentProps) {
  return (
    <div
      className={cn(
        'base-styles',
        variant === 'primary' && 'primary-styles',
        className
      )}
    >
      {children}
    </div>
  )
}
```

### Working with Forms

```typescript
const [form, setForm] = useState({
  name: '',
  email: '',
  phone: ''
})

const [saving, setSaving] = useState(false)
const [errorMessage, setErrorMessage] = useState<string | null>(null)

const handleSubmit = async () => {
  setSaving(true)
  setErrorMessage(null)
  
  try {
    // Sanitize inputs
    const cleanName = sanitizeText(form.name)
    const cleanEmail = sanitizeEmail(form.email)
    const cleanPhone = sanitizePhone(form.phone)
    
    // Validate
    if (!cleanName || !cleanEmail) {
      setErrorMessage('يرجى ملء جميع الحقول المطلوبة')
      setSaving(false)
      return
    }
    
    // Save
    const { error } = await supabase
      .from('table')
      .insert([{
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        created_by: user?.id || null
      }])
    
    if (error) throw error
    
    // Success
    setSaving(false)
    // Close dialog or refresh data
  } catch (error: any) {
    setErrorMessage('خطأ في الحفظ')
    setSaving(false)
  }
}
```

### Responsive Design

Use Tailwind's responsive prefixes:
- `sm:` - Small screens (640px+)
- `md:` - Medium screens (768px+)
- `lg:` - Large screens (1024px+)
- `xl:` - Extra large (1280px+)

```typescript
<div className="
  grid 
  grid-cols-1        // Mobile: 1 column
  sm:grid-cols-2    // Small: 2 columns
  md:grid-cols-3    // Medium: 3 columns
  gap-4
">
```

### Mobile-First Approach

- Design for mobile first, then enhance for desktop
- Use `md:hidden` to hide on mobile, `hidden md:block` to show only on desktop
- Touch-friendly targets: minimum 44x44px
- Prevent zoom on input focus: `font-size: 16px` minimum

---

## 🗃️ Backend/Database Development

### Adding a New Table

1. **Create SQL migration file**
   ```sql
   -- ADD_NEW_TABLE.sql
   CREATE TABLE my_new_table (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     name VARCHAR(255) NOT NULL,
     description TEXT,
     created_by UUID REFERENCES users(id),
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );
   
   -- Add indexes
   CREATE INDEX idx_my_table_name ON my_new_table(name);
   
   -- Enable RLS
   ALTER TABLE my_new_table ENABLE ROW LEVEL SECURITY;
   
   -- RLS Policies
   CREATE POLICY "My table is viewable by authenticated users"
     ON my_new_table FOR SELECT
     TO authenticated
     USING (true);
   
   CREATE POLICY "Users can create my table records"
     ON my_new_table FOR INSERT
     TO authenticated
     WITH CHECK (true);
   
   -- Add audit trigger
   CREATE TRIGGER audit_my_table 
     AFTER INSERT OR UPDATE OR DELETE ON my_new_table
     FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
   ```

2. **Add TypeScript types**
   ```typescript
   // frontend/src/types/database.ts
   export interface MyNewTable {
     id: string
     name: string
     description: string | null
     created_by: string | null
     created_at: string
     updated_at: string
   }
   ```

### Adding User Tracking to Existing Table

```sql
-- Add created_by column if missing
ALTER TABLE my_table 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- Create index
CREATE INDEX IF NOT EXISTS idx_my_table_created_by ON my_table(created_by);

-- Add audit trigger if missing
CREATE TRIGGER IF NOT EXISTS audit_my_table 
  AFTER INSERT OR UPDATE OR DELETE ON my_table
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
```

### Creating Database Functions

```sql
CREATE OR REPLACE FUNCTION my_custom_function(param1 TEXT, param2 INTEGER)
RETURNS TABLE(result1 TEXT, result2 INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER  -- Runs with creator's privileges
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    param1 as result1,
    param2 * 2 as result2;
END;
$$;
```

### RLS Policy Patterns

**View All (Authenticated Users)**
```sql
CREATE POLICY "Table is viewable by authenticated users"
  ON table_name FOR SELECT
  TO authenticated
  USING (true);
```

**Role-Based Access**
```sql
CREATE POLICY "Owners can manage table"
  ON table_name FOR ALL
  TO authenticated
  USING (get_user_role() = 'Owner')
  WITH CHECK (get_user_role() = 'Owner');
```

**Owner-Based Access**
```sql
CREATE POLICY "Users can view own records"
  ON table_name FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());
```

---

## 🎨 UI/UX Guidelines

### Design Principles

1. **RTL (Right-to-Left) Support**
   - All text is Arabic (RTL)
   - Use `dir="rtl"` in HTML
   - Icons and layouts adapt for RTL

2. **Mobile-First**
   - Design for mobile, enhance for desktop
   - Touch-friendly buttons (min 44x44px)
   - Prevent zoom on input focus

3. **Consistency**
   - Use same components across pages
   - Consistent spacing (Tailwind scale)
   - Consistent colors (theme variables)

### Color Scheme

```css
/* Primary colors */
--primary: Blue (#3B82F6)
--success: Green (#10B981)
--warning: Orange (#F59E0B)
--destructive: Red (#EF4444)

/* Text colors */
--foreground: Dark text
--muted-foreground: Gray text
```

### Typography

- **Font**: Tajawal (Arabic font)
- **Sizes**: 
  - Mobile: `text-xs` (12px) to `text-sm` (14px)
  - Desktop: `text-base` (16px) to `text-lg` (18px)
  - Headings: `text-xl` to `text-3xl`

### Spacing

Use Tailwind spacing scale:
- `p-2` = 8px
- `p-3` = 12px
- `p-4` = 16px
- `p-6` = 24px

### Component Patterns

**Cards**
```typescript
<Card>
  <CardContent className="p-4">
    {/* Content */}
  </CardContent>
</Card>
```

**Buttons**
```typescript
<Button variant="default" size="sm">
  Action
</Button>
```

**Dialogs**
```typescript
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
    {/* Content */}
    <DialogFooter>
      <Button onClick={handleSave}>Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Error Messages

- **Inline errors**: Show below input fields
- **Toast notifications**: For success/error messages
- **Dialog errors**: Show in dialog content area
- **Always use Arabic** for error messages

### Loading States

```typescript
if (loading) {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-muted-foreground">جاري التحميل...</div>
    </div>
  )
}
```

---

## 🔐 Security & Permissions

### Permission System

Permissions are defined in `roles` table and checked via `hasPermission()`:

```typescript
const { hasPermission } = useAuth()

if (hasPermission('edit_sales')) {
  // Show edit button
}
```

### Common Permissions

- `view_dashboard`
- `view_land`, `edit_land`, `delete_land`
- `view_clients`, `edit_clients`, `delete_clients`
- `view_sales`, `edit_sales`, `edit_prices`
- `view_installments`, `edit_installments`
- `view_payments`, `record_payments`
- `view_financial`, `view_profit`
- `manage_users`
- `view_audit_logs`

### Input Sanitization

**Always sanitize** before database operations:

```typescript
import { 
  sanitizeText,      // General text
  sanitizeEmail,     // Email addresses
  sanitizePhone,     // Phone numbers
  sanitizeCIN,       // CIN/ID numbers
  sanitizeNotes      // Long text/notes
} from '@/lib/sanitize'

const clean = sanitizeText(userInput)
```

### User Tracking

**Always set user tracking fields**:

```typescript
// For new records
const data = {
  ...otherFields,
  created_by: user?.id || null  // or recorded_by, submitted_by
}

// For updates (don't overwrite created_by)
const updateData = {
  ...changedFields
  // Don't include created_by
}
```

---

## 🧪 Testing & Debugging

### Development Tools

1. **React DevTools** - Component inspection
2. **Supabase Dashboard** - Database inspection
3. **Browser DevTools** - Network, console, storage

### Common Debugging Steps

1. **Check Console** for errors
2. **Check Network Tab** for failed requests
3. **Check Supabase Logs** for RLS policy issues
4. **Verify User Permissions** in AuthContext
5. **Check Database** for data issues

### Testing Database Queries

Use Supabase SQL Editor to test queries:

```sql
-- Test query
SELECT * FROM sales 
WHERE created_by = 'user-id'
LIMIT 10;

-- Check RLS policies
SELECT * FROM pg_policies 
WHERE tablename = 'sales';
```

### Common Issues

**RLS Policy Errors**
- Error: `new row violates row-level security policy`
- Fix: Check RLS policies, ensure user has permission

**Missing User Tracking**
- Error: `created_by` is null
- Fix: Always set `created_by: user?.id || null` when creating records

**Type Errors**
- Error: Type mismatch
- Fix: Check TypeScript types in `database.ts`

---

## 🚀 Deployment

### Vercel Deployment

1. **Connect GitHub repository** to Vercel
2. **Set build settings**:
   - Framework: Vite
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. **Add environment variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. **Deploy**

### Database Migrations

1. **Test migrations locally** in Supabase SQL Editor
2. **Run migrations** in production Supabase project
3. **Verify** tables and policies are created correctly

---

## 📝 Common Tasks

### Adding a New Field to a Table

1. **Create migration SQL**
   ```sql
   ALTER TABLE table_name 
   ADD COLUMN new_field_name TYPE DEFAULT value;
   ```

2. **Update TypeScript types**
   ```typescript
   export interface TableName {
     // ... existing fields
     new_field_name: string | null
   }
   ```

3. **Update frontend forms** to include new field
4. **Update queries** to select new field

### Adding a New Permission

1. **Add to roles table**
   ```sql
   UPDATE roles 
   SET permissions = jsonb_set(
     permissions, 
     '{new_permission}', 
     'true'::jsonb
   )
   WHERE name = 'Owner';
   ```

2. **Use in frontend**
   ```typescript
   if (hasPermission('new_permission')) {
     // Show feature
   }
   ```

### Modifying UI Components

1. **Find component** in `frontend/src/components/ui/`
2. **Make changes** (preserve props interface)
3. **Test** across all pages using the component
4. **Check mobile responsiveness**

### Adding Notifications

```typescript
import { showNotification } from '@/components/ui/notification'

// Success
showNotification('تم الحفظ بنجاح', 'success')

// Error
showNotification('حدث خطأ', 'error')

// Warning
showNotification('تحذير', 'warning')

// Info
showNotification('معلومة', 'info')
```

---

## 🔧 Troubleshooting

### Build Errors

**TypeScript Errors**
- Run `npm run build` to see all errors
- Fix type mismatches
- Add missing type definitions

**Import Errors**
- Check import paths (use `@/` alias)
- Verify file exists
- Check export statements

### Runtime Errors

**"Cannot read property of undefined"**
- Add null checks: `data?.property`
- Use optional chaining: `data?.nested?.value`

**"Permission denied"**
- Check RLS policies
- Verify user has required permission
- Check `hasPermission()` calls

**"Column does not exist"**
- Run database migration
- Check column name spelling
- Verify table schema

### Database Issues

**Data not saving**
- Check RLS policies allow INSERT
- Verify `created_by` is set
- Check for validation errors

**Data not loading**
- Check RLS policies allow SELECT
- Verify user has permission
- Check query syntax

---

## 📚 Additional Resources

### Documentation Files

- `README.md` - Project overview
- `supabase_schema.sql` - Complete database schema
- `ENSURE_USER_TRACKING_COMPLETE.sql` - User tracking setup
- `RESET_DATABASE_KEEP_USER.sql` - Database reset script

### External Resources

- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Supabase Docs](https://supabase.com/docs)
- [React Router Docs](https://reactrouter.com)

### Code Examples

Check existing pages for patterns:
- **Form handling**: `Clients.tsx`
- **Complex state**: `SalesNew.tsx`
- **Data fetching**: `Installments.tsx`
- **Permissions**: `Users.tsx`

---

## 🎯 Best Practices

1. **Always sanitize user inputs**
2. **Set user tracking fields** (`created_by`, `recorded_by`)
3. **Check permissions** before showing features
4. **Handle errors gracefully** with user-friendly messages
5. **Test on mobile** - most users are on mobile
6. **Use TypeScript** - catch errors early
7. **Follow existing patterns** - consistency is key
8. **Document complex logic** with comments
9. **Keep components small** - single responsibility
10. **Optimize queries** - use indexes, limit results

---

## 📞 Support

For issues or questions:
1. Check this documentation
2. Review existing code for patterns
3. Check Supabase logs
4. Review browser console errors

---

**Last Updated**: January 2026
**Version**: 1.0

