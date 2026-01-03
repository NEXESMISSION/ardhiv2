import { NavLink } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  LayoutDashboard,
  Map,
  MapPin,
  Users,
  ShoppingCart,
  CreditCard,
  DollarSign,
  Settings,
  Shield,
  LogOut,
  TrendingDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'الرئيسية', permission: null },
  { to: '/land', icon: Map, label: 'إدارة الأراضي', permission: 'view_land' },
  { to: '/availability', icon: MapPin, label: 'توفر الأراضي', permission: 'view_land' },
  { to: '/clients', icon: Users, label: 'العملاء', permission: 'view_clients' },
  { to: '/sales', icon: ShoppingCart, label: 'المبيعات', permission: 'view_sales' },
  { to: '/installments', icon: CreditCard, label: 'الأقساط', permission: 'view_installments' },
  { to: '/financial', icon: DollarSign, label: 'المالية', permission: 'view_financial' },
  { to: '/debts', icon: TrendingDown, label: 'الديون', permission: null },
  { to: '/users', icon: Settings, label: 'المستخدمين', permission: 'manage_users' },
  { to: '/security', icon: Shield, label: 'الأمان', permission: 'view_audit_logs' },
]

interface SidebarProps {
  onClose?: () => void
}

export function Sidebar({ onClose }: SidebarProps) {
  const { profile, signOut, hasPermission } = useAuth()

  const handleNavClick = () => {
    if (onClose) {
      onClose()
    }
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-l bg-card shadow-lg md:shadow-none">
      <div className="flex h-16 items-center border-b px-6">
        <h1 className="text-xl font-bold text-primary">نظام الأراضي</h1>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          if (item.permission && !hasPermission(item.permission)) return null

          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={handleNavClick}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t p-4">
        <div className="mb-3 px-3">
          <p className="text-sm font-medium">{profile?.name}</p>
          <p className="text-xs text-muted-foreground">
            {String(profile?.role) === 'owner' ? 'مالك' : 
             String(profile?.role) === 'manager' ? 'مدير' : 
             String(profile?.role) === 'field_staff' ? 'موظف ميداني' : profile?.role}
          </p>
        </div>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="h-5 w-5" />
          تسجيل الخروج
        </button>
      </div>
    </aside>
  )
}
