import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Shield, User, Save, X, AlertCircle } from 'lucide-react'
import type { User as UserType, PermissionTemplate, UserPermission } from '@/types/database'
import { formatDate } from '@/lib/utils'

const RESOURCES = [
  { value: 'land', label: 'الأراضي' },
  { value: 'client', label: 'العملاء' },
  { value: 'sale', label: 'المبيعات' },
  { value: 'payment', label: 'المدفوعات' },
  { value: 'report', label: 'التقارير' },
  { value: 'user', label: 'المستخدمين' },
  { value: 'expense', label: 'المصاريف' },
] as const

const PERMISSION_TYPES = [
  { value: 'view', label: 'عرض' },
  { value: 'create', label: 'إنشاء' },
  { value: 'edit', label: 'تعديل' },
  { value: 'delete', label: 'حذف' },
  { value: 'export', label: 'تصدير' },
] as const

export function UserPermissions() {
  const { hasPermission, profile } = useAuth()
  const [users, setUsers] = useState<UserType[]>([])
  const [templates, setTemplates] = useState<PermissionTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Permission dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null)
  const [userPermissions, setUserPermissions] = useState<Record<string, boolean>>({})
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')

  useEffect(() => {
    if (!hasPermission('manage_users')) return
    fetchData()
  }, [hasPermission])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Fetch users
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, name, email, role, status, created_at, updated_at')
        .order('name', { ascending: true })

      if (usersError) throw usersError
      setUsers((usersData as UserType[]) || [])

      // Fetch permission templates
      const { data: templatesData, error: templatesError } = await supabase
        .from('permission_templates')
        .select('*')
        .order('name', { ascending: true })

      if (templatesError) {
        // Table might not exist yet, that's okay
        if (templatesError.code !== '42P01') {
          console.error('Error fetching templates:', templatesError)
        }
        setTemplates([])
      } else {
        setTemplates((templatesData as PermissionTemplate[]) || [])
      }
    } catch (error: any) {
      setError('خطأ في تحميل البيانات')
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const openPermissionDialog = async (user: UserType) => {
    if (user.role === 'Owner') {
      setError('لا يمكن تعديل صلاحيات المالك')
      return
    }

    setSelectedUser(user)
    setError(null)
    setSuccess(null)

    // Fetch user's custom permissions
    try {
      const { data, error: permError } = await supabase
        .from('user_permissions')
        .select('resource_type, permission_type, granted')
        .eq('user_id', user.id)

      if (permError && permError.code !== '42P01') {
        console.error('Error fetching permissions:', permError)
      }

      // Initialize permissions map
      const permissionsMap: Record<string, boolean> = {}
      if (data) {
        data.forEach((perm: any) => {
          const key = `${perm.resource_type}_${perm.permission_type}`
          permissionsMap[key] = perm.granted
        })
      }

      setUserPermissions(permissionsMap)
      setDialogOpen(true)
    } catch (error) {
      console.error('Error opening permission dialog:', error)
      setError('خطأ في تحميل الصلاحيات')
    }
  }

  const applyTemplate = async () => {
    if (!selectedUser || !selectedTemplate) return

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const template = templates.find(t => t.id === selectedTemplate)
      if (!template) {
        setError('القالب المحدد غير موجود')
        setSaving(false)
        return
      }

      // Convert template permissions to user_permissions format
      const permissionsToInsert: any[] = []
      
      // Map legacy permissions to new format
      Object.entries(template.permissions).forEach(([key, value]) => {
        // Parse legacy format (e.g., "view_land" -> resource: "land", permission: "view")
        const parts = key.split('_')
        if (parts.length === 2) {
          const [action, resource] = parts
          // Map to new format
          const resourceMap: Record<string, string> = {
            'land': 'land',
            'clients': 'client',
            'sales': 'sale',
            'payments': 'payment',
            'financial': 'report',
            'users': 'user',
            'expenses': 'expense',
            'installments': 'sale', // Installments are part of sales
          }
          
          const permissionMap: Record<string, string> = {
            'view': 'view',
            'edit': 'edit',
            'create': 'create',
            'delete': 'delete',
            'record': 'create', // record_payments -> payment_create
          }

          const resourceType = resourceMap[resource] || resource
          const permissionType = permissionMap[action] || action

          if (resourceType && permissionType && ['view', 'create', 'edit', 'delete', 'export'].includes(permissionType)) {
            permissionsToInsert.push({
              user_id: selectedUser.id,
              resource_type: resourceType,
              permission_type: permissionType,
              granted: value,
              created_by: profile?.id,
            })
          }
        }
      })

      // Delete existing permissions for this user
      await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', selectedUser.id)

      // Insert new permissions
      if (permissionsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('user_permissions')
          .insert(permissionsToInsert)

        if (insertError) throw insertError
      }

      setSuccess('تم تطبيق القالب بنجاح')
      setTemplateDialogOpen(false)
      setSelectedTemplate('')
      await fetchData()
      // Refresh permissions dialog if open
      if (dialogOpen) {
        await openPermissionDialog(selectedUser)
      }
    } catch (error: any) {
      setError(`خطأ في تطبيق القالب: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const savePermissions = async () => {
    if (!selectedUser) return

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      // Delete existing permissions
      await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', selectedUser.id)

      // Insert new permissions
      const permissionsToInsert: any[] = []
      Object.entries(userPermissions).forEach(([key, granted]) => {
        const [resource_type, permission_type] = key.split('_')
        permissionsToInsert.push({
          user_id: selectedUser.id,
          resource_type,
          permission_type,
          granted,
          created_by: profile?.id,
        })
      })

      if (permissionsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('user_permissions')
          .insert(permissionsToInsert)

        if (insertError) throw insertError
      }

      setSuccess('تم حفظ الصلاحيات بنجاح')
      setTimeout(() => {
        setDialogOpen(false)
        setSuccess(null)
      }, 1500)
    } catch (error: any) {
      setError(`خطأ في حفظ الصلاحيات: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const togglePermission = (resource: string, permission: string) => {
    const key = `${resource}_${permission}`
    setUserPermissions(prev => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const getUserPermissionsSummary = (user: UserType) => {
    // This would require fetching permissions, but for now show role
    return user.role
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">جاري التحميل...</div>
      </div>
    )
  }

  if (!hasPermission('manage_users')) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <div>
                <h3 className="text-lg font-semibold">ليس لديك صلاحية</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  يجب أن تكون مالكاً للوصول إلى إدارة الصلاحيات
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">إدارة الصلاحيات</h1>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {success && (
        <Card className="border-green-500">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-green-600">
              <Shield className="h-5 w-5" />
              <p>{success}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Users List */}
      <Card>
        <CardHeader>
          <CardTitle>المستخدمون</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0" style={{ WebkitOverflowScrolling: 'touch' }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>البريد الإلكتروني</TableHead>
                  <TableHead>الدور</TableHead>
                  <TableHead>الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'Owner' ? 'default' : 'secondary'}>
                        {user.role === 'Owner' ? 'مالك' : 'عامل'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.role !== 'Owner' && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openPermissionDialog(user)}
                          >
                            <Shield className="h-4 w-4 ml-1" />
                            إدارة الصلاحيات
                          </Button>
                          {templates.length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedUser(user)
                                setTemplateDialogOpen(true)
                              }}
                            >
                              تطبيق قالب
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Permission Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              إدارة صلاحيات: {selectedUser?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              حدد الصلاحيات المخصصة لهذا المستخدم. الصلاحيات المخصصة تتجاوز صلاحيات الدور الافتراضية.
            </p>
            <div className="space-y-4">
              {RESOURCES.map((resource) => (
                <Card key={resource.value}>
                  <CardHeader>
                    <CardTitle className="text-lg">{resource.label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                      {PERMISSION_TYPES.map((perm) => {
                        const key = `${resource.value}_${perm.value}`
                        const isChecked = userPermissions[key] || false
                        return (
                          <div key={perm.value} className="flex items-center space-x-2 space-x-reverse">
                            <Checkbox
                              id={key}
                              checked={isChecked}
                              onCheckedChange={() => togglePermission(resource.value, perm.value)}
                            />
                            <Label htmlFor={key} className="cursor-pointer">
                              {perm.label}
                            </Label>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={savePermissions} disabled={saving}>
              {saving ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تطبيق قالب صلاحيات</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>اختر قالب</Label>
              <Select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
              >
                <option value="">اختر قالب...</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} - {template.description || ''}
                  </option>
                ))}
              </Select>
            </div>
            {selectedTemplate && (
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  {templates.find(t => t.id === selectedTemplate)?.description}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setTemplateDialogOpen(false)
              setSelectedTemplate('')
            }}>
              إلغاء
            </Button>
            <Button onClick={applyTemplate} disabled={saving || !selectedTemplate}>
              {saving ? 'جاري التطبيق...' : 'تطبيق'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

