# Reusable UI Components System

## 🎯 Overview

A comprehensive system of reusable UI components to ensure consistency across all pages, including loading states, popups, alerts, and common UI patterns.

## 📋 Component Categories

### 1. Loading Components
- **PageLoader**: Full-page loading
- **InlineLoader**: Inline loading spinner
- **ButtonLoader**: Loading state for buttons
- **SkeletonLoader**: Content placeholders

### 2. Dialog/Popup Components
- **AlertDialog**: Confirmation dialogs
- **InfoDialog**: Information dialogs
- **FormDialog**: Form dialogs
- **ActionDialog**: Action confirmation dialogs

### 3. Notification Components
- **Toast**: Toast notifications
- **Alert**: Alert messages
- **Banner**: Banner messages

### 4. Common UI Components
- **DataTable**: Reusable data table
- **SearchBar**: Search input
- **FilterBar**: Filter controls
- **ActionBar**: Action buttons bar

## 🏗️ Architecture

### Component Structure

```
components/
├── ui/
│   ├── loading/
│   │   ├── PageLoader.tsx
│   │   ├── InlineLoader.tsx
│   │   ├── ButtonLoader.tsx
│   │   └── SkeletonLoader.tsx
│   ├── dialogs/
│   │   ├── AlertDialog.tsx
│   │   ├── InfoDialog.tsx
│   │   ├── FormDialog.tsx
│   │   └── ActionDialog.tsx
│   ├── notifications/
│   │   ├── Toast.tsx
│   │   ├── Alert.tsx
│   │   └── Banner.tsx
│   └── common/
│       ├── DataTable.tsx
│       ├── SearchBar.tsx
│       ├── FilterBar.tsx
│       └── ActionBar.tsx
```

## 💻 Implementation

### 1. Loading Components

#### PageLoader
```typescript
// components/ui/loading/PageLoader.tsx
import { LoadingProgress } from '@/components/ui/loading-progress'

interface PageLoaderProps {
  message?: string
  fullScreen?: boolean
}

export function PageLoader({ 
  message = 'جاري التحميل...', 
  fullScreen = true 
}: PageLoaderProps) {
  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <LoadingProgress message={message} />
      </div>
    )
  }
  
  return (
    <div className="flex items-center justify-center p-8">
      <LoadingProgress message={message} />
    </div>
  )
}
```

#### InlineLoader
```typescript
// components/ui/loading/InlineLoader.tsx
import { Loader2 } from 'lucide-react'

interface InlineLoaderProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function InlineLoader({ size = 'md', className }: InlineLoaderProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  }
  
  return (
    <Loader2 className={`animate-spin text-blue-500 ${sizeClasses[size]} ${className}`} />
  )
}
```

#### SkeletonLoader
```typescript
// components/ui/loading/SkeletonLoader.tsx
export function SkeletonLoader({ 
  count = 1, 
  className = '' 
}: { 
  count?: number
  className?: string 
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`animate-pulse bg-gray-200 rounded ${className}`}
        />
      ))}
    </>
  )
}

// Usage examples
export function TableSkeleton() {
  return (
    <div className="space-y-2">
      <SkeletonLoader count={5} className="h-12" />
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="space-y-4 p-4 border rounded-lg">
      <SkeletonLoader className="h-6 w-3/4" />
      <SkeletonLoader className="h-4 w-full" />
      <SkeletonLoader className="h-4 w-2/3" />
    </div>
  )
}
```

### 2. Dialog Components

#### AlertDialog (Enhanced)
```typescript
// components/ui/dialogs/AlertDialog.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react'

type AlertType = 'success' | 'error' | 'warning' | 'info'

interface AlertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: AlertType
  title: string
  message: string
  confirmText?: string
  onConfirm?: () => void
  showCancel?: boolean
  cancelText?: string
}

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info
}

const colors = {
  success: 'text-green-600',
  error: 'text-red-600',
  warning: 'text-yellow-600',
  info: 'text-blue-600'
}

export function AlertDialog({
  open,
  onOpenChange,
  type,
  title,
  message,
  confirmText = 'موافق',
  onConfirm,
  showCancel = false,
  cancelText = 'إلغاء'
}: AlertDialogProps) {
  const Icon = icons[type]
  const colorClass = colors[type]
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Icon className={`h-6 w-6 ${colorClass}`} />
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            {message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {showCancel && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {cancelText}
            </Button>
          )}
          <Button 
            onClick={() => {
              onConfirm?.()
              onOpenChange(false)
            }}
            className={type === 'error' ? 'bg-red-600 hover:bg-red-700' : ''}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

#### FormDialog
```typescript
// components/ui/dialogs/FormDialog.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface FormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: React.ReactNode
  onSubmit: () => void
  submitText?: string
  cancelText?: string
  loading?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  children,
  onSubmit,
  submitText = 'حفظ',
  cancelText = 'إلغاء',
  loading = false,
  size = 'md'
}: FormDialogProps) {
  const sizeClasses = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-xl'
  }
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={sizeClasses[size]}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}>
          {children}
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {cancelText}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'جاري الحفظ...' : submitText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

### 3. Notification Components

#### Toast System
```typescript
// components/ui/notifications/Toast.tsx
import { createContext, useContext, useState, useCallback } from 'react'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastContextType {
  showToast: (type: ToastType, message: string, duration?: number) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  
  const showToast = useCallback((type: ToastType, message: string, duration = 3000) => {
    const id = Math.random().toString(36).substr(2, 9)
    const toast: Toast = { id, type, message, duration }
    
    setToasts(prev => [...prev, toast])
    
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }, [])
  
  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[10000] space-y-2">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onClose={() => {
            setToasts(prev => prev.filter(t => t.id !== toast.id))
          }} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    info: Info,
    warning: AlertTriangle
  }
  
  const colors = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800'
  }
  
  const Icon = icons[toast.type]
  
  return (
    <div className={`flex items-center gap-3 p-4 border rounded-lg shadow-lg min-w-[300px] max-w-md ${colors[toast.type]}`}>
      <Icon className="h-5 w-5 flex-shrink-0" />
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
      <button onClick={onClose} className="flex-shrink-0">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}
```

### 4. Common UI Components

#### DataTable
```typescript
// components/ui/common/DataTable.tsx
interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T>[]
  loading?: boolean
  onRowClick?: (row: T) => void
  pagination?: boolean
}

export function DataTable<T>({
  data,
  columns,
  loading = false,
  onRowClick,
  pagination = false
}: DataTableProps<T>) {
  if (loading) {
    return <TableSkeleton />
  }
  
  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            {columns.map(column => (
              <th key={column.id} className="px-4 py-3 text-left text-sm font-medium">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={i}
              onClick={() => onRowClick?.(row)}
              className="border-t hover:bg-gray-50 cursor-pointer"
            >
              {columns.map(column => (
                <td key={column.id} className="px-4 py-3 text-sm">
                  {column.cell ? column.cell(row) : row[column.accessorKey]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

## 🎨 Usage Examples

### Loading States
```typescript
// In any page
import { PageLoader } from '@/components/ui/loading/PageLoader'
import { InlineLoader } from '@/components/ui/loading/InlineLoader'

function MyPage() {
  const { data, isLoading } = useQuery(...)
  
  if (isLoading) {
    return <PageLoader message="جاري تحميل البيانات..." />
  }
  
  return (
    <div>
      {data.map(item => (
        <div key={item.id}>
          {item.loading && <InlineLoader />}
          {item.content}
        </div>
      ))}
    </div>
  )
}
```

### Dialogs
```typescript
// Using AlertDialog
import { AlertDialog } from '@/components/ui/dialogs/AlertDialog'

function MyComponent() {
  const [dialogOpen, setDialogOpen] = useState(false)
  
  return (
    <>
      <button onClick={() => setDialogOpen(true)}>Show Alert</button>
      <AlertDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        type="success"
        title="نجح!"
        message="تم الحفظ بنجاح"
      />
    </>
  )
}
```

### Toast Notifications
```typescript
// Using Toast
import { useToast } from '@/components/ui/notifications/Toast'

function MyComponent() {
  const toast = useToast()
  
  const handleSave = async () => {
    try {
      await saveData()
      toast.showToast('success', 'تم الحفظ بنجاح')
    } catch (error) {
      toast.showToast('error', 'فشل الحفظ')
    }
  }
  
  return <button onClick={handleSave}>Save</button>
}
```

## ✅ Implementation Checklist

- [ ] Create PageLoader component
- [ ] Create InlineLoader component
- [ ] Create SkeletonLoader component
- [ ] Create AlertDialog component
- [ ] Create FormDialog component
- [ ] Create Toast system
- [ ] Create DataTable component
- [ ] Create SearchBar component
- [ ] Create FilterBar component
- [ ] Update all pages to use new components
- [ ] Remove duplicate loading/dialog code
- [ ] Test all components
- [ ] Document usage

## 🎯 Next Steps

1. Implement loading components
2. Implement dialog components
3. Implement notification system
4. Implement common UI components
5. Update existing pages
6. Remove old duplicate code

