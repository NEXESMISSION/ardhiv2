# FULLLANDDEV - Land & Real Estate Management System

A comprehensive land and real estate management system built with React, TypeScript, Tailwind CSS, and Supabase.

## 🚀 Features

- **Dashboard** - Overview of land, sales, clients, and overdue installments
- **Land Management** - Manage land batches and individual pieces with dual pricing
- **Client Management** - Track clients, their sales history, and contact info
- **Sales Management** - Create sales (full payment or installments), auto-calculate profit
- **Installments & Payments** - Track monthly installments, record payments, handle stacking
- **Financial Reports** - Revenue, profit analysis, payment tracking
- **Debt Management** - Track and manage debts with payment history
- **User Management** - Role-based access control (Owner/Manager/FieldStaff)
- **Security & Audit Logs** - Activity tracking, RLS protection

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS v4
- **UI Components**: Custom components (shadcn/ui style)
- **Icons**: Lucide React
- **Backend**: Supabase (Auth + PostgreSQL)
- **Routing**: React Router v6

## 📦 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account

### 1. Set Up Supabase Database

1. Go to your Supabase project dashboard
2. Open **SQL Editor**
3. Run the contents of `supabase_schema.sql` to create all tables and RLS policies
4. Run `security_database_fixes.sql` for security enhancements
5. (Optional) Run `create_debts_table.sql` and `add_debt_payments_table.sql` if using debt management

**See `SQL_MIGRATIONS_README.md` for detailed migration guide**

### 2. Configure Environment Variables

```bash
cd frontend
cp .env.example .env
```

Edit `.env` with your Supabase credentials:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### 3. Install Dependencies

```bash
cd frontend
npm install
```

### 4. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### 5. Create First User

1. Create a user in Supabase Auth dashboard
2. Add user record to `users` table with role `Owner`
3. Login with that user

## 📁 Project Structure

```
FULLLANDDEV/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/         # Sidebar, MainLayout
│   │   │   └── ui/             # Button, Card, Table, etc.
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx # Authentication & permissions
│   │   ├── lib/
│   │   │   ├── supabase.ts     # Supabase client
│   │   │   ├── sanitize.ts     # Input sanitization utilities
│   │   │   ├── throttle.ts     # Throttle/debounce utilities
│   │   │   └── utils.ts        # Helper functions
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── LandManagement.tsx
│   │   │   ├── Clients.tsx
│   │   │   ├── SalesNew.tsx
│   │   │   ├── Installments.tsx
│   │   │   ├── FinancialNew.tsx
│   │   │   ├── Debts.tsx
│   │   │   ├── Users.tsx
│   │   │   └── Security.tsx
│   │   ├── types/
│   │   │   └── database.ts     # TypeScript types
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
├── supabase_schema.sql          # Main database schema
├── security_database_fixes.sql # Security enhancements
├── SQL_MIGRATIONS_README.md     # SQL migrations guide
├── SECURITY_FIXES_COMPLETE.md   # Security fixes documentation
└── README.md                    # This file
```

## 🔐 Role Permissions

| Feature | Owner | Manager | FieldStaff |
|---------|-------|---------|------------|
| View Dashboard | ✅ | ✅ | ✅ |
| Manage Land | ✅ | ✅ | View only |
| Delete Land | ✅ | ❌ | ❌ |
| View Clients | ✅ | ✅ | ✅ |
| Create Sales | ✅ | ✅ | ✅ |
| Edit Prices | ✅ | ❌ | ❌ |
| View Profit | ✅ | ❌ | ❌ |
| Financial Page | ✅ | ✅ | ❌ |
| Manage Users | ✅ | ❌ | ❌ |
| Audit Logs | ✅ | ✅ | ❌ |
| Manage Debts | ✅ | ✅ | ✅ |

## 💼 Business Rules

- **Dual Pricing**: Full payment price differs from installment price
- **Multi-Land Sales**: Clients can purchase multiple pieces in one sale
- **Small Advance**: Refundable reservation deposit
- **Big Advance**: Initial payment to start installment plan
- **Stacked Installments**: Unpaid amounts carry over to next month
- **Profit Calculation**: Automatic based on purchase cost vs selling price

## 🔒 Security Features

- ✅ **Input Sanitization** - All user inputs sanitized
- ✅ **Row Level Security (RLS)** - Enabled on all tables
- ✅ **Password Encryption** - Via Supabase Auth (bcrypt)
- ✅ **Audit Logging** - For sensitive operations
- ✅ **Role-Based Access Control** - At both RLS and application level
- ✅ **Request Throttling** - Debouncing on search inputs
- ✅ **Authorization Checks** - Before all write operations
- ✅ **Database Constraints** - Input validation at database level

## 📝 SQL Files

All SQL migration files are documented with clear structure for future developers. See `SQL_MIGRATIONS_README.md` for:
- Migration order
- File descriptions
- Usage instructions
- Best practices

**Key SQL Files:**
- `supabase_schema.sql` - Main database schema (run first!)
- `security_database_fixes.sql` - Security enhancements
- `create_debts_table.sql` - Debt management feature
- `add_debt_payments_table.sql` - Debt payment tracking
- Utility scripts for database resets (well documented)

## 🐛 Troubleshooting

### Database Issues
- Check `SQL_MIGRATIONS_README.md` for migration order
- Verify RLS policies are enabled
- Check audit triggers are active

### Authentication Issues
- Verify Supabase credentials in `.env`
- Check user exists in both `auth.users` and `users` table
- Verify role is set correctly

## 📄 License

Private - All rights reserved
