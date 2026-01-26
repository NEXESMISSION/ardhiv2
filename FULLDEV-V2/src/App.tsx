import { useState, useEffect } from 'react'
import './App.css'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/Login'
import { HomePage } from './pages/Home'
import { LandPage } from './pages/Land'
import { ClientsPage } from './pages/Clients'
import { ConfirmationPage } from './pages/Confirmation'
import { FinancePage } from './pages/Finance'
import { ContractWritersPage } from './pages/ContractWriters'
import { InstallmentsPage } from './pages/Installments'
import { SalesRecordsPage } from './pages/SalesRecords'
import { AppointmentsPage } from './pages/Appointments'
import { PhoneCallAppointmentsPage } from './pages/PhoneCallAppointments'
import { UsersPage } from './pages/Users'

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

function AppContent() {
  const { user, systemUser, loading } = useAuth()
  
  // Check if user has access to a page
  const hasAccessToPage = (pageId: string) => {
    if (!systemUser) return false
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

  // If we have user (authenticated), show the app immediately
  // systemUser will load in the background and update when ready
  // This makes the app feel much faster on initial load
  if (user) {
    // Show the app - systemUser will load in background
    // The useEffect in AuthContext will ensure loading is false
  } else if (loading) {
    // Show loading state only if we don't have user yet
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">جاري التحميل...</p>
        </div>
      </div>
    )
  } else {
    // Not loading and no user - show login
    return <LoginPage />
  }

  // Show protected pages if authenticated
  // Note: systemUser might be null temporarily while loading, but we show the app anyway
  // This makes the app feel much faster - systemUser loads in < 500ms
  return (
    <Layout currentPage={currentPage} onNavigate={handleNavigate}>
      {currentPage === 'home' && <HomePage onNavigate={handleNavigate} />}
      {hasAccessToPage('land') && currentPage === 'land' && <LandPage />}
      {hasAccessToPage('clients') && currentPage === 'clients' && <ClientsPage />}
      {hasAccessToPage('confirmation') && currentPage === 'confirmation' && <ConfirmationPage />}
      {hasAccessToPage('finance') && currentPage === 'finance' && <FinancePage />}
      {hasAccessToPage('contract-writers') && currentPage === 'contract-writers' && <ContractWritersPage />}
      {hasAccessToPage('installments') && currentPage === 'installments' && <InstallmentsPage />}
      {hasAccessToPage('sales-records') && currentPage === 'sales-records' && <SalesRecordsPage />}
      {hasAccessToPage('appointments') && currentPage === 'appointments' && <AppointmentsPage />}
      {hasAccessToPage('phone-call-appointments') && currentPage === 'phone-call-appointments' && <PhoneCallAppointmentsPage />}
      {hasAccessToPage('users') && currentPage === 'users' && <UsersPage />}
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
