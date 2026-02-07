import { useState, useEffect, lazy, Suspense, useRef } from 'react'
import './App.css'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Layout } from './components/Layout'

// Lazy-load all pages so initial bundle is small and app opens in milliseconds (PWA-friendly)
const LoginPage = lazy(() => import('./pages/Login').then(m => ({ default: m.LoginPage })))
const HomePage = lazy(() => import('./pages/Home').then(m => ({ default: m.HomePage })))
const LandPage = lazy(() => import('./pages/Land').then(m => ({ default: m.LandPage })))
const ClientsPage = lazy(() => import('./pages/Clients').then(m => ({ default: m.ClientsPage })))
const ConfirmationPage = lazy(() => import('./pages/Confirmation').then(m => ({ default: m.ConfirmationPage })))
const FinancePage = lazy(() => import('./pages/Finance').then(m => ({ default: m.FinancePage })))
const ContractWritersPage = lazy(() => import('./pages/ContractWriters').then(m => ({ default: m.ContractWritersPage })))
const InstallmentsPage = lazy(() => import('./pages/Installments').then(m => ({ default: m.InstallmentsPage })))
const SalesRecordsPage = lazy(() => import('./pages/SalesRecords').then(m => ({ default: m.SalesRecordsPage })))
const AppointmentsPage = lazy(() => import('./pages/Appointments').then(m => ({ default: m.AppointmentsPage })))
const PhoneCallAppointmentsPage = lazy(() => import('./pages/PhoneCallAppointments').then(m => ({ default: m.PhoneCallAppointmentsPage })))
const UsersPage = lazy(() => import('./pages/Users').then(m => ({ default: m.UsersPage })))

// Map URL hash to page IDs
const pageHashMap: Record<string, string> = {
  '': 'home',
  '#login': 'login',
  '#home': 'home',
  '#land': 'land',
  '#clients': 'clients',
  '#confirmation': 'confirmation',
  '#finance': 'finance',
  '#contract-writers': 'contract-writers',
  '#installments': 'installments',
  '#sales-records': 'sales-records',
  '#appointments': 'appointments',
  '#phone-call-appointments': 'phone-call-appointments',
  '#users': 'users',
}

const pageToHash: Record<string, string> = {
  'login': '#login',
  'home': '#home',
  'land': '#land',
  'clients': '#clients',
  'confirmation': '#confirmation',
  'finance': '#finance',
  'contract-writers': '#contract-writers',
  'installments': '#installments',
  'sales-records': '#sales-records',
  'appointments': '#appointments',
  'phone-call-appointments': '#phone-call-appointments',
  'users': '#users',
}

// Max time to show "loading profile" before showing app anyway (avoids infinite wait if systemUser fails)
const SYSTEM_USER_MAX_WAIT_MS = 2500

function AppContent() {
  const { user, systemUser, loading } = useAuth()
  const [allowAppWithoutSystemUser, setAllowAppWithoutSystemUser] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Once we have user, give systemUser a short time to load; then show app anyway so we don't block forever
  useEffect(() => {
    if (!user) {
      setAllowAppWithoutSystemUser(false)
      return
    }
    if (systemUser) {
      setAllowAppWithoutSystemUser(true)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      return
    }
    if (timeoutRef.current) return
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null
      setAllowAppWithoutSystemUser(true)
    }, SYSTEM_USER_MAX_WAIT_MS)
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [user, systemUser])

  // Check if user has access to a page
  const hasAccessToPage = (pageId: string) => {
    // While systemUser is still loading, only home is visible so user sees something (no blank screen)
    if (!systemUser) return pageId === 'home'
    // Owners have access to all pages
    if (systemUser.role === 'owner') return true
    // Home is always accessible
    if (pageId === 'home') return true
    // Check if user has access to this page
    return systemUser.allowed_pages?.includes(pageId) ?? false
  }
  
  // Initialize from URL hash or default to 'home'
  // MUST be called before any conditional returns (Rules of Hooks)
  const getPageFromHash = () => {
    const hash = window.location.hash || ''
    // Normalize hash (remove trailing slash, ensure it starts with #)
    const normalizedHash = hash === '' ? '' : (hash.startsWith('#') ? hash : `#${hash}`)
    const page = pageHashMap[normalizedHash]
    if (!page) {
      console.warn(`Hash "${normalizedHash}" not found in pageHashMap, defaulting to home`)
      return 'home'
    }
    return page
  }

  const [currentPage, setCurrentPage] = useState(getPageFromHash)

  // Listen for hash changes (back/forward buttons)
  useEffect(() => {
    const handleHashChange = () => {
      const page = getPageFromHash()
      setCurrentPage((prevPage) => {
        // Only update if page is actually different to avoid unnecessary re-renders
        return page !== prevPage ? page : prevPage
      })
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  // Set initial hash if not present (only on mount, before any navigation)
  useEffect(() => {
    const hash = window.location.hash
    // Only set default hash if there's no hash at all (not even '#' or '#home')
    if (!hash || hash === '' || hash === '#') {
      // Don't trigger navigation, just set the hash silently
      if (user && systemUser) {
      window.history.replaceState(null, '', '#home')
        setCurrentPage('home')
      } else if (!loading) {
        window.history.replaceState(null, '', '#login')
        setCurrentPage('login')
      }
    }
  }, [user, systemUser, loading])

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user && currentPage !== 'login') {
      window.location.hash = '#login'
      setCurrentPage('login')
    }
  }, [user, loading, currentPage])

  // Redirect to home if authenticated and on login page
  useEffect(() => {
    if (!loading && user && systemUser && currentPage === 'login') {
      window.location.hash = '#home'
      setCurrentPage('home')
    }
  }, [user, systemUser, loading, currentPage])

  // Redirect to home if user doesn't have access to current page
  useEffect(() => {
    if (systemUser && !hasAccessToPage(currentPage) && currentPage !== 'home') {
      console.warn(`User doesn't have access to page: ${currentPage}`)
      window.location.hash = '#home'
      setCurrentPage('home')
    }
  }, [systemUser, currentPage])

  // Preload Home immediately when user is set so /#home is not empty on first paint
  useEffect(() => {
    if (!user) return
    import('./pages/Home')
  }, [user])

  // Prefetch confirmation & land chunks when idle so PWA navigation is instant
  useEffect(() => {
    if (!user) return
    const prefetch = () => {
      import('./pages/Confirmation')
      import('./pages/Land')
    }
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(prefetch, { timeout: 2000 })
      return () => cancelIdleCallback(id)
    }
    const t = setTimeout(prefetch, 500)
    return () => clearTimeout(t)
  }, [user])

  // Update URL hash when page changes
  const handleNavigate = (page: string) => {
    // Check access before navigating
    if (systemUser && !hasAccessToPage(page)) {
      console.warn(`Access denied to page: ${page}`)
      return
    }
    
    // Validate page exists in mapping
    if (!pageToHash[page]) {
      console.warn(`Page "${page}" not found in pageToHash, defaulting to home`)
      const homeHash = '#home'
      setCurrentPage('home')
      if (window.location.hash !== homeHash) {
        window.location.hash = homeHash
      }
      return
    }
    
    const hash = pageToHash[page]
    // Only update if page is actually different
    if (currentPage !== page) {
      setCurrentPage(page)
      // Only update hash if it's different
      if (window.location.hash !== hash) {
        window.location.hash = hash
      }
    }
  }

  // Show one clear loading state until we're ready: session checked and (systemUser loaded or timeout)
  // This avoids flashing empty page then main content
  if (user && !systemUser && !allowAppWithoutSystemUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600 mb-2">جاري التحميل...</p>
          <p className="text-sm text-gray-500">جاري تحميل بياناتك...</p>
        </div>
      </div>
    )
  }
  if (user) {
    // Show the app (systemUser ready or we gave up waiting)
  } else if (loading) {
    // Show loading state only if we don't have user yet
    // Add a timeout to prevent infinite loading
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600 mb-2">جاري التحميل...</p>
          <p className="text-sm text-gray-500">جاري تحميل بيانات المستخدم...</p>
        </div>
      </div>
    )
  } else {
    // Not loading and no user - show login (lazy chunk)
    return (
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent" />
        </div>
      }>
        <LoginPage />
      </Suspense>
    )
  }

  // Visible fallback so content area never looks empty while page chunk loads
  const PageFallback = () => (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[280px] gap-3" aria-hidden>
      <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent" />
      <p className="text-sm text-gray-500">جاري تحميل الصفحة...</p>
    </div>
  )

  // Show protected pages if authenticated; lazy chunks load on demand.
  // If no page matches (e.g. no access), show home so PWA never shows blank main.
  const pageContent =
    (currentPage === 'home' && <HomePage onNavigate={handleNavigate} />) ||
    (hasAccessToPage('land') && currentPage === 'land' && <LandPage />) ||
    (hasAccessToPage('clients') && currentPage === 'clients' && <ClientsPage />) ||
    (hasAccessToPage('confirmation') && currentPage === 'confirmation' && <ConfirmationPage />) ||
    (hasAccessToPage('finance') && currentPage === 'finance' && <FinancePage />) ||
    (hasAccessToPage('contract-writers') && currentPage === 'contract-writers' && <ContractWritersPage />) ||
    (hasAccessToPage('installments') && currentPage === 'installments' && <InstallmentsPage />) ||
    (hasAccessToPage('sales-records') && currentPage === 'sales-records' && <SalesRecordsPage />) ||
    (hasAccessToPage('appointments') && currentPage === 'appointments' && <AppointmentsPage />) ||
    (hasAccessToPage('phone-call-appointments') && currentPage === 'phone-call-appointments' && <PhoneCallAppointmentsPage />) ||
    (hasAccessToPage('users') && currentPage === 'users' && <UsersPage />)

  return (
    <Layout currentPage={currentPage} onNavigate={handleNavigate}>
      <Suspense fallback={<PageFallback />}>
        {pageContent || <HomePage onNavigate={handleNavigate} />}
      </Suspense>
    </Layout>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
