import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { IconButton } from '@/components/ui/icon-button'
import { Dialog } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

// ============================================================================
// TYPES
// ============================================================================

type ClientType = 'individual' | 'company'

interface Client {
  id: string
  id_number: string
  name: string
  phone: string
  email: string | null
  address: string | null
  notes: string | null
  type: ClientType
  created_at: string
  updated_at: string
}

interface ClientStats {
  total: number
  withSales: number
  individuals: number
  companies: number
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ClientsPage() {
  // ============================================================================
  // AUTH
  // ============================================================================
  const { isOwner } = useAuth()

  // ============================================================================
  // STATE: List View
  // ============================================================================
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [stats, setStats] = useState<ClientStats>({
    total: 0,
    withSales: 0,
    individuals: 0,
    companies: 0,
  })
  const [displayedStats, setDisplayedStats] = useState<ClientStats>({
    total: 0,
    withSales: 0,
    individuals: 0,
    companies: 0,
  })
  const statsAnimationRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // ============================================================================
  // STATE: Pagination
  // ============================================================================
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const itemsPerPage = 20

  // ============================================================================
  // STATE: Search
  // ============================================================================
  const [searchQuery, setSearchQuery] = useState('')
  // Removed allClients state - search is now done directly via database query (filterClientsBySearch)
  // This avoids loading all clients into memory unnecessarily

  // ============================================================================
  // STATE: Dialogs
  // ============================================================================
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)

  // ============================================================================
  // STATE: Selected Client (for editing/deleting/viewing)
  // ============================================================================
  const [editingClientId, setEditingClientId] = useState<string | null>(null)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [clientToDelete, setClientToDelete] = useState<string | null>(null)

  // ============================================================================
  // STATE: Form Data
  // ============================================================================
  const [idNumber, setIdNumber] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [type, setType] = useState<ClientType>('individual')

  // ============================================================================
  // STATE: Form Status
  // ============================================================================
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // ============================================================================
  // STATE: ID number auto-check (exists or available)
  // ============================================================================
  const [idNumberCheck, setIdNumberCheck] = useState<'idle' | 'checking' | 'exists' | 'available'>('idle')
  const [idNumberExistingName, setIdNumberExistingName] = useState<string | null>(null)

  // ============================================================================
  // EFFECTS
  // ============================================================================
  useEffect(() => {
    // Load clients immediately - don't wait for anything
    loadClients()
    // Load stats immediately but in background (non-blocking)
    loadStats()
  }, [currentPage])

  // Removed loadAllClientsForSearch - search is now done directly via database query (filterClientsBySearch)
  // This avoids loading all clients into memory unnecessarily

  // Filter clients based on search query - minimal debounce for instant feel
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        // Reset to page 1 when searching
        if (currentPage !== 1) {
          setCurrentPage(1)
        }
        filterClientsBySearch()
      } else {
        // Reset to paginated view when search is cleared
        if (currentPage !== 1) {
          setCurrentPage(1)
        }
        loadClients()
      }
    }, 100) // Reduced to 100ms for faster response

    return () => clearTimeout(timeoutId)
  }, [searchQuery])

  // Animate stats numbers with count-up effect
  useEffect(() => {
    // Cleanup any existing animations first
    statsAnimationRef.current.forEach(timeout => clearTimeout(timeout))
    statsAnimationRef.current.clear()

    const animateStat = (key: keyof ClientStats, targetValue: number) => {
      // Use functional update to get current value without dependency
      setDisplayedStats(prev => {
        const currentValue = prev[key]
        if (currentValue === targetValue) {
          return prev // No change needed
        }

        // Clear any existing animation for this stat
      const existingTimeout = statsAnimationRef.current.get(key)
      if (existingTimeout) {
        clearTimeout(existingTimeout)
      }

      const diff = targetValue - currentValue
      const steps = Math.min(Math.abs(diff), 30) // Max 30 steps for smooth animation
      const stepValue = diff / steps
      const duration = 600 // 600ms total
      const stepDuration = duration / steps

      let currentStep = 0
      const animate = () => {
        currentStep++
        const newValue = Math.round(currentValue + (stepValue * currentStep))
          const finalValue = currentStep >= steps ? targetValue : newValue
          
          // Update state using functional update to avoid dependency issues
          setDisplayedStats(prevState => ({
            ...prevState,
            [key]: finalValue,
        }))

        if (currentStep < steps) {
          const timeout = setTimeout(animate, stepDuration)
          statsAnimationRef.current.set(key, timeout)
        } else {
          statsAnimationRef.current.delete(key)
        }
      }

        // Start animation after a small delay to avoid immediate state update
        setTimeout(() => animate(), 0)

        // Return previous state to avoid immediate update
        return prev
      })
    }

    // Animate each stat
    animateStat('total', stats.total)
    animateStat('withSales', stats.withSales)
    animateStat('individuals', stats.individuals)
    animateStat('companies', stats.companies)

    // Cleanup on unmount or when stats change
    return () => {
      statsAnimationRef.current.forEach(timeout => clearTimeout(timeout))
      statsAnimationRef.current.clear()
    }
  }, [stats]) // Only depend on stats, NOT displayedStats to avoid infinite loop

  // Keyboard shortcut: "+" opens add client popup (Clients page only - this component only mounts here)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isPlus = e.key === '+' || (e.key === '=' && e.shiftKey)
      if (!isPlus) return
      const target = e.target as HTMLElement
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable
      if (inInput) return
      e.preventDefault()
      if (!dialogOpen) openCreateDialog()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dialogOpen])

  // Auto-check if ID number (رقم الهوية) already exists when user types 8 digits
  useEffect(() => {
    const trimmed = idNumber.trim()
    if (trimmed.length !== 8 || !/^\d{8}$/.test(trimmed)) {
      setIdNumberCheck('idle')
      setIdNumberExistingName(null)
      return
    }

    // When editing: if ID is unchanged, consider it available (no check needed)
    if (editingClientId) {
      const current = clients.find(c => c.id === editingClientId)
      if (current && current.id_number === trimmed) {
        setIdNumberCheck('available')
        setIdNumberExistingName(null)
        return
      }
    }

    const timeoutId = setTimeout(async () => {
      setIdNumberCheck('checking')
      setIdNumberExistingName(null)
      try {
        let query = supabase
          .from('clients')
          .select('id, name')
          .eq('id_number', trimmed)
        if (editingClientId) {
          query = query.neq('id', editingClientId)
        }
        const { data, error: err } = await query.maybeSingle()

        if (err) {
          setIdNumberCheck('idle')
          return
        }
        if (data) {
          setIdNumberCheck('exists')
          setIdNumberExistingName(data.name || null)
        } else {
          setIdNumberCheck('available')
          setIdNumberExistingName(null)
        }
      } catch {
        setIdNumberCheck('idle')
      }
    }, 400)

    return () => clearTimeout(timeoutId)
  }, [idNumber, editingClientId, clients])

  // ============================================================================
  // DATA LOADING FUNCTIONS
  // ============================================================================

  async function loadClients() {
    // Optimistic: don't show loading if we already have data
    if (clients.length === 0) {
      setLoading(true)
    }
    setListError(null)
    try {
      const from = (currentPage - 1) * itemsPerPage
      const to = from + itemsPerPage - 1

      // Load ONLY data - fastest possible query
      const dataResult = await supabase
        .from('clients')
        .select('id,name,id_number,phone,email,address,notes,type,created_at,updated_at')
        .order('created_at', { ascending: false })
        .range(from, to)
        .limit(itemsPerPage)

      if (dataResult.error) throw dataResult.error
      
      // Show clients IMMEDIATELY - don't wait for anything
      const loadedClients = dataResult.data || []
      setClients(loadedClients)
      setLoading(false)
      
      // Update stats immediately with approximate values from loaded clients
      if (loadedClients.length > 0) {
        const individuals = loadedClients.filter(c => c.type === 'individual').length
        const companies = loadedClients.filter(c => c.type === 'company').length
        setStats(prev => ({
          total: Math.max(prev.total, loadedClients.length),
          individuals: Math.max(prev.individuals, individuals),
          companies: Math.max(prev.companies, companies),
          withSales: prev.withSales,
        }))
      }
      
      // Set approximate count immediately (fast)
      if (dataResult.data) {
        if (dataResult.data.length === itemsPerPage) {
          // Likely more pages exist
          setTotalCount((currentPage * itemsPerPage) + 1)
        } else {
          // This is the last page
          setTotalCount((currentPage - 1) * itemsPerPage + dataResult.data.length)
        }
      }
      
      // Load exact count in background (lowest priority, doesn't block UI)
      setTimeout(async () => {
        try {
          const { count } = await supabase
            .from('clients')
            .select('*', { count: 'exact', head: true })
          if (count !== null) {
            setTotalCount(count)
          }
        } catch (e) {
          // Silently fail - we already have approximate count
        }
      }, 300)
    } catch (e: any) {
      setListError(e.message || 'فشل تحميل العملاء')
      setLoading(false)
    }
  }

  // Removed loadAllClientsForSearch function - search is now done directly via database query (filterClientsBySearch)
  // This avoids loading all clients into memory unnecessarily

  async function filterClientsBySearch() {
    if (!searchQuery.trim()) {
      loadClients()
      return
    }

    // Optimistic: don't show loading if we already have data
    if (clients.length === 0) {
      setLoading(true)
    }
    setListError(null)
    const query = searchQuery.trim().toLowerCase()
    
    try {
      // Optimized search: use textSearch or simple ilike for faster queries
      // Select only needed fields for faster queries
      const { data, error: err } = await supabase
        .from('clients')
        .select('id,name,id_number,phone,email,address,notes,type,created_at,updated_at')
        .or(`name.ilike.%${query}%,id_number.ilike.%${query}%,phone.ilike.%${query}%${query.includes('@') ? `,email.ilike.%${query}%` : ''}`)
        .order('created_at', { ascending: false })
        .limit(200) // Reduced limit for faster queries

      if (err) {
        console.error('Error searching clients:', err)
        setListError('فشل البحث عن العملاء. يرجى المحاولة مرة أخرى.')
        setClients([])
        return
      }
      
      setClients(data || [])
      setTotalCount(data?.length || 0)
    } catch (e: any) {
      setListError(e.message || 'فشل البحث')
      setClients([])
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }

  async function loadStats() {
    // Load stats immediately - show approximate first, then exact
    try {
      // Show approximate stats from loaded clients immediately (instant)
      if (clients.length > 0) {
        const individuals = clients.filter(c => c.type === 'individual').length
        const companies = clients.filter(c => c.type === 'company').length
        setStats(prev => ({
          total: Math.max(prev.total, clients.length),
          individuals: Math.max(prev.individuals, individuals),
          companies: Math.max(prev.companies, companies),
          withSales: prev.withSales, // Keep existing
        }))
      }

      // Load exact counts in parallel (fast)
      const [totalResult, individualsResult, companiesResult] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact', head: true }),
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('type', 'individual'),
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('type', 'company'),
      ])

      // Update with exact counts immediately
      setStats(prev => ({
        total: totalResult.count ?? prev.total,
        individuals: individualsResult.count ?? prev.individuals,
        companies: companiesResult.count ?? prev.companies,
        withSales: prev.withSales, // Will update below
      }))

      // Load sales count in background (non-blocking, can be slower)
      Promise.resolve().then(async () => {
        try {
          const { data: uniqueClientsData } = await supabase
            .from('sales')
            .select('client_id')
            .limit(1000)
          
          if (uniqueClientsData && uniqueClientsData.length > 0) {
            const uniqueClients = new Set(uniqueClientsData.map((s: any) => s.client_id))
            setStats(prev => ({
              ...prev,
              withSales: uniqueClients.size,
            }))
          }
        } catch (e) {
          // Silently fail
        }
      })
    } catch (e) {
      // Silently fail - stats are not critical
    }
  }

  // ============================================================================
  // DIALOG HANDLERS
  // ============================================================================

  function openCreateDialog() {
    resetForm()
    setEditingClientId(null)
    setDialogOpen(true)
  }

  async function openEditDialog(clientId: string) {
    const client = clients.find((c) => c.id === clientId)
    if (!client) return

    setEditingClientId(clientId)
    setIdNumber(client.id_number)
    setName(client.name)
    setPhone(client.phone)
    setEmail(client.email || '')
    setAddress(client.address || '')
    setNotes(client.notes || '')
    setType(client.type)
    setDialogOpen(true)
  }

  function openDetailsDialog(clientId: string) {
    const client = clients.find((c) => c.id === clientId)
    if (client) {
      setSelectedClient(client)
      setDetailsDialogOpen(true)
    }
  }

  function openDeleteDialog(clientId: string) {
    setClientToDelete(clientId)
    setDeleteConfirmOpen(true)
  }

  // ============================================================================
  // FORM HANDLERS
  // ============================================================================

  function resetForm() {
    setIdNumber('')
    setName('')
    setPhone('')
    setEmail('')
    setAddress('')
    setNotes('')
    setType('individual')
    setError(null)
    setSuccess(null)
    setIdNumberCheck('idle')
    setIdNumberExistingName(null)
  }

  function validateForm(): boolean {
    if (!idNumber.trim()) {
      setError('رقم الهوية إجباري')
      return false
    }

    if (!/^\d{8}$/.test(idNumber.trim())) {
      setError('رقم الهوية يجب أن يكون 8 أرقام')
      return false
    }

    if (!name.trim()) {
      setError('الاسم إجباري')
      return false
    }

    if (!phone.trim()) {
      setError('الهاتف إجباري')
      return false
    }

    if (email && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('البريد الإلكتروني غير صحيح')
      return false
    }

    return true
  }

  async function handleSaveClient() {
    setError(null)
    setSuccess(null)

    if (!validateForm()) {
      return
    }

    setSaving(true)
    try {
      const clientData = {
        id_number: idNumber.trim(),
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
        type: type,
        updated_at: new Date().toISOString(),
      }

      if (editingClientId) {
        // Update existing client
        // Check if id_number is being changed and if it conflicts with another client
        const currentClient = clients.find(c => c.id === editingClientId)
        if (currentClient && currentClient.id_number !== clientData.id_number) {
          // Check if new id_number already exists
          const { data: existingClient } = await supabase
            .from('clients')
            .select('id, name')
            .eq('id_number', clientData.id_number)
            .neq('id', editingClientId)
            .single()

          if (existingClient) {
            throw new Error(`رقم الهوية ${clientData.id_number} مستخدم بالفعل للعميل: ${existingClient.name}`)
          }
        }

        const { error: err } = await supabase
          .from('clients')
          .update(clientData)
          .eq('id', editingClientId)

        if (err) {
          // Handle unique constraint violation
          if (err.code === '23505' || err.message?.includes('unique')) {
            throw new Error(`رقم الهوية ${clientData.id_number} مستخدم بالفعل. يرجى استخدام رقم آخر.`)
          }
          throw err
        }
        setSuccess('تم تحديث العميل بنجاح')
      } else {
        // Create new client - Check for duplicate id_number first
        const { data: existingClient } = await supabase
          .from('clients')
          .select('id, name')
          .eq('id_number', clientData.id_number)
          .single()

        if (existingClient) {
          throw new Error(`رقم الهوية ${clientData.id_number} مستخدم بالفعل للعميل: ${existingClient.name}. يرجى استخدام رقم آخر أو تعديل العميل الموجود.`)
        }

        // Create new client
        const { error: err } = await supabase.from('clients').insert(clientData)

        if (err) {
          // Handle unique constraint violation (double check)
          if (err.code === '23505' || err.message?.includes('unique')) {
            throw new Error(`رقم الهوية ${clientData.id_number} مستخدم بالفعل. يرجى استخدام رقم آخر.`)
          }
          throw err
        }
        setSuccess('تم إضافة العميل بنجاح')
      }

      setTimeout(() => {
        setDialogOpen(false)
        resetForm()
        loadClients()
        // Removed loadAllClientsForSearch - search is now done directly via database query
        loadStats()
      }, 1500)
    } catch (e: any) {
      setError(e.message || 'خطأ غير متوقع')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteClient() {
    if (!clientToDelete) return

    setDeleting(true)
    try {
      const { count: salesCount } = await supabase
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientToDelete)

      if ((salesCount || 0) > 0) {
        throw new Error('لا يمكن حذف العميل لوجود مبيعات مرتبطة به. قم بإلغاء/نقل المبيعات أولاً.')
      }

      // Store the client being deleted for potential rollback
      const clientToDeleteData = clients.find(c => c.id === clientToDelete)
      const wasSearching = searchQuery.trim().length > 0

      // Optimistic update: Remove from UI immediately
      setClients(prev => prev.filter(c => c.id !== clientToDelete))
      // Removed setAllClients - allClients state no longer exists
      
      // Update stats optimistically
      setStats(prev => ({
        ...prev,
        total: Math.max(0, prev.total - 1),
        individuals: clientToDeleteData?.type === 'individual' ? Math.max(0, prev.individuals - 1) : prev.individuals,
        companies: clientToDeleteData?.type === 'company' ? Math.max(0, prev.companies - 1) : prev.companies,
      }))
      
      // Update total count
      setTotalCount(prev => Math.max(0, prev - 1))

      // Actually delete from database
      const { error } = await supabase.from('clients').delete().eq('id', clientToDelete)

      if (error) {
        // Rollback on error - reload data
        if (wasSearching) {
          await filterClientsBySearch()
        } else {
          await loadClients()
        }
        // Removed loadAllClientsForSearch - search is now done directly via database query
        await loadStats()
        throw error
      }

      setDeleteConfirmOpen(false)
      setClientToDelete(null)
      
      // Only reload if we're not searching (to maintain search state)
      if (!wasSearching && clients.length === 0 && currentPage > 1) {
        // If we deleted the last item on a page, go to previous page
        setCurrentPage(prev => Math.max(1, prev - 1))
      }
    } catch (e: any) {
      console.error('Error deleting client:', e)
      alert('فشل حذف العميل: ' + e.message)
    } finally {
      setDeleting(false)
    }
  }

  // ============================================================================
  // PAGINATION HELPERS
  // ============================================================================

  const totalPages = Math.ceil(totalCount / itemsPerPage)
  const hasNextPage = currentPage < totalPages
  const hasPrevPage = currentPage > 1

  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6">
        {/* Header */}
        <header className="mb-3 sm:mb-4 lg:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 mb-1 sm:mb-2">إدارة العملاء</h1>
              <p className="text-xs sm:text-sm text-gray-600">إدارة عملائك ومعلوماتهم</p>
            </div>
            <Button
              onClick={openCreateDialog}
              size="sm"
              className="w-9 h-9 sm:w-10 sm:h-10 p-0 rounded-full bg-gray-700 hover:bg-gray-800 text-white flex-shrink-0 shadow-sm"
              title="إضافة عميل (اختصار: +)"
              aria-label="إضافة عميل (اضغط +)"
            >
              +
            </Button>
          </div>
        </header>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4 mb-3 sm:mb-4 lg:mb-6">
          <Card className="animate-fade-in hover:shadow-md transition-all duration-300">
            <CardContent className="pt-3 sm:pt-4 lg:pt-6 p-3 sm:p-4 lg:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-600 mb-0.5 sm:mb-1">إجمالي العملاء</p>
                  <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 animate-count-up transition-all duration-300">
                    {displayedStats.total.toLocaleString()}
                  </p>
                </div>
                <div className="h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="animate-fade-in hover:shadow-md transition-all duration-300" style={{ animationDelay: '0.1s' }}>
            <CardContent className="pt-3 sm:pt-4 lg:pt-6 p-3 sm:p-4 lg:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-600 mb-0.5 sm:mb-1">لديهم مبيعات</p>
                  <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 animate-count-up transition-all duration-300">
                    {displayedStats.withSales.toLocaleString()}
                  </p>
                </div>
                <div className="h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="animate-fade-in hover:shadow-md transition-all duration-300" style={{ animationDelay: '0.2s' }}>
            <CardContent className="pt-3 sm:pt-4 lg:pt-6 p-3 sm:p-4 lg:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-600 mb-0.5 sm:mb-1">أفراد</p>
                  <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 animate-count-up transition-all duration-300">
                    {displayedStats.individuals.toLocaleString()}
                  </p>
                </div>
                <div className="h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="animate-fade-in hover:shadow-md transition-all duration-300" style={{ animationDelay: '0.3s' }}>
            <CardContent className="pt-3 sm:pt-4 lg:pt-6 p-3 sm:p-4 lg:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-600 mb-0.5 sm:mb-1">شركات</p>
                  <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 animate-count-up transition-all duration-300">
                    {displayedStats.companies.toLocaleString()}
                  </p>
                </div>
                <div className="h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search Bar and Action Bar */}
        <div className="mb-2 sm:mb-3 lg:mb-4 space-y-2 sm:space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <Input
              type="text"
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              placeholder="🔍 ابحث عن عميل (الاسم، رقم الهوية، الهاتف، البريد الإلكتروني)..."
              className="w-full text-xs sm:text-sm pr-10"
              size="sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                title="مسح البحث"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          
          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
            <div className="text-xs sm:text-sm text-gray-600">
              {searchQuery ? (
                <>عرض {clients.length} نتيجة من البحث</>
              ) : (
                <>عرض {clients.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} -{' '}
                {Math.min(currentPage * itemsPerPage, totalCount)} من {totalCount}</>
              )}
            </div>
          </div>
        </div>

        {/* List Error */}
        {listError && (
          <div className="mb-4">
            <Alert variant="error">{listError}</Alert>
          </div>
        )}

        {/* Clients List */}
        {loading ? (
          <Card className="text-center py-8 sm:py-12">
            <CardContent>
              <div className="inline-block animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-xs sm:text-sm text-gray-600">جاري التحميل...</p>
            </CardContent>
          </Card>
        ) : clients.length === 0 ? (
          <Card className="text-center py-8 sm:py-12">
            <CardContent>
              <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4">
                {searchQuery ? `لا توجد نتائج للبحث عن "${searchQuery}"` : 'لا يوجد عملاء حتى الآن'}
              </p>
              {!searchQuery && (
                <Button onClick={openCreateDialog} size="sm" className="text-xs sm:text-sm">إضافة عميل جديد</Button>
              )}
              {searchQuery && (
                <Button onClick={() => setSearchQuery('')} size="sm" className="text-xs sm:text-sm">مسح البحث</Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 lg:gap-4 mb-3 sm:mb-4 lg:mb-6">
              {clients.map((client) => (
                <Card key={client.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="p-3 sm:p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm sm:text-base lg:text-lg mb-1 truncate">{client.name}</CardTitle>
                        <p className="text-xs sm:text-sm text-gray-600 mb-1 truncate">🆔 {client.id_number}</p>
                        <p className="text-xs sm:text-sm text-gray-600 truncate">📞 {client.phone}</p>
                      </div>
                      <Badge
                        variant={client.type === 'individual' ? 'info' : 'default'}
                        size="sm"
                        className="text-xs flex-shrink-0 ml-2"
                      >
                        {client.type === 'individual' ? 'فردي' : 'شركة'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-4 pt-0">
                    <div className="flex items-center gap-1.5 sm:gap-2 pt-2 border-t border-gray-100">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openDetailsDialog(client.id)}
                        className="flex-1 text-xs sm:text-sm py-1.5"
                      >
                        التفاصيل
                      </Button>
                      <IconButton
                        variant="default"
                        size="sm"
                        onClick={() => openEditDialog(client.id)}
                        title="تعديل"
                        className="p-1.5 sm:p-2"
                      >
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </IconButton>
                      {isOwner && (
                      <IconButton
                        variant="danger"
                        size="sm"
                        onClick={() => openDeleteDialog(client.id)}
                        title="حذف"
                        className="p-1.5 sm:p-2"
                      >
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </IconButton>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Pagination - Only show when not searching */}
            {!searchQuery && totalPages > 1 && (
              <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={!hasPrevPage}
                  className="text-xs sm:text-sm py-1.5 px-2"
                >
                  السابق
                </Button>
                
                {/* Show all pages if 7 or less */}
                {totalPages <= 7 ? (
                  Array.from({ length: totalPages }, (_, i) => {
                    const pageNum = i + 1
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => goToPage(pageNum)}
                        className="text-xs sm:text-sm py-1.5 px-2 min-w-[32px] sm:min-w-[36px]"
                      >
                        {pageNum}
                      </Button>
                    )
                  })
                ) : (
                  <>
                    {/* Always show first page */}
                    <Button
                      variant={currentPage === 1 ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => goToPage(1)}
                      className="text-xs sm:text-sm py-1.5 px-2 min-w-[32px] sm:min-w-[36px]"
                    >
                      1
                    </Button>

                    {/* Show ellipsis if current page > 3 */}
                    {currentPage > 3 && <span className="px-1 sm:px-2 text-xs sm:text-sm text-gray-500">...</span>}

                    {/* Show current page and neighbors */}
                    {currentPage > 1 && currentPage < totalPages && (
                      <>
                        {currentPage > 2 && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => goToPage(currentPage - 1)}
                            className="text-xs sm:text-sm py-1.5 px-2 min-w-[32px] sm:min-w-[36px]"
                          >
                            {currentPage - 1}
                          </Button>
                        )}
                        <Button
                          variant="primary"
                          size="sm"
                          className="text-xs sm:text-sm py-1.5 px-2 min-w-[32px] sm:min-w-[36px]"
                        >
                          {currentPage}
                        </Button>
                        {currentPage < totalPages - 1 && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => goToPage(currentPage + 1)}
                            className="text-xs sm:text-sm py-1.5 px-2 min-w-[32px] sm:min-w-[36px]"
                          >
                            {currentPage + 1}
                          </Button>
                        )}
                      </>
                    )}

                    {/* Show ellipsis if current page < totalPages - 2 */}
                    {currentPage < totalPages - 2 && <span className="px-1 sm:px-2 text-xs sm:text-sm text-gray-500">...</span>}

                    {/* Always show last page */}
                    <Button
                      variant={currentPage === totalPages ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => goToPage(totalPages)}
                      className="text-xs sm:text-sm py-1.5 px-2 min-w-[32px] sm:min-w-[36px]"
                    >
                      {totalPages}
                    </Button>
                  </>
                )}

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={!hasNextPage}
                  className="text-xs sm:text-sm py-1.5 px-2"
                >
                  التالي
                </Button>
              </div>
            )}
          </>
        )}

        {/* Create/Edit Dialog - Add client popup (Clients page only) */}
        <Dialog
          open={dialogOpen}
          onClose={() => {
            if (!saving) {
              setDialogOpen(false)
              resetForm()
            }
          }}
          title={editingClientId ? 'تعديل العميل' : 'إضافة عميل جديد'}
          size="xl"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setDialogOpen(false)
                  resetForm()
                }}
                disabled={saving}
                className="bg-gray-100 text-gray-800 border border-gray-300 hover:bg-gray-200"
              >
                إلغاء
              </Button>
              <Button
                onClick={handleSaveClient}
                disabled={saving || idNumberCheck === 'exists' || idNumberCheck === 'checking'}
                className="bg-gray-700 hover:bg-gray-800"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    جارٍ الحفظ...
                  </span>
                ) : (
                  '💾 حفظ'
                )}
              </Button>
            </div>
          }
        >
          <div className="rounded-lg bg-gray-50/80 p-5 sm:p-6 -mx-1 sm:-mx-2 border border-gray-100">
          {/* Alerts */}
          {error && (
            <div className="mb-5">
              <Alert variant="error" className="text-sm">{error}</Alert>
            </div>
          )}

          {success && (
            <div className="mb-5">
              <Alert variant="success" className="text-sm">{success}</Alert>
            </div>
          )}

          {/* Form - larger and easier to use */}
          <div className="space-y-5 sm:space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
            <div className="space-y-2">
              <Label className="text-gray-800 font-medium text-sm sm:text-base">
                رقم الهوية <span className="text-red-500">*</span>
              </Label>
              <Input
                value={idNumber}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 8)
                  setIdNumber(v)
                }}
                placeholder="رقم الهوية (8 أرقام)"
                maxLength={8}
                pattern="[0-9]{8}"
                className={`text-base min-h-[2.75rem] transition-all focus:shadow-md ${
                  idNumberCheck === 'exists' ? 'border-red-500 focus:ring-red-500' : ''
                } ${idNumberCheck === 'available' ? 'border-green-500 focus:ring-green-500' : ''}`}
              />
              <p className="text-xs sm:text-sm text-gray-600">يجب أن يكون 8 أرقام</p>
              {idNumberCheck === 'checking' && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <span className="inline-block w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  جاري التحقق...
                </p>
              )}
              {idNumberCheck === 'exists' && (
                <p className="text-xs text-red-600">
                  رقم الهوية مستخدم بالفعل
                  {idNumberExistingName ? ` (العميل: ${idNumberExistingName})` : ''}
                </p>
              )}
              {idNumberCheck === 'available' && (
                <p className="text-xs sm:text-sm text-green-600">✓ رقم الهوية متاح</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-gray-800 font-medium text-sm sm:text-base">
                الاسم <span className="text-red-500">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                placeholder="اسم العميل"
                className="text-base min-h-[2.75rem] transition-all focus:shadow-md"
              />
            </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
            <div className="space-y-2">
              <Label className="text-gray-800 font-medium text-sm sm:text-base">
                الهاتف <span className="text-red-500">*</span>
              </Label>
              <Input
                value={phone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
                placeholder="مثال: 5822092120192614/10/593"
                className="text-base min-h-[2.75rem] transition-all focus:shadow-md"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-800 font-medium text-sm sm:text-base">البريد الإلكتروني</Label>
              <Input
                type="email"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                placeholder="example@email.com"
                className="text-base min-h-[2.75rem] transition-all focus:shadow-md"
              />
            </div>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-800 font-medium text-sm sm:text-base">العنوان</Label>
              <Input
                value={address}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddress(e.target.value)}
                placeholder="عنوان العميل"
                className="text-base min-h-[2.75rem] transition-all focus:shadow-md"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-800 font-medium text-sm sm:text-base">النوع</Label>
              <Select
                value={type}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setType(e.target.value as ClientType)
                }
                className="text-base min-h-[2.75rem]"
              >
                <option value="individual">فردي</option>
                <option value="company">شركة</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-800 font-medium text-sm sm:text-base">ملاحظات</Label>
              <Textarea
                value={notes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                placeholder="ملاحظات إضافية"
                rows={4}
                className="text-base min-h-[5rem] transition-all focus:shadow-md w-full"
              />
            </div>
          </div>
          </div>
        </Dialog>

        {/* Details Dialog */}
        <Dialog
          open={detailsDialogOpen}
          onClose={() => {
            setDetailsDialogOpen(false)
            setSelectedClient(null)
          }}
          title={`تفاصيل العميل: ${selectedClient?.name || ''}`}
          size="md"
          footer={
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setDetailsDialogOpen(false)}>
                إغلاق
              </Button>
            </div>
          }
        >
          {selectedClient && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-gray-500">رقم الهوية</Label>
                  <p className="text-sm font-medium">{selectedClient.id_number}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">النوع</Label>
                  <p className="text-sm font-medium">
                    {selectedClient.type === 'individual' ? 'فردي' : 'شركة'}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">الهاتف</Label>
                  <p className="text-sm font-medium">{selectedClient.phone}</p>
                </div>
                {selectedClient.email && (
                  <div>
                    <Label className="text-xs text-gray-500">البريد الإلكتروني</Label>
                    <p className="text-sm font-medium">{selectedClient.email}</p>
                  </div>
                )}
                {selectedClient.address && (
                  <div className="col-span-2">
                    <Label className="text-xs text-gray-500">العنوان</Label>
                    <p className="text-sm font-medium">{selectedClient.address}</p>
                  </div>
                )}
                {selectedClient.notes && (
                  <div className="col-span-2">
                    <Label className="text-xs text-gray-500">ملاحظات</Label>
                    <p className="text-sm font-medium">{selectedClient.notes}</p>
                  </div>
                )}
                <div>
                  <Label className="text-xs text-gray-500">تاريخ الإضافة</Label>
                  <p className="text-sm font-medium">
                    {new Date(selectedClient.created_at).toLocaleDateString('en-US')}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">آخر تحديث</Label>
                  <p className="text-sm font-medium">
                    {new Date(selectedClient.updated_at).toLocaleDateString('en-US')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          open={deleteConfirmOpen}
          onClose={() => {
            if (!deleting) {
              setDeleteConfirmOpen(false)
              setClientToDelete(null)
            }
          }}
          onConfirm={handleDeleteClient}
          title="حذف العميل"
          description="هل أنت متأكد من حذف هذا العميل؟ لا يمكن التراجع عن هذا الإجراء."
          confirmText={deleting ? 'جاري الحذف...' : 'نعم، حذف'}
          cancelText="إلغاء"
          variant="destructive"
          disabled={deleting}
        />
      </div>
  )
}

export default ClientsPage

