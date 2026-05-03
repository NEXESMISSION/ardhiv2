import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { NotificationDialog } from '@/components/ui/notification-dialog'
import { formatPrice } from '@/utils/priceCalculator'
import { ConfirmSaleDialog } from '@/components/ConfirmSaleDialog'
import { ConfirmGroupSaleDialog } from '@/components/ConfirmGroupSaleDialog'
import { SaleDetailsDialog } from '@/components/SaleDetailsDialog'
import { GroupSaleDetailsDialog } from '@/components/GroupSaleDetailsDialog'
import { EditSaleDialog } from '@/components/EditSaleDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { notifyOwners } from '@/utils/notifications'
import { buildSaleQuery, formatSalesWithSellers } from '@/utils/salesQueries'
import { prefetchContractWriters } from '@/utils/contractWritersCache'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/i18n/context'
import { useSalesRealtime } from '@/hooks/useSalesRealtime'

function replaceVars(str: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)), str)
}

interface Sale {
  id: string
  client_id: string
  land_piece_id: string
  batch_id: string
  sale_price: number
  deposit_amount: number
  sale_date: string
  status: string
  deadline_date: string | null
  payment_method: 'full' | 'installment' | 'promise' | null
  payment_offer_id: string | null
  partial_payment_amount: number | null
  remaining_payment_amount: number | null
  company_fee_amount: number | null
  notes: string | null
  created_at: string
  sold_by: string | null
  confirmed_by: string | null
  appointment_date: string | null
  client?: {
    id: string
    name: string
    id_number: string
    phone: string
  }
  piece?: {
    id: string
    piece_number: string
    surface_m2: number
  }
  batch?: {
    id: string
    name: string
    price_per_m2_cash: number | null
  }
  payment_offer?: {
    id: string
    name: string | null
    price_per_m2_installment: number
    advance_mode: 'fixed' | 'percent'
    advance_value: number
    calc_mode: 'monthlyAmount' | 'months'
    monthly_amount: number | null
    months: number | null
}
  seller?: {
    id: string
    name: string
    place: string | null
  }
}

/** Like Installments: group by client, then by payment offer within client */
interface ClientGroup {
  client: Sale['client']
  offerGroups: Array<{ offer: Sale['payment_offer'] | null; paymentMethod: 'full' | 'installment' | 'promise' | null; sales: Sale[] }>
}

export function ConfirmationPage() {
  const { isOwner, systemUser } = useAuth()
  const { t } = useLanguage()
  // Workers should only see batches they're allowed into. Defense-in-depth: the
  // ultimate enforcement is server-side RLS, but scoping client-side prevents
  // a worker from even seeing the names/IDs of forbidden batches.
  const allowedBatchIds = isOwner ? null : (systemUser?.allowed_batches ?? [])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false)
  const [appointmentDate, setAppointmentDate] = useState('')
  const [appointmentTime, setAppointmentTime] = useState('09:00')
  const [appointmentNotes, setAppointmentNotes] = useState('')
  const [savingAppointment, setSavingAppointment] = useState(false)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [showErrorDialog, setShowErrorDialog] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  // Flat list of grouped sales — kept for future flow (currently unused). The
  // setter is still called on load so values stay in sync if needed later.
  const [_groupedSales, setGroupedSales] = useState<Sale[][]>([])
  const [clientGroups, setClientGroups] = useState<ClientGroup[]>([])
  const [selectedSalesGroup, setSelectedSalesGroup] = useState<Sale[] | null>(null)
  const [confirmGroupDialogOpen, setConfirmGroupDialogOpen] = useState(false)
  const [saleDetailsDialogOpen, setSaleDetailsDialogOpen] = useState(false)
  const [groupSaleDetailsDialogOpen, setGroupSaleDetailsDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [saleToCancel, setSaleToCancel] = useState<Sale | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  // Debounced copy of searchQuery — used for refetches and heavy filtering so
  // we don't hammer the DB / re-group thousands of rows on every keystroke.
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300)
    return () => clearTimeout(handle)
  }, [searchQuery])
  const [batchFilter, setBatchFilter] = useState<string>('all')
  const [allBatches, setAllBatches] = useState<Array<{ id: string; name: string }>>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  /** Clients per page (each client box shows all their pieces) */
  const itemsPerPage = 15
  const prevBatchFilterRef = useRef<string>(batchFilter)

  /** Max pending sales to load so we can group by client (one box per client with all pieces) */
  const PENDING_SALES_LOAD_LIMIT = 5000

  // Race guard: each loadPendingSales call increments this; only the latest is allowed to set state.
  // Without it, applying a filter then quickly confirming a sale (which fires window/realtime events
  // that also call loadPendingSales) lets whichever response lands last "win", sometimes reverting
  // a filtered view back to all-batches.
  const loadRequestIdRef = useRef(0)

  useEffect(() => {
    loadAllBatches()
    prefetchContractWriters()
    return () => {}
  }, [])

  // Load sales when page, batch filter, or search query changes. When filter is a specific batch, also run once batches are loaded.
  const batchesReady = batchFilter === 'all' ? 1 : allBatches.length
  const prevSearchQueryRef = useRef<string>(debouncedSearchQuery)
  useEffect(() => {
    const pageToLoad = prevBatchFilterRef.current !== batchFilter ? 1 : currentPage
    if (prevBatchFilterRef.current !== batchFilter) {
      prevBatchFilterRef.current = batchFilter
      setCurrentPage(1)
    }
    // Reset to page 1 when (debounced) search query changes
    if (prevSearchQueryRef.current !== debouncedSearchQuery) {
      prevSearchQueryRef.current = debouncedSearchQuery
      setCurrentPage(1)
      loadPendingSales(1)
      return
    }
    loadPendingSales(pageToLoad)
  }, [currentPage, batchFilter, batchesReady, debouncedSearchQuery])

  // Keep a ref pointing at the LATEST loadPendingSales so the window-event
  // listeners (registered once at mount) don't capture the mount-time closure
  // — which would re-fetch with the filter values that were in effect when
  // the page first rendered, blowing away the user's current filter view.
  const loadPendingSalesRef = useRef(loadPendingSales)
  loadPendingSalesRef.current = loadPendingSales

  useEffect(() => {
    const handleSaleCreated = () => loadPendingSalesRef.current()
    const handleSaleUpdated = () => loadPendingSalesRef.current()
    window.addEventListener('saleCreated', handleSaleCreated)
    window.addEventListener('saleUpdated', handleSaleUpdated)
    return () => {
      window.removeEventListener('saleCreated', handleSaleCreated)
      window.removeEventListener('saleUpdated', handleSaleUpdated)
    }
  }, [])

  // Real-time updates for sales (keep search/filter/page, just refresh data)
  useSalesRealtime({
    onSaleCreated: () => loadPendingSales(),
    onSaleUpdated: () => {
      if (!loading) loadPendingSales()
    },
  })

  async function loadAllBatches() {
    try {
      let query = supabase
        .from('land_batches')
        .select('id, name')
        .order('name', { ascending: true })
      // Workers: limit to their permitted batches.
      if (allowedBatchIds !== null) {
        if (allowedBatchIds.length === 0) {
          setAllBatches([])
          return
        }
        query = query.in('id', allowedBatchIds)
      }
      const { data, error } = await query

      if (error) throw error
      setAllBatches(data || [])
    } catch (e: any) {
      console.error('Error loading batches:', e)
    }
  }

  async function loadPendingSales(_overridePage?: number) {
    const requestId = ++loadRequestIdRef.current
    if (sales.length === 0 && !loading) setLoading(true)
    setError(null)
    try {
      const batchId = batchFilter === 'all' ? null : allBatches.find(b => b.name === batchFilter)?.id

      // Load all pending sales (up to limit) so we can group by client: one box per client with all their pieces
      let query = supabase
        .from('sales')
        .select(buildSaleQuery())
        .eq('status', 'pending')
        .order('sale_date', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(PENDING_SALES_LOAD_LIMIT)
      if (batchId) query = query.eq('batch_id', batchId)
      // Worker scope guard: only fetch sales from permitted batches.
      if (allowedBatchIds !== null) {
        if (allowedBatchIds.length === 0) {
          if (loadRequestIdRef.current !== requestId) return
          setSales([]); setClientGroups([]); setGroupedSales([]); setTotalCount(0)
          return
        }
        query = query.in('batch_id', allowedBatchIds)
      }

      const { data, error: err } = await query

      // Drop stale: a newer loadPendingSales has started since we awaited.
      if (loadRequestIdRef.current !== requestId) return

      if (err) throw err

      // Format sales with seller information
      let formattedSales = await formatSalesWithSellers(data || [])
      if (loadRequestIdRef.current !== requestId) return
      
      // If any sales have payment_offer_id but no payment_offer, fetch them manually
      const salesNeedingOffer = formattedSales.filter(
        s => s.payment_offer_id && !s.payment_offer && s.payment_method === 'installment'
      )
      
      if (salesNeedingOffer.length > 0) {
        if (import.meta.env.DEV) {
          console.log('Sales needing payment_offer:', salesNeedingOffer.map(s => ({
            sale_id: s.id,
            payment_offer_id: s.payment_offer_id,
            payment_method: s.payment_method
          })))
        }
        
        const offerIds = [...new Set(salesNeedingOffer.map(s => s.payment_offer_id).filter(Boolean))]
        
        if (offerIds.length > 0) {
          if (import.meta.env.DEV) {
            console.log('Fetching payment_offers for IDs:', offerIds)
          }
          
          const { data: offersData, error: offersError } = await supabase
            .from('payment_offers')
            .select('id, name, price_per_m2_installment, advance_mode, advance_value, calc_mode, monthly_amount, months')
            .in('id', offerIds)
          
          if (offersError) {
            console.error('Error fetching payment_offers:', offersError)
          } else {
            if (import.meta.env.DEV) {
              console.log('Fetched payment_offers:', offersData)
            }
            
            if (offersData && offersData.length > 0) {
              const offersMap = new Map(offersData.map(offer => [offer.id, offer]))
              
              formattedSales = formattedSales.map(sale => {
                if (sale.payment_offer_id && !sale.payment_offer && offersMap.has(sale.payment_offer_id)) {
                  if (import.meta.env.DEV) {
                    console.log(`Attaching payment_offer to sale ${sale.id}:`, offersMap.get(sale.payment_offer_id))
                  }
                  return {
                    ...sale,
                    payment_offer: offersMap.get(sale.payment_offer_id)
                  }
                }
                return sale
              })
            } else {
              if (import.meta.env.DEV) {
                console.warn('No payment_offers found for IDs:', offerIds)
              }
            }
          }
        }
      }
      
      // Group by client, then by offer (like Installments): client -> offerKey -> sales
      const clientGroupsMap = new Map<string, Map<string, Sale[]>>()
      formattedSales.forEach((sale) => {
        const clientId = sale.client_id
        const offerKey = sale.payment_method === 'installment'
          ? (sale.payment_offer_id || 'no-offer')
          : (sale.payment_method || 'other')
        if (!clientGroupsMap.has(clientId)) clientGroupsMap.set(clientId, new Map())
        const offerMap = clientGroupsMap.get(clientId)!
        if (!offerMap.has(offerKey)) offerMap.set(offerKey, [])
        offerMap.get(offerKey)!.push(sale)
      })
      const clientGroupsList: ClientGroup[] = []
      clientGroupsMap.forEach((offerMap, _clientId) => {
        const firstSale = Array.from(offerMap.values())[0]?.[0]
        const offerGroups: ClientGroup['offerGroups'] = []
        offerMap.forEach((sales) => {
          sales.sort((a, b) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime())
          const pm = sales[0]?.payment_method ?? null
          offerGroups.push({
            offer: sales[0]?.payment_offer ?? null,
            paymentMethod: pm,
            sales,
          })
        })
        clientGroupsList.push({
          client: firstSale?.client,
          offerGroups,
        })
      })
      clientGroupsList.sort((a, b) => {
        const nameA = (a.client?.name ?? '').toLowerCase()
        const nameB = (b.client?.name ?? '').toLowerCase()
        return nameA.localeCompare(nameB)
      })
      // Final stale check before committing to React state.
      if (loadRequestIdRef.current !== requestId) return
      setSales(formattedSales)
      setClientGroups(clientGroupsList)
      setGroupedSales(clientGroupsList.flatMap(cg => cg.offerGroups.map(og => og.sales)))
      setTotalCount(clientGroupsList.length)
    } catch (e: any) {
      if (loadRequestIdRef.current !== requestId) return
      setError(e.message || t('confirmation.loadError'))
    } finally {
      if (loadRequestIdRef.current === requestId) setLoading(false)
    }
  }

  // Get unique batches for filter - use all batches from database
  const batches = useMemo(() => {
    return allBatches.map(b => b.name).sort()
  }, [allBatches])

  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage))
  const hasNextPage = currentPage < totalPages
  const hasPrevPage = currentPage > 1
  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages) setCurrentPage(page)
  }

  // Scroll to top when page changes for better UX
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [currentPage])

  // Filter client groups by search and batch (like Installments)
  const filteredClientGroups = useMemo(() => {
    if (!searchQuery.trim() && batchFilter === 'all') {
      return clientGroups
    }
    const normalizePhone = (phone: string | null | undefined): string => {
      if (!phone) return ''
      return phone.replace(/[\s\/\-]/g, '').toLowerCase()
    }
    return clientGroups
      .map((clientGroup) => {
        const filteredOfferGroups = clientGroup.offerGroups
          .map((og) => ({
            ...og,
            sales: og.sales.filter((sale) => {
              if (batchFilter !== 'all' && sale.batch?.name !== batchFilter) return false
              if (!searchQuery.trim()) return true
              const query = searchQuery.toLowerCase().trim()
              const clientName = sale.client?.name || ''
              const clientIdNum = sale.client?.id_number || ''
              const clientPhone = sale.client?.phone || ''
              const normalizedPhone = normalizePhone(clientPhone)
              const normalizedQuery = normalizePhone(query)
              const matchesPiece = (sale.piece?.piece_number || '').toLowerCase().includes(query)
              const matchesBatch = (sale.batch?.name || '').toLowerCase().includes(query)
              return (
                clientName.toLowerCase().includes(query) ||
                clientIdNum.toLowerCase().includes(query) ||
                normalizedPhone.includes(normalizedQuery) ||
                matchesPiece ||
                matchesBatch
              )
            }),
          }))
          .filter((og) => og.sales.length > 0)
        if (filteredOfferGroups.length === 0) return null
        return { ...clientGroup, offerGroups: filteredOfferGroups }
      })
      .filter((g): g is ClientGroup => g !== null)
  }, [clientGroups, searchQuery, batchFilter])

  // Paginate by client
  const paginatedClientGroups = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredClientGroups.slice(start, start + itemsPerPage)
  }, [filteredClientGroups, currentPage, itemsPerPage])

  useEffect(() => {
    if (searchQuery.trim() || batchFilter !== 'all') {
      setTotalCount(filteredClientGroups.length)
    }
  }, [filteredClientGroups, searchQuery, batchFilter])

  /** Remove confirmed/cancelled sales from state so search and scroll stay (no full refresh) */
  function removeSalesFromState(saleIds: Set<string>) {
    setSales(prev => prev.filter(s => !saleIds.has(s.id)))
    setGroupedSales(prev => prev.map(group => group.filter(s => !saleIds.has(s.id))).filter(g => g.length > 0))
    setClientGroups(prev => {
      const next = prev
        .map(cg => ({
          ...cg,
          offerGroups: cg.offerGroups
            .map(og => ({ ...og, sales: og.sales.filter(s => !saleIds.has(s.id)) }))
            .filter(og => og.sales.length > 0),
        }))
        .filter(cg => cg.offerGroups.length > 0)
      setTotalCount(next.length)
      return next
    })
  }

  function getConfirmButtonText(sale: Sale): string {
    if (sale.payment_method === 'promise' && sale.partial_payment_amount) {
      return t('confirmation.confirmPromisePartial')
    }
    if (sale.payment_method === 'promise' && !sale.partial_payment_amount) {
      return t('confirmation.confirmPromise')
    }
    if (sale.payment_method === 'installment') {
      return t('confirmation.confirmInstallment')
    }
    if (sale.payment_method === 'full') {
      return t('confirmation.confirmFull')
    }
    return t('confirmation.confirmSale')
  }

  async function handleCancelSale(sale: Sale) {
    setCancelling(true)
    try {
      const { error } = await supabase
        .from('sales')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', sale.id)

      if (error) throw error

      // Notify owners about sale cancellation
      const clientName = sale.client?.name || t('confirmation.clientUnknown')
      const pieceNumber = sale.piece?.piece_number || t('confirmation.unknown')
      const batchName = sale.batch?.name || t('confirmation.unknown')
      
      await notifyOwners(
        'sale_cancelled',
        t('confirmation.cancelSaleTitle'),
        `${t('confirmation.cancelSaleTitle')} — ${t('confirmation.surface')} ${pieceNumber} — ${clientName} — ${batchName}`,
        'sale',
        sale.id,
        {
          client_name: clientName,
          piece_number: pieceNumber,
          batch_name: batchName,
          sale_price: sale.sale_price,
        }
      )

            await supabase
              .from('land_pieces')
        .update({ status: 'Available', updated_at: new Date().toISOString() })
        .eq('id', sale.land_piece_id)

      setSuccessMessage(t('confirmation.cancelSuccess'))
      setShowSuccessDialog(true)
      setCancelDialogOpen(false)
      removeSalesFromState(new Set([sale.id]))
      setSaleToCancel(null)
      window.dispatchEvent(new CustomEvent('saleUpdated'))
      window.dispatchEvent(new CustomEvent('pieceStatusChanged'))
    } catch (e: any) {
      setErrorMessage(e.message || t('confirmation.cancelError'))
      setShowErrorDialog(true)
    } finally {
      setCancelling(false)
    }
  }

  // Compact pagination (window: current ± 1, with first/last and ellipses)
  const renderPagination = () => {
    if (searchQuery || totalPages <= 1) return null
    const window: (number | '...')[] = []
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) window.push(i)
    } else {
      window.push(1)
      if (currentPage > 3) window.push('...')
      const from = Math.max(2, currentPage - 1)
      const to = Math.min(totalPages - 1, currentPage + 1)
      for (let i = from; i <= to; i++) window.push(i)
      if (currentPage < totalPages - 2) window.push('...')
      window.push(totalPages)
    }
    return (
      <div dir="ltr" className="flex items-center justify-center gap-1 flex-wrap">
        <button
          type="button"
          onClick={() => goToPage(currentPage - 1)}
          disabled={!hasPrevPage}
          className="h-9 w-9 rounded-xl bg-white border border-gray-200 text-gray-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex items-center justify-center hover:bg-gray-50 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title={t('confirmation.prev')}
          aria-label={t('confirmation.prev')}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
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
          title={t('confirmation.next')}
          aria-label={t('confirmation.next')}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 max-w-7xl space-y-3 sm:space-y-4">
      {/* HEADER */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 sm:w-[22px] sm:h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <path d="m9 11 3 3L22 4" />
          </svg>
        </div>
        <div className="min-w-0">
          <h1 className="text-[19px] sm:text-2xl font-bold text-gray-900 tracking-tight truncate">{t('confirmation.title')}</h1>
          <p className="text-[11.5px] sm:text-xs text-gray-500 font-medium truncate">{t('confirmation.subtitle')}</p>
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {/* SEARCH + FILTER ROW */}
      {allBatches.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
            <div className="relative">
              <div className="absolute inset-y-0 start-3 flex items-center pointer-events-none text-gray-400">
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </div>
              <Input
                type="text"
                placeholder={t('confirmation.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ps-10 pe-10"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 end-2 my-auto w-7 h-7 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition-colors"
                  aria-label={t('confirmation.reset')}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                  </svg>
                </button>
              )}
            </div>
            <Select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              className="text-gray-900"
            >
              <option value="all">{t('confirmation.allBatches')}</option>
              {batches.map(batch => (
                <option key={batch} value={batch}>{batch}</option>
              ))}
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3 px-1">
            <span className="text-[11.5px] text-gray-500 font-semibold tabular-nums">
              {searchQuery.trim()
                ? `${replaceVars(t('confirmation.resultsOnPage'), { count: paginatedClientGroups.length, total: filteredClientGroups.length })} ${t('confirmation.clients')}`
                : `${replaceVars(t('confirmation.showingRange'), { from: clientGroups.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0, to: Math.min(currentPage * itemsPerPage, totalCount), total: totalCount })} ${t('confirmation.clients')}`}
            </span>
            {(searchQuery || batchFilter !== 'all') && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setBatchFilter('all') }}
                className="h-7 px-2.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-[10.5px] font-bold hover:bg-blue-100 transition-colors"
              >
                {t('confirmation.reset')}
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-blue-600 mb-3" />
          <p className="text-[13px] text-gray-500 font-semibold">{t('confirmation.loading')}</p>
        </div>
      ) : filteredClientGroups.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white/60 p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 mb-3 ring-1 ring-emerald-100">
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <path d="m9 11 3 3L22 4" />
            </svg>
          </div>
          <p className="text-[13px] text-gray-700 font-semibold">
            {clientGroups.length === 0 ? t('confirmation.noPendingSales') : t('confirmation.noSearchResults')}
          </p>
        </div>
      ) : (
        <>
        {/* Pagination — top */}
        {renderPagination()}

        <div className="space-y-3">
          {paginatedClientGroups.map((clientGroup, clientIndex) => {
            const totalPieces = clientGroup.offerGroups.reduce((sum, og) => sum + og.sales.length, 0)
            const clientTotal = clientGroup.offerGroups.reduce((sum, og) => sum + og.sales.reduce((s, sale) => s + sale.sale_price, 0), 0)

            const getDeadlineStatus = (sale: Sale) => {
              if (!sale.deadline_date) return null
              const deadline = new Date(sale.deadline_date)
              const now = new Date()
              const diffMs = now.getTime() - deadline.getTime()
              const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
              return diffMs > 0 ? { overdue: true, days: diffDays } : { overdue: false, days: Math.abs(diffDays) }
            }

            return (
              <div key={`client-${clientIndex}`} className="rounded-2xl border border-gray-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
                {/* Client header — compact */}
                <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b border-gray-200/80 bg-gradient-to-l from-emerald-50/40 via-blue-50/30 to-white">
                  <div className="min-w-0">
                    <h2 className="text-[14px] sm:text-[15px] font-extrabold text-gray-900 tracking-tight truncate">
                      {clientGroup.client?.name || t('confirmation.unknown')}
                    </h2>
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-semibold tabular-nums truncate">
                      <span className="truncate">{clientGroup.client?.id_number || ''}</span>
                      {clientGroup.client?.phone && (<><span className="opacity-60">·</span><span className="truncate">{clientGroup.client.phone}</span></>)}
                    </div>
                  </div>
                  <div className="text-end flex-shrink-0">
                    <p className="num text-[14px] sm:text-[15px] font-extrabold text-gray-900 tracking-tight">
                      {formatPrice(clientTotal)} <span className="text-[10px] font-bold text-gray-400">DT</span>
                    </p>
                    <p className="text-[10.5px] text-gray-500 font-bold">
                      {totalPieces} {totalPieces === 1 ? t('confirmation.piece') : t('confirmation.pieces')}
                    </p>
                  </div>
                </div>

                {/* Offer groups */}
                <div className="p-2.5 sm:p-3 space-y-3">
                  {clientGroup.offerGroups.map((offerGroup, offerIndex) => (
                    <div key={`offer-${clientIndex}-${offerIndex}`}>
                      {/* Offer label as a single small inline pill */}
                      <div className="flex items-center gap-1.5 mb-2 ps-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold border ${
                          offerGroup.paymentMethod === 'installment' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                          offerGroup.paymentMethod === 'promise' ? 'bg-violet-50 text-violet-700 border-violet-100' :
                          'bg-emerald-50 text-emerald-700 border-emerald-100'
                        }`}>
                          {offerGroup.offer
                            ? `📋 ${offerGroup.offer.name || t('confirmation.offerLabel')}`
                            : (offerGroup.paymentMethod === 'full' ? t('confirmation.paymentFull') : offerGroup.paymentMethod === 'promise' ? t('confirmation.promiseSale') : t('confirmation.installment'))}
                        </span>
                        <span className="text-[10.5px] text-gray-500 font-semibold">
                          {offerGroup.sales.length} {offerGroup.sales.length === 1 ? t('confirmation.piece') : t('confirmation.pieces')}
                        </span>
                        {offerGroup.offer?.monthly_amount != null && (
                          <span className="text-[10.5px] text-gray-500 font-semibold">· {formatPrice(offerGroup.offer.monthly_amount)} DT/{t('confirmation.month')}</span>
                        )}
                      </div>

                      {/* Pieces — compact 2-col grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {offerGroup.sales.map((sale) => {
                          const isInstallment = sale.payment_method === 'installment'
                          const isPromise = sale.payment_method === 'promise'
                          const deadlineStatus = getDeadlineStatus(sale)
                          const methodTone = isInstallment
                            ? 'bg-blue-50 text-blue-700 border-blue-100'
                            : isPromise
                            ? 'bg-violet-50 text-violet-700 border-violet-100'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-100'

                          return (
                            <div
                              key={sale.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => { setSelectedSale(sale); setSaleDetailsDialogOpen(true) }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  setSelectedSale(sale); setSaleDetailsDialogOpen(true)
                                }
                              }}
                              className="group relative rounded-xl border border-gray-200/80 bg-white p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-md hover:border-blue-200 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                            >
                              {/* Top row: piece info + chips + corner actions */}
                              <div className="flex items-start justify-between gap-2 mb-1.5">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[12.5px] font-extrabold text-gray-900 tracking-tight truncate">{sale.batch?.name || '-'}</span>
                                    <span className="text-[11.5px] font-bold text-gray-500 tabular-nums">#{sale.piece?.piece_number || '-'}</span>
                                    {sale.piece?.surface_m2 != null && (
                                      <span className="text-[10.5px] text-gray-400 font-semibold tabular-nums">{sale.piece.surface_m2} m²</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                                    <span className={`px-1.5 py-0 rounded-full text-[9.5px] font-bold border ${methodTone}`}>
                                      {isPromise ? t('confirmation.promiseSale') : isInstallment ? t('confirmation.installment') : t('confirmation.paymentFull')}
                                    </span>
                                    {sale.status === 'pending' && (
                                      <span className="px-1.5 py-0 rounded-full text-[9.5px] font-bold border bg-amber-50 text-amber-700 border-amber-100">
                                        {t('confirmation.reserved')}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Inline corner actions — stop propagation so the card click still goes to details */}
                                <div className="flex items-center gap-0.5 flex-shrink-0 -mt-0.5 -me-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSelectedSale(sale)
                                      const tmr = new Date()
                                      tmr.setDate(tmr.getDate() + 1)
                                      setAppointmentDate(tmr.toISOString().split('T')[0])
                                      setAppointmentTime('09:00')
                                      setAppointmentNotes('')
                                      setAppointmentDialogOpen(true)
                                    }}
                                    className="w-7 h-7 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center transition-colors"
                                    title={t('confirmation.appointment')}
                                    aria-label={t('confirmation.appointment')}
                                  >
                                    <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                                      <rect x="3" y="4" width="18" height="18" rx="2" />
                                      <path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setSelectedSale(sale); setEditDialogOpen(true) }}
                                    className="w-7 h-7 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center transition-colors"
                                    title={t('confirmation.edit')}
                                    aria-label={t('confirmation.edit')}
                                  >
                                    <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                      <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setSaleToCancel(sale); setCancelDialogOpen(true) }}
                                    className="w-7 h-7 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors"
                                    title={t('confirmation.cancel')}
                                    aria-label={t('confirmation.cancel')}
                                  >
                                    <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                                    </svg>
                                  </button>
                                </div>
                              </div>

                              {/* Price + deadline alert */}
                              <div className="flex items-end justify-between gap-2 mb-2">
                                <p className="num text-[16px] sm:text-[17px] font-extrabold text-gray-900 leading-none tracking-tight">
                                  {formatPrice(sale.sale_price)} <span className="text-[10px] font-bold text-gray-400">DT</span>
                                </p>
                                {deadlineStatus?.overdue && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100 text-[10px] font-bold whitespace-nowrap animate-alert-pulse">
                                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
                                    </svg>
                                    {replaceVars(t('confirmation.overdueDays'), { days: deadlineStatus.days })}
                                  </span>
                                )}
                              </div>

                              {/* Primary action — full width */}
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setSelectedSale(sale); setConfirmDialogOpen(true) }}
                                className="ardhi-btn-primary w-full h-9 rounded-xl text-[12.5px] font-bold flex items-center justify-center gap-1.5"
                              >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" />
                                </svg>
                                {getConfirmButtonText(sale)}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        </>
      )}

      {/* Pagination — bottom */}
      {renderPagination()}

      {/* Confirm Sale Dialog */}
      {selectedSale && (
        <ConfirmSaleDialog
          open={confirmDialogOpen}
        onClose={() => {
            setConfirmDialogOpen(false)
          setSelectedSale(null)
        }}
        sale={selectedSale}
          onConfirm={() => {
            removeSalesFromState(new Set([selectedSale.id]))
            setConfirmDialogOpen(false)
            setSelectedSale(null)
            window.dispatchEvent(new CustomEvent('saleUpdated'))
            window.dispatchEvent(new CustomEvent('pieceStatusChanged'))
          }}
        />
      )}

      {/* Confirm Group Sale Dialog */}
      {selectedSalesGroup && (
        <ConfirmGroupSaleDialog
          open={confirmGroupDialogOpen}
          onClose={() => {
            setConfirmGroupDialogOpen(false)
            setSelectedSalesGroup(null)
          }}
          sales={selectedSalesGroup}
          onConfirm={() => {
            removeSalesFromState(new Set(selectedSalesGroup.map(s => s.id)))
            setConfirmGroupDialogOpen(false)
            setSelectedSalesGroup(null)
            window.dispatchEvent(new CustomEvent('saleUpdated'))
            window.dispatchEvent(new CustomEvent('pieceStatusChanged'))
          }}
        />
      )}

      {/* Edit Sale Dialog - pass the sale the user clicked on (same object as card) so price is correct */}
      {selectedSale && (
        <EditSaleDialog
          open={editDialogOpen}
          onClose={() => {
            setEditDialogOpen(false)
            setSelectedSale(null)
          }}
          sale={selectedSale}
          onSave={(updatedSale) => {
            if (updatedSale) {
              setSales(prev => prev.map(s => s.id === updatedSale.id ? updatedSale : s))
              setGroupedSales(prev => prev.map(group => group.map(s => s.id === updatedSale.id ? updatedSale : s)))
              setClientGroups(prev => prev.map(cg => ({
                ...cg,
                offerGroups: cg.offerGroups.map(og => ({
                  ...og,
                  sales: og.sales.map(s => s.id === updatedSale.id ? updatedSale : s),
                })),
              })))
            } else {
              loadPendingSales()
            }
            setSuccessMessage(t('confirmation.updateSaleSuccess'))
            setShowSuccessDialog(true)
            window.dispatchEvent(new CustomEvent('saleUpdated'))
          }}
          isOwner={isOwner}
        />
      )}

      {/* Appointment Dialog */}
      {selectedSale && (
      <Dialog
          open={appointmentDialogOpen}
        onClose={() => {
            if (!savingAppointment) {
              setAppointmentDialogOpen(false)
          setSelectedSale(null)
              setAppointmentDate('')
              setAppointmentTime('')
              setAppointmentNotes('')
            }
        }}
          title={t('confirmation.appointmentTitle')}
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                  setAppointmentDialogOpen(false)
                setSelectedSale(null)
                  setAppointmentDate('')
                  setAppointmentTime('')
                  setAppointmentNotes('')
              }}
                disabled={savingAppointment}
            >
              {t('confirmation.appointmentCancel')}
            </Button>
            <Button
                onClick={async () => {
                  if (!selectedSale || !appointmentDate || !appointmentTime) return

                  // Validate client_id exists
                  if (!selectedSale.client_id) {
                    setErrorMessage(t('confirmation.appointmentClientError'))
                    setShowErrorDialog(true)
                    return
                  }

                  setSavingAppointment(true)
                  try {
                    // Ensure appointment_date is in YYYY-MM-DD format
                    let normalizedDate = appointmentDate
                    if (normalizedDate && normalizedDate.includes('T')) {
                      normalizedDate = normalizedDate.split('T')[0]
                    }
                    
                    console.log('Creating appointment with date:', {
                      original: appointmentDate,
                      normalized: normalizedDate,
                      saleId: selectedSale.id,
                      clientId: selectedSale.client_id
                    })
                    
                    // Create appointment record
                    const { error: appointmentError } = await supabase
                      .from('appointments')
                      .insert({
                        sale_id: selectedSale.id,
                        client_id: selectedSale.client_id,
                        appointment_date: normalizedDate,
                        appointment_time: appointmentTime,
                        notes: appointmentNotes.trim() || null,
                        status: 'scheduled',
                      })

                    if (appointmentError) {
                      console.error('Error creating appointment:', appointmentError)
                      throw appointmentError
                    }
                    
                    console.log('Appointment created successfully')

                    // Notify owners about appointment creation
                    const clientName = selectedSale.client?.name || t('confirmation.clientUnknown')
                    const pieceNumber = selectedSale.piece?.piece_number || t('confirmation.unknown')
                    
                    await notifyOwners(
                      'appointment_created',
                      t('confirmation.newAppointment'),
                      replaceVars(t('confirmation.newAppointmentMessage'), { client: clientName, piece: pieceNumber, date: appointmentDate, time: appointmentTime }),
                      'appointment',
                      null,
                      {
                        client_name: clientName,
                        piece_number: pieceNumber,
                        appointment_date: appointmentDate,
                        appointment_time: appointmentTime,
                        sale_id: selectedSale.id,
                      }
                    )

                    setSuccessMessage(t('confirmation.appointmentSuccess'))
                    setShowSuccessDialog(true)
                    setAppointmentDialogOpen(false)
                    setSelectedSale(null)
                    setAppointmentDate('')
                    setAppointmentTime('')
                    setAppointmentNotes('')
                    loadPendingSales()
                    
                    // Dispatch event to notify other pages (like Appointments page) to refresh
                    window.dispatchEvent(new CustomEvent('appointmentCreated'))
                  } catch (e: any) {
                    setErrorMessage(e.message || t('confirmation.appointmentError'))
                    setShowErrorDialog(true)
                  } finally {
                    setSavingAppointment(false)
                  }
                }} 
                disabled={savingAppointment || !appointmentDate || !appointmentTime} 
                className="bg-green-600 hover:bg-green-700 active:bg-green-800 focus-visible:ring-green-500"
              >
                {savingAppointment ? t('confirmation.savingAppointment') : t('confirmation.saveAppointment')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {selectedSale && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1.5 text-sm">
              <p><span className="font-medium">{t('confirmation.clientLabel')}:</span> {selectedSale.client?.name || t('confirmation.unknown')}</p>
              <p><span className="font-medium">{t('confirmation.saleNumberLabel')}:</span> #{selectedSale.id.substring(0, 8)}</p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="confirmation-appt-date" className="text-xs sm:text-sm">
              {t('confirmation.dateRequired')} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="confirmation-appt-date"
              type="date"
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              size="sm"
              className="text-base"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmation-appt-time" className="text-xs sm:text-sm">
              {t('confirmation.timeRequired')} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="confirmation-appt-time"
              type="time"
              value={appointmentTime}
              onChange={(e) => setAppointmentTime(e.target.value)}
              size="sm"
              className="text-base"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmation-appt-notes" className="text-xs sm:text-sm">{t('confirmation.notes')}</Label>
            <Textarea
              id="confirmation-appt-notes"
              value={appointmentNotes}
              onChange={(e) => setAppointmentNotes(e.target.value)}
              placeholder={t('confirmation.notesPlaceholder')}
              rows={3}
              className="text-base"
            />
          </div>
        </div>
      </Dialog>
      )}

      {/* Success Dialog */}
      <NotificationDialog
        open={showSuccessDialog}
        onClose={() => {
          setShowSuccessDialog(false)
          setSuccessMessage('')
        }}
        type="success"
        title={t('confirmation.successTitle')}
        message={successMessage}
      />

      {/* Error Dialog */}
      <NotificationDialog
        open={showErrorDialog}
        onClose={() => {
          setShowErrorDialog(false)
          setErrorMessage('')
        }}
        type="error"
        title={t('confirmation.errorTitle')}
        message={errorMessage}
      />

      {/* Sale Details Dialog */}
      {selectedSale && (
        <SaleDetailsDialog
          open={saleDetailsDialogOpen}
          onClose={() => {
            setSaleDetailsDialogOpen(false)
          setSelectedSale(null)
          }}
          sale={selectedSale}
        />
      )}

      {/* Group Sale Details Dialog */}
      {selectedSalesGroup && (
        <GroupSaleDetailsDialog
          open={groupSaleDetailsDialogOpen}
          onClose={() => {
            setGroupSaleDetailsDialogOpen(false)
            setSelectedSalesGroup(null)
          }}
          sales={selectedSalesGroup}
        />
      )}

      {/* Cancel Sale Confirmation Dialog */}
      {saleToCancel && (
        <ConfirmDialog
          open={cancelDialogOpen}
          onClose={() => {
            setCancelDialogOpen(false)
            setSaleToCancel(null)
          }}
          onConfirm={() => handleCancelSale(saleToCancel)}
          title={t('confirmation.cancelSaleTitle')}
          description={replaceVars(t('confirmation.cancelSaleDescription'), { batch: saleToCancel.batch?.name || '-', piece: saleToCancel.piece?.piece_number || '-' })}
          confirmText={cancelling ? t('confirmation.cancelling') : t('confirmation.confirmCancel')}
        cancelText={t('confirmation.cancel')}
          variant="destructive"
          disabled={cancelling}
          loading={cancelling}
      />
      )}
    </div>
  )
}
