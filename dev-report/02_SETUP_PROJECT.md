# Setup Project - Step by Step

## 🎯 Goal

Create the project from scratch. Follow each step exactly.

## ⏱️ Time: 1-2 hours

## 📋 Step 1: Install Node.js

1. Go to https://nodejs.org
2. Download and install Node.js (version 18 or higher)
3. Open terminal/command prompt
4. Type: `node --version`
5. Should show version number (like v18.17.0)

✅ **Done when**: You see a version number

## 📋 Step 2: Create Project Folder

1. Open terminal/command prompt
2. Go to where you want the project (like Desktop)
3. Type these commands:

```bash
mkdir FULLLANDDEV
cd FULLLANDDEV
```

✅ **Done when**: You're in the FULLLANDDEV folder

## 📋 Step 3: Create Frontend Project

Still in the FULLLANDDEV folder, type:

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

✅ **Done when**: No errors, folder "frontend" created

## 📋 Step 4: Install Required Packages

Still in the frontend folder, type:

```bash
npm install @supabase/supabase-js@^2.89.0
npm install @tanstack/react-query@^5.90.16
npm install react-router-dom@^7.11.0
npm install date-fns@^4.1.0
npm install lucide-react@^0.562.0
npm install class-variance-authority@^0.7.1
npm install clsx@^2.1.1
npm install tailwind-merge@^3.4.0
npm install -D @types/node@^24.10.1
npm install -D tailwindcss@^4.1.18
npm install -D @tailwindcss/vite@^4.1.18
```

✅ **Done when**: All packages installed (no errors)

## 📋 Step 5: Create Folders

Still in the frontend folder, type:

```bash
cd src
mkdir -p components/ui components/layout components/features
mkdir -p contexts hooks lib services pages types
```

✅ **Done when**: All folders created

## 📋 Step 6: Create Configuration Files

### 6.1 Create `vite.config.ts`

In the `frontend` folder, create file `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

### 6.2 Update `tsconfig.json`

Open `tsconfig.json` and make sure it has:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

### 6.3 Create `.env` file

In the `frontend` folder, create a file named `.env` (just `.env`, no extension):

Put this inside:
```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

(We'll fill these in Step 8 - leave them empty for now)

✅ **Done when**: All config files created

## 📋 Step 7: Create Supabase Account

1. Go to https://supabase.com
2. Click "Sign Up" (free account)
3. Create account
4. Click "New Project"
5. Fill in:
   - Name: "FULLLANDDEV" (or any name)
   - Database Password: (choose a strong password - save it!)
   - Region: (choose closest to you)
6. Click "Create new project"
7. Wait 2-3 minutes for project to be created

✅ **Done when**: Project created, you see the dashboard

## 📋 Step 8: Get Supabase Credentials

1. In Supabase dashboard, click "Settings" (gear icon)
2. Click "API"
3. Copy these two values:
   - **Project URL** (looks like: https://xxxxx.supabase.co)
   - **anon public key** (long string)

4. Open `frontend/.env` file
5. Paste them:

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

✅ **Done when**: `.env` file has both values

## 📋 Step 9: Create Database

1. In Supabase dashboard, click "SQL Editor" (in left sidebar)
2. Click "New query" button
3. Open `REFERENCE/DATABASE_SCHEMA.md` from this dev-report folder
4. Find the big code block that starts with ````sql`
5. Copy ALL the SQL code (everything inside the code block)
6. Go back to Supabase SQL Editor
7. Paste the code
8. Click "Run" button (or press Ctrl+Enter)
9. Wait a few seconds
10. Should see "Success" message at the bottom

**If you see errors**: Make sure you copied ALL the code, including the first and last lines.

✅ **Done when**: Database created, no errors

## 📋 Step 10: Create First Owner User

1. In Supabase dashboard, click "Authentication"
2. Click "Users"
3. Click "Add user" → "Create new user"
4. Enter:
   - Email: your-email@example.com
   - Password: (choose a password)
   - Check "Auto Confirm User"
5. Click "Create user"
6. **Copy the User ID** (looks like: 123e4567-e89b-12d3-a456-426614174000)

7. Click "Table Editor" in sidebar
8. Click "users" table
9. Click "Insert row"
10. Fill in:
    - `id`: Paste the User ID from step 6
    - `name`: Your name
    - `email`: Same email as step 4
    - `role`: Select "Owner"
    - `status`: Select "Active"
11. Click "Save"

✅ **Done when**: Owner user created in users table

## 📋 Step 11: Create Basic Files

### 11.1 Create `src/lib/supabase.ts`

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

### 11.2 Create `src/types/database.ts`

1. Open `REFERENCE/TYPE_DEFINITIONS.md` from this dev-report folder
2. Copy ALL the code (the big code block)
3. Create file `src/types/database.ts`
4. Paste the code
5. Save

### 11.3 Update `src/App.tsx`

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Login } from './pages/Login'
import { Home } from './pages/Home'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
```

### 11.4 Create `src/pages/Login.tsx`

```typescript
export function Login() {
  return <div>Login Page - Will build this later</div>
}
```

### 11.5 Create `src/pages/Home.tsx`

```typescript
export function Home() {
  return <div>Home Page - Will build this later</div>
}
```

✅ **Done when**: All files created, no errors

## 📋 Step 12: Test It Works

1. In terminal, make sure you're in `frontend` folder
2. Type: `npm run dev`
3. Should see: "VITE ready" and a URL (like http://localhost:5173)
4. Open that URL in browser
5. Should see a page (even if it's just "Home Page")

✅ **Done when**: Browser shows a page, no errors

## ✅ Setup Complete!

You now have:
- ✅ Project created
- ✅ All packages installed
- ✅ Database created
- ✅ First Owner user created
- ✅ Basic files created
- ✅ App runs

## 🎯 What's Next?

Go to **`03_BUILD_FEATURES.md`** and start building features!

## ❓ Troubleshooting

### "npm command not found"
- Node.js not installed properly
- Reinstall Node.js from nodejs.org

### "Cannot find module"
- Run `npm install` again in frontend folder

### "Supabase connection error"
- Check `.env` file has correct values
- Make sure Supabase project is active

### "Database error"
- Make sure you ran the SQL schema
- Check Supabase dashboard → Database → Tables (should see tables)

### Still stuck?
- Check `REFERENCE/` folder for more details
- Make sure you followed every step

