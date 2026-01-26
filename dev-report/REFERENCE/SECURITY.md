# Security Implementation Guide

## 🎯 Overview

Complete security guide for implementing secure authentication, authorization, and data protection.

## 🔐 Authentication Setup

### Supabase Auth Configuration

```typescript
// lib/supabase.ts

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
```

### Auth Context

```typescript
// contexts/AuthContext.tsx

import { createContext, useContext, useEffect, useState } from 'react'
import { User as SupabaseUser, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { User } from '@/types/database'

interface AuthContextType {
  user: SupabaseUser | null
  profile: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  hasPermission: (permission: string) => boolean
  isOwner: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [profile, setProfile] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        
        if (session?.user) {
          await loadProfile(session.user.id)
        } else {
          setProfile(null)
          setLoading(false)
        }
      }
    )
    
    return () => subscription.unsubscribe()
  }, [])
  
  async function loadProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()
      
      if (error) throw error
      setProfile(data)
    } catch (error) {
      console.error('Error loading profile:', error)
    } finally {
      setLoading(false)
    }
  }
  
  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    if (error) throw error
  }
  
  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }
  
  function hasPermission(permission: string): boolean {
    if (!profile) return false
    if (profile.role === 'Owner') return true
    return profile.permissions[permission] === true
  }
  
  const isOwner = profile?.role === 'Owner' ?? false
  
  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        signIn,
        signOut,
        hasPermission,
        isOwner,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
```

## 🛡️ Authorization Patterns

### Permission Checks

```typescript
// lib/permissions.ts

export const PERMISSIONS = {
  // Dashboard
  VIEW_DASHBOARD: 'view_dashboard',
  
  // Land
  VIEW_LAND: 'view_land',
  EDIT_LAND: 'edit_land',
  DELETE_LAND: 'delete_land',
  
  // Clients
  VIEW_CLIENTS: 'view_clients',
  EDIT_CLIENTS: 'edit_clients',
  DELETE_CLIENTS: 'delete_clients',
  
  // Sales
  VIEW_SALES: 'view_sales',
  CREATE_SALES: 'create_sales',
  EDIT_SALES: 'edit_sales',
  DELETE_SALES: 'delete_sales',
  
  // Financial
  VIEW_FINANCIAL: 'view_financial',
  VIEW_PROFIT: 'view_profit',
  
  // Users
  MANAGE_USERS: 'manage_users',
} as const

export function checkPermission(
  profile: User | null,
  permission: string
): boolean {
  if (!profile) return false
  if (profile.role === 'Owner') return true
  return profile.permissions[permission] === true
}
```

### Protected Routes

```typescript
// components/ProtectedRoute.tsx

import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { LoadingProgress } from '@/components/ui/loading-progress'

interface ProtectedRouteProps {
  children: React.ReactNode
  permission?: string
  requireOwner?: boolean
}

export function ProtectedRoute({
  children,
  permission,
  requireOwner = false,
}: ProtectedRouteProps) {
  const { user, profile, loading, hasPermission, isOwner } = useAuth()
  
  if (loading) {
    return <LoadingProgress message="جاري التحميل..." />
  }
  
  if (!user || !profile) {
    return <Navigate to="/login" replace />
  }
  
  if (requireOwner && !isOwner) {
    return <Navigate to="/" replace />
  }
  
  if (permission && !hasPermission(permission)) {
    return <Navigate to="/" replace />
  }
  
  return <>{children}</>
}
```

## 🔒 Input Validation

```typescript
// lib/validation.ts

import { ValidationError } from './errors'

export function validateEmail(email: string): void {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    throw new ValidationError('Invalid email format', 'email')
  }
}

export function validateRequired(value: any, fieldName: string): void {
  if (value === null || value === undefined || value === '') {
    throw new ValidationError(`${fieldName} is required`, fieldName)
  }
}

export function validatePositiveNumber(value: number, fieldName: string): void {
  if (typeof value !== 'number' || isNaN(value) || value < 0) {
    throw new ValidationError(`${fieldName} must be a positive number`, fieldName)
  }
}

export function validatePhone(phone: string): void {
  const phoneRegex = /^[0-9+\-\s()]+$/
  if (!phoneRegex.test(phone)) {
    throw new ValidationError('Invalid phone format', 'phone')
  }
}
```

## 🚨 Security Best Practices

### 1. Never Expose Service Role Key

```typescript
// ❌ BAD - Never do this
const supabase = createClient(url, SERVICE_ROLE_KEY) // Exposed in client!

// ✅ GOOD - Use anon key
const supabase = createClient(url, ANON_KEY)
```

### 2. Always Validate on Server

```typescript
// Use RLS policies for server-side validation
// Never trust client-side validation alone
```

### 3. Sanitize Inputs

```typescript
// lib/sanitize.ts

export function sanitizeString(input: string): string {
  return input.trim().replace(/[<>]/g, '')
}

export function sanitizeNumber(input: string): number {
  const num = parseFloat(input)
  if (isNaN(num)) throw new ValidationError('Invalid number')
  return num
}
```

### 4. Rate Limiting

```typescript
// Implement rate limiting for sensitive operations
// Use Supabase Edge Functions or external service
```

## ✅ Security Checklist

- [ ] RLS policies enabled on all tables
- [ ] Authentication implemented
- [ ] Authorization checks in place
- [ ] Input validation on all forms
- [ ] Input sanitization
- [ ] Error messages don't leak sensitive info
- [ ] Service role key never exposed
- [ ] HTTPS only in production
- [ ] Session management secure
- [ ] Password requirements enforced

## 📝 Next Steps

1. Implement authentication
2. Setup RLS policies
3. Add permission checks
4. Add input validation
5. Test security thoroughly

