import { useState, useEffect, type ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/i18n/context'
import { supabase } from '@/lib/supabase'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert } from '@/components/ui/alert'
import { isRealImageFile } from '@/utils/validateImage'

interface HomePageProps {
  onNavigate: (page: string) => void
}

type IconColor = 'blue' | 'emerald' | 'violet' | 'amber' | 'rose' | 'cyan' | 'indigo' | 'pink' | 'slate' | 'orange'

interface PageDef {
  id: string
  color: IconColor
  icon: ReactNode
}

// Lucide-style icons sized to 24
const Ic = {
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  land: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 22h20" />
      <path d="M3 22V8l9-6 9 6v14" />
      <path d="M7 22v-7h10v7" />
      <path d="M9 12h6" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    </svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  ),
  card: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </svg>
  ),
  wallet: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V8a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2" />
      <path d="M3 4v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" />
      <circle cx="17" cy="14" r="1.5" fill="currentColor" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </svg>
  ),
  history: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.74 9.74 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  edit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  pencil: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  ),
  mail: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <path d="m2 7 10 6 10-6" />
    </svg>
  ),
}

const PAGE_DEFS: PageDef[] = [
  { id: 'confirmation', color: 'emerald', icon: Ic.check },
  { id: 'clients', color: 'violet', icon: Ic.users },
  { id: 'land', color: 'cyan', icon: Ic.land },
  { id: 'appointments', color: 'indigo', icon: Ic.calendar },
  { id: 'phone-call-appointments', color: 'rose', icon: Ic.phone },
  { id: 'installments', color: 'blue', icon: Ic.card },
  { id: 'finance', color: 'amber', icon: Ic.wallet },
  { id: 'sales-records', color: 'pink', icon: Ic.list },
  { id: 'confirmation-history', color: 'orange', icon: Ic.history },
  { id: 'contract-writers', color: 'slate', icon: Ic.pencil },
  { id: 'users', color: 'indigo', icon: Ic.user },
]

// Tailwind-safe class lookups (must be literal for JIT)
const colorTile: Record<IconColor, string> = {
  blue: 'bg-blue-50 text-blue-600 ring-blue-100',
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  violet: 'bg-violet-50 text-violet-600 ring-violet-100',
  amber: 'bg-amber-50 text-amber-600 ring-amber-100',
  rose: 'bg-rose-50 text-rose-600 ring-rose-100',
  cyan: 'bg-cyan-50 text-cyan-600 ring-cyan-100',
  indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
  pink: 'bg-pink-50 text-pink-600 ring-pink-100',
  slate: 'bg-slate-50 text-slate-600 ring-slate-200',
  orange: 'bg-orange-50 text-orange-600 ring-orange-100',
}

export function HomePage({ onNavigate }: HomePageProps) {
  const { t } = useLanguage()
  const { systemUser, refreshSystemUser, isOwner } = useAuth()
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  useEffect(() => {
    if (systemUser) {
      console.log('HomePage - systemUser:', {
        email: systemUser.email,
        role: systemUser.role,
        allowed_pages: systemUser.allowed_pages,
        allowed_pages_type: typeof systemUser.allowed_pages,
        allowed_pages_is_array: Array.isArray(systemUser.allowed_pages),
      })
    }
  }, [systemUser])
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

  const getUserName = () => {
    if (!systemUser) return t('home.user')
    if (systemUser.name && systemUser.name.trim()) {
      return systemUser.name.trim()
    }
    const emailName = systemUser.email.split('@')[0]
    return emailName.charAt(0).toUpperCase() + emailName.slice(1)
  }

  const getInitial = () => {
    const name = getUserName()
    return name.charAt(0).toUpperCase()
  }

  const getUserImage = () => {
    return systemUser?.image_url || null
  }

  const allPages = PAGE_DEFS.map(p => ({
    id: p.id,
    color: p.color,
    icon: p.icon,
    label: t(`pageNames.${p.id}`),
    description: t(`homePageDesc.${p.id}`),
  }))

  let pages = systemUser?.role === 'owner'
    ? allPages
    : allPages.filter(page => {
        if (page.id === 'confirmation-history') return systemUser?.allowed_pages?.includes('confirmation') ?? false
        return systemUser?.allowed_pages?.includes(page.id) ?? false
      })

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
    const touchStart = touchStarts[pageId]
    if (!touchStart) return

    const touch = e.touches[0]
    const deltaX = Math.abs(touch.clientX - touchStart.x)
    const deltaY = Math.abs(touch.clientY - touchStart.y)

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

    if (deltaX > 20 || deltaY > 20 || deltaTime > 250) {
      setTouchStarts(prev => {
        const newStarts = { ...prev }
        delete newStarts[pageId]
        return newStarts
      })
      return
    }

    e.preventDefault()
    onNavigate(pageId)
    setTouchStarts(prev => {
      const newStarts = { ...prev }
      delete newStarts[pageId]
      return newStarts
    })
  }

  const handleClick = (pageId: string, _e: React.MouseEvent) => {
    if ('ontouchstart' in window) return
    onNavigate(pageId)
  }

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

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError(t('home.errorImageType'))
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        setError(t('home.errorImageSize'))
        return
      }
      if (!(await isRealImageFile(file))) {
        setError(t('home.errorImageType'))
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

  async function handleSaveProfile() {
    if (!systemUser) return

    setError(null)
    setSuccess(null)
    setSaving(true)

    try {
      let finalImageUrl: string | null = systemUser.image_url

      if (imageFile) {
        try {
          const fileExt = imageFile.name.split('.').pop()
          const fileName = `${systemUser.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

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

          const { error: uploadError } = await supabase.storage
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
          setError(t('home.errorUpload') + ': ' + (e.message || ''))
          setSaving(false)
          return
        }
      }

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

      setSuccess(t('home.successProfile'))

      await refreshSystemUser()

      setTimeout(() => {
        setEditDialogOpen(false)
        setSuccess(null)
      }, 1500)
    } catch (e: any) {
      console.error('Error updating profile:', e)
      setError(e.message || t('home.errorUpdateProfile'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6">
      <div className="max-w-6xl mx-auto">
        {/* Account Card */}
        {systemUser && (
          <div className="mb-4 sm:mb-5 relative overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm animate-lift-in">
            {/* Subtle gradient bar */}
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500" />
            <div className="p-3 sm:p-4">
              <div className="flex items-center gap-3 sm:gap-4" style={{ direction: 'ltr' }}>
                {/* Avatar */}
                <div className="flex-shrink-0 relative">
                  {getUserImage() ? (
                    <img
                      src={getUserImage()!}
                      alt={getUserName()}
                      loading="lazy"
                      decoding="async"
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover ring-2 ring-white shadow-md"
                    />
                  ) : (
                    <div
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center ring-2 ring-white shadow-md"
                      style={{
                        background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 60%, #8B5CF6 100%)',
                      }}
                    >
                      <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                        {getInitial()}
                      </span>
                    </div>
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 ring-2 ring-white" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0" style={{ textAlign: 'left' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-[15px] sm:text-base font-bold text-gray-900 truncate tracking-tight">
                      {getUserName()}
                    </h2>
                    {systemUser.role === 'owner' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-semibold border border-blue-100 ring-1 ring-blue-50">
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2 4 7v6c0 5 4 9 8 9s8-4 8-9V7l-8-5z" />
                        </svg>
                        OWNER
                      </span>
                    )}
                  </div>

                  {systemUser.title && (
                    <div className="mb-1.5">
                      <div
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 shadow-sm border border-yellow-300/70 relative overflow-hidden"
                      >
                        <span className="relative z-10 text-white font-bold text-[11px]" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.25)' }}>
                          {systemUser.title}
                        </span>
                        <span className="animate-shine"></span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 text-[12px] sm:text-[13px] text-gray-500" style={{ justifyContent: 'flex-start' }}>
                    <span className="text-gray-400 flex-shrink-0 w-3.5 h-3.5">{Ic.mail}</span>
                    <span className="truncate">{systemUser.email}</span>
                  </div>
                </div>

                {/* Edit Button */}
                {isOwner && (
                  <button
                    onClick={openEditDialog}
                    title={t('home.editProfile')}
                    className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 bg-gray-50 hover:bg-blue-50 hover:text-blue-600 border border-gray-200/70 transition-colors"
                  >
                    <span className="w-[18px] h-[18px]">{Ic.edit}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Welcome */}
        <div className="mb-5 sm:mb-7 text-center">
          <h1 className="text-[22px] sm:text-3xl lg:text-[34px] font-bold text-gray-900 mb-1.5 tracking-tight">
            {t('home.welcomeTitle')}
          </h1>
          <p className="text-[13px] sm:text-sm text-gray-500">
            {t('home.choosePage')}
          </p>
        </div>

        {/* Pages Grid */}
        {pages.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50/50 p-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 mb-3">
              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
                <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              </svg>
            </div>
            <p className="text-sm text-gray-700 font-medium max-w-sm mx-auto">
              {t('home.noPagesAvailable')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {pages.map((page, idx) => (
              <button
                key={page.id}
                type="button"
                onTouchStart={(e) => handleTouchStart(page.id, e)}
                onTouchMove={(e) => handleTouchMove(page.id, e)}
                onTouchEnd={(e) => handleTouchEnd(page.id, e)}
                onClick={(e) => handleClick(page.id, e)}
                className="group relative text-right rounded-2xl border border-gray-200/80 bg-white p-4 sm:p-5 shadow-sm transition-all duration-200
                  hover:shadow-lg hover:border-blue-200 hover:-translate-y-0.5
                  active:scale-[0.98] active:shadow-sm
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40
                  animate-lift-in"
                style={{ animationDelay: `${Math.min(idx * 30, 240)}ms` }}
              >
                {/* Subtle accent on hover */}
                <span className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{
                    background: 'radial-gradient(140% 80% at 100% 0%, rgba(59,130,246,0.05), transparent 60%)',
                  }}
                />

                <div className="flex flex-col items-start gap-2.5 sm:gap-3 relative">
                  {/* Icon tile */}
                  <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl ring-1 flex items-center justify-center transition-transform duration-200 group-hover:scale-105 ${colorTile[page.color]}`}>
                    <span className="w-5 h-5 sm:w-[22px] sm:h-[22px]">{page.icon}</span>
                  </div>

                  {/* Text — RTL-friendly */}
                  <div className="w-full text-right">
                    <h2 className="text-[14px] sm:text-[15px] font-semibold text-gray-900 mb-0.5 tracking-tight">
                      {page.label}
                    </h2>
                    <p className="text-[11.5px] sm:text-xs text-gray-500 line-clamp-2 leading-snug">
                      {page.description}
                    </p>
                  </div>
                </div>

                {/* Chevron arrow on the leading edge (RTL = left) */}
                <span className="absolute top-3 left-3 w-6 h-6 rounded-full bg-gray-50 text-gray-300 group-hover:bg-blue-50 group-hover:text-blue-500 flex items-center justify-center transition-colors">
                  <svg className="w-3 h-3 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Edit Profile Dialog */}
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
          title={t('home.editProfile')}
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
                {t('home.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveProfile}
                disabled={saving}
              >
                {saving ? t('home.saving') : t('home.save')}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            {success && <Alert variant="success">{success}</Alert>}
            {error && <Alert variant="error">{error}</Alert>}

            {/* Avatar uploader */}
            <div>
              <Label htmlFor="profile-image">{t('home.profileImage')}</Label>
              <div className="flex items-center gap-3.5">
                <div className="flex-shrink-0 relative">
                  {(imagePreview || systemUser.image_url) ? (
                    <img
                      src={imagePreview || systemUser.image_url || ''}
                      alt="Preview"
                      className="w-[72px] h-[72px] rounded-2xl object-cover ring-2 ring-white shadow-md"
                    />
                  ) : (
                    <div
                      className="w-[72px] h-[72px] rounded-2xl flex items-center justify-center text-white font-bold text-3xl ring-2 ring-white shadow-md"
                      style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 60%, #8B5CF6 100%)' }}
                    >
                      {getInitial()}
                    </div>
                  )}
                  {imageFile && (
                    <button
                      type="button"
                      onClick={() => {
                        setImageFile(null)
                        setImagePreview(systemUser.image_url)
                      }}
                      className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-md ring-2 ring-white"
                      title={t('home.removeImage')}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <label
                    htmlFor="profile-image"
                    className={`inline-flex items-center gap-2 h-10 px-3.5 rounded-xl bg-white border border-gray-200 text-[13px] font-bold text-gray-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] cursor-pointer hover:bg-gray-50 hover:border-gray-300 transition-colors ${
                      saving ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''
                    }`}
                  >
                    <svg className="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <path d="M17 8 12 3 7 8" />
                      <path d="M12 3v12" />
                    </svg>
                    <span>{t('home.profileImage')}</span>
                  </label>
                  <input
                    id="profile-image"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                    disabled={saving}
                  />
                  <p className="text-[11px] text-gray-500 mt-1.5 font-medium">{t('home.maxSize')}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <Label htmlFor="name">{t('home.name')}</Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('home.namePlaceholder')}
                  disabled={saving}
                />
              </div>

              <div>
                <Label htmlFor="title">{t('home.jobTitle')}</Label>
                <Input
                  id="title"
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={t('home.jobTitlePlaceholder')}
                  disabled={saving}
                />
              </div>

              <div>
                <Label htmlFor="phone">{t('home.phone')}</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder={t('home.phonePlaceholder')}
                  disabled={saving}
                />
              </div>

              <div>
                <Label htmlFor="place">{t('home.place')}</Label>
                <Input
                  id="place"
                  type="text"
                  value={formData.place}
                  onChange={(e) => setFormData({ ...formData, place: e.target.value })}
                  placeholder={t('home.placePlaceholder')}
                  disabled={saving}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="notes">{t('home.notes')}</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder={t('home.notesPlaceholder')}
                className="min-h-[100px]"
                disabled={saving}
              />
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
