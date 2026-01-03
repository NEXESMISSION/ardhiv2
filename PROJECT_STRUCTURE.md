# Project Structure Guide

## 📁 Directory Structure

```
FULLLANDDEV/
├── frontend/                    # React frontend application
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   │   ├── layout/         # Layout components (Sidebar, MainLayout)
│   │   │   └── ui/             # Base UI components (Button, Card, Table, etc.)
│   │   ├── contexts/           # React contexts
│   │   │   └── AuthContext.tsx # Authentication & permissions
│   │   ├── lib/                # Utility libraries
│   │   │   ├── supabase.ts     # Supabase client initialization
│   │   │   ├── sanitize.ts     # Input sanitization functions
│   │   │   ├── throttle.ts    # Throttle/debounce utilities
│   │   │   └── utils.ts        # General helper functions
│   │   ├── pages/              # Page components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── LandManagement.tsx
│   │   │   ├── Clients.tsx
│   │   │   ├── SalesNew.tsx
│   │   │   ├── Installments.tsx
│   │   │   ├── FinancialNew.tsx
│   │   │   ├── Debts.tsx
│   │   │   ├── Users.tsx
│   │   │   └── Security.tsx
│   │   ├── types/              # TypeScript type definitions
│   │   │   └── database.ts     # Database types
│   │   ├── App.tsx             # Main app component with routing
│   │   └── main.tsx            # Entry point
│   └── package.json
│
├── SQL Files/                   # Database migrations and utilities
│   ├── supabase_schema.sql     # Main database schema (run first!)
│   ├── security_database_fixes.sql # Security enhancements
│   ├── create_debts_table.sql  # Debt management feature
│   ├── add_debt_payments_table.sql # Debt payment tracking
│   ├── add_real_estate_tax_number.sql # Real estate tax field
│   ├── database_full_reset_keep_users.sql # Reset utility
│   └── database_full_reset_with_test_data.sql # Reset with test data
│
└── Documentation/
    ├── README.md                # Main project documentation
    ├── SQL_MIGRATIONS_README.md # SQL migration guide
    ├── SECURITY_FIXES_COMPLETE.md # Security documentation
    ├── CLEANUP_SUMMARY.md      # Cleanup summary
    └── PROJECT_STRUCTURE.md    # This file
```

## 🔑 Key Files

### Frontend Entry Points
- `frontend/src/main.tsx` - Application entry point
- `frontend/src/App.tsx` - Routing and layout setup

### Core Utilities
- `frontend/src/lib/sanitize.ts` - Input sanitization (XSS protection)
- `frontend/src/lib/throttle.ts` - Request throttling/debouncing
- `frontend/src/lib/supabase.ts` - Supabase client configuration

### Database
- `supabase_schema.sql` - Complete database schema (source of truth)
- `security_database_fixes.sql` - Security constraints and triggers

## 📝 SQL File Organization

All SQL files follow a consistent structure:

```sql
-- ============================================
-- TITLE AND PURPOSE
-- Brief description
-- ============================================
-- Dependencies: List required files
-- Usage: When to run this script
-- ============================================

-- Step-by-step operations with comments
-- Verification queries at the end
```

## 🎯 For Future Developers

- **Don't modify** `supabase_schema.sql` directly - create new migrations
- **Follow the structure** in existing SQL files for new migrations
- **Document clearly** - future developers need to understand the changes
- **Test migrations** in development before production

