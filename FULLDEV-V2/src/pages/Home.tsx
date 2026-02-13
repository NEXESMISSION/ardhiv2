import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert } from '@/components/ui/alert'
import { IconButton } from '@/components/ui/icon-button'

interface HomePageProps {
  onNavigate: (page: string) => void
}

export function HomePage({ onNavigate }: HomePageProps) {
  const { systemUser, refreshSystemUser, isOwner } = useAuth()
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    place: '',
    title: '',
    notes: '',
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  
  // Get user display name (use name field if available, otherwise email)
  const getUserName = () => {
    if (!systemUser) return 'مستخدم'
    if (systemUser.name && systemUser.name.trim()) {
      return systemUser.name.trim()
    }
    // Fallback to email (part before @)
    const emailName = systemUser.email.split('@')[0]
    return emailName.charAt(0).toUpperCase() + emailName.slice(1)
  }

  // Get first letter for avatar
  const getInitial = () => {
    const name = getUserName()
    return name.charAt(0).toUpperCase()
  }

  // Get user image or null
  const getUserImage = () => {
    return systemUser?.image_url || null
  }

  const allPages = [
    { id: 'confirmation', label: 'التأكيدات', icon: '✅', description: 'تأكيد المبيعات المعلقة' },
    { id: 'clients', label: 'العملاء', icon: '👥', description: 'إدارة بيانات العملاء' },
    { id: 'land', label: 'دفعات الأراضي', icon: '🏞️', description: 'إدارة دفعات الأراضي والقطع' },
    { id: 'appointments', label: 'موعد اتمام البيع', icon: '📅', description: 'مواعيد اتمام البيع' },
    { id: 'phone-call-appointments', label: 'مواعيد المكالمات', icon: '📞', description: 'مواعيد المكالمات الهاتفية' },
    { id: 'installments', label: 'الأقساط', icon: '💳', description: 'متابعة الأقساط والمدفوعات' },
    { id: 'finance', label: 'المالية', icon: '💰', description: 'الإدارة المالية والتقارير' },
    { id: 'sales-records', label: 'سجل المبيعات', icon: '📋', description: 'سجل جميع المبيعات' },
    { id: 'confirmation-history', label: 'سجل التأكيدات', icon: '📜', description: 'سجل تأكيدات المبيعات' },
    { id: 'contract-writers', label: 'محررين العقد', icon: '📝', description: 'إدارة محرري العقود' },
    { id: 'users', label: 'المستخدمين', icon: '👤', description: 'إدارة المستخدمين والعمال' },
  ]

  // Filter pages based on user permissions (confirmation-history: show if user has confirmation)
  let pages = systemUser?.role === 'owner'
    ? allPages
    : allPages.filter(page => {
        if (page.id === 'confirmation-history') return systemUser?.allowed_pages?.includes('confirmation') ?? false
        return systemUser?.allowed_pages?.includes(page.id) ?? false
      })
  
  // Sort by allowed_pages order if user is not owner (سجل التأكيدات next to السجل)
  if (systemUser?.role !== 'owner' && systemUser?.allowed_pages) {
    const pageOrder = systemUser.allowed_pages
    const orderOf = (id: string) => {
      if (id === 'confirmation-history') {
        const salesIdx = pageOrder.indexOf('sales-records')
        return salesIdx >= 0 ? salesIdx + 0.5 : pageOrder.indexOf('confirmation')
      }
      return pageOrder.indexOf(id)
    }
    pages = pages.sort((a, b) => {
      const aOrder = orderOf(a.id)
      const bOrder = orderOf(b.id)
      if (aOrder === -1) return 1
      if (bOrder === -1) return -1
      return aOrder - bOrder
    })
  }
  const [touchStarts, setTouchStarts] = useState<Record<string, { x: number; y: number; time: number; isScrolling?: boolean }>>({})

  const handleTouchStart = (pageId: string, e: React.TouchEvent) => {
    // Don't interfere with scrolling - let it happen naturally
    const touch = e.touches[0]
    setTouchStarts(prev => ({
      ...prev,
      [pageId]: {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
        isScrolling: false,
      }
    }))
  }

  const handleTouchMove = (pageId: string, e: React.TouchEvent) => {
    // Mark as scrolling if user moves finger
    const touchStart = touchStarts[pageId]
    if (!touchStart) return
    
    const touch = e.touches[0]
    const deltaX = Math.abs(touch.clientX - touchStart.x)
    const deltaY = Math.abs(touch.clientY - touchStart.y)
    
    // If moved more than 5px, it's definitely a scroll
    if (deltaX > 5 || deltaY > 5) {
      setTouchStarts(prev => ({
        ...prev,
        [pageId]: { ...prev[pageId], isScrolling: true }
      }))
    }
  }

  const handleTouchEnd = (pageId: string, e: React.TouchEvent) => {
    const touchStart = touchStarts[pageId]
    if (!touchStart) return
    
    // If we detected scrolling during touch move, don't treat as click
    if (touchStart.isScrolling) {
      setTouchStarts(prev => {
        const newStarts = { ...prev }
        delete newStarts[pageId]
        return newStarts
      })
      return
    }
    
    const touch = e.changedTouches[0]
    const deltaX = Math.abs(touch.clientX - touchStart.x)
    const deltaY = Math.abs(touch.clientY - touchStart.y)
    const deltaTime = Date.now() - touchStart.time
    
    // Increased threshold to 20px and 250ms to better distinguish scrolls from clicks
    if (deltaX > 20 || deltaY > 20 || deltaTime > 250) {
      setTouchStarts(prev => {
        const newStarts = { ...prev }
        delete newStarts[pageId]
        return newStarts
      })
      return
    }
    
    // It's a click - only prevent default at the very end
    e.preventDefault()
    onNavigate(pageId)
    setTouchStarts(prev => {
      const newStarts = { ...prev }
      delete newStarts[pageId]
      return newStarts
    })
  }

  const handleClick = (pageId: string, e: React.MouseEvent) => {
    // Only handle click on desktop (not touch devices)
    if ('ontouchstart' in window) return
    onNavigate(pageId)
  }

  // Open edit dialog
  function openEditDialog() {
    if (!systemUser) return
    setFormData({
      name: systemUser.name || '',
      phone: systemUser.phone || '',
      place: systemUser.place || '',
      title: systemUser.title || '',
      notes: systemUser.notes || '',
    })
    setImageFile(null)
    setImagePreview(systemUser.image_url)
    setError(null)
    setSuccess(null)
    setEditDialogOpen(true)
  }

  // Handle image change
  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('الرجاء اختيار ملف صورة')
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('حجم الصورة يجب أن يكون أقل من 5 ميجابايت')
        return
      }
      setImageFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  // Save profile changes
  async function handleSaveProfile() {
    if (!systemUser) return
    
    setError(null)
    setSuccess(null)
    setSaving(true)

    try {
      let finalImageUrl: string | null = systemUser.image_url

      // Upload new image if selected
      if (imageFile) {
        try {
          const fileExt = imageFile.name.split('.').pop()
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
          
          // Delete old image if exists
          if (systemUser.image_url && systemUser.image_url.includes('profile-images')) {
            try {
              const urlParts = systemUser.image_url.split('/')
              const oldFileIndex = urlParts.findIndex(part => part === 'profile-images')
              if (oldFileIndex !== -1 && oldFileIndex < urlParts.length - 1) {
                const oldFileName = urlParts.slice(oldFileIndex + 1).join('/')
                await supabase.storage
                  .from('profile-images')
                  .remove([oldFileName])
                  .catch(console.error)
              }
            } catch (e) {
              console.error('Error deleting old image:', e)
            }
          }
          
          // Upload new image
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('profile-images')
            .upload(fileName, imageFile, {
              cacheControl: '3600',
              upsert: false
            })
          
          if (uploadError) throw uploadError
          
          const { data: urlData } = supabase.storage
            .from('profile-images')
            .getPublicUrl(fileName)
          
          finalImageUrl = urlData.publicUrl
        } catch (e: any) {
          console.error('Error uploading image:', e)
          setError('فشل رفع الصورة: ' + (e.message || 'خطأ غير معروف'))
          setSaving(false)
          return
        }
      }

      // Update user profile
      const updateData: any = {
        name: formData.name.trim() ? formData.name.trim() : null,
        phone: formData.phone.trim() ? formData.phone.trim() : null,
        place: formData.place.trim() ? formData.place.trim() : null,
        title: formData.title.trim() ? formData.title.trim() : null,
        notes: formData.notes.trim() ? formData.notes.trim() : null,
        image_url: finalImageUrl,
        updated_at: new Date().toISOString(),
      }

      const { error: updateError } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', systemUser.id)

      if (updateError) throw updateError

      setSuccess('تم تحديث الملف الشخصي بنجاح')
      
      // Refresh system user to show updated data
      await refreshSystemUser()
      
      // Close dialog after a short delay
      setTimeout(() => {
        setEditDialogOpen(false)
        setSuccess(null)
      }, 1500)
    } catch (e: any) {
      console.error('Error updating profile:', e)
      setError(e.message || 'فشل تحديث الملف الشخصي')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-2 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6">
      <div className="max-w-6xl mx-auto">
        {/* Account Details Card */}
        {systemUser && (
          <Card className="mb-3 sm:mb-4 p-3 sm:p-4 border border-gray-200 shadow-sm relative">
            <div className="flex items-center gap-3 sm:gap-4" style={{ direction: 'ltr' }}>
              {/* User Avatar */}
              <div className="flex-shrink-0">
                {getUserImage() ? (
                  <img
                    src={getUserImage()!}
                    alt={getUserName()}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-gray-200"
                  />
                ) : (
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center border-2 border-gray-200">
                    <span className="text-2xl sm:text-3xl font-bold text-white">
                      {getInitial()}
                    </span>
                  </div>
                )}
              </div>

              {/* User Info - Left Aligned */}
              <div className="flex-1 min-w-0" style={{ textAlign: 'left' }}>
                <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-1.5">
                  {getUserName()}
                </h2>
                {systemUser.title && (
                  <div className="mb-2">
                    <div className="relative inline-block">
                      <div 
                        className="inline-flex items-center px-3 py-1.5 rounded-full bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 shadow-lg border-2 border-yellow-300 relative overflow-hidden"
                        style={{
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(251, 191, 36, 0.3)'
                        }}
                      >
                        <span 
                          className="relative z-10 text-white font-bold text-xs sm:text-sm"
                          style={{ 
                            textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                            letterSpacing: '0.025em'
                          }}
                        >
                          {systemUser.title}
                        </span>
                        <span className="animate-shine"></span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-600" style={{ justifyContent: 'flex-start' }}>
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                  </svg>
                  <span className="truncate">{systemUser.email}</span>
                </div>
              </div>

              {/* Edit Button - Only for owners */}
              {isOwner && (
                <div className="flex-shrink-0">
                  <IconButton
                    variant="ghost"
                    size="sm"
                    onClick={openEditDialog}
                    className="p-2 hover:bg-blue-50 hover:text-blue-600"
                    title="تعديل الملف الشخصي"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </IconButton>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Header */}
        <div className="mb-4 sm:mb-6 lg:mb-8 text-center">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-2">
            نظام إدارة الأراضي
          </h1>
          <p className="text-xs sm:text-sm text-gray-600">
            اختر الصفحة التي تريد الوصول إليها
          </p>
        </div>

        {/* Pages Grid - 2 boxes per row */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
          {pages.map((page) => (
            <Card
              key={page.id}
              className="p-3 sm:p-4 lg:p-5 hover:shadow-lg transition-all duration-200 cursor-pointer group border-2 hover:border-blue-300 active:scale-95"
              onTouchStart={(e) => handleTouchStart(page.id, e)}
              onTouchMove={(e) => handleTouchMove(page.id, e)}
              onTouchEnd={(e) => handleTouchEnd(page.id, e)}
              onClick={(e) => handleClick(page.id, e)}
            >
              <div className="flex flex-col items-center text-center space-y-2 sm:space-y-3">
                <div className="text-3xl sm:text-4xl lg:text-5xl mb-1 sm:mb-2 group-hover:scale-110 transition-transform duration-200">
                  {page.icon}
                </div>
                <h2 className="text-sm sm:text-base lg:text-lg font-semibold text-gray-900">
                  {page.label}
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 line-clamp-2">
                  {page.description}
                </p>
              </div>
            </Card>
          ))}
        </div>

      </div>

      {/* Edit Profile Dialog - Only for owners */}
      {isOwner && systemUser && (
        <Dialog
          open={editDialogOpen}
          onClose={() => {
            if (!saving) {
              setEditDialogOpen(false)
              setError(null)
              setSuccess(null)
            }
          }}
          title="تعديل الملف الشخصي"
          size="md"
          footer={
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  if (!saving) {
                    setEditDialogOpen(false)
                    setError(null)
                    setSuccess(null)
                  }
                }}
                disabled={saving}
              >
                إلغاء
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveProfile}
                disabled={saving}
              >
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            {success && <Alert variant="success">{success}</Alert>}
            {error && <Alert variant="error">{error}</Alert>}

            {/* Profile Image */}
            <div>
              <Label htmlFor="profile-image">صورة الملف الشخصي</Label>
              <div className="mt-2 flex items-center gap-4">
                {(imagePreview || systemUser.image_url) && (
                  <div className="flex-shrink-0 relative">
                    <img
                      src={imagePreview || systemUser.image_url || ''}
                      alt="Preview"
                      className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setImageFile(null)
                        setImagePreview(systemUser.image_url)
                      }}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      title="إزالة الصورة"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
                <div className="flex-1">
                  <Input
                    id="profile-image"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="text-xs sm:text-sm"
                    disabled={saving}
                  />
                  <p className="text-xs text-gray-500 mt-1">حد أقصى 5 ميجابايت</p>
                </div>
              </div>
            </div>

            {/* Name */}
            <div>
              <Label htmlFor="name">الاسم</Label>
              <Input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="أدخل الاسم"
                className="text-xs sm:text-sm"
                disabled={saving}
              />
            </div>

            {/* Title */}
            <div>
              <Label htmlFor="title">المسمى الوظيفي</Label>
              <Input
                id="title"
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="مثال: رئيس مجلس الإدارة والمدير التنفيذي"
                className="text-xs sm:text-sm"
                disabled={saving}
              />
            </div>

            {/* Phone */}
            <div>
              <Label htmlFor="phone">رقم الهاتف</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+216 XX XXX XXX"
                className="text-xs sm:text-sm"
                disabled={saving}
              />
            </div>

            {/* Place */}
            <div>
              <Label htmlFor="place">المكان</Label>
              <Input
                id="place"
                type="text"
                value={formData.place}
                onChange={(e) => setFormData({ ...formData, place: e.target.value })}
                placeholder="المدينة أو المنطقة"
                className="text-xs sm:text-sm"
                disabled={saving}
              />
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="notes">ملاحظات</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="ملاحظات إضافية (اختياري)"
                className="text-xs sm:text-sm min-h-[80px]"
                disabled={saving}
              />
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}

