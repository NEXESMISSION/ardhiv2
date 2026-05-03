import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/i18n/context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Alert } from '@/components/ui/alert'
import { Dialog } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { NotificationDialog } from '@/components/ui/notification-dialog'

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

function replaceVars(str: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)), str)
}

export function ClientsPage() {
  const { t } = useLanguage()
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
  const statsAnimationRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

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
  // Styled error popup state — replaces the native alert() that fired on
  // delete failure so the message matches the rest of the app's design.
  const [deleteClientError, setDeleteClientError] = useState<string | null>(null)

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
  // STATE: Name search when adding client (see if similar name exists)
  // ============================================================================
  const [nameSearchStatus, setNameSearchStatus] = useState<'idle' | 'checking' | 'found' | 'none'>('idle')
  const [nameSearchMatches, setNameSearchMatches] = useState<Array<{ id: string; name: string; id_number: string }>>([])

  // ============================================================================
  // STATE: Phone auto-check (exists or available) - like CIN
  // ============================================================================
  const [phoneCheck, setPhoneCheck] = useState<'idle' | 'checking' | 'exists' | 'available'>('idle')
  const [phoneExistingName, setPhoneExistingName] = useState<string | null>(null)

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

  // Search by name when adding/editing client - show similar names so user knows if client may exist
  useEffect(() => {
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setNameSearchStatus('idle')
      setNameSearchMatches([])
      return
    }

    const timeoutId = setTimeout(async () => {
      setNameSearchStatus('checking')
      setNameSearchMatches([])
      try {
        // Escape ilike special chars (%, _) so search is safe and predictable
        const escaped = trimmed.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
        const pattern = `%${escaped}%`
        let query = supabase
          .from('clients')
          .select('id, name, id_number')
          .ilike('name', pattern)
          .limit(10)
        if (editingClientId) {
          query = query.neq('id', editingClientId)
        }
        const { data, error: err } = await query

        if (err) {
          setNameSearchStatus('idle')
          return
        }
        const list = (data || []) as Array<{ id: string; name: string; id_number: string }>
        if (list.length > 0) {
          setNameSearchStatus('found')
          setNameSearchMatches(list)
        } else {
          setNameSearchStatus('none')
          setNameSearchMatches([])
        }
      } catch {
        setNameSearchStatus('idle')
      }
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [name, editingClientId])

  // Auto-check if phone already exists when user types 4+ digits (like CIN)
  useEffect(() => {
    const trimmed = phone.trim()
    if (trimmed.length < 4) {
      setPhoneCheck('idle')
      setPhoneExistingName(null)
      return
    }

    if (editingClientId) {
      const current = clients.find(c => c.id === editingClientId)
      if (current && current.phone === trimmed) {
        setPhoneCheck('available')
        setPhoneExistingName(null)
        return
      }
    }

    const timeoutId = setTimeout(async () => {
      setPhoneCheck('checking')
      setPhoneExistingName(null)
      try {
        let query = supabase
          .from('clients')
          .select('id, name')
          .eq('phone', trimmed)
        if (editingClientId) {
          query = query.neq('id', editingClientId)
        }
        const { data, error: err } = await query.maybeSingle()

        if (err) {
          setPhoneCheck('idle')
          return
        }
        if (data) {
          setPhoneCheck('exists')
          setPhoneExistingName(data.name || null)
        } else {
          setPhoneCheck('available')
          setPhoneExistingName(null)
        }
      } catch {
        setPhoneCheck('idle')
      }
    }, 400)

    return () => clearTimeout(timeoutId)
  }, [phone, editingClientId, clients])

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
      setListError(e.message || t('clients.loadError'))
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
    // PostgREST uses comma + dot to separate clauses inside `.or(...)`, so any
    // user-typed comma/parenthesis/asterisk would inject an extra clause and
    // could bypass the intended filter. Strip those characters before building.
    const query = searchQuery
      .trim()
      .toLowerCase()
      .replace(/[,()*]/g, ' ')

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
        setListError(t('clients.searchError'))
        setClients([])
        return
      }
      
      setClients(data || [])
      setTotalCount(data?.length || 0)
    } catch (e: any) {
      setListError(e.message || t('clients.searchFailed'))
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
    setPhoneCheck('idle')
    setPhoneExistingName(null)
    setNameSearchStatus('idle')
    setNameSearchMatches([])
  }

  function validateForm(): boolean {
    if (!idNumber.trim()) {
      setError(t('clients.errorIdRequired'))
      return false
    }

    if (!/^\d{8}$/.test(idNumber.trim())) {
      setError(t('clients.errorIdDigits'))
      return false
    }

    if (!name.trim()) {
      setError(t('clients.errorNameRequired'))
      return false
    }

    if (!phone.trim()) {
      setError(t('clients.errorPhoneRequired'))
      return false
    }

    if (email && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t('clients.errorEmailInvalid'))
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
            throw new Error(replaceVars(t('clients.idUsedBy'), { id: clientData.id_number, name: existingClient.name }))
          }
        }

        const { error: err } = await supabase
          .from('clients')
          .update(clientData)
          .eq('id', editingClientId)

        if (err) {
          // Handle unique constraint violation
          if (err.code === '23505' || err.message?.includes('unique')) {
            throw new Error(replaceVars(t('clients.idUsedByOther'), { id: clientData.id_number }))
          }
          throw err
        }
        setSuccess(t('clients.successUpdated'))
      } else {
        // Create new client - Check for duplicate id_number first
        const { data: existingClient } = await supabase
          .from('clients')
          .select('id, name')
          .eq('id_number', clientData.id_number)
          .single()

        if (existingClient) {
          throw new Error(replaceVars(t('clients.idUsedEdit'), { id: clientData.id_number, name: existingClient.name }))
        }

        // Create new client
        const { error: err } = await supabase.from('clients').insert(clientData)

        if (err) {
          // Handle unique constraint violation (double check)
          if (err.code === '23505' || err.message?.includes('unique')) {
            throw new Error(replaceVars(t('clients.idUsedByOther'), { id: clientData.id_number }))
          }
          throw err
        }
        setSuccess(t('clients.successCreated'))
      }

      setTimeout(() => {
        setDialogOpen(false)
        resetForm()
        loadClients()
        // Removed loadAllClientsForSearch - search is now done directly via database query
        loadStats()
      }, 1500)
    } catch (e: any) {
      setError(e.message || t('clients.errorUnexpected'))
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
        throw new Error(t('clients.errorHasSales'))
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
      setDeleteClientError(t('clients.errorDeleteFailed') + ': ' + e.message)
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

  // Scroll to top when page changes for better UX
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [currentPage])

  // ============================================================================
  // RENDER
  // ============================================================================

  // Compact pagination — only render the visible window
  const renderPagination = () => {
    if (searchQuery || totalPages <= 1) return null

    // Build window: current ± 1, plus first/last with ellipses
    const window: (number | '...')[] = []
    const add = (n: number | '...') => window.push(n)
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) add(i)
    } else {
      add(1)
      if (currentPage > 3) add('...')
      const from = Math.max(2, currentPage - 1)
      const to = Math.min(totalPages - 1, currentPage + 1)
      for (let i = from; i <= to; i++) add(i)
      if (currentPage < totalPages - 2) add('...')
      add(totalPages)
    }

    return (
      <div dir="ltr" className="flex items-center justify-center gap-1 flex-wrap">
        <button
          type="button"
          onClick={() => goToPage(currentPage - 1)}
          disabled={!hasPrevPage}
          className="h-9 w-9 rounded-xl bg-white border border-gray-200 text-gray-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex items-center justify-center hover:bg-gray-50 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title={t('clients.prev')}
          aria-label={t('clients.prev')}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        {window.map((p, i) =>
          p === '...' ? (
            <span key={`gap-${i}`} className="w-7 text-center text-gray-400 font-bold tabular-nums">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => goToPage(p)}
              aria-current={currentPage === p ? 'page' : undefined}
              className={`h-9 min-w-[36px] px-2 rounded-xl text-[13px] font-extrabold tabular-nums transition-colors ${
                currentPage === p
                  ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-500/30'
                  : 'bg-white border border-gray-200 text-gray-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-gray-50 hover:border-gray-300'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => goToPage(currentPage + 1)}
          disabled={!hasNextPage}
          className="h-9 w-9 rounded-xl bg-white border border-gray-200 text-gray-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex items-center justify-center hover:bg-gray-50 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title={t('clients.next')}
          aria-label={t('clients.next')}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 space-y-3 sm:space-y-4">
      {/* HEADER — title with icon + add button */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-violet-50 text-violet-600 ring-1 ring-violet-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 sm:w-[22px] sm:h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-[19px] sm:text-2xl font-bold text-gray-900 tracking-tight truncate">{t('clients.title')}</h1>
            <p className="text-[11.5px] sm:text-xs text-gray-500 font-medium">{t('clients.subtitle')}</p>
          </div>
        </div>
        <button
          onClick={openCreateDialog}
          className="ardhi-btn-primary h-10 px-3 sm:px-4 rounded-xl text-[13px] font-bold flex-shrink-0 inline-flex items-center gap-1.5"
          title={t('clients.addClientShort')}
          aria-label={t('clients.addClientAria')}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          <span className="hidden sm:inline">{t('clients.addClientShort')}</span>
        </button>
      </div>

      {/* STATS — compact 2/4 grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5">
        {[
          {
            label: t('clients.totalClients'),
            value: displayedStats.total,
            tile: 'bg-blue-50 text-blue-600 ring-blue-100',
            icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            ),
          },
          {
            label: t('clients.withSales'),
            value: displayedStats.withSales,
            tile: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
            icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <path d="m9 11 3 3L22 4" />
              </svg>
            ),
          },
          {
            label: t('clients.individuals'),
            value: displayedStats.individuals,
            tile: 'bg-violet-50 text-violet-600 ring-violet-100',
            icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            ),
          },
          {
            label: t('clients.companies'),
            value: displayedStats.companies,
            tile: 'bg-orange-50 text-orange-600 ring-orange-100',
            icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18" />
                <path d="M5 21V7l8-4v18" />
                <path d="M19 21V11l-6-4" />
              </svg>
            ),
          },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-gray-200/80 bg-white p-2.5 sm:p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex items-center gap-2.5">
            <span className={`w-9 h-9 rounded-xl ring-1 flex items-center justify-center flex-shrink-0 ${kpi.tile}`}>
              <span className="w-[18px] h-[18px]">{kpi.icon}</span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="num text-[16px] sm:text-[18px] font-extrabold text-gray-900 leading-none tracking-tight tabular-nums animate-count-up">
                {kpi.value.toLocaleString()}
              </p>
              <p className="text-[10.5px] text-gray-500 font-semibold truncate mt-0.5">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* SEARCH + count strip */}
      <div className="space-y-2">
        <div className="relative">
          <div className="absolute inset-y-0 start-3 flex items-center pointer-events-none text-gray-400">
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </div>
          <Input
            type="text"
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            placeholder={t('clients.searchPlaceholder')}
            className="ps-10 pe-10"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 end-2 my-auto w-7 h-7 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition-colors"
              title={t('clients.clearSearch')}
              aria-label={t('clients.clearSearch')}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-1">
          <span className="text-[11.5px] text-gray-500 font-semibold tabular-nums">
            {searchQuery
              ? replaceVars(t('clients.showingResults'), { count: clients.length })
              : replaceVars(t('clients.showingRange'), {
                  from: clients.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0,
                  to: Math.min(currentPage * itemsPerPage, totalCount),
                  total: totalCount,
                })}
          </span>
          {totalPages > 1 && !searchQuery && (
            <span className="text-[10.5px] text-gray-400 font-bold tabular-nums">
              {currentPage} / {totalPages}
            </span>
          )}
        </div>
      </div>

      {/* List error */}
      {listError && <Alert variant="error">{listError}</Alert>}

      {/* CLIENTS LIST */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-blue-600 mb-3" />
          <p className="text-[13px] text-gray-500 font-semibold">{t('clients.loading')}</p>
        </div>
      ) : clients.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white/60 p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 mb-3">
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </div>
          <p className="text-[13px] text-gray-700 font-semibold mb-3">
            {searchQuery ? replaceVars(t('clients.noResultsFor'), { query: searchQuery }) : t('clients.noClients')}
          </p>
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="h-9 px-4 rounded-xl bg-white border border-gray-200 text-[12.5px] font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-300"
            >
              {t('clients.clearSearch')}
            </button>
          ) : (
            <button
              onClick={openCreateDialog}
              className="ardhi-btn-primary h-9 px-4 rounded-xl text-[12.5px] font-bold inline-flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14" /><path d="M5 12h14" />
              </svg>
              {t('clients.addNewClient')}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3">
            {clients.map((client) => {
              const isCompany = client.type === 'company'
              return (
                <div
                  key={client.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openDetailsDialog(client.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openDetailsDialog(client.id)
                    }
                  }}
                  className="group relative rounded-2xl border border-gray-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-md hover:border-blue-200 hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                >
                  {/* Name + type chip */}
                  <div className="flex items-start gap-2 mb-2">
                    <h3 className="flex-1 min-w-0 text-[13.5px] font-bold text-gray-900 truncate tracking-tight group-hover:text-blue-700 transition-colors">
                      {client.name}
                    </h3>
                    <span
                      className={`flex-shrink-0 px-1.5 py-0.5 rounded-full text-[9.5px] font-bold border whitespace-nowrap ${
                        isCompany
                          ? 'bg-orange-50 text-orange-700 border-orange-100'
                          : 'bg-violet-50 text-violet-700 border-violet-100'
                      }`}
                    >
                      {isCompany ? t('clients.typeCompany') : t('clients.typeIndividual')}
                    </span>
                  </div>

                  {/* Info rows */}
                  <div className="space-y-0.5">
                    <p className="flex items-center gap-1.5 text-[11px] text-gray-500 font-semibold truncate">
                      <svg className="w-3 h-3 flex-shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="16" rx="3" />
                        <path d="M7 9h10M7 13h6" />
                      </svg>
                      <span className="truncate tabular-nums">{client.id_number}</span>
                    </p>
                    <p className="flex items-center gap-1.5 text-[11px] text-gray-500 font-semibold truncate" dir="ltr">
                      <svg className="w-3 h-3 flex-shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
                      </svg>
                      <span className="truncate tabular-nums">{client.phone}</span>
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {renderPagination()}
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
          title={editingClientId ? t('clients.editClient') : t('clients.addNewClientTitle')}
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
                {t('clients.cancel')}
              </Button>
              <Button
                onClick={handleSaveClient}
                disabled={saving || idNumberCheck === 'exists' || idNumberCheck === 'checking'}
                className="bg-gray-700 hover:bg-gray-800"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    {t('clients.saving')}
                  </span>
                ) : (
                  `💾 ${t('clients.save')}`
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
              <Label htmlFor="client-id-number" className="text-gray-800 font-medium text-sm sm:text-base">
                {t('clients.idNumber')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="client-id-number"
                value={idNumber}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 8)
                  setIdNumber(v)
                }}
                placeholder={t('clients.idNumberPlaceholder')}
                maxLength={8}
                pattern="[0-9]{8}"
                className={`text-base min-h-[2.75rem] transition-all focus:shadow-md ${
                  idNumberCheck === 'exists' ? 'border-red-500 focus:ring-red-500' : ''
                } ${idNumberCheck === 'available' ? 'border-green-500 focus:ring-green-500' : ''}`}
              />
              <p className="text-xs sm:text-sm text-gray-600">{t('clients.idNumberHint')}</p>
              {idNumberCheck === 'checking' && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <span className="inline-block w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  {t('clients.checking')}
                </p>
              )}
              {idNumberCheck === 'exists' && (
                <p className="text-xs sm:text-sm text-red-700 font-medium">
                  {t('clients.idInUse')}{idNumberExistingName ? ` (${replaceVars(t('clients.idInUseClient'), { name: idNumberExistingName })})` : ''}. {t('clients.idInUseHint')}
                </p>
              )}
              {idNumberCheck === 'available' && (
                <p className="text-xs sm:text-sm text-green-600 font-medium">✓ {t('clients.idAvailable')}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-name" className="text-gray-800 font-medium text-sm sm:text-base">
                {t('clients.name')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="client-name"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                placeholder={t('clients.namePlaceholder')}
                className="text-base min-h-[2.75rem] transition-all focus:shadow-md"
              />
              {nameSearchStatus === 'checking' && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <span className="inline-block w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  {t('clients.searchingNames')}
                </p>
              )}
              {nameSearchStatus === 'found' && nameSearchMatches.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50/80 p-2 text-xs">
                  <p className="font-semibold text-amber-900 mb-1">{t('clients.similarNamesTitle')}</p>
                  <ul className="space-y-1 text-amber-800">
                    {nameSearchMatches.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-amber-700">· {replaceVars(t('clients.similarId'), { id: c.id_number })}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-amber-700 mt-1">{t('clients.similarHint')}</p>
                </div>
              )}
              {nameSearchStatus === 'none' && name.trim().length >= 2 && (
                <p className="text-xs sm:text-sm text-green-600 font-medium">✓ {t('clients.nameAvailable')}</p>
              )}
            </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
            <div className="space-y-2">
              <Label htmlFor="client-phone" className="text-gray-800 font-medium text-sm sm:text-base">
                {t('clients.phone')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="client-phone"
                value={phone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
                placeholder={t('clients.phonePlaceholder')}
                className={`text-base min-h-[2.75rem] transition-all focus:shadow-md ${
                  phoneCheck === 'exists' ? 'border-red-500 focus:ring-red-500' : ''
                } ${phoneCheck === 'available' ? 'border-green-500 focus:ring-green-500' : ''}`}
              />
              <p className="text-xs sm:text-sm text-gray-600">{t('clients.phoneHint')}</p>
              {phoneCheck === 'checking' && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <span className="inline-block w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  {t('clients.checking')}
                </p>
              )}
              {phoneCheck === 'exists' && (
                <p className="text-xs sm:text-sm text-red-700 font-medium">
                  {t('clients.phoneInUse')}{phoneExistingName ? ` (${replaceVars(t('clients.idInUseClient'), { name: phoneExistingName })})` : ''}. {t('clients.idInUseHint')}
                </p>
              )}
              {phoneCheck === 'available' && (
                <p className="text-xs sm:text-sm text-green-600 font-medium">✓ {t('clients.phoneAvailable')}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-email" className="text-gray-800 font-medium text-sm sm:text-base">{t('clients.email')}</Label>
              <Input
                id="client-email"
                type="email"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                placeholder="example@email.com"
                className="text-base min-h-[2.75rem] transition-all focus:shadow-md"
              />
            </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-address" className="text-gray-800 font-medium text-sm sm:text-base">{t('clients.address')}</Label>
              <Input
                id="client-address"
                value={address}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddress(e.target.value)}
                placeholder={t('clients.addressPlaceholder')}
                className="text-base min-h-[2.75rem] transition-all focus:shadow-md"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-type" className="text-gray-800 font-medium text-sm sm:text-base">{t('clients.type')}</Label>
              <Select
                id="client-type"
                value={type}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setType(e.target.value as ClientType)
                }
                className="text-base min-h-[2.75rem]"
              >
                <option value="individual">{t('clients.typeIndividual')}</option>
                <option value="company">{t('clients.typeCompany')}</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-notes" className="text-gray-800 font-medium text-sm sm:text-base">{t('clients.notes')}</Label>
              <Textarea
                id="client-notes"
                value={notes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                placeholder={t('clients.notesPlaceholder')}
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
          title={`${t('clients.clientDetails')}: ${selectedClient?.name || ''}`}
          size="md"
          footer={
            <div className="flex items-center justify-between gap-2 w-full">
              {/* Destructive on the start, primary actions on the end */}
              <div className="flex items-center gap-2">
                {isOwner && selectedClient && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = selectedClient.id
                      setDetailsDialogOpen(false)
                      openDeleteDialog(id)
                    }}
                    className="h-10 px-3 rounded-xl bg-red-50 text-red-700 border border-red-100 hover:bg-red-100 inline-flex items-center gap-1.5 text-[13px] font-bold transition-colors"
                    title={t('clients.delete')}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    <span className="hidden sm:inline">{t('clients.delete')}</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setDetailsDialogOpen(false)}>
                  {t('clients.close')}
                </Button>
                {selectedClient && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = selectedClient.id
                      setDetailsDialogOpen(false)
                      openEditDialog(id)
                    }}
                    className="ardhi-btn-primary h-10 px-4 rounded-xl text-[13px] font-bold inline-flex items-center gap-1.5"
                    title={t('clients.edit')}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
                    </svg>
                    {t('clients.edit')}
                  </button>
                )}
              </div>
            </div>
          }
        >
          {selectedClient && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-gray-500">{t('clients.idNumber')}</Label>
                  <p className="text-sm font-medium">{selectedClient.id_number}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">{t('clients.type')}</Label>
                  <p className="text-sm font-medium">
                    {selectedClient.type === 'individual' ? t('clients.typeIndividual') : t('clients.typeCompany')}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">{t('clients.phone')}</Label>
                  <p className="text-sm font-medium">{selectedClient.phone}</p>
                </div>
                {selectedClient.email && (
                  <div>
                    <Label className="text-xs text-gray-500">{t('clients.email')}</Label>
                    <p className="text-sm font-medium">{selectedClient.email}</p>
                  </div>
                )}
                {selectedClient.address && (
                  <div className="col-span-2">
                    <Label className="text-xs text-gray-500">{t('clients.address')}</Label>
                    <p className="text-sm font-medium">{selectedClient.address}</p>
                  </div>
                )}
                {selectedClient.notes && (
                  <div className="col-span-2">
                    <Label className="text-xs text-gray-500">{t('clients.notes')}</Label>
                    <p className="text-sm font-medium">{selectedClient.notes}</p>
                  </div>
                )}
                <div>
                  <Label className="text-xs text-gray-500">{t('clients.dateAdded')}</Label>
                  <p className="text-sm font-medium">
                    {new Date(selectedClient.created_at).toLocaleDateString('en-US')}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">{t('clients.lastUpdated')}</Label>
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
          title={t('clients.deleteClient')}
          description={t('clients.deleteConfirm')}
          confirmText={deleting ? t('clients.deleting') : t('clients.confirmDelete')}
          cancelText={t('clients.cancel')}
          variant="destructive"
          disabled={deleting}
        />

        {/* Styled error popup — replaces native window.alert on delete failure */}
        <NotificationDialog
          open={!!deleteClientError}
          onClose={() => setDeleteClientError(null)}
          type="error"
          title={t('clients.errorDeleteFailed')}
          message={deleteClientError ?? ''}
        />
      </div>
  )
}

export default ClientsPage

