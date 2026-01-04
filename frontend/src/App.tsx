import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { MainLayout } from '@/components/layout/MainLayout'
import { Login } from '@/pages/Login'
import { LandManagement } from '@/pages/LandManagement'
import { Clients } from '@/pages/Clients'
import { SalesNew as Sales } from '@/pages/SalesNew'
import { SaleConfirmation } from '@/pages/SaleConfirmation'
import { Installments } from '@/pages/Installments'
import { Financial } from '@/pages/FinancialNew'
import { Users } from '@/pages/Users'
import { UserPermissions } from '@/pages/UserPermissions'
import { Security } from '@/pages/Security'
import { LandAvailability } from '@/pages/LandAvailability'
import { Home } from '@/pages/Home'
import { Debts } from '@/pages/Debts'
import { Expenses } from '@/pages/Expenses'
import { RealEstateBuildings } from '@/pages/RealEstateBuildings'
import { LoadingProgress } from '@/components/ui/loading-progress'
import { NotificationContainer } from '@/components/ui/notification'

function AppRoutes() {
  const { user, loading, hasPermission } = useAuth()

  function ProtectedRoute({ children }: { children: React.ReactNode }) {
    if (loading) {
      return (
        <div className="flex h-screen items-center justify-center">
          <LoadingProgress message="جاري التحميل..." />
        </div>
      )
    }

    if (!user) {
      return <Navigate to="/login" replace />
    }

    return <>{children}</>
  }

  function PublicRoute({ children }: { children: React.ReactNode }) {
    if (loading) {
      return (
        <div className="flex h-screen items-center justify-center">
          <LoadingProgress message="جاري التحميل..." />
        </div>
      )
    }

    if (user) {
      return <Navigate to="/" replace />
    }

    return <>{children}</>
  }

  function PermissionProtectedRoute({ 
    children, 
    permission 
  }: { 
    children: React.ReactNode
    permission: string | null 
  }) {
    if (loading) {
      return (
        <div className="flex h-screen items-center justify-center">
          <LoadingProgress message="جاري التحميل..." />
        </div>
      )
    }

    // If no permission required, allow access
    if (!permission) {
      return <>{children}</>
    }

    // Check permission
    if (!hasPermission(permission)) {
      return (
        <div className="flex h-screen items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2">غير مصرح</h2>
            <p className="text-muted-foreground">ليس لديك صلاحية للوصول إلى هذه الصفحة</p>
          </div>
        </div>
      )
    }

    return <>{children}</>
  }
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Home />} />
        <Route 
          path="land" 
          element={
            <PermissionProtectedRoute permission="view_land">
              <LandManagement />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="availability" 
          element={
            <PermissionProtectedRoute permission="view_land">
              <LandAvailability />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="clients" 
          element={
            <PermissionProtectedRoute permission="view_clients">
              <Clients />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="sales" 
          element={
            <PermissionProtectedRoute permission="view_sales">
              <Sales />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="sale-confirmation" 
          element={
            <PermissionProtectedRoute permission="edit_sales">
              <SaleConfirmation />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="installments" 
          element={
            <PermissionProtectedRoute permission="view_installments">
              <Installments />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="financial" 
          element={
            <PermissionProtectedRoute permission="view_financial">
              <Financial />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="expenses" 
          element={
            <PermissionProtectedRoute permission="view_financial">
              <Expenses />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="users" 
          element={
            <PermissionProtectedRoute permission="manage_users">
              <Users />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="permissions" 
          element={
            <PermissionProtectedRoute permission="manage_users">
              <UserPermissions />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="security" 
          element={
            <PermissionProtectedRoute permission="view_audit_logs">
              <Security />
            </PermissionProtectedRoute>
          } 
        />
        <Route path="debts" element={<Debts />} />
        <Route path="real-estate-buildings" element={<RealEstateBuildings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationContainer />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
