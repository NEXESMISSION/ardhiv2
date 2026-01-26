# Worker Titles System

## 🎯 Overview

A system for assigning custom titles to workers (e.g., "Manager", "Sales Rep", "Field Agent"). These titles can be used for selling titles/roles and organizing workers.

## 🔑 Key Concepts

### Two Roles Only
- **Owner**: Created via Supabase Dashboard only
- **Worker**: Created via application, can have titles

### Worker Titles
- **Custom Titles**: Workers can have custom titles
- **Examples**: "Manager", "Sales Rep", "Field Agent", "Senior Agent", "Junior Agent"
- **Purpose**: Organize workers, sell titles/roles, display in UI
- **Flexible**: Owner can assign any title to any worker

## 🏗️ Architecture

### Database Schema

```sql
-- Add title column to users table
ALTER TABLE users ADD COLUMN title VARCHAR(255) NULL;

-- Constraint: Only workers can have titles
ALTER TABLE users ADD CONSTRAINT worker_title_check 
  CHECK (title IS NULL OR role = 'Worker');

-- Index for faster title searches
CREATE INDEX idx_users_title ON users(title) WHERE title IS NOT NULL;
```

### TypeScript Types

```typescript
// types/database.ts
export type UserRole = 'Owner' | 'Worker'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  title: string | null  // Worker title (null for Owners)
  permissions: Record<string, boolean>
  status: 'Active' | 'Inactive'
  created_at: string
  updated_at: string
}
```

## 💻 Implementation

### 1. Worker Creation with Title

```typescript
// components/user-management/UserCreationForm.tsx
export function UserCreationForm({ onSuccess, onCancel }: UserCreationFormProps) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    title: '', // Worker title
    password: '',
    sendEmail: true
  })
  
  return (
    <form onSubmit={handleSubmit}>
      {/* Name, Email fields */}
      
      <div>
        <label className="block text-sm font-medium mb-1">
          المسمى الوظيفي (اختياري)
        </label>
        <Input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="مثال: مدير، مندوب مبيعات، موظف ميداني"
        />
        <p className="text-xs text-gray-500 mt-1">
          يمكنك إضافة مسمى وظيفي للعامل (مثل: مدير، مندوب مبيعات، إلخ)
        </p>
      </div>
      
      {/* Rest of form */}
    </form>
  )
}
```

### 2. Title Management Component

```typescript
// components/user-management/TitleManager.tsx
import { useState } from 'react'
import { User } from '@/types/database'
import { UserService } from '@/services/userService'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useNotification } from '@/hooks/useNotification'

interface TitleManagerProps {
  worker: User
  onUpdate: () => void
}

export function TitleManager({ worker, onUpdate }: TitleManagerProps) {
  const notification = useNotification()
  const [title, setTitle] = useState(worker.title || '')
  const [loading, setLoading] = useState(false)
  
  const handleSave = async () => {
    setLoading(true)
    try {
      await UserService.updateWorkerTitle(worker.id, title.trim() || null)
      notification.success('تم تحديث المسمى الوظيفي بنجاح')
      onUpdate()
    } catch (error: any) {
      notification.error(error.message || 'فشل تحديث المسمى الوظيفي')
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">المسمى الوظيفي</label>
      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="مثال: مدير، مندوب مبيعات"
          className="flex-1"
        />
        <Button onClick={handleSave} disabled={loading}>
          {loading ? 'جاري الحفظ...' : 'حفظ'}
        </Button>
      </div>
      <p className="text-xs text-gray-500">
        يمكنك إضافة أو تعديل المسمى الوظيفي للعامل
      </p>
    </div>
  )
}
```

### 3. Title Presets

```typescript
// lib/constants/titles.ts
export const WORKER_TITLE_PRESETS = [
  'مدير',
  'مدير مبيعات',
  'مندوب مبيعات',
  'موظف ميداني',
  'موظف ميداني أول',
  'مساعد مبيعات',
  'منسق مبيعات',
  'مشرف مبيعات',
] as const

export type WorkerTitlePreset = typeof WORKER_TITLE_PRESETS[number]

// Helper to get title suggestions
export function getTitleSuggestions(input: string): string[] {
  if (!input) return [...WORKER_TITLE_PRESETS]
  
  const lowerInput = input.toLowerCase()
  return WORKER_TITLE_PRESETS.filter(title => 
    title.toLowerCase().includes(lowerInput)
  )
}
```

### 4. Title Selector Component

```typescript
// components/user-management/TitleSelector.tsx
import { useState } from 'react'
import { WORKER_TITLE_PRESETS, getTitleSuggestions } from '@/lib/constants/titles'
import { Input } from '@/components/ui/input'

interface TitleSelectorProps {
  value: string
  onChange: (title: string) => void
}

export function TitleSelector({ value, onChange }: TitleSelectorProps) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestions = getTitleSuggestions(value)
  
  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setShowSuggestions(true)
        }}
        onFocus={() => setShowSuggestions(true)}
        placeholder="المسمى الوظيفي"
      />
      
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-auto">
          {suggestions.map((title, i) => (
            <button
              key={i}
              onClick={() => {
                onChange(title)
                setShowSuggestions(false)
              }}
              className="w-full px-4 py-2 text-left hover:bg-gray-100 text-sm"
            >
              {title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

### 5. Display Worker with Title

```typescript
// components/user-management/WorkerCard.tsx
import { User } from '@/types/database'

interface WorkerCardProps {
  worker: User
}

export function WorkerCard({ worker }: WorkerCardProps) {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{worker.name}</h3>
          {worker.title && (
            <p className="text-sm text-gray-600">
              {worker.title}
            </p>
          )}
          <p className="text-xs text-gray-500">{worker.email}</p>
        </div>
        <div className="text-xs text-gray-500">
          {worker.status === 'Active' ? 'نشط' : 'غير نشط'}
        </div>
      </div>
    </div>
  )
}
```

### 6. Filter by Title

```typescript
// components/user-management/WorkerList.tsx
import { useState, useMemo } from 'react'
import { User } from '@/types/database'

interface WorkerListProps {
  workers: User[]
}

export function WorkerList({ workers }: WorkerListProps) {
  const [titleFilter, setTitleFilter] = useState<string>('')
  
  const filteredWorkers = useMemo(() => {
    if (!titleFilter) return workers
    
    return workers.filter(worker =>
      worker.title?.toLowerCase().includes(titleFilter.toLowerCase())
    )
  }, [workers, titleFilter])
  
  // Get unique titles for filter dropdown
  const uniqueTitles = useMemo(() => {
    const titles = workers
      .map(w => w.title)
      .filter((t): t is string => t !== null && t !== '')
    return Array.from(new Set(titles)).sort()
  }, [workers])
  
  return (
    <div>
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">تصفية حسب المسمى الوظيفي</label>
        <select
          value={titleFilter}
          onChange={(e) => setTitleFilter(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value="">الكل</option>
          {uniqueTitles.map(title => (
            <option key={title} value={title}>{title}</option>
          ))}
        </select>
      </div>
      
      <div className="space-y-2">
        {filteredWorkers.map(worker => (
          <WorkerCard key={worker.id} worker={worker} />
        ))}
      </div>
    </div>
  )
}
```

## 🎨 UI Examples

### Worker List with Titles
```
┌─────────────────────────────────────┐
│ العمال                              │
├─────────────────────────────────────┤
│ تصفية حسب المسمى الوظيفي: [▼]      │
├─────────────────────────────────────┤
│ أحمد محمد                           │
│ مدير                                │
│ ahmed@example.com                   │
│ [نشط]                               │
├─────────────────────────────────────┤
│ فاطمة علي                           │
│ مندوب مبيعات                        │
│ fatima@example.com                  │
│ [نشط]                               │
└─────────────────────────────────────┘
```

## 🔒 Security

### Validation
- Only workers can have titles
- Title length validation (max 255 chars)
- Title format validation (optional)

### Database Constraints
```sql
-- Ensure only workers have titles
ALTER TABLE users ADD CONSTRAINT worker_title_check 
  CHECK (title IS NULL OR role = 'Worker');
```

## 📊 Use Cases

### 1. Selling Titles/Roles
- Owner can assign premium titles (e.g., "Senior Manager")
- Can charge for title upgrades
- Titles displayed in UI for prestige

### 2. Organizing Workers
- Filter workers by title
- Group workers by title
- Display title in worker list

### 3. Permission Presets
- Quick apply permissions based on title
- "Manager" title → Manager permissions
- "Sales Rep" title → Sales permissions

## ✅ Implementation Checklist

- [ ] Add `title` column to users table
- [ ] Add database constraint (only workers can have titles)
- [ ] Update User type to include title
- [ ] Update UserCreationForm to include title field
- [ ] Create TitleManager component
- [ ] Create TitleSelector component
- [ ] Update WorkerCard to display title
- [ ] Add title filtering to WorkerList
- [ ] Update UserService to handle titles
- [ ] Add title presets
- [ ] Test title assignment
- [ ] Test title filtering
- [ ] Document in user guide

## 🎯 Next Steps

1. Implement database schema changes
2. Create title management components
3. Update worker creation form
4. Add title display in UI
5. Add title filtering
6. Test thoroughly

