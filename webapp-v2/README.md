# Webapp V2 - Clean Land Management System

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up database:**
   - Open Supabase Dashboard → SQL Editor
   - Run the SQL from `database_schema.sql`
   - This creates all necessary tables and RLS policies

3. **Environment variables:**
   - The `.env` file is already created with your Supabase credentials
   - **Never commit `.env` to version control** (already in `.gitignore`)

4. **Run dev server:**
   ```bash
   npm run dev
   ```

5. **Open browser:**
   - http://localhost:3000

## 📁 Project Structure

```
webapp-v2/
├── src/
│   ├── components/
│   │   └── ui/          # Reusable UI components
│   ├── lib/
│   │   └── supabase.ts  # Supabase client
│   ├── pages/
│   │   └── Land.tsx     # Main Land page (clean & organized)
│   ├── App.tsx
│   └── main.tsx
├── .env                  # Environment variables (create this)
└── package.json
```

## ✨ Features

- ✅ Create/Edit/Delete land batches
- ✅ Manage installment offers per batch
- ✅ View pieces for each batch
- ✅ Clean, organized code structure
- ✅ Easy to modify and extend

## 🎨 Tech Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS v3
- Supabase
