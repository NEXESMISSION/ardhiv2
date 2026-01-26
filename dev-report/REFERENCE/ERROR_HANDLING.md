# Error Handling Patterns

## 🎯 Overview

Robust error handling patterns for the entire application. Use these patterns consistently.

## 📋 Error Types

```typescript
// lib/errors.ts

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public field?: string) {
    super(message, 'VALIDATION_ERROR', 400)
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404)
    this.name = 'NotFoundError'
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 'FORBIDDEN', 403)
    this.name = 'ForbiddenError'
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, public originalError?: any) {
    super(message, 'DATABASE_ERROR', 500)
    this.name = 'DatabaseError'
  }
}
```

## 🔧 Error Handler Utility

```typescript
// lib/errorHandler.ts

import { AppError, ValidationError, NotFoundError, UnauthorizedError, ForbiddenError, DatabaseError } from './errors'

export function handleError(error: unknown): AppError {
  // Already an AppError
  if (error instanceof AppError) {
    return error
  }
  
  // Supabase errors
  if (error && typeof error === 'object' && 'code' in error) {
    const supabaseError = error as any
    
    if (supabaseError.code === 'PGRST116') {
      return new NotFoundError('Resource')
    }
    
    if (supabaseError.code === '42501') {
      return new ForbiddenError('Insufficient permissions')
    }
    
    if (supabaseError.code === '23505') {
      return new ValidationError('Duplicate entry', supabaseError.details)
    }
    
    return new DatabaseError(supabaseError.message || 'Database error', error)
  }
  
  // Standard Error
  if (error instanceof Error) {
    return new AppError(error.message, 'UNKNOWN_ERROR', 500)
  }
  
  // Unknown error
  return new AppError('An unknown error occurred', 'UNKNOWN_ERROR', 500)
}

export function getErrorMessage(error: unknown): string {
  const appError = handleError(error)
  return appError.message
}
```

## 🎨 Error Display Components

```typescript
// components/ui/ErrorDisplay.tsx

import { AlertCircle } from 'lucide-react'
import { AppError } from '@/lib/errors'

interface ErrorDisplayProps {
  error: AppError | Error | unknown
  className?: string
}

export function ErrorDisplay({ error, className }: ErrorDisplayProps) {
  const message = error instanceof Error ? error.message : 'An error occurred'
  
  return (
    <div className={`bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 ${className}`}>
      <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-red-800 font-medium text-sm">{message}</p>
      </div>
    </div>
  )
}
```

## 🔄 Service Error Handling

```typescript
// services/saleService.ts

import { supabase } from '@/lib/supabase'
import { handleError, NotFoundError, ValidationError } from '@/lib/errorHandler'
import type { Sale } from '@/types/database'

export class SaleService {
  static async getSale(id: string): Promise<Sale> {
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .eq('id', id)
        .single()
      
      if (error) throw error
      if (!data) throw new NotFoundError('Sale')
      
      return data
    } catch (error) {
      throw handleError(error)
    }
  }
  
  static async createSale(saleData: Partial<Sale>): Promise<Sale> {
    try {
      // Validation
      if (!saleData.client_id) {
        throw new ValidationError('Client is required', 'client_id')
      }
      
      if (!saleData.land_piece_ids || saleData.land_piece_ids.length === 0) {
        throw new ValidationError('At least one land piece is required', 'land_piece_ids')
      }
      
      const { data, error } = await supabase
        .from('sales')
        .insert(saleData)
        .select()
        .single()
      
      if (error) throw error
      if (!data) throw new Error('Failed to create sale')
      
      return data
    } catch (error) {
      throw handleError(error)
    }
  }
}
```

## 🎣 React Query Error Handling

```typescript
// hooks/useSale.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { SaleService } from '@/services/saleService'
import { handleError } from '@/lib/errorHandler'
import { useNotification } from '@/hooks/useNotification'

export function useSale(id: string) {
  const notification = useNotification()
  
  return useQuery({
    queryKey: ['sale', id],
    queryFn: async () => {
      try {
        return await SaleService.getSale(id)
      } catch (error) {
        const appError = handleError(error)
        notification.error(appError.message)
        throw appError
      }
    },
    enabled: !!id,
  })
}

export function useCreateSale() {
  const queryClient = useQueryClient()
  const notification = useNotification()
  
  return useMutation({
    mutationFn: SaleService.createSale,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      notification.success('Sale created successfully')
    },
    onError: (error) => {
      const appError = handleError(error)
      notification.error(appError.message)
    },
  })
}
```

## 🛡️ Try-Catch Patterns

```typescript
// Good pattern
async function handleAction() {
  try {
    setLoading(true)
    setError(null)
    
    const result = await someService.doSomething()
    
    // Success handling
    notification.success('Action completed')
    return result
  } catch (error) {
    const appError = handleError(error)
    setError(appError.message)
    notification.error(appError.message)
  } finally {
    setLoading(false)
  }
}

// Bad pattern (don't do this)
async function handleAction() {
  const result = await someService.doSomething() // No error handling!
  return result
}
```

## 📊 Error Logging

```typescript
// lib/logger.ts

export function logError(error: unknown, context?: string) {
  const appError = handleError(error)
  
  console.error('Error:', {
    message: appError.message,
    code: appError.code,
    statusCode: appError.statusCode,
    context,
    timestamp: new Date().toISOString(),
  })
  
  // In production, send to error tracking service
  if (import.meta.env.PROD) {
    // Send to Sentry, LogRocket, etc.
  }
}
```

## ✅ Best Practices

1. **Always handle errors** - Never let errors bubble up unhandled
2. **Use try-catch** - Wrap async operations
3. **Provide user feedback** - Show error messages
4. **Log errors** - For debugging
5. **Validate inputs** - Prevent errors before they happen
6. **Use typed errors** - Better error handling
7. **Handle network errors** - Connection issues
8. **Handle permission errors** - Access denied

## 🎯 Error Handling Checklist

- [ ] Create error types
- [ ] Create error handler utility
- [ ] Create error display component
- [ ] Add error handling to all services
- [ ] Add error handling to all hooks
- [ ] Add error handling to all components
- [ ] Add error logging
- [ ] Test error scenarios

