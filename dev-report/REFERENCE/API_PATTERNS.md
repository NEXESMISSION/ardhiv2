# API Patterns & Best Practices

## 🎯 Overview

Standardized patterns for all API calls, data fetching, and state management using React Query.

## 📋 React Query Setup

```typescript
// lib/queryClient.ts

import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 10, // 10 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
})
```

## 🔄 Query Patterns

### Basic Query

```typescript
// hooks/useSales.ts

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Sale } from '@/types/database'

export function useSales(filters?: { status?: string }) {
  return useQuery({
    queryKey: ['sales', filters],
    queryFn: async () => {
      let query = supabase
        .from('sales')
        .select('*, client:clients(*), land_pieces:land_pieces(*)')
      
      if (filters?.status) {
        query = query.eq('status', filters.status)
      }
      
      const { data, error } = await query.order('created_at', { ascending: false })
      
      if (error) throw error
      return data as Sale[]
    },
  })
}
```

### Query with Pagination

```typescript
// hooks/usePaginatedSales.ts

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Sale } from '@/types/database'

interface PaginationParams {
  page: number
  limit: number
}

export function usePaginatedSales(params: PaginationParams) {
  return useQuery({
    queryKey: ['sales', 'paginated', params],
    queryFn: async () => {
      const from = (params.page - 1) * params.limit
      const to = from + params.limit - 1
      
      const { data, error, count } = await supabase
        .from('sales')
        .select('*, client:clients(*)', { count: 'exact' })
        .range(from, to)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      
      return {
        data: data as Sale[],
        total: count || 0,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil((count || 0) / params.limit),
      }
    },
  })
}
```

## 🔧 Mutation Patterns

### Create Mutation

```typescript
// hooks/useCreateSale.ts

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SaleService } from '@/services/saleService'
import { useNotification } from '@/hooks/useNotification'
import { handleError } from '@/lib/errorHandler'

export function useCreateSale() {
  const queryClient = useQueryClient()
  const notification = useNotification()
  
  return useMutation({
    mutationFn: SaleService.createSale,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      notification.success('تم إنشاء البيع بنجاح')
    },
    onError: (error) => {
      const appError = handleError(error)
      notification.error(appError.message)
    },
  })
}
```

### Update Mutation

```typescript
// hooks/useUpdateSale.ts

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SaleService } from '@/services/saleService'
import { useNotification } from '@/hooks/useNotification'
import { handleError } from '@/lib/errorHandler'

export function useUpdateSale() {
  const queryClient = useQueryClient()
  const notification = useNotification()
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Sale> }) =>
      SaleService.updateSale(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['sale', variables.id] })
      notification.success('تم تحديث البيع بنجاح')
    },
    onError: (error) => {
      const appError = handleError(error)
      notification.error(appError.message)
    },
  })
}
```

### Delete Mutation

```typescript
// hooks/useDeleteSale.ts

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SaleService } from '@/services/saleService'
import { useNotification } from '@/hooks/useNotification'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { handleError } from '@/lib/errorHandler'

export function useDeleteSale() {
  const queryClient = useQueryClient()
  const notification = useNotification()
  const confirmDialog = useConfirmDialog()
  
  return useMutation({
    mutationFn: async (id: string) => {
      const confirmed = await confirmDialog.show({
        title: 'حذف البيع',
        description: 'هل أنت متأكد من حذف هذا البيع؟',
        variant: 'destructive',
      })
      
      if (!confirmed) {
        throw new Error('Cancelled')
      }
      
      return SaleService.deleteSale(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      notification.success('تم حذف البيع بنجاح')
    },
    onError: (error) => {
      if (error.message === 'Cancelled') return
      const appError = handleError(error)
      notification.error(appError.message)
    },
  })
}
```

## 🔄 Optimistic Updates

```typescript
// hooks/useOptimisticUpdateSale.ts

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SaleService } from '@/services/saleService'
import type { Sale } from '@/types/database'

export function useOptimisticUpdateSale() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Sale> }) =>
      SaleService.updateSale(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['sale', id] })
      
      // Snapshot previous value
      const previousSale = queryClient.getQueryData<Sale>(['sale', id])
      
      // Optimistically update
      if (previousSale) {
        queryClient.setQueryData<Sale>(['sale', id], {
          ...previousSale,
          ...data,
        })
      }
      
      return { previousSale }
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousSale) {
        queryClient.setQueryData(['sale', variables.id], context.previousSale)
      }
    },
    onSettled: (data, error, variables) => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['sale', variables.id] })
    },
  })
}
```

## 📊 Real-time Subscriptions

```typescript
// hooks/useRealtimeSales.ts

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Sale } from '@/types/database'

export function useRealtimeSales() {
  const queryClient = useQueryClient()
  
  useEffect(() => {
    const channel = supabase
      .channel('sales-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sales',
        },
        (payload) => {
          // Invalidate queries on any change
          queryClient.invalidateQueries({ queryKey: ['sales'] })
          
          // Update specific sale if ID available
          if (payload.new?.id) {
            queryClient.invalidateQueries({ queryKey: ['sale', payload.new.id] })
          }
        }
      )
      .subscribe()
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])
}
```

## 🎯 Best Practices

### 1. Consistent Query Keys

```typescript
// Use consistent query key patterns
['sales'] // All sales
['sales', { status: 'Pending' }] // Filtered sales
['sale', id] // Single sale
['sales', 'paginated', { page, limit }] // Paginated
```

### 2. Error Handling

```typescript
// Always handle errors
const { data, error, isLoading } = useQuery({
  queryKey: ['sales'],
  queryFn: fetchSales,
  onError: (error) => {
    const appError = handleError(error)
    notification.error(appError.message)
  },
})
```

### 3. Loading States

```typescript
// Handle loading states
if (isLoading) return <LoadingProgress />
if (error) return <ErrorDisplay error={error} />
if (!data) return <EmptyState />
```

### 4. Cache Management

```typescript
// Invalidate related queries
queryClient.invalidateQueries({ queryKey: ['sales'] })
queryClient.invalidateQueries({ queryKey: ['financial'] })

// Remove specific query
queryClient.removeQueries({ queryKey: ['sale', id] })
```

## ✅ API Patterns Checklist

- [ ] React Query setup
- [ ] Query patterns implemented
- [ ] Mutation patterns implemented
- [ ] Optimistic updates where needed
- [ ] Real-time subscriptions
- [ ] Error handling
- [ ] Loading states
- [ ] Cache management
- [ ] Consistent query keys

