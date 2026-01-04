import { useEffect, useState } from 'react'
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
import { Plus, Edit, Trash2, User, Shield, Activity, TrendingUp, CheckCircle2, ShoppingCart, Map as MapIcon, Users as UsersIcon, Calendar, FileText } from 'lucide-react'
import type { User as UserType, UserRole, UserStatus, Sale } from '@/types/database'
import { sanitizeText, sanitizeEmail } from '@/lib/sanitize'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatCurrency, formatDate } from '@/lib/utils'

const roleColors: Record<UserRole, 'default' | 'secondary' | 'destructive'> = {
  Owner: 'default',
  Manager: 'secondary',
  FieldStaff: 'destructive',
}

interface UserStats {
  userId: string
  salesCreated: number
  salesConfirmed: number
  totalSalesValue: number
  totalConfirmedValue: number
  lastActivity: string | null
}

export function Users() {
  const { hasPermission, profile } = useAuth()
  const [users, setUsers] = useState<UserType[]>([])
  const [userStats, setUserStats] = useState<Map<string, UserStats>>(new Map())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<string | null>(null)
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false)
  const [userToToggle, setUserToToggle] = useState<UserType | null>(null)
  const [selectedUserForDetails, setSelectedUserForDetails] = useState<UserType | null>(null)
  const [userDetailsOpen, setUserDetailsOpen] = useState(false)
  const [userCreatedSales, setUserCreatedSales] = useState<any[]>([])
  const [userConfirmedSales, setUserConfirmedSales] = useState<any[]>([])
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [userActivityLogs, setUserActivityLogs] = useState<any[]>([])
  const [userPayments, setUserPayments] = useState<any[]>([])
  const [userClients, setUserClients] = useState<any[]>([])
  const [userLandBatches, setUserLandBatches] = useState<any[]>([])
  const [userReservations, setUserReservations] = useState<any[]>([])
  const [activityFilter, setActivityFilter] = useState<'all' | 'sales' | 'payments' | 'clients' | 'land' | 'audit'>('all')
  const [activityDateFilter, setActivityDateFilter] = useState<'today' | 'week' | 'month' | 'all'>('all')

  // User dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserType | null>(null)
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'FieldStaff' as UserRole,
    status: 'Active' as UserStatus,
  })

  useEffect(() => {
    if (!hasPermission('manage_users')) return
    fetchUsers()
  }, [hasPermission])

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, status, created_at, updated_at')
        .order('name', { ascending: true })

      if (error) {
        // Check for permission errors
        const errorCode = (error as any).code || ''
        const errorStatus = (error as any).status || (error as any).hint || ''
        if (errorCode === 'PGRST301' || errorCode === '42501' || errorStatus === 403 || error.message?.includes('403') || error.message?.includes('permission')) {
          setError('ليس لديك صلاحية لعرض المستخدمين. يرجى التواصل مع المسؤول.')
          console.error('Permission denied accessing users table:', error)
        } else {
          console.error('Error fetching users:', error)
          setError('خطأ في تحميل المستخدمين. يرجى المحاولة مرة أخرى.')
        }
        throw error
      }
      
      setUsers((data as UserType[]) || [])
      setError(null) // Clear any previous errors
      
      // Fetch user statistics
      await fetchUserStats((data as UserType[]) || [])
    } catch (error) {
      // Error already handled above
      setUsers([]) // Set empty array on error
    } finally {
      setLoading(false)
    }
  }

  const fetchUserStats = async (usersList: UserType[]) => {
    try {
      const statsMap = new Map<string, UserStats>()
      
      // Fetch all sales with created_by and confirmed_by
      const { data: sales } = await supabase
        .from('sales')
        .select('id, created_by, confirmed_by, total_selling_price, sale_date, status')
      
      if (sales) {
        usersList.forEach(user => {
          const userSales = sales.filter(s => 
            (s as any).created_by === user.id || (s as any).confirmed_by === user.id
          )
          
          const salesCreated = sales.filter(s => (s as any).created_by === user.id)
          const salesConfirmed = sales.filter(s => (s as any).confirmed_by === user.id)
          
          const totalSalesValue = salesCreated.reduce((sum, s) => sum + (s.total_selling_price || 0), 0)
          const totalConfirmedValue = salesConfirmed.reduce((sum, s) => sum + (s.total_selling_price || 0), 0)
          
          // Get last activity date
          const allDates = userSales
            .map(s => s.sale_date)
            .filter(Boolean)
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
          
          statsMap.set(user.id, {
            userId: user.id,
            salesCreated: salesCreated.length,
            salesConfirmed: salesConfirmed.length,
            totalSalesValue,
            totalConfirmedValue,
            lastActivity: allDates.length > 0 ? allDates[0] : null,
          })
        })
      }
      
      setUserStats(statsMap)
    } catch (error) {
      console.error('Error fetching user stats:', error)
    }
  }

  const openUserDetails = async (user: UserType) => {
    setSelectedUserForDetails(user)
    setLoadingDetails(true)
    setUserDetailsOpen(true)
    
    // Fetch COMPREHENSIVE user activity data - everything they've done
    try {
      const [
        createdRes, 
        confirmedRes, 
        paymentsRes, 
        clientsRes,
        landBatchesRes,
        reservationsRes,
        auditRes
      ] = await Promise.all([
        // Sales created by user
        supabase
          .from('sales')
          .select('*, client:clients(name, phone, cin)')
          .eq('created_by', user.id)
          .order('sale_date', { ascending: false })
          .limit(200),
        // Sales confirmed by user
        supabase
          .from('sales')
          .select('*, client:clients(name, phone, cin)')
          .eq('confirmed_by', user.id)
          .order('sale_date', { ascending: false })
          .limit(200),
        // Payments recorded by user
        supabase
          .from('payments')
          .select('*, client:clients(name, phone), sale:sales(id, sale_date, payment_type)')
          .eq('recorded_by', user.id)
          .order('payment_date', { ascending: false })
          .limit(200),
        // Clients added by user
        supabase
          .from('clients')
          .select('*')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false })
          .limit(200),
        // Land batches created by user
        supabase
          .from('land_batches')
          .select('*')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false })
          .limit(200),
        // Reservations created by user
        supabase
          .from('reservations')
          .select('*, client:clients(name, phone, cin)')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false })
          .limit(200),
        // All audit logs for user
        supabase
          .from('audit_logs')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(500)
      ])
      
      setUserCreatedSales((createdRes.data || []) as any[])
      setUserConfirmedSales((confirmedRes.data || []) as any[])
      setUserPayments((paymentsRes.data || []) as any[])
      setUserClients((clientsRes.data || []) as any[])
      setUserLandBatches((landBatchesRes.data || []) as any[])
      setUserReservations((reservationsRes.data || []) as any[])
      setUserActivityLogs((auditRes.data || []) as any[])
    } catch (error) {
      console.error('Error fetching user details:', error)
      setUserCreatedSales([])
      setUserConfirmedSales([])
      setUserPayments([])
      setUserClients([])
      setUserLandBatches([])
      setUserReservations([])
      setUserActivityLogs([])
    } finally {
      setLoadingDetails(false)
    }
  }

  const getDateRange = (filter: 'today' | 'week' | 'month' | 'all') => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    switch (filter) {
      case 'today':
        return { start: today, end: new Date(today.getTime() + 24 * 60 * 60 * 1000) }
      case 'week':
        const weekAgo = new Date(today)
        weekAgo.setDate(weekAgo.getDate() - 7)
        return { start: weekAgo, end: null }
      case 'month':
        const monthAgo = new Date(today)
        monthAgo.setMonth(monthAgo.getMonth() - 1)
        return { start: monthAgo, end: null }
      default:
        return { start: new Date(0), end: null }
    }
  }

  const openDialog = (user?: UserType) => {
    setError(null) // Clear any previous errors
    if (user) {
      setEditingUser(user)
      setForm({
        name: user.name,
        email: user.email,
        password: '',
        role: user.role,
        status: user.status,
      })
    } else {
      setEditingUser(null)
      setForm({
        name: '',
        email: '',
        password: '',
        role: 'FieldStaff',
        status: 'Active',
      })
    }
    setDialogOpen(true)
  }

  const saveUser = async () => {
    setError(null)
    setSaving(true)

    try {
      // Check permissions first - with better error message
      if (!hasPermission('manage_users')) {
        setError('ليس لديك صلاحية لإدارة المستخدمين. يرجى التواصل مع المسؤول.')
        console.error('Permission check failed:', {
          hasPermission: hasPermission('manage_users'),
          profile: profile,
          profileRole: profile?.role
        })
        setSaving(false)
        return
      }
      
      // Validate form
      if (!form.name.trim()) {
        setError('الاسم مطلوب')
        setSaving(false)
        return
      }

      if (editingUser) {
        // Update existing user
        const { error } = await supabase
          .from('users')
          .update({
            name: sanitizeText(form.name),
            role: form.role,
            status: form.status,
          })
          .eq('id', editingUser.id)

        if (error) {
          const errorCode = (error as any).code || ''
          const errorStatus = (error as any).status || ''
          if (errorCode === 'PGRST301' || errorCode === '42501' || errorStatus === 403 || error.message?.includes('403') || error.message?.includes('permission')) {
            setError('ليس لديك صلاحية لتعديل المستخدمين. يرجى التواصل مع المسؤول.')
          } else {
            setError('خطأ في تحديث المستخدم. يرجى المحاولة مرة أخرى.')
          }
          setSaving(false)
          return
        }

        setDialogOpen(false)
        setForm({ name: '', email: '', password: '', role: 'FieldStaff', status: 'Active' })
        await fetchUsers()
      } else {
        // Create new user with Supabase Auth
        // Password is optional - will generate random password if not provided

        // Validate and sanitize email
        let cleanEmail = form.email.trim().toLowerCase()
        
        if (!cleanEmail) {
          setError('البريد الإلكتروني مطلوب')
          setSaving(false)
          return
        }

        // Remove any potentially problematic characters but keep email structure
        cleanEmail = cleanEmail.replace(/[<>]/g, '').slice(0, 254)

        // Better email validation regex - RFC 5322 compliant
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
        if (!emailRegex.test(cleanEmail)) {
          setError('البريد الإلكتروني غير صالح. يرجى إدخال بريد إلكتروني صحيح (مثال: user@example.com)')
          setSaving(false)
          return
        }
        
        // Additional validation: check for common issues
        if (cleanEmail.includes('..') || cleanEmail.startsWith('.') || cleanEmail.endsWith('.')) {
          setError('البريد الإلكتروني غير صالح. لا يمكن أن يبدأ أو ينتهي بنقطة أو يحتوي على نقطتين متتاليتين')
          setSaving(false)
          return
        }
        
        // Check for spaces
        if (cleanEmail.includes(' ')) {
          setError('البريد الإلكتروني غير صالح. لا يمكن أن يحتوي على مسافات')
          setSaving(false)
          return
        }

        // Check if email already exists in users table
        const { data: existingUsers, error: checkError } = await supabase
          .from('users')
          .select('id, email')
          .eq('email', cleanEmail)
          .limit(1)

        if (checkError) {
          const errorCode = (checkError as any).code || ''
          const errorStatus = (checkError as any).status || ''
          if (errorCode === 'PGRST301' || errorCode === '42501' || errorStatus === 403 || checkError.message?.includes('403') || checkError.message?.includes('permission')) {
            setError('ليس لديك صلاحية للوصول إلى جدول المستخدمين. يرجى التواصل مع المسؤول.')
          } else {
            setError('خطأ في التحقق من البريد الإلكتروني. يرجى المحاولة مرة أخرى.')
          }
          setSaving(false)
          return
        }

        if (existingUsers && existingUsers.length > 0) {
          setError('البريد الإلكتروني مستخدم بالفعل')
          setSaving(false)
          return
        }

        // Final validation: ensure email is properly formatted and doesn't have hidden characters
        // Remove any non-printable characters
        cleanEmail = cleanEmail.replace(/[\x00-\x1F\x7F]/g, '')
        
        // Double-check email format one more time
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
          setError('البريد الإلكتروني غير صالح. يرجى التحقق من صحة البريد الإلكتروني')
          setSaving(false)
          return
        }

        // Password validation - password is required for signup
        // Generate secure random password if not provided (min 12 chars with special chars)
        let userPassword = form.password && form.password.trim().length >= 6
          ? form.password.trim()
          : null
        
        if (!userPassword) {
          // Generate secure random password: 12 chars with letters, numbers, and special chars
          const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
          userPassword = ''
          for (let i = 0; i < 12; i++) {
            userPassword += chars.charAt(Math.floor(Math.random() * chars.length))
          }
        }
        
        // Validate password meets Supabase requirements (min 6 chars)
        if (userPassword.length < 6) {
          setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
          setSaving(false)
          return
        }

        // IMPORTANT: Save current admin session BEFORE signup
        // signUp() automatically logs in as the new user, which logs out the admin
        const { data: currentSession } = await supabase.auth.getSession()
        const adminAccessToken = currentSession?.session?.access_token
        const adminRefreshToken = currentSession?.session?.refresh_token
        
        // Create auth user
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: cleanEmail,
          password: userPassword,
          options: {
            data: {
              name: form.name.trim(),
              role: form.role,
              status: form.status,
            },
            emailRedirectTo: undefined, // Don't send confirmation email
          },
        })
        
        // IMMEDIATELY restore admin session after signup
        // This prevents the auto-login as the new user
        if (adminAccessToken && adminRefreshToken) {
          await supabase.auth.setSession({
            access_token: adminAccessToken,
            refresh_token: adminRefreshToken,
          })
        }

        if (authError) {
          // Provide more specific error messages
          let errorMessage = 'خطأ في إنشاء الحساب. يرجى المحاولة مرة أخرى.'
          
          const errorMsg = authError.message.toLowerCase()
          const errorCode = (authError as any).status || (authError as any).code || ''
          
          // Check for specific error types
          if (errorMsg.includes('already registered') || errorMsg.includes('already exists') || errorMsg.includes('user already') || errorCode === 'user_already_registered') {
            errorMessage = 'البريد الإلكتروني مستخدم بالفعل في نظام المصادقة'
          } else if (errorMsg.includes('invalid email') || errorMsg.includes('email') || errorCode === 'invalid_email') {
            // If email validation passed our checks but Supabase rejects it, provide more context
            errorMessage = `البريد الإلكتروني "${cleanEmail}" غير مقبول من قبل النظام. يرجى التحقق من صحة البريد الإلكتروني أو استخدام بريد إلكتروني آخر.`
          } else if (errorMsg.includes('password') || errorMsg.includes('weak') || errorCode === 'weak_password') {
            errorMessage = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'
          } else if (errorMsg.includes('signup_disabled') || errorCode === 'signup_disabled') {
            errorMessage = 'إنشاء الحسابات معطل حالياً'
          } else if (errorMsg.includes('rate limit') || errorCode === 'too_many_requests') {
            errorMessage = 'تم تجاوز الحد المسموح. يرجى المحاولة لاحقاً'
          } else if (errorCode === 400 || errorCode === 422) {
            errorMessage = `خطأ في البيانات المرسلة: ${errorMsg}. يرجى التحقق من جميع الحقول.`
          } else if (errorCode === 422) {
            errorMessage = `خطأ في التحقق من البيانات: ${errorMsg}. قد يكون البريد الإلكتروني غير صالح أو هناك مشكلة في الإعدادات.`
          }
          
          console.error('Signup error details:', {
            message: authError.message,
            code: errorCode,
            email: cleanEmail,
            fullError: authError
          })
          setError(errorMessage)
          setSaving(false)
          return
        }

        if (!authData.user) {
          setError('فشل إنشاء المستخدم. لم يتم إنشاء حساب المصادقة')
          setSaving(false)
          return
        }

        // Wait and retry to ensure auth.users record is fully committed
        let userError = null
        let retries = 0
        const maxRetries = 5
        
        while (retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (retries + 1)))
          
          const { error } = await supabase.from('users').insert([
          {
            id: authData.user.id,
            name: sanitizeText(form.name),
              email: cleanEmail,
            role: form.role,
            status: form.status,
          },
        ])

          if (!error) {
            userError = null
            break
          }
          
          userError = error
          retries++
          
          // If it's not a foreign key error, stop retrying
          if (!error.message.includes('foreign key') && !error.message.includes('users_id_fkey')) {
            break
          }
        }

        if (userError) {
          // Check if it's a permission error
          const errorCode = (userError as any).code || ''
          const errorStatus = (userError as any).status || ''
          const errorMessage = userError.message || ''
          
          if (errorCode === 'PGRST301' || errorCode === '42501' || errorStatus === 403 || errorMessage.includes('403') || errorMessage.includes('permission') || errorMessage.includes('row-level security')) {
            setError('ليس لديك صلاحية لإضافة مستخدمين في قاعدة البيانات. يرجى التواصل مع المسؤول لإصلاح صلاحيات الوصول (RLS policies).')
          } else {
            // Use generic error message to avoid leaking database details
            setError(`خطأ في حفظ بيانات المستخدم: ${errorMessage}. يرجى المحاولة مرة أخرى أو التواصل مع المسؤول.`)
          }
          console.error('Error inserting user:', {
            code: errorCode,
            status: errorStatus,
            message: errorMessage,
            fullError: userError
          })
          
          // IMPORTANT: Restore admin session if insert failed
          // The signUp might have changed the session
          try {
            if (adminAccessToken && adminRefreshToken) {
              await supabase.auth.setSession({
                access_token: adminAccessToken,
                refresh_token: adminRefreshToken,
              })
            }
          } catch (cleanupError) {
            console.warn('Could not restore admin session:', cleanupError)
          }
          
          setSaving(false)
          return
        }

        // Success
        setDialogOpen(false)
        setForm({ name: '', email: '', password: '', role: 'FieldStaff', status: 'Active' })
        setError(null)
        await fetchUsers()
      }
    } catch (error: any) {
      // Provide specific error messages based on error type
      if (error?.message) {
        setError(error.message)
      } else if (error?.code === 'PGRST301' || error?.code === '42501' || error?.status === 403) {
        setError('ليس لديك صلاحية لإجراء هذه العملية. يرجى التواصل مع المسؤول.')
      } else {
        setError('خطأ في حفظ بيانات المستخدم. يرجى المحاولة مرة أخرى.')
      }
      console.error('Error saving user:', error)
    } finally {
      setSaving(false)
    }
  }

  const deleteUser = async (userId: string) => {
    if (userId === profile?.id) {
      setError('لا يمكنك حذف حسابك الخاص')
      return
    }

    setUserToDelete(userId)
    setDeleteConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!userToDelete) return

    try {
      // Delete from users table
      // Note: Deleting from auth.users requires admin privileges and should be done server-side
      // For now, deleting from users table is sufficient as RLS policies will prevent login
      // if the user doesn't exist in the users table
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('id', userToDelete)

      if (deleteError) {
        // Check if it's a foreign key constraint error
        if (deleteError.message?.includes('foreign key') || deleteError.message?.includes('constraint')) {
          throw new Error('لا يمكن حذف المستخدم لأنه مرتبط بسجلات أخرى (مبيعات، دفعات، إلخ)')
        }
        throw deleteError
      }

      fetchUsers()
      setDeleteConfirmOpen(false)
      setUserToDelete(null)
    } catch (error: any) {
      console.error('Error deleting user:', error)
      setError(error?.message || 'خطأ في حذف المستخدم. قد يكون المستخدم مرتبطاً بسجلات أخرى.')
      setDeleteConfirmOpen(false)
      setUserToDelete(null)
    }
  }

  const toggleStatus = async (user: UserType) => {
    if (user.id === profile?.id) {
      setError('لا يمكنك تغيير حالتك الخاصة')
      return
    }

    setUserToToggle(user)
    setStatusConfirmOpen(true)
  }

  const confirmToggleStatus = async () => {
    if (!userToToggle) return

    try {
      const newStatus = userToToggle.status === 'Active' ? 'Inactive' : 'Active'
      const { error } = await supabase
        .from('users')
        .update({ status: newStatus })
        .eq('id', userToToggle.id)

      if (error) throw error
      fetchUsers()
      setStatusConfirmOpen(false)
      setUserToToggle(null)
    } catch (error) {
      setError('خطأ في تحديث حالة المستخدم')
      setStatusConfirmOpen(false)
      setUserToToggle(null)
    }
  }

  if (!hasPermission('manage_users')) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">
          You don't have permission to manage users.
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">Loading users...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">إدارة المستخدمين</h1>
          <p className="text-muted-foreground text-sm sm:text-base">إدارة مستخدمي النظام وأدوارهم</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button onClick={() => openDialog()} className="flex-1 sm:flex-none">
          <Plus className="mr-2 h-4 w-4" />
            إضافة مستخدم
          </Button>
          <Button 
            variant="outline" 
            onClick={() => window.location.href = '/permissions'} 
            className="flex-1 sm:flex-none"
          >
            <Shield className="mr-2 h-4 w-4" />
            إدارة الصلاحيات
        </Button>
        </div>
      </div>

      {/* Role Overview */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Owners</CardTitle>
            <Shield className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((u) => u.role === 'Owner').length}
            </div>
            <p className="text-xs text-muted-foreground">Full system access</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Managers</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((u) => u.role === 'Manager').length}
            </div>
            <p className="text-xs text-muted-foreground">Limited financial access</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Field Staff</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((u) => u.role === 'FieldStaff').length}
            </div>
            <p className="text-xs text-muted-foreground">Basic operations only</p>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>جميع المستخدمين</CardTitle>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا يوجد مستخدمين</p>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0" style={{ WebkitOverflowScrolling: 'touch' }}>
              <Table className="min-w-full">
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>البريد الإلكتروني</TableHead>
                  <TableHead>الدور</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الإحصائيات</TableHead>
                  <TableHead>الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      <div 
                        className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors"
                        onClick={() => openUserDetails(user)}
                      >
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="hover:underline">{user.name}</span>
                        {user.id === profile?.id && (
                          <Badge variant="outline" className="ml-2">
                            أنت
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={roleColors[user.role]}>
                        {user.role === 'Owner' ? 'مالك' : 
                         user.role === 'Manager' ? 'مدير' : 
                         'موظف ميداني'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={user.status === 'Active' ? 'success' : 'secondary'}
                        className="cursor-pointer"
                        onClick={() => toggleStatus(user)}
                      >
                        {user.status === 'Active' ? 'نشط' : 'غير نشط'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const stats = userStats.get(user.id)
                        return stats ? (
                          <div className="flex flex-col gap-1 text-xs">
                            <span className="text-muted-foreground">
                              أنشأ: {stats.salesCreated} | أكد: {stats.salesConfirmed}
                            </span>
                            {stats.lastActivity && (
                              <span className="text-muted-foreground">
                                آخر نشاط: {formatDate(stats.lastActivity)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDialog(user)}
                          title="تعديل"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteUser(user.id)}
                          disabled={user.id === profile?.id}
                          title="حذف"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open)
        if (!open) {
          setError(null)
          setForm({ name: '', email: '', password: '', role: 'FieldStaff', status: 'Active' })
          setEditingUser(null)
        }
      }}>
        <DialogContent className="w-[95vw] sm:max-w-lg max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'تعديل المستخدم' : 'إضافة مستخدم جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">الاسم</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value })
                  setError(null)
                }}
                placeholder="أدخل اسم المستخدم"
                disabled={saving}
                maxLength={255}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => {
                  setForm({ ...form, email: e.target.value })
                  setError(null)
                }}
                disabled={!!editingUser || saving}
                placeholder="user@example.com"
                maxLength={254}
              />
            </div>
            {!editingUser && (
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور (اختياري)</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(e) => {
                    setForm({ ...form, password: e.target.value })
                    setError(null)
                  }}
                  placeholder="اتركه فارغاً لإنشاء كلمة مرور عشوائية"
                  disabled={saving}
                  maxLength={72}
                />
                <p className="text-xs text-muted-foreground">
                  إذا تركت الحقل فارغاً، سيتم إنشاء كلمة مرور عشوائية تلقائياً
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="role">الدور</Label>
              <Select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                disabled={saving}
              >
                <option value="Owner">مالك (Owner)</option>
                <option value="Manager">مدير (Manager)</option>
                <option value="FieldStaff">موظف ميداني (Field Staff)</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">الحالة</Label>
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as UserStatus })}
                disabled={saving}
              >
                <option value="Active">نشط</option>
                <option value="Inactive">غير نشط</option>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setDialogOpen(false)
                setError(null)
              }}
              disabled={saving}
            >
              إلغاء
            </Button>
            <Button onClick={saveUser} disabled={saving}>
              {saving ? 'جاري الحفظ...' : editingUser ? 'حفظ التغييرات' : 'إضافة المستخدم'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Details Dialog */}
      <Dialog open={userDetailsOpen} onOpenChange={(open) => {
        setUserDetailsOpen(open)
        if (!open) {
          setSelectedUserForDetails(null)
          setUserCreatedSales([])
          setUserConfirmedSales([])
          setUserPayments([])
          setUserClients([])
          setUserLandBatches([])
          setUserReservations([])
          setUserActivityLogs([])
          setActivityFilter('all')
          setActivityDateFilter('all')
        }
      }}>
        <DialogContent className="w-[95vw] sm:w-full max-w-6xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>تفاصيل المستخدم: {selectedUserForDetails?.name}</DialogTitle>
              <div className="flex gap-2">
                <Select 
                  value={activityDateFilter} 
                  onChange={(e) => setActivityDateFilter(e.target.value as any)}
                  className="w-32"
                >
                  <option value="today">اليوم</option>
                  <option value="week">هذا الأسبوع</option>
                  <option value="month">هذا الشهر</option>
                  <option value="all">الكل</option>
                </Select>
    </div>
            </div>
          </DialogHeader>
          {selectedUserForDetails && (
            <div className="space-y-6">
              {/* User Info */}
              <Card>
                <CardHeader>
                  <CardTitle>معلومات المستخدم</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">الاسم</p>
                      <p className="font-medium">{selectedUserForDetails.name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">البريد الإلكتروني</p>
                      <p className="font-medium">{selectedUserForDetails.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">الدور</p>
                      <Badge variant={roleColors[selectedUserForDetails.role]}>
                        {selectedUserForDetails.role === 'Owner' ? 'مالك' : 
                         selectedUserForDetails.role === 'Manager' ? 'مدير' : 
                         'موظف ميداني'}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">الحالة</p>
                      <Badge variant={selectedUserForDetails.status === 'Active' ? 'success' : 'secondary'}>
                        {selectedUserForDetails.status === 'Active' ? 'نشط' : 'غير نشط'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Comprehensive Statistics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-blue-600" />
                      المبيعات المنشأة
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{userCreatedSales.length}</div>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(userCreatedSales.reduce((sum, s) => sum + (s.total_selling_price || 0), 0))}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      المبيعات المؤكدة
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{userConfirmedSales.length}</div>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(userConfirmedSales.reduce((sum, s) => sum + (s.total_selling_price || 0), 0))}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-purple-600" />
                      المدفوعات
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{userPayments.length}</div>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(userPayments.reduce((sum, p) => sum + (p.amount_paid || 0), 0))}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <UsersIcon className="h-4 w-4 text-indigo-600" />
                      العملاء المضافون
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{userClients.length}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <MapIcon className="h-4 w-4 text-teal-600" />
                      دفعات الأراضي
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{userLandBatches.length}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-orange-600" />
                      الحجوزات
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{userReservations.length}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Created Sales */}
              {loadingDetails ? (
                <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
              ) : (
                <>
                  {userCreatedSales.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>المبيعات المنشأة ({userCreatedSales.length})</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>التاريخ</TableHead>
                                <TableHead>العميل</TableHead>
                                <TableHead>النوع</TableHead>
                                <TableHead className="text-right">المبلغ</TableHead>
                                <TableHead>الحالة</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {userCreatedSales.map((sale: any) => (
                                <TableRow key={sale.id}>
                                  <TableCell>{formatDate(sale.sale_date)}</TableCell>
                                  <TableCell>
                                    {sale.client?.name || 'غير معروف'}
                                    {sale.client?.phone && (
                                      <span className="text-xs text-muted-foreground block">
                                        ({sale.client.phone})
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={sale.payment_type === 'Full' ? 'success' : 'secondary'}>
                                      {sale.payment_type === 'Full' ? 'بالحاضر' : 'بالتقسيط'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {formatCurrency(sale.total_selling_price)}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={
                                        sale.status === 'Completed' ? 'success' :
                                        sale.status === 'Cancelled' ? 'destructive' : 'warning'
                                      }
                                    >
                                      {sale.status === 'Completed' ? 'مباع' :
                                       sale.status === 'Cancelled' ? 'ملغي' : 'قيد الدفع'}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Confirmed Sales */}
                  {userConfirmedSales.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>المبيعات المؤكدة ({userConfirmedSales.length})</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>التاريخ</TableHead>
                                <TableHead>العميل</TableHead>
                                <TableHead>النوع</TableHead>
                                <TableHead className="text-right">المبلغ</TableHead>
                                <TableHead>الحالة</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {userConfirmedSales.map((sale: any) => (
                                <TableRow key={sale.id}>
                                  <TableCell>{formatDate(sale.sale_date)}</TableCell>
                                  <TableCell>
                                    {sale.client?.name || 'غير معروف'}
                                    {sale.client?.phone && (
                                      <span className="text-xs text-muted-foreground block">
                                        ({sale.client.phone})
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={sale.payment_type === 'Full' ? 'success' : 'secondary'}>
                                      {sale.payment_type === 'Full' ? 'بالحاضر' : 'بالتقسيط'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {formatCurrency(sale.total_selling_price)}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={
                                        sale.status === 'Completed' ? 'success' :
                                        sale.status === 'Cancelled' ? 'destructive' : 'warning'
                                      }
                                    >
                                      {sale.status === 'Completed' ? 'مباع' :
                                       sale.status === 'Cancelled' ? 'ملغي' : 'قيد الدفع'}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Payments Recorded */}
                  {userPayments.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>المدفوعات المسجلة ({userPayments.length})</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>التاريخ</TableHead>
                                <TableHead>العميل</TableHead>
                                <TableHead>نوع الدفع</TableHead>
                                <TableHead className="text-right">المبلغ</TableHead>
                                <TableHead>ملاحظات</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {userPayments.map((payment: any) => (
                                <TableRow key={payment.id}>
                                  <TableCell>{formatDate(payment.payment_date)}</TableCell>
                                  <TableCell>
                                    {payment.client?.name || 'غير معروف'}
                                    {payment.client?.phone && (
                                      <span className="text-xs text-muted-foreground block">
                                        ({payment.client.phone})
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="secondary" className="text-xs">
                                      {payment.payment_type === 'Full' ? 'دفع كامل' :
                                       payment.payment_type === 'Installment' ? 'قسط' :
                                       payment.payment_type === 'BigAdvance' ? 'دفعة كبيرة' :
                                       payment.payment_type === 'SmallAdvance' ? 'عربون' :
                                       payment.payment_type || '-'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {formatCurrency(payment.amount_paid)}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {payment.notes || '-'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Clients Added */}
                  {userClients.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>العملاء المضافون ({userClients.length})</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>التاريخ</TableHead>
                                <TableHead>الاسم</TableHead>
                                <TableHead>رقم الهوية</TableHead>
                                <TableHead>الهاتف</TableHead>
                                <TableHead>النوع</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {userClients.map((client: any) => (
                                <TableRow key={client.id}>
                                  <TableCell>{formatDate(client.created_at)}</TableCell>
                                  <TableCell className="font-medium">{client.name}</TableCell>
                                  <TableCell>{client.cin}</TableCell>
                                  <TableCell>{client.phone || '-'}</TableCell>
                                  <TableCell>
                                    <Badge variant="secondary">{client.client_type || 'فرد'}</Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Land Batches Created */}
                  {userLandBatches.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>دفعات الأراضي المنشأة ({userLandBatches.length})</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>التاريخ</TableHead>
                                <TableHead>اسم الدفعة</TableHead>
                                <TableHead className="text-right">المساحة (م²)</TableHead>
                                <TableHead className="text-right">التكلفة</TableHead>
                                <TableHead>ملاحظات</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {userLandBatches.map((batch: any) => (
                                <TableRow key={batch.id}>
                                  <TableCell>{formatDate(batch.date_acquired)}</TableCell>
                                  <TableCell className="font-medium">{batch.name}</TableCell>
                                  <TableCell className="text-right">{batch.total_surface}</TableCell>
                                  <TableCell className="text-right font-medium">{formatCurrency(batch.total_cost)}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground">{batch.notes || '-'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Reservations Created */}
                  {userReservations.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>الحجوزات المنشأة ({userReservations.length})</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>التاريخ</TableHead>
                                <TableHead>العميل</TableHead>
                                <TableHead className="text-right">العربون</TableHead>
                                <TableHead>تاريخ الانتهاء</TableHead>
                                <TableHead>الحالة</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {userReservations.map((reservation: any) => (
                                <TableRow key={reservation.id}>
                                  <TableCell>{formatDate(reservation.reservation_date)}</TableCell>
                                  <TableCell>
                                    {reservation.client?.name || 'غير معروف'}
                                    {reservation.client?.phone && (
                                      <span className="text-xs text-muted-foreground block">
                                        ({reservation.client.phone})
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {formatCurrency(reservation.small_advance_amount)}
                                  </TableCell>
                                  <TableCell>{formatDate(reservation.reserved_until)}</TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={
                                        reservation.status === 'Confirmed' ? 'success' :
                                        reservation.status === 'Cancelled' ? 'destructive' :
                                        reservation.status === 'Expired' ? 'secondary' : 'warning'
                                      }
                                    >
                                      {reservation.status === 'Confirmed' ? 'مؤكد' :
                                       reservation.status === 'Cancelled' ? 'ملغي' :
                                       reservation.status === 'Expired' ? 'منتهي' : 'قيد الانتظار'}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Activity Timeline */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>سجل النشاط</CardTitle>
                        <Select 
                          value={activityFilter} 
                          onChange={(e) => setActivityFilter(e.target.value as any)}
                          className="w-48"
                        >
                          <option value="all">الكل</option>
                          <option value="sales">المبيعات</option>
                          <option value="payments">المدفوعات</option>
                          <option value="clients">العملاء</option>
                          <option value="land">الأراضي</option>
                          <option value="audit">سجلات النظام</option>
                        </Select>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {(() => {
                          const allActivities: any[] = []
                          
                          // Add sales created
                          userCreatedSales.forEach(sale => {
                            allActivities.push({
                              type: 'sale_created',
                              date: sale.sale_date,
                              timestamp: sale.created_at,
                              title: 'إنشاء بيع جديد',
                              description: `عميل: ${sale.client?.name || 'غير معروف'} - ${formatCurrency(sale.total_selling_price)}`,
                              icon: ShoppingCart,
                              color: 'blue',
                              data: sale
                            })
                          })
                          
                          // Add sales confirmed
                          userConfirmedSales.forEach(sale => {
                            allActivities.push({
                              type: 'sale_confirmed',
                              date: sale.sale_date,
                              timestamp: sale.updated_at || sale.created_at,
                              title: 'تأكيد بيع',
                              description: `عميل: ${sale.client?.name || 'غير معروف'} - ${formatCurrency(sale.total_selling_price)}`,
                              icon: CheckCircle2,
                              color: 'green',
                              data: sale
                            })
                          })
                          
                          // Add payments
                          userPayments.forEach(payment => {
                            allActivities.push({
                              type: 'payment',
                              date: payment.payment_date,
                              timestamp: payment.created_at,
                              title: 'تسجيل دفعة',
                              description: `عميل: ${payment.client?.name || 'غير معروف'} - ${formatCurrency(payment.amount_paid)}`,
                              icon: TrendingUp,
                              color: 'purple',
                              data: payment
                            })
                          })
                          
                          // Add clients created
                          userClients.forEach(client => {
                            allActivities.push({
                              type: 'client_created',
                              date: client.created_at?.split('T')[0],
                              timestamp: client.created_at,
                              title: 'إضافة عميل جديد',
                              description: `${client.name} - ${client.cin || ''} ${client.phone ? `(${client.phone})` : ''}`,
                              icon: UsersIcon,
                              color: 'indigo',
                              data: client
                            })
                          })
                          
                          // Add land batches created
                          userLandBatches.forEach(batch => {
                            allActivities.push({
                              type: 'land_batch_created',
                              date: batch.date_acquired,
                              timestamp: batch.created_at,
                              title: 'إضافة دفعة أراضي',
                              description: `${batch.name} - ${formatCurrency(batch.total_cost)} - ${batch.total_surface} م²`,
                              icon: MapIcon,
                              color: 'teal',
                              data: batch
                            })
                          })
                          
                          // Add reservations created
                          userReservations.forEach(reservation => {
                            allActivities.push({
                              type: 'reservation_created',
                              date: reservation.reservation_date,
                              timestamp: reservation.created_at,
                              title: 'إنشاء حجز',
                              description: `عميل: ${reservation.client?.name || 'غير معروف'} - ${formatCurrency(reservation.small_advance_amount)}`,
                              icon: Calendar,
                              color: 'orange',
                              data: reservation
                            })
                          })
                          
                          // Add audit logs - only meaningful actions
                          const auditLogsByTable = new Map<string, any[]>()
                          userActivityLogs.forEach(log => {
                            const key = `${log.table_name}-${log.action}`
                            if (!auditLogsByTable.has(key)) {
                              auditLogsByTable.set(key, [])
                            }
                            auditLogsByTable.get(key)!.push(log)
                          })
                          
                          // Process audit logs - group UPDATEs and show only significant ones
                          auditLogsByTable.forEach((logs, key) => {
                            const [tableName, action] = key.split('-')
                            
                            // Skip repetitive UPDATE operations on sales table (too noisy)
                            if (action === 'UPDATE' && tableName === 'sales' && logs.length > 5) {
                              // Group them into one entry
                              const latestLog = logs[0] // Most recent
                              allActivities.push({
                                type: 'audit',
                                date: latestLog.created_at.split('T')[0],
                                timestamp: latestLog.created_at,
                                title: `تحديثات متعددة - ${tableName}`,
                                description: `${logs.length} تحديث في جدول ${tableName}`,
                                icon: Activity,
                                color: 'yellow',
                                data: latestLog
                              })
                            } else if (action === 'INSERT' || action === 'DELETE') {
                              // Show all INSERTs and DELETEs
                              logs.forEach(log => {
                                allActivities.push({
                                  type: 'audit',
                                  date: log.created_at.split('T')[0],
                                  timestamp: log.created_at,
                                  title: action === 'INSERT' ? `إضافة جديدة - ${tableName}` : `حذف - ${tableName}`,
                                  description: action === 'INSERT' ? `إضافة سجل جديد في ${tableName}` : `حذف سجل من ${tableName}`,
                                  icon: Activity,
                                  color: action === 'INSERT' ? 'green' : 'red',
                                  data: log
                                })
                              })
                            } else if (logs.length <= 3) {
                              // Show UPDATEs if there are only a few
                              logs.forEach(log => {
                                allActivities.push({
                                  type: 'audit',
                                  date: log.created_at.split('T')[0],
                                  timestamp: log.created_at,
                                  title: `تحديث - ${tableName}`,
                                  description: `تحديث سجل في ${tableName}`,
                                  icon: Activity,
                                  color: 'yellow',
                                  data: log
                                })
                              })
                            }
                          })
                          
                          // Sort by timestamp (newest first)
                          allActivities.sort((a, b) => 
                            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                          )
                          
                          // Filter by activity type
                          const filtered = activityFilter === 'all' ? allActivities :
                            activityFilter === 'sales' ? allActivities.filter(a => a.type.startsWith('sale')) :
                            activityFilter === 'payments' ? allActivities.filter(a => a.type === 'payment') :
                            activityFilter === 'clients' ? allActivities.filter(a => a.type === 'client_created') :
                            activityFilter === 'land' ? allActivities.filter(a => a.type === 'land_batch_created' || a.type === 'reservation_created') :
                            allActivities.filter(a => a.type === 'audit')
                          
                          return filtered.length === 0 ? (
                            <p className="text-center text-muted-foreground py-8">لا يوجد نشاط</p>
                          ) : (
                            <div className="space-y-3">
                              {filtered.slice(0, 50).map((activity, idx) => {
                                const Icon = activity.icon
                                const colorClasses: Record<string, string> = {
                                  blue: 'bg-blue-100 text-blue-600',
                                  green: 'bg-green-100 text-green-600',
                                  purple: 'bg-purple-100 text-purple-600',
                                  yellow: 'bg-yellow-100 text-yellow-600',
                                  red: 'bg-red-100 text-red-600',
                                }
                                return (
                                  <div key={idx} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors">
                                    <div className={`p-2 rounded-full ${colorClasses[activity.color] || 'bg-gray-100 text-gray-600'}`}>
                                      <Icon className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1">
                                      <div className="flex items-center justify-between">
                                        <p className="font-medium text-sm">{activity.title}</p>
                                        <span className="text-xs text-muted-foreground">{formatDate(activity.timestamp)}</span>
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-1">{activity.description}</p>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })()}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={confirmDelete}
        title="تأكيد الحذف"
        description="هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع عن هذا الإجراء."
      />

      {/* Status Toggle Confirmation Dialog */}
      <ConfirmDialog
        open={statusConfirmOpen}
        onOpenChange={setStatusConfirmOpen}
        onConfirm={confirmToggleStatus}
        title={userToToggle?.status === 'Active' ? 'تعطيل المستخدم' : 'تفعيل المستخدم'}
        description={`هل أنت متأكد من ${userToToggle?.status === 'Active' ? 'تعطيل' : 'تفعيل'} هذا المستخدم؟`}
      />
    </div>
  )
}
