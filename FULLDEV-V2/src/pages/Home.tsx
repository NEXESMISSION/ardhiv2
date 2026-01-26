import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface HomePageProps {
  onNavigate: (page: string) => void
}

export function HomePage({ onNavigate }: HomePageProps) {
  const { systemUser } = useAuth()
  
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
    { id: 'contract-writers', label: 'محررين العقد', icon: '📝', description: 'إدارة محرري العقود' },
    { id: 'users', label: 'المستخدمين', icon: '👤', description: 'إدارة المستخدمين والعمال' },
  ]
  
  // Filter pages based on user permissions
  let pages = systemUser?.role === 'owner'
    ? allPages
    : allPages.filter(page => systemUser?.allowed_pages?.includes(page.id) ?? false)
  
  // Sort by allowed_pages order if user is not owner
  if (systemUser?.role !== 'owner' && systemUser?.allowed_pages) {
    const pageOrder = systemUser.allowed_pages
    pages = pages.sort((a, b) => {
      const aIndex = pageOrder.indexOf(a.id)
      const bIndex = pageOrder.indexOf(b.id)
      // If not in allowed_pages, put at end
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    })
  }
  const [touchStarts, setTouchStarts] = useState<Record<string, { x: number; y: number; time: number }>>({})

  const handleTouchStart = (pageId: string, e: React.TouchEvent) => {
    const touch = e.touches[0]
    setTouchStarts(prev => ({
      ...prev,
      [pageId]: {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      }
    }))
  }

  const handleTouchEnd = (pageId: string, e: React.TouchEvent) => {
    const touchStart = touchStarts[pageId]
    if (!touchStart) return
    
    const touch = e.changedTouches[0]
    const deltaX = Math.abs(touch.clientX - touchStart.x)
    const deltaY = Math.abs(touch.clientY - touchStart.y)
    const deltaTime = Date.now() - touchStart.time
    
    // If moved more than 10px or took more than 300ms, it's a scroll, not a click
    if (deltaX > 10 || deltaY > 10 || deltaTime > 300) {
      setTouchStarts(prev => {
        const newStarts = { ...prev }
        delete newStarts[pageId]
        return newStarts
      })
      return
    }
    
    // It's a click
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

  return (
    <div className="px-2 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6">
      <div className="max-w-6xl mx-auto">
        {/* Account Details Card */}
        {systemUser && (
          <Card className="mb-3 sm:mb-4 p-3 sm:p-4 border border-gray-200 shadow-sm">
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
              className="p-3 sm:p-4 lg:p-5 hover:shadow-lg transition-all duration-200 cursor-pointer group border-2 hover:border-blue-300 active:scale-95 touch-none"
              onTouchStart={(e) => handleTouchStart(page.id, e)}
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
    </div>
  )
}

