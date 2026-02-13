import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { IconButton } from '@/components/ui/icon-button'
import { Dialog } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

// ============================================================================
// TYPES
// ============================================================================

interface UserRow {
  id: string
  email: string
  name: string | null
  phone: string | null
  place: string | null
  title: string | null
  notes: string | null
  role: 'owner' | 'worker'
  allowed_pages: string[] | null
  allowed_batches: string[] | null
  allowed_pieces: string[] | null
  display_order: number | null
  image_url: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function UsersPage() {
  const { systemUser, user, refreshSystemUser } = useAuth()
  
  // ============================================================================
  // STATE: List View
  // ============================================================================
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ============================================================================
  // STATE: Create/Edit Dialog
  // ============================================================================
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    password: '',
    phone: '',
    place: '',
    title: '',
    notes: '',
    display_order: 0,
    allowed_pages: [] as string[],
    allowed_batches: [] as string[],
    allowed_pieces: [] as string[],
    image_url: null as string | null,
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [availableBatches, setAvailableBatches] = useState<Array<{ id: string; name: string; location: string | null }>>([])
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [batchSearchQuery, setBatchSearchQuery] = useState('')
  const [batchPieces, setBatchPieces] = useState<Map<string, Array<{ id: string; piece_number: string; surface_m2: number }>>>(new Map())
  const [loadingPieces, setLoadingPieces] = useState<Set<string>>(new Set())
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())
  
  // Available pages for permissions (سجل التأكيدات next to السجل by default)
  const availablePages = [
    { id: 'home', label: 'الرئيسية', icon: '🏠' },
    { id: 'land', label: 'دفعات الأراضي', icon: '🏞️' },
    { id: 'clients', label: 'العملاء', icon: '👥' },
    { id: 'confirmation', label: 'التأكيدات', icon: '✅' },
    { id: 'appointments', label: 'موعد اتمام البيع', icon: '📅' },
    { id: 'phone-call-appointments', label: 'مواعيد المكالمات', icon: '📞' },
    { id: 'installments', label: 'الأقساط', icon: '💳' },
    { id: 'finance', label: 'المالية', icon: '💰' },
    { id: 'sales-records', label: 'السجل', icon: '📋' },
    { id: 'confirmation-history', label: 'سجل التأكيدات', icon: '📜' },
    { id: 'contract-writers', label: 'محررين العقد', icon: '📝' },
    { id: 'users', label: 'المستخدمين', icon: '👤' },
  ]
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  // ============================================================================
  // STATE: Delete Confirmation
  // ============================================================================
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [workerToDelete, setWorkerToDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ============================================================================
  // LOAD WORKERS
  // ============================================================================
  useEffect(() => {
    loadWorkers()
    loadBatchesForPermissions()
  }, [])

  async function loadBatchesForPermissions() {
    setLoadingBatches(true)
    try {
      const { data, error: err } = await supabase
        .from('land_batches')
        .select('id, name, location')
        .order('name', { ascending: true })
        .limit(1000)

      if (err) throw err
      setAvailableBatches(data || [])
    } catch (e: any) {
      console.error('Error loading batches for permissions:', e)
      setAvailableBatches([])
    } finally {
      setLoadingBatches(false)
    }
  }

  // Filter batches based on search query
  const filteredBatches = availableBatches.filter(batch => {
    if (!batchSearchQuery.trim()) return true
    const query = batchSearchQuery.toLowerCase()
    return (
      batch.name.toLowerCase().includes(query) ||
      (batch.location && batch.location.toLowerCase().includes(query))
    )
  })

  // Enhanced natural sort function for piece numbers
  // Handles: 1,2,3 or a1,a2,b2 or A1-B2-C3 or complex patterns
  function naturalSort(a: string, b: string): number {
    // Handle null/undefined/empty
    if (!a && !b) return 0
    if (!a || a.trim() === '') return 1
    if (!b || b.trim() === '') return -1

    // Normalize: trim, lowercase, and handle special characters
    const normalize = (str: string) => str.trim().toLowerCase().replace(/[^\w\d]/g, ' ')
    const aStr = normalize(a)
    const bStr = normalize(b)

    // Split into alternating letter and number parts (handles complex patterns)
    // This regex captures: letters, numbers, or mixed segments
    const aParts = aStr.match(/([a-zA-Z]+|\d+|[^\s]+)/g) || []
    const bParts = bStr.match(/([a-zA-Z]+|\d+|[^\s]+)/g) || []

    // Compare part by part
    const maxLength = Math.max(aParts.length, bParts.length)
    
    for (let i = 0; i < maxLength; i++) {
      const aPart = aParts[i] || ''
      const bPart = bParts[i] || ''

      // If one part is missing, the shorter string comes first
      if (!aPart && !bPart) continue
      if (!aPart) return -1
      if (!bPart) return 1

      // Check if parts are numbers, letters, or mixed
      const aIsNum = /^\d+$/.test(aPart)
      const bIsNum = /^\d+$/.test(bPart)
      const aHasNum = /\d/.test(aPart)
      const bHasNum = /\d/.test(bPart)

      if (aIsNum && bIsNum) {
        // Both are pure numbers - compare numerically (handles leading zeros)
        const aNum = parseInt(aPart, 10)
        const bNum = parseInt(bPart, 10)
        const diff = aNum - bNum
        if (diff !== 0) return diff
        // If numbers are equal, compare by string length (1 < 01 < 001)
        if (aPart.length !== bPart.length) {
          return aPart.length - bPart.length
        }
      } else if (aHasNum && bHasNum) {
        // Both have numbers but are mixed - extract and compare numbers first
        const aNumMatch = aPart.match(/\d+/)
        const bNumMatch = bPart.match(/\d+/)
        if (aNumMatch && bNumMatch) {
          const aNum = parseInt(aNumMatch[0], 10)
          const bNum = parseInt(bNumMatch[0], 10)
          if (aNum !== bNum) return aNum - bNum
        }
        // If numbers are equal, compare as strings
        const diff = aPart.localeCompare(bPart, undefined, { numeric: true, sensitivity: 'base' })
        if (diff !== 0) return diff
      } else if (aIsNum) {
        // a is number, b is not - numbers come before letters
        return -1
      } else if (bIsNum) {
        // b is number, a is not - numbers come before letters
        return 1
      } else {
        // Both are strings (letters or mixed without numbers) - compare alphabetically
        const diff = aPart.localeCompare(bPart, undefined, { numeric: true, sensitivity: 'base' })
        if (diff !== 0) return diff
      }
    }

    // If all parts are equal, compare original strings (case-insensitive)
    return aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: 'base' })
  }

  async function loadPiecesForBatch(batchId: string) {
    if (batchPieces.has(batchId) || loadingPieces.has(batchId)) {
      return // Already loaded or loading
    }

    setLoadingPieces(prev => new Set(prev).add(batchId))
    try {
      const { data, error: err } = await supabase
        .from('land_pieces')
        .select('id, piece_number, surface_m2')
        .eq('batch_id', batchId)
        .limit(1000)

      if (err) throw err
      
      // Sort pieces using natural sort
      const sortedPieces = (data || []).sort((a, b) => 
        naturalSort(a.piece_number || '', b.piece_number || '')
      )
      
      setBatchPieces(prev => {
        const newMap = new Map(prev)
        newMap.set(batchId, sortedPieces)
        return newMap
      })
    } catch (e: any) {
      console.error('Error loading pieces for batch:', e)
      setBatchPieces(prev => {
        const newMap = new Map(prev)
        newMap.set(batchId, [])
        return newMap
      })
    } finally {
      setLoadingPieces(prev => {
        const newSet = new Set(prev)
        newSet.delete(batchId)
        return newSet
      })
    }
  }

  function toggleBatchExpansion(batchId: string) {
    setExpandedBatches(prev => {
      const newSet = new Set(prev)
      if (newSet.has(batchId)) {
        newSet.delete(batchId)
      } else {
        newSet.add(batchId)
        loadPiecesForBatch(batchId)
      }
      return newSet
    })
  }

  async function loadWorkers() {
    if (users.length === 0) setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('users')
        .select('id,email,name,phone,place,title,notes,role,allowed_pages,allowed_batches,allowed_pieces,display_order,image_url,created_at,updated_at,created_by')
        .order('role', { ascending: true })
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1000)

      if (err) throw err
      setUsers(data || [])
    } catch (e: any) {
      console.error('Error loading users:', e)
      setError('فشل تحميل المستخدمين')
    } finally {
      setLoading(false)
    }
  }

  // ============================================================================
  // DIALOG HANDLERS
  // ============================================================================
  async function openCreateDialog() {
    setEditingWorkerId(null)
    // Load batches if not already loaded
    if (availableBatches.length === 0 && !loadingBatches) {
      await loadBatchesForPermissions()
    }
    // Get max display_order and add 1 for new user
    const maxOrder = users.length > 0
      ? Math.max(...users.map(w => w.display_order || 0), 0)
      : 0
    setFormData({
      email: '',
      name: '',
      password: '',
      phone: '',
      place: '',
      title: '',
      notes: '',
      display_order: maxOrder + 1,
      allowed_pages: availablePages.map(p => p.id), // Default: all pages allowed
      allowed_batches: availableBatches.map(b => b.id), // Default: all batches allowed
      allowed_pieces: [], // Default: no specific pieces (access to all pieces in allowed batches)
      image_url: null,
    })
    setImageFile(null)
    setImagePreview(null)
    setShowPassword(false)
    setError(null)
    setSuccess(null)
    setDialogOpen(true)
  }

  async function openEditDialog(userRow: UserRow) {
    setEditingWorkerId(userRow.id)
    if (availableBatches.length === 0 && !loadingBatches) {
      await loadBatchesForPermissions()
    }
    setFormData({
      email: userRow.email,
      name: userRow.name || '',
      password: '',
      phone: userRow.phone || '',
      place: userRow.place || '',
      title: userRow.title || '',
      notes: userRow.notes || '',
      display_order: userRow.display_order || 0,
      allowed_pages: userRow.allowed_pages || availablePages.map(p => p.id),
      allowed_batches: userRow.allowed_batches || availableBatches.map(b => b.id),
      allowed_pieces: userRow.allowed_pieces || [],
      image_url: userRow.image_url,
    })
    setImageFile(null)
    setImagePreview(userRow.image_url)
    setShowPassword(false)
    setError(null)
    setSuccess(null)
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditingWorkerId(null)
    setBatchSearchQuery('')
    setFormData({
      email: '',
      name: '',
      password: '',
      phone: '',
      place: '',
      title: '',
      notes: '',
      display_order: 0,
      allowed_pages: [],
      allowed_batches: [],
      allowed_pieces: [],
      image_url: null,
    })
    setImageFile(null)
    setImagePreview(null)
    setShowPassword(false)
    setError(null)
    setSuccess(null)
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('الرجاء اختيار ملف صورة')
        return
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('حجم الصورة يجب أن يكون أقل من 5 ميجابايت')
        return
      }
      setImageFile(file)
      // Create preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  // ============================================================================
  // SAVE WORKER
  // ============================================================================
  async function handleSaveWorker() {
    setError(null)
    setSuccess(null)

    // Validation
    if (!formData.email.trim()) {
      setError('البريد الإلكتروني إجباري')
      return
    }

    if (!editingWorkerId && !formData.password.trim()) {
      setError('كلمة المرور إجبارية للمستخدمين الجدد')
      return
    }

    if (!editingWorkerId && formData.password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
      return
    }

    if (!supabaseAdmin) {
      setError('خدمة الإدارة غير متاحة. يرجى التحقق من إعدادات البيئة.')
      return
    }

    setSaving(true)
    try {
      // Process image if a new file is selected - upload to Supabase Storage
      let finalImageUrl: string | null = formData.image_url
      if (imageFile) {
        try {
          // Generate unique filename
          const fileExt = imageFile.name.split('.').pop()
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
          const filePath = fileName
          
          // Delete old image if updating
          if (editingWorkerId && formData.image_url && formData.image_url.includes('profile-images')) {
            try {
              // Extract old file path from URL
              const urlParts = formData.image_url.split('/')
              const oldFileIndex = urlParts.findIndex(part => part === 'profile-images')
              if (oldFileIndex !== -1 && oldFileIndex < urlParts.length - 1) {
                const oldFileName = urlParts.slice(oldFileIndex + 1).join('/')
                await supabase.storage
                  .from('profile-images')
                  .remove([oldFileName])
                  .catch(console.error) // Don't fail if old image doesn't exist
              }
            } catch (e) {
              console.error('Error deleting old image:', e)
              // Continue even if deletion fails
            }
          }
          
          // Upload to Supabase Storage
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('profile-images')
            .upload(filePath, imageFile, {
              cacheControl: '3600',
              upsert: false
            })
          
          if (uploadError) throw uploadError
          
          // Get public URL
          const { data: urlData } = supabase.storage
            .from('profile-images')
            .getPublicUrl(filePath)
          
          finalImageUrl = urlData.publicUrl
        } catch (e: any) {
          console.error('Error uploading image:', e)
          setError('فشل رفع الصورة: ' + (e.message || 'خطأ غير معروف'))
          setSaving(false)
          return
        }
      }

      if (editingWorkerId) {
        // Update existing worker
        const updateData: any = {
          email: formData.email.trim().toLowerCase(),
          name: formData.name.trim() ? formData.name.trim() : null,
          phone: formData.phone.trim() ? formData.phone.trim() : null,
          place: formData.place.trim() ? formData.place.trim() : null,
          title: formData.title.trim() ? formData.title.trim() : null,
          notes: formData.notes.trim() ? formData.notes.trim() : null,
          display_order: formData.display_order || 0,
          allowed_pages: formData.allowed_pages.length > 0 ? formData.allowed_pages : null,
          allowed_batches: formData.allowed_batches.length > 0 ? formData.allowed_batches : null,
          image_url: finalImageUrl,
          updated_at: new Date().toISOString(),
        }

        // Update password if provided
        if (formData.password.trim()) {
          // Get the worker to find auth_user_id
          const worker = users.find(w => w.id === editingWorkerId)
          if (worker) {
            // Find auth user by email
            const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers()
            if (authError) throw authError
            
            const authUser = authUsers.users.find(u => u.email === worker.email)
            if (authUser) {
              // Update password
              const { error: updatePasswordError } = await supabaseAdmin.auth.admin.updateUserById(
                authUser.id,
                { password: formData.password.trim() }
              )
              if (updatePasswordError) throw updatePasswordError
            }
          }
        }

        const { error: err } = await supabase
          .from('users')
          .update(updateData)
          .eq('id', editingWorkerId)

        if (err) throw err
        
        await loadWorkers()
        
        // If updating current user, refresh their systemUser data
        if (editingWorkerId === systemUser?.id && user) {
          await refreshSystemUser()
        }
        
        setSuccess('تم تحديث المستخدم بنجاح')
        setTimeout(() => {
          closeDialog()
        }, 1000)
      } else {
        // Create new worker with auth account
        const email = formData.email.trim().toLowerCase()
        const password = formData.password.trim()

        // Create auth user first
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true, // Auto-confirm email
        })

        if (authError) {
          if (authError.message.includes('already registered')) {
            throw new Error('البريد الإلكتروني مستخدم بالفعل')
          }
          throw authError
        }

        if (!authData.user) {
          throw new Error('فشل إنشاء حساب المصادقة')
        }

        // Create user record in users table
        const insertData = {
          email,
          name: formData.name.trim() ? formData.name.trim() : null,
          phone: formData.phone.trim() ? formData.phone.trim() : null,
          place: formData.place.trim() ? formData.place.trim() : null,
          title: formData.title.trim() ? formData.title.trim() : null,
          notes: formData.notes.trim() ? formData.notes.trim() : null,
          role: 'worker',
          display_order: formData.display_order || 0,
          allowed_pages: formData.allowed_pages.length > 0 ? formData.allowed_pages : null,
          allowed_batches: formData.allowed_batches.length > 0 ? formData.allowed_batches : null,
          allowed_pieces: formData.allowed_pieces.length > 0 ? formData.allowed_pieces : null,
          image_url: finalImageUrl,
          auth_user_id: authData.user.id,
          created_by: systemUser?.id || null,
        }
        
        const { error: err } = await supabase.from('users').insert(insertData)

        if (err) {
          // If user creation fails, try to delete the auth user
          if (authData.user) {
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(console.error)
          }
          throw err
        }

        setSuccess('تم إضافة المستخدم بنجاح')
      }

      await loadWorkers()
      setTimeout(() => {
        closeDialog()
      }, 1500)
    } catch (e: any) {
      console.error('Error saving worker:', e)
      setError(e.message || 'فشل حفظ المستخدم')
    } finally {
      setSaving(false)
    }
  }

  // ============================================================================
  // DELETE WORKER
  // ============================================================================
  function handleDeleteClick(workerId: string) {
    setWorkerToDelete(workerId)
    setDeleteConfirmOpen(true)
  }

  async function handleDeleteWorker() {
    if (!workerToDelete) return

    setDeleting(true)
    try {
      // Get worker to find auth_user_id
      const worker = users.find(w => w.id === workerToDelete)
      if (!worker) {
        throw new Error('المستخدم غير موجود')
      }

      // Get auth_user_id from users table
      const { data: userData, error: fetchError } = await supabase
        .from('users')
        .select('auth_user_id')
        .eq('id', workerToDelete)
        .single()

      if (fetchError) throw fetchError

      // Delete profile image from storage if exists
      if (worker.image_url && worker.image_url.includes('profile-images')) {
        try {
          const urlParts = worker.image_url.split('/')
          const fileIndex = urlParts.findIndex(part => part === 'profile-images')
          if (fileIndex !== -1 && fileIndex < urlParts.length - 1) {
            const fileName = urlParts.slice(fileIndex + 1).join('/')
            await supabase.storage
              .from('profile-images')
              .remove([fileName])
              .catch(console.error) // Don't fail if image doesn't exist
          }
        } catch (e) {
          console.error('Error deleting profile image:', e)
          // Continue even if deletion fails
        }
      }

      // Delete from users table first (cascade should handle auth user, but we'll delete explicitly)
      const { error: err } = await supabase
        .from('users')
        .delete()
        .eq('id', workerToDelete)

      if (err) throw err

      // Delete auth user if exists and we have admin access
      if (userData?.auth_user_id && supabaseAdmin) {
        await supabaseAdmin.auth.admin.deleteUser(userData.auth_user_id).catch((error) => {
          console.error('Error deleting auth user:', error)
          // Don't throw - user is already deleted from users table
        })
      }

      setDeleteConfirmOpen(false)
      setWorkerToDelete(null)
      await loadWorkers()
    } catch (e: any) {
      console.error('Error deleting worker:', e)
      alert('فشل حذف المستخدم: ' + e.message)
    } finally {
      setDeleting(false)
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4 sm:mb-6 lg:mb-8">
          <div className="flex items-center justify-between flex-wrap gap-3 sm:gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">
                إدارة المستخدمين
              </h1>
              <p className="text-xs sm:text-sm text-gray-600">إدارة المستخدمين والعمال</p>
            </div>
            <Button onClick={openCreateDialog} size="sm" className="text-xs sm:text-sm">
              + إضافة مستخدم جديد
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4">
            <Alert variant="error">{error}</Alert>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <Card className="text-center py-8 sm:py-12">
            <CardContent>
              <div className="inline-block animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-xs sm:text-sm text-gray-600">جاري التحميل...</p>
            </CardContent>
          </Card>
        ) : users.length === 0 ? (
          <Card className="text-center py-8 sm:py-12">
            <CardContent>
              <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4">لا يوجد مستخدمين حتى الآن</p>
              <Button onClick={openCreateDialog} size="sm" className="text-xs sm:text-sm">
                إضافة مستخدم جديد
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
            {users.map((userRow) => (
              <Card key={userRow.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="p-3 sm:p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm sm:text-base lg:text-lg mb-1 truncate">
                        {userRow.email}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-1 mb-1">
                        {userRow.title && (
                          <Badge variant="info" size="sm" className="text-xs">
                            {userRow.title}
                          </Badge>
                        )}
                      </div>
                      {userRow.phone && (
                        <p className="text-xs sm:text-sm text-gray-600 truncate">📞 {userRow.phone}</p>
                      )}
                      {userRow.place && (
                        <p className="text-xs sm:text-sm text-gray-600 truncate">📍 {userRow.place}</p>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-3 sm:p-4 pt-0">
                  {userRow.notes && (
                    <p className="text-xs sm:text-sm text-gray-600 mb-3 line-clamp-2">{userRow.notes}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-gray-500 font-medium px-2 py-1 bg-gray-100 rounded">
                      #{userRow.display_order ?? 0}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(userRow)}
                      className="text-xs sm:text-sm flex-1"
                    >
                      تعديل
                    </Button>
                    {userRow.role !== 'owner' && (
                      <IconButton
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(userRow.id)}
                        title="حذف"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </IconButton>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog
          open={dialogOpen}
          onClose={closeDialog}
          title={editingWorkerId ? 'تعديل مستخدم' : 'إضافة مستخدم جديد'}
          size="md"
        >
          <div className="space-y-4">
            {success && <Alert variant="success">{success}</Alert>}
            {error && <Alert variant="error">{error}</Alert>}

            {/* Profile Image */}
            <div>
              <Label htmlFor="image">صورة الملف الشخصي</Label>
              <div className="mt-2 flex items-center gap-4">
                {(imagePreview || formData.image_url) && (
                  <div className="flex-shrink-0 relative">
                    <img
                      src={imagePreview || formData.image_url || ''}
                      alt="Preview"
                      className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                    />
                    <button
                      type="button"
                    onClick={async () => {
                      // Delete image from storage if it exists
                      if (formData.image_url && formData.image_url.includes('profile-images')) {
                        try {
                          const urlParts = formData.image_url.split('/')
                          const oldFileIndex = urlParts.findIndex(part => part === 'profile-images')
                          if (oldFileIndex !== -1 && oldFileIndex < urlParts.length - 1) {
                            const oldFileName = urlParts.slice(oldFileIndex + 1).join('/')
                            await supabase.storage
                              .from('profile-images')
                              .remove([oldFileName])
                              .catch(console.error)
                          }
                        } catch (e) {
                          console.error('Error deleting image:', e)
                        }
                      }
                      setImageFile(null)
                      setImagePreview(null)
                      setFormData({ ...formData, image_url: null })
                      // Reset file input
                      const fileInput = document.getElementById('image') as HTMLInputElement
                      if (fileInput) fileInput.value = ''
                    }}
                      disabled={saving}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 disabled:opacity-50"
                      title="إزالة الصورة"
                    >
                      ×
                    </button>
                  </div>
                )}
                <div className="flex-1">
                  <input
                    id="image"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    disabled={saving}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
                  />
                  <p className="mt-1 text-xs text-gray-500">اختياري - إذا لم تقم باختيار صورة، سيتم استخدام الحرف الأول من الاسم</p>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="name">الاسم</Label>
              <Input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1"
                placeholder="اسم المستخدم"
                disabled={saving}
              />
            </div>

            <div>
              <Label htmlFor="email">البريد الإلكتروني *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="mt-1"
                placeholder="example@email.com"
                required
                disabled={saving}
              />
            </div>

            <div>
              <Label htmlFor="password">
                {editingWorkerId ? 'كلمة المرور (اتركها فارغة للاحتفاظ بالكلمة الحالية)' : 'كلمة المرور *'}
              </Label>
              <div className="mt-1 relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="mt-1 pr-10"
                  placeholder={editingWorkerId ? '•••••••• (اختياري)' : '••••••••'}
                  required={!editingWorkerId}
                  disabled={saving}
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center">
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-gray-400 hover:text-gray-600"
                    title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </IconButton>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="phone">رقم الهاتف</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="mt-1"
                placeholder="+216 XX XXX XXX"
                disabled={saving}
              />
            </div>

            <div>
              <Label htmlFor="place">العنوان / المكان</Label>
              <Input
                id="place"
                type="text"
                value={formData.place}
                onChange={(e) => setFormData({ ...formData, place: e.target.value })}
                className="mt-1"
                placeholder="العنوان الكامل"
                disabled={saving}
              />
            </div>

            <div>
              <Label htmlFor="title">المسمى الوظيفي</Label>
              <Input
                id="title"
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="mt-1"
                placeholder="مثال: قائد فريق، مدير فريق..."
                disabled={saving}
              />
            </div>

            <div>
              <Label htmlFor="notes">ملاحظات / مهام</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="mt-1"
                placeholder="أضف ملاحظات أو مهام للمستخدم..."
                rows={4}
                disabled={saving}
              />
            </div>

            <div>
              <Label htmlFor="display_order">ترتيب العرض</Label>
              <Input
                id="display_order"
                type="number"
                value={formData.display_order}
                onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                className="mt-1"
                placeholder="0"
                min="0"
                disabled={saving}
              />
              <p className="mt-1 text-xs text-gray-500">رقم أقل = يظهر أولاً في القائمة</p>
            </div>

            <div>
              <Label>صلاحيات الوصول للصفحات</Label>
              <p className="mt-1 mb-2 text-xs text-gray-500">
                الترتيب أدناه = ترتيب ظهور الصفحات في القائمة الجانبية. استخدم الأسهم لتغيير الترتيب.
              </p>
              <div className="mt-2 space-y-1 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-gray-50">
                {formData.allowed_pages.length === 0 ? (
                  <p className="text-xs text-gray-500 p-2">لم تُضف أي صفحة بعد. أضف من القائمة أدناه.</p>
                ) : (
                  formData.allowed_pages.map((pageId, index) => {
                    const page = availablePages.find(p => p.id === pageId)
                    if (!page) return null
                    return (
                      <div
                        key={pageId}
                        className="flex items-center gap-2 p-2 bg-white border border-gray-200 rounded"
                      >
                        <span className="text-lg">{page.icon}</span>
                        <span className="text-sm text-gray-800 flex-1">{page.label}</span>
                        <div className="flex items-center gap-0.5">
                          <IconButton
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (index <= 0) return
                              const next = [...formData.allowed_pages]
                              const t = next[index]
                              next[index] = next[index - 1]
                              next[index - 1] = t
                              setFormData({ ...formData, allowed_pages: next })
                            }}
                            disabled={saving || index === 0}
                            title="تحريك لأعلى"
                            className="p-1"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </IconButton>
                          <IconButton
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (index >= formData.allowed_pages.length - 1) return
                              const next = [...formData.allowed_pages]
                              const t = next[index]
                              next[index] = next[index + 1]
                              next[index + 1] = t
                              setFormData({ ...formData, allowed_pages: next })
                            }}
                            disabled={saving || index === formData.allowed_pages.length - 1}
                            title="تحريك لأسفل"
                            className="p-1"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </IconButton>
                          <IconButton
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setFormData({ ...formData, allowed_pages: formData.allowed_pages.filter(p => p !== pageId) })}
                            disabled={saving}
                            title="إزالة"
                            className="p-1 text-red-600 hover:bg-red-50"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </IconButton>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
              <p className="mt-2 text-xs font-medium text-gray-600">إضافة صفحة</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {availablePages
                  .filter(p => !formData.allowed_pages.includes(p.id))
                  .map((page) => (
                    <Button
                      key={page.id}
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setFormData({ ...formData, allowed_pages: [...formData.allowed_pages, page.id] })}
                      disabled={saving}
                      className="text-xs"
                    >
                      {page.icon} {page.label}
                    </Button>
                  ))}
                {availablePages.filter(p => !formData.allowed_pages.includes(p.id)).length === 0 && (
                  <span className="text-xs text-gray-500">جميع الصفحات مضافة</span>
                )}
              </div>
            </div>

            <div>
              <Label>صلاحيات الوصول لدفعات الأراضي</Label>
              <p className="mt-1 mb-3 text-xs text-gray-500">
                اختر الدفعات التي يمكن للمستخدم الوصول إليها ومشاهدتها. عند اختيار دفعة، يمكن للمستخدم رؤية جميع القطع داخل هذه الدفعة.
              </p>
              {loadingBatches ? (
                <div className="mt-2 p-4 text-center text-sm text-gray-500 bg-gray-50 rounded-lg">
                  <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mb-2"></div>
                  <div>جاري تحميل الدفعات...</div>
                </div>
              ) : availableBatches.length === 0 ? (
                <div className="mt-2 p-4 text-center text-sm text-gray-500 bg-gray-50 rounded-lg">
                  لا توجد دفعات متاحة. قم بإنشاء دفعات من صفحة "دفعات الأراضي" أولاً.
                </div>
              ) : (
                <>
                  {/* Search Bar */}
                  <div className="mt-2 mb-3">
                    <Input
                      type="text"
                      placeholder="🔍 ابحث عن دفعة بالاسم أو الموقع..."
                      value={batchSearchQuery}
                      onChange={(e) => setBatchSearchQuery(e.target.value)}
                      className="w-full text-sm"
                      disabled={saving}
                    />
                  </div>

                  {/* Select All Button */}
                  <div className="mb-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (formData.allowed_batches.length === filteredBatches.length) {
                          setFormData({
                            ...formData,
                            allowed_batches: [],
                          })
                        } else {
                          setFormData({
                            ...formData,
                            allowed_batches: filteredBatches.map(b => b.id),
                          })
                        }
                      }}
                      disabled={saving || filteredBatches.length === 0}
                      className="w-full text-xs"
                    >
                      {formData.allowed_batches.length === filteredBatches.length && filteredBatches.length > 0
                        ? 'إلغاء تحديد الكل'
                        : `تحديد الكل (${filteredBatches.length})`}
                    </Button>
                  </div>

                  {/* Batches List */}
                  {filteredBatches.length === 0 ? (
                    <div className="mt-2 p-4 text-center text-sm text-gray-500 bg-gray-50 rounded-lg">
                      لا توجد دفعات تطابق البحث
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2 max-h-80 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50">
                      {filteredBatches.map((batch) => (
                        <div key={batch.id} className="border border-gray-200 rounded-lg overflow-hidden">
                          <label
                            className={`flex items-start gap-3 p-3 cursor-pointer transition-all ${
                              formData.allowed_batches.includes(batch.id)
                                ? 'bg-blue-50 border-b border-blue-200'
                                : 'bg-white border-b border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={formData.allowed_batches.includes(batch.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormData({
                                    ...formData,
                                    allowed_batches: [...formData.allowed_batches, batch.id],
                                  })
                                  // Auto-expand to show pieces
                                  if (!expandedBatches.has(batch.id)) {
                                    toggleBatchExpansion(batch.id)
                                  }
                                } else {
                                  // Remove all pieces from this batch when batch is deselected
                                  const piecesToRemove = batchPieces.get(batch.id)?.map(p => p.id) || []
                                  setFormData({
                                    ...formData,
                                    allowed_batches: formData.allowed_batches.filter((b) => b !== batch.id),
                                    allowed_pieces: formData.allowed_pieces.filter((pieceId) => !piecesToRemove.includes(pieceId)),
                                  })
                                }
                              }}
                              disabled={saving}
                              className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-blue-500 flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-base font-semibold text-gray-900">{batch.name}</span>
                                  {formData.allowed_batches.includes(batch.id) && (
                                    <Badge variant="info" size="sm" className="text-xs bg-blue-100 text-blue-800">
                                      محددة
                                    </Badge>
                                  )}
                                </div>
                                {formData.allowed_batches.includes(batch.id) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      toggleBatchExpansion(batch.id)
                                    }}
                                    className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-100"
                                    disabled={saving}
                                  >
                                    {expandedBatches.has(batch.id) ? '▼ إخفاء القطع' : '▶ عرض القطع'}
                                  </button>
                                )}
                              </div>
                              {batch.location && (
                                <div className="text-xs text-gray-600 flex items-center gap-1">
                                  <span>📍</span>
                                  <span className="truncate">{batch.location}</span>
                                </div>
                              )}
                            </div>
                          </label>
                          
                          {/* Pieces List - Expandable */}
                          {formData.allowed_batches.includes(batch.id) && expandedBatches.has(batch.id) && (
                            <div className="bg-gray-50 p-3 border-t border-gray-200">
                              {loadingPieces.has(batch.id) ? (
                                <div className="text-center py-4 text-sm text-gray-500">
                                  <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mb-2"></div>
                                  <div>جاري تحميل القطع...</div>
                                </div>
                              ) : batchPieces.get(batch.id)?.length === 0 ? (
                                <div className="text-center py-4 text-sm text-gray-500">
                                  لا توجد قطع في هذه الدفعة
                                </div>
                              ) : (
                                <>
                                  <div className="mb-2 flex items-center justify-between">
                                    <span className="text-xs font-semibold text-gray-700">اختر القطع:</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const pieces = batchPieces.get(batch.id) || []
                                        const allSelected = pieces.every(p => formData.allowed_pieces.includes(p.id))
                                        if (allSelected) {
                                          setFormData({
                                            ...formData,
                                            allowed_pieces: formData.allowed_pieces.filter(id => 
                                              !pieces.some(p => p.id === id)
                                            ),
                                          })
                                        } else {
                                          setFormData({
                                            ...formData,
                                            allowed_pieces: [...new Set([...formData.allowed_pieces, ...pieces.map(p => p.id)])],
                                          })
                                        }
                                      }}
                                      className="text-xs text-blue-600 hover:text-blue-700"
                                      disabled={saving}
                                    >
                                      {batchPieces.get(batch.id)?.every(p => formData.allowed_pieces.includes(p.id)) 
                                        ? 'إلغاء تحديد الكل' 
                                        : 'تحديد الكل'}
                                    </button>
                                  </div>
                                  <div className="max-h-48 overflow-y-auto space-y-1">
                                    {batchPieces.get(batch.id)?.map((piece) => (
                                      <label
                                        key={piece.id}
                                        className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-all ${
                                          formData.allowed_pieces.includes(piece.id)
                                            ? 'bg-blue-100 border border-blue-300'
                                            : 'bg-white border border-gray-200 hover:bg-gray-50'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={formData.allowed_pieces.includes(piece.id)}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              setFormData({
                                                ...formData,
                                                allowed_pieces: [...formData.allowed_pieces, piece.id],
                                              })
                                            } else {
                                              setFormData({
                                                ...formData,
                                                allowed_pieces: formData.allowed_pieces.filter((id) => id !== piece.id),
                                              })
                                            }
                                          }}
                                          disabled={saving}
                                          className="w-3.5 h-3.5 text-blue-600 rounded focus:ring-blue-500"
                                        />
                                        <span className="text-xs text-gray-700 flex-1">
                                          {piece.piece_number}
                                        </span>
                                        <span className="text-xs text-gray-500">
                                          {piece.surface_m2} م²
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                  <div className="mt-2 text-xs text-gray-600">
                                    محددة: {batchPieces.get(batch.id)?.filter(p => formData.allowed_pieces.includes(p.id)).length || 0} من {batchPieces.get(batch.id)?.length || 0} قطعة
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Summary */}
                  <div className="mt-3 p-2 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-xs text-blue-900 space-y-1">
                      <div>
                        <span className="font-semibold">الدفعات:</span> {formData.allowed_batches.length} من {availableBatches.length} دفعة
                      </div>
                      {formData.allowed_pieces.length > 0 && (
                        <div>
                          <span className="font-semibold">القطع المحددة:</span> {formData.allowed_pieces.length} قطعة
                          {formData.allowed_pieces.length > 0 && (
                            <span className="text-blue-700 ml-1">
                              (سيتم الوصول فقط للقطع المحددة في الدفعات المحددة)
                            </span>
                          )}
                        </div>
                      )}
                      {formData.allowed_batches.length > 0 && formData.allowed_pieces.length === 0 && (
                        <div className="text-blue-700">
                          (سيتم الوصول لجميع القطع في الدفعات المحددة)
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="primary"
                onClick={handleSaveWorker}
                disabled={saving}
                className="flex-1"
              >
                {saving ? 'جاري الحفظ...' : editingWorkerId ? 'تحديث' : 'إضافة'}
              </Button>
              <Button variant="ghost" onClick={closeDialog} disabled={saving}>
                إلغاء
              </Button>
            </div>
          </div>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          open={deleteConfirmOpen}
          onClose={() => {
            setDeleteConfirmOpen(false)
            setWorkerToDelete(null)
          }}
          onConfirm={handleDeleteWorker}
          title="تأكيد الحذف"
          message="هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع عن هذه العملية."
          confirmText="حذف"
          cancelText="إلغاء"
          variant="danger"
          loading={deleting}
        />
      </div>
    </div>
  )
}

