import { type ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/i18n/context'

interface SidebarProps {
  currentPage: string
  onNavigate: (page: string) => void
  isOpen: boolean
  onToggle: () => void
}

type IconColor = 'blue' | 'emerald' | 'violet' | 'amber' | 'rose' | 'cyan' | 'indigo' | 'pink' | 'slate' | 'orange' | 'gray'

interface SidebarItem {
  id: string
  color: IconColor
  icon: ReactNode
}

// Lucide-style icons
const Ic = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" />
      <path d="M5 21V8l7-5 7 5v13" />
      <path d="M9 21v-6h6v6" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  land: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 22h20" />
      <path d="M3 22V8l9-6 9 6v14" />
      <path d="M7 22v-7h10v7" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  ),
  card: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </svg>
  ),
  wallet: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V8a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2" />
      <path d="M3 4v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" />
      <circle cx="17" cy="14" r="1.4" fill="currentColor" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </svg>
  ),
  history: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.74 9.74 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  pencil: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2 4 7v6c0 5 4 9 8 9s8-4 8-9V7l-8-5z" />
    </svg>
  ),
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'home', color: 'blue', icon: Ic.home },
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

const colorTile: Record<IconColor, string> = {
  blue: 'bg-blue-50 text-blue-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  violet: 'bg-violet-50 text-violet-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
  cyan: 'bg-cyan-50 text-cyan-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  pink: 'bg-pink-50 text-pink-600',
  slate: 'bg-slate-50 text-slate-600',
  orange: 'bg-orange-50 text-orange-600',
  gray: 'bg-gray-100 text-gray-600',
}

export function Sidebar({ currentPage, onNavigate, isOpen, onToggle }: SidebarProps) {
  const { t, language } = useLanguage()
  const { signOut, systemUser } = useAuth()
  const isRTL = language === 'ar'
  const isOwner = systemUser?.role === 'owner'

  async function handleLogout() {
    await signOut()
    window.location.hash = '#login'
  }

  const allMenuItems = SIDEBAR_ITEMS.map(item => ({
    id: item.id,
    color: item.color,
    icon: item.icon,
    label: t(`pageNames.${item.id}`),
  }))

  let menuItems = systemUser?.role === 'owner'
    ? allMenuItems
    : allMenuItems.filter(item => {
        if (item.id === 'home') return true
        if (item.id === 'confirmation-history') return systemUser?.allowed_pages?.includes('confirmation') ?? false
        return systemUser?.allowed_pages?.includes(item.id) ?? false
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

  const userInitial = (systemUser?.name?.trim() || systemUser?.email?.split('@')[0] || 'U').charAt(0).toUpperCase()
  const userImage = systemUser?.image_url

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden animate-fade-in"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 ${isRTL ? 'right-0' : 'left-0'} h-full w-[280px] bg-white shadow-2xl z-50
          transform transition-transform duration-300 ease-out
          lg:relative lg:translate-x-0 lg:z-auto lg:shadow-none lg:w-[260px]
          ${isRTL ? 'lg:border-l lg:border-r-0' : 'lg:border-r'} lg:border-gray-200/80
          safe-area-top safe-area-bottom
          ${isOpen ? 'translate-x-0' : (isRTL ? 'translate-x-full lg:translate-x-0' : '-translate-x-full lg:translate-x-0')}
        `}
      >
        <div className="flex flex-col h-full min-h-0">
          {/* Header */}
          <div className="px-4 py-3.5 border-b border-gray-200/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shadow-md"
                style={{
                  background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 60%, #8B5CF6 100%)',
                  boxShadow: '0 4px 10px -2px rgba(99, 102, 241, 0.45), inset 0 1px 0 rgba(255,255,255,0.3)',
                }}
              >
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 21h18" />
                  <path d="M5 21V8l7-5 7 5v13" />
                  <path d="M9 21v-6h6v6" />
                </svg>
              </div>
              <div className="leading-tight">
                <div className="text-[15px] font-bold text-gray-900 tracking-tight">{t('sidebar.appTitle')}</div>
                <div className="text-[10.5px] text-gray-400 font-semibold uppercase tracking-wider">Ardhi</div>
              </div>
            </div>
            <button
              onClick={onToggle}
              className="lg:hidden w-9 h-9 rounded-lg hover:bg-gray-100 text-gray-500 flex items-center justify-center transition-colors"
              title={t('common.close')}
              aria-label={t('common.close')}
            >
              <span className="w-5 h-5">{Ic.close}</span>
            </button>
          </div>

          {/* Menu Items */}
          <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto scrollbar-thin">
            {menuItems.map((item) => {
              const active = currentPage === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id)
                    onToggle()
                  }}
                  className={`group relative w-full px-2 py-2 rounded-xl transition-all flex items-center gap-2.5
                    ${active
                      ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm ring-1 ring-blue-100'
                      : 'text-gray-700 hover:bg-gray-50 font-medium'
                    }
                  `}
                >
                  {/* Active indicator (start side) */}
                  {active && (
                    <span
                      className={`absolute top-1.5 bottom-1.5 ${isRTL ? 'right-0' : 'left-0'} w-1 rounded-full bg-blue-500`}
                    />
                  )}
                  <span
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                      active ? colorTile[item.color] : 'bg-gray-50 text-gray-500 group-hover:bg-white group-hover:text-gray-700'
                    }`}
                  >
                    <span className="w-[18px] h-[18px]">{item.icon}</span>
                  </span>
                  <span className="text-[13.5px] truncate flex-1 text-start">{item.label}</span>
                </button>
              )
            })}
          </nav>

          {/* User Card + Logout */}
          <div className="px-3 py-3 border-t border-gray-200/80 space-y-2">
            {systemUser && (
              <div className="flex items-center gap-2.5 p-2 rounded-xl bg-gray-50/70 border border-gray-200/60">
                {/* Avatar */}
                <div className="flex-shrink-0 relative">
                  {userImage ? (
                    <img
                      src={userImage}
                      alt={systemUser.email}
                      className="w-9 h-9 rounded-lg object-cover ring-2 ring-white shadow-sm"
                    />
                  ) : (
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-[13px] ring-2 ring-white shadow-sm"
                      style={{
                        background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 60%, #8B5CF6 100%)',
                      }}
                    >
                      {userInitial}
                    </div>
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-bold text-gray-900 truncate">
                      {(systemUser.name?.trim() || systemUser.email.split('@')[0])}
                    </span>
                    {isOwner && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[9px] font-bold tracking-wide">
                        <span className="w-2 h-2">{Ic.shield}</span>
                        OWNER
                      </span>
                    )}
                  </div>
                  <div className="text-[10.5px] text-gray-500 truncate font-medium">
                    {systemUser.email}
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleLogout}
              className="w-full px-2 py-2 rounded-xl transition-colors flex items-center gap-2.5
                text-red-600 hover:bg-red-50 font-semibold"
            >
              <span className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
                <span className="w-[18px] h-[18px]">{Ic.logout}</span>
              </span>
              <span className="text-[13.5px] text-start">{t('sidebar.logout')}</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
