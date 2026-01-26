# User Management System

## 🎯 Overview

A simplified, controllable user management system with **two roles only**: **Owner** and **Worker**.

- **Owners**: Created via Supabase Dashboard only (NOT in the app)
- **Workers**: Created by Owner through the application dashboard
- **Worker Titles**: Workers can have custom titles (e.g., "Manager", "Sales Rep", "Field Agent") for selling titles/roles

## 🔐 Core Requirements

1. **Two Roles Only**: Owner and Worker
2. **Owner Creation**: Via Supabase Dashboard only
3. **Worker Creation**: By Owner through application dashboard
4. **Worker Titles**: Custom titles for workers
5. **Granular Access**: Control all types of access for workers
6. **Permission Control**: Fine-grained permissions for workers
7. **Status Management**: Activate/deactivate workers

## 🏗️ Architecture

### Component Structure

```
components/
├── user-management/
│   ├── UserCreationForm.tsx        # Simple user creation form
│   ├── UserEditForm.tsx            # User editing form
│   ├── PermissionManager.tsx       # Permission control component
│   ├── AccessControlPanel.tsx      # Access control dashboard
│   ├── RoleSelector.tsx            # Role selection component
│   └── UserStatusToggle.tsx        # Activate/deactivate toggle
```

### Service Structure

```
services/
├── userService.ts                  # User management service
│   ├── createUser()
│   ├── updateUser()
│   ├── deleteUser()
│   ├── updatePermissions()
│   ├── updateRole()
│   └── updateStatus()
```

## 💻 Implementation

### 1. Simplified User Creation Form

```typescript
// components/user-management/UserCreationForm.tsx
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { UserService } from '@/services/userService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useNotification } from '@/hooks/useNotification'

interface UserCreationFormProps {
  onSuccess?: () => void
  onCancel?: () => void
}

export function UserCreationForm({ onSuccess, onCancel }: UserCreationFormProps) {
  const { profile } = useAuth()
  const notification = useNotification()
  const [loading, setLoading] = useState(false)
  
  const [form, setForm] = useState({
    name: '',
    email: '',
    title: '', // Worker title (e.g., "Manager", "Sales Rep", "Field Agent")
    password: '', // Optional - auto-generate if not provided
    sendEmail: true // Send invitation email
  })
  
  // Note: Role is always 'Worker' - Owners are created via Supabase Dashboard only
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      await UserService.createWorker({
        name: form.name.trim(),
        email: form.email.trim(),
        title: form.title.trim() || null, // Worker title
        password: form.password || undefined, // Auto-generate if empty
        sendEmail: form.sendEmail
      })
      
      notification.success('تم إنشاء المستخدم بنجاح')
      onSuccess?.()
    } catch (error: any) {
      notification.error(error.message || 'فشل إنشاء المستخدم')
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">الاسم</label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
          placeholder="اسم المستخدم"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-1">البريد الإلكتروني</label>
        <Input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
          placeholder="email@example.com"
        />
      </div>
      
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
      
      <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
        <strong>ملاحظة:</strong> يتم إنشاء المالكين فقط من خلال لوحة تحكم Supabase. 
        هذا النموذج لإنشاء العمال فقط.
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-1">
          كلمة المرور (اختياري - سيتم توليدها تلقائياً)
        </label>
        <Input
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder="اتركه فارغاً للتوليد التلقائي"
        />
      </div>
      
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="sendEmail"
          checked={form.sendEmail}
          onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })}
        />
        <label htmlFor="sendEmail" className="text-sm">
          إرسال بريد إلكتروني للمستخدم
        </label>
      </div>
      
      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? 'جاري الإنشاء...' : 'إنشاء مستخدم'}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            إلغاء
          </Button>
        )}
      </div>
    </form>
  )
}
```

### 2. Access Control Dashboard

```typescript
// components/user-management/AccessControlPanel.tsx
import { useState } from 'react'
import { User } from '@/types/database'
import { PermissionManager } from './PermissionManager'
import { Card } from '@/components/ui/card'

interface AccessControlPanelProps {
  user: User
  onUpdate: (updates: Partial<User>) => void
}

export function AccessControlPanel({ user, onUpdate }: AccessControlPanelProps) {
  const [activeTab, setActiveTab] = useState<'permissions' | 'pages' | 'features'>('permissions')
  
  return (
    <Card className="p-6">
      <div className="flex gap-2 mb-4 border-b">
        <button
          onClick={() => setActiveTab('permissions')}
          className={`px-4 py-2 ${activeTab === 'permissions' ? 'border-b-2 border-blue-500' : ''}`}
        >
          الصلاحيات
        </button>
        <button
          onClick={() => setActiveTab('pages')}
          className={`px-4 py-2 ${activeTab === 'pages' ? 'border-b-2 border-blue-500' : ''}`}
        >
          الصفحات
        </button>
        <button
          onClick={() => setActiveTab('features')}
          className={`px-4 py-2 ${activeTab === 'features' ? 'border-b-2 border-blue-500' : ''}`}
        >
          الميزات
        </button>
      </div>
      
      {activeTab === 'permissions' && (
        <PermissionManager
          user={user}
          onUpdate={(permissions) => onUpdate({ permissions })}
        />
      )}
      
      {activeTab === 'pages' && (
        <PageAccessManager
          user={user}
          onUpdate={(allowedPages) => onUpdate({ allowed_pages: allowedPages })}
        />
      )}
      
      {activeTab === 'features' && (
        <FeatureAccessManager
          user={user}
          onUpdate={(allowedFeatures) => onUpdate({ allowed_features: allowedFeatures })}
        />
      )}
    </Card>
  )
}
```

### 3. Permission Manager Component

```typescript
// components/user-management/PermissionManager.tsx
import { useState } from 'react'
import { User } from '@/types/database'
import { Checkbox } from '@/components/ui/checkbox'

interface PermissionManagerProps {
  user: User
  onUpdate: (permissions: Record<string, boolean>) => void
}

const PERMISSIONS = [
  { id: 'view_dashboard', label: 'عرض لوحة التحكم' },
  { id: 'view_land', label: 'عرض الأراضي' },
  { id: 'edit_land', label: 'تعديل الأراضي' },
  { id: 'delete_land', label: 'حذف الأراضي' },
  { id: 'view_clients', label: 'عرض العملاء' },
  { id: 'edit_clients', label: 'تعديل العملاء' },
  { id: 'delete_clients', label: 'حذف العملاء' },
  { id: 'view_sales', label: 'عرض المبيعات' },
  { id: 'create_sales', label: 'إنشاء مبيعات' },
  { id: 'edit_sales', label: 'تعديل المبيعات' },
  { id: 'delete_sales', label: 'حذف المبيعات' },
  { id: 'view_financial', label: 'عرض المالية' },
  { id: 'view_profit', label: 'عرض الأرباح' },
  { id: 'manage_users', label: 'إدارة المستخدمين' },
  // ... more permissions
]

export function PermissionManager({ user, onUpdate }: PermissionManagerProps) {
  const [permissions, setPermissions] = useState<Record<string, boolean>>(
    user.permissions || {}
  )
  
  const handleToggle = (permissionId: string, checked: boolean) => {
    const updated = { ...permissions, [permissionId]: checked }
    setPermissions(updated)
    onUpdate(updated)
  }
  
  return (
    <div className="space-y-2">
      {PERMISSIONS.map(permission => (
        <div key={permission.id} className="flex items-center gap-2">
          <Checkbox
            checked={permissions[permission.id] || false}
            onCheckedChange={(checked) => handleToggle(permission.id, checked as boolean)}
          />
          <label className="text-sm">{permission.label}</label>
        </div>
      ))}
    </div>
  )
}
```

### 4. User Service

```typescript
// services/userService.ts
import { supabase } from '@/lib/supabase'
import { logAction } from '@/services/auditService'

export class UserService {
  /**
   * Create a new worker
   * Note: Owners are created via Supabase Dashboard only
   */
  static async createWorker(data: {
    name: string
    email: string
    title?: string | null  // Worker title (e.g., "Manager", "Sales Rep")
    password?: string
    sendEmail?: boolean
  }): Promise<void> {
    // Generate password if not provided
    const password = data.password || this.generateSecurePassword()
    
    // Create auth user (always as Worker - Owners created via Supabase Dashboard)
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email,
      password: password,
      options: {
        data: {
          name: data.name,
          role: 'Worker',  // Always Worker
          title: data.title || null
        },
        emailRedirectTo: data.sendEmail ? undefined : undefined
      }
    })
    
    if (authError) throw authError
    if (!authData.user) throw new Error('Failed to create user')
    
    // Create worker record
    const { error: dbError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        name: data.name,
        email: data.email,
        role: 'Worker',  // Always Worker
        title: data.title || null,  // Worker title
        status: 'Active',
        permissions: this.getDefaultWorkerPermissions()
      })
    
    if (dbError) {
      // Rollback: delete auth user if DB insert fails
      await supabase.auth.admin.deleteUser(authData.user.id)
      throw dbError
    }
    
    // Send email if requested
    if (data.sendEmail) {
      await this.sendInvitationEmail(data.email, password)
    }
    
    await logAction('create_worker', { userId: authData.user.id, title: data.title })
  }
  
  /**
   * Update worker title
   */
  static async updateWorkerTitle(
    userId: string,
    title: string | null
  ): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({ title })
      .eq('id', userId)
      .eq('role', 'Worker')  // Only workers can have titles
    
    if (error) throw error
    
    await logAction('update_worker_title', { userId, title })
  }
  
  /**
   * Update worker permissions
   */
  static async updateWorkerPermissions(
    userId: string,
    permissions: Record<string, boolean>
  ): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({ permissions })
      .eq('id', userId)
      .eq('role', 'Worker')  // Only workers have permissions
    
    if (error) throw error
    
    await logAction('update_worker_permissions', { userId, permissions })
  }
  
  /**
   * Update user status
   */
  static async updateStatus(
    userId: string,
    status: 'Active' | 'Inactive'
  ): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({ status })
      .eq('id', userId)
    
    if (error) throw error
    
    await logAction('update_status', { userId, status })
  }
  
  /**
   * Generate secure random password
   */
  private static generateSecurePassword(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
    let password = ''
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return password
  }
  
  /**
   * Get default permissions for workers
   * Owners have all permissions by default (handled in RLS)
   */
  private static getDefaultWorkerPermissions(): Record<string, boolean> {
    // Default limited permissions for new workers
    // Owner can modify these through the dashboard
    return {
      view_dashboard: true,
      view_land: true,
      edit_land: false,
      delete_land: false,
      view_clients: true,
      edit_clients: false,
      delete_clients: false,
      view_sales: true,
      create_sales: false,
      edit_sales: false,
      delete_sales: false,
      view_financial: false,
      view_profit: false,
      manage_users: false,
      // ... more permissions
    }
  }
}
```

## 🎨 UI Design

### User Creation Flow
1. **Simple Form**: Name, Email, Role, Optional Password
2. **One-Click Create**: Single button to create user
3. **Auto-Generate Password**: If not provided
4. **Email Option**: Toggle to send invitation email

### Access Control Dashboard
1. **Tabbed Interface**: Permissions, Pages, Features
2. **Checkbox Grid**: Easy to toggle permissions
3. **Role Presets**: Quick apply role-based permissions
4. **Custom Permissions**: Override role defaults

## 🔒 Security

### Validation
- Email format validation
- Password strength (if provided)
- Role validation
- Permission validation

### Database
```sql
-- Update user_role enum to only Owner and Worker
-- (If enum exists, drop and recreate)
DROP TYPE IF EXISTS user_role CASCADE;
CREATE TYPE user_role AS ENUM ('Owner', 'Worker');

-- Add title column for workers
ALTER TABLE users ADD COLUMN title VARCHAR(255) NULL;

-- Add permissions column if not exists
ALTER TABLE users ADD COLUMN permissions JSONB DEFAULT '{}';

-- Add allowed_pages column
ALTER TABLE users ADD COLUMN allowed_pages TEXT[] DEFAULT NULL;

-- Add allowed_features column
ALTER TABLE users ADD COLUMN allowed_features TEXT[] DEFAULT NULL;

-- Update role column to use new enum
ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;

-- Add constraint: Only workers can have titles
ALTER TABLE users ADD CONSTRAINT worker_title_check 
  CHECK (title IS NULL OR role = 'Worker');
```

## ✅ Implementation Checklist

- [ ] Create UserCreationForm component
- [ ] Create AccessControlPanel component
- [ ] Create PermissionManager component
- [ ] Create UserService
- [ ] Update Users page
- [ ] Add permission checks
- [ ] Add database columns
- [ ] Add RLS policies
- [ ] Test user creation
- [ ] Test permission updates
- [ ] Test role changes
- [ ] Document in admin guide

## 🎯 Next Steps

1. Implement UserCreationForm
2. Create AccessControlPanel
3. Build UserService
4. Update Users page
5. Add permission system
6. Test thoroughly

