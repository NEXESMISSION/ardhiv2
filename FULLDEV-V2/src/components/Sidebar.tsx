import { useAuth } from '@/contexts/AuthContext'

interface SidebarProps {
  currentPage: string
  onNavigate: (page: string) => void
  isOpen: boolean
  onToggle: () => void
}

export function Sidebar({ currentPage, onNavigate, isOpen, onToggle }: SidebarProps) {
  const { signOut, systemUser } = useAuth()

  async function handleLogout() {
    await signOut()
    window.location.hash = '#login'
  }
  
  const allMenuItems = [
    { id: 'home', label: 'الرئيسية', icon: '🏠' },
    { id: 'confirmation', label: 'التأكيدات', icon: '✅' },
    { id: 'clients', label: 'العملاء', icon: '👥' },
    { id: 'land', label: 'دفعات الأراضي', icon: '🏞️' },
    { id: 'appointments', label: 'موعد اتمام البيع', icon: '📅' },
    { id: 'phone-call-appointments', label: 'مواعيد المكالمات', icon: '📞' },
    { id: 'installments', label: 'الأقساط', icon: '💳' },
    { id: 'finance', label: 'المالية', icon: '💰' },
    { id: 'sales-records', label: 'السجل', icon: '📋' },
    { id: 'confirmation-history', label: 'سجل التأكيدات', icon: '📜' },
    { id: 'contract-writers', label: 'محررين العقد', icon: '📝' },
    { id: 'users', label: 'المستخدمين', icon: '👤' },
  ]
  
  // Filter and sort menu items based on user permissions
  let menuItems = systemUser?.role === 'owner'
    ? allMenuItems
    : allMenuItems.filter(item => {
        if (item.id === 'home') return true
        // Confirmation history: show if user has confirmation
        if (item.id === 'confirmation-history') return systemUser?.allowed_pages?.includes('confirmation') ?? false
        return systemUser?.allowed_pages?.includes(item.id) ?? false
      })

  // Sort by allowed_pages order if user is not owner (سجل التأكيدات next to السجل: use sales-records order + 1)
  if (systemUser?.role !== 'owner' && systemUser?.allowed_pages) {
    const pageOrder = systemUser.allowed_pages
    const orderOf = (id: string) => {
      if (id === 'confirmation-history') {
        const salesIdx = pageOrder.indexOf('sales-records')
        return salesIdx >= 0 ? salesIdx + 0.5 : pageOrder.indexOf('confirmation')
      }
      return pageOrder.indexOf(id)
    }
    menuItems = menuItems.sort((a, b) => {
      if (a.id === 'home') return -1
      if (b.id === 'home') return 1
      const aIndex = orderOf(a.id)
      const bIndex = orderOf(b.id)
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    })
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-white shadow-lg z-50
          transform transition-transform duration-300 ease-in-out
          lg:relative lg:translate-x-0 lg:z-auto lg:shadow-none lg:border-l-0 lg:border-r lg:border-gray-200
          safe-area-top safe-area-bottom
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex flex-col h-full min-h-0">
          {/* Header */}
          <div className="p-2 sm:p-3 lg:p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm sm:text-base lg:text-xl font-bold text-gray-900">النظام</h2>
            <button
              onClick={onToggle}
              className="lg:hidden p-1.5 sm:p-2 hover:bg-gray-100 rounded-md"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Menu Items */}
          <nav className="flex-1 p-2 sm:p-3 lg:p-4 space-y-1 sm:space-y-1.5 lg:space-y-2 overflow-y-auto">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id)
                  onToggle() // Close sidebar on mobile after navigation
                }}
                className={`
                  w-full text-right px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 lg:py-3 rounded-lg transition-colors
                  flex items-center gap-2 sm:gap-2.5 lg:gap-3
                  text-xs sm:text-sm lg:text-base
                  ${
                    currentPage === item.id
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                  }
                `}
              >
                <span className="text-base sm:text-lg lg:text-xl">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          {/* User Info and Logout */}
          <div className="p-2 sm:p-3 lg:p-4 border-t border-gray-200 space-y-2">
            {systemUser && (
              <div className="px-2 sm:px-3 lg:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-600">
                <div className="font-medium text-gray-900 truncate">{systemUser.email}</div>
                <div className="text-gray-500">
                  {systemUser.role === 'owner' ? 'مالك' : 'عامل'}
                </div>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="
                w-full text-right px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 lg:py-3 rounded-lg transition-colors
                flex items-center gap-2 sm:gap-2.5 lg:gap-3
                text-xs sm:text-sm lg:text-base
                text-red-600 hover:bg-red-50 font-medium
              "
            >
              <span className="text-base sm:text-lg lg:text-xl">🚪</span>
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}


