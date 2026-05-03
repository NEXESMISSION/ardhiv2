import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog } from '@/components/ui/dialog'
import { formatPrice, formatDateShort } from '@/utils/priceCalculator'
import { calculateInstallmentWithDeposit } from '@/utils/installmentCalculator'
import { buildSaleQuery, formatSalesWithSellers } from '@/utils/salesQueries'
import { InstallmentDetailsDialog } from '@/components/InstallmentDetailsDialog'
import { useLanguage } from '@/i18n/context'
import { useSalesRealtime } from '@/hooks/useSalesRealtime'
import { useAuth } from '@/contexts/AuthContext'

interface Sale {
  id: string
  client_id: string
  land_piece_id: string
  batch_id: string
  sale_price: number
  deposit_amount: number
  sale_date: string
  deadline_date: string | null
  status: string
  payment_method: 'full' | 'installment' | 'promise' | null
  payment_offer_id: string | null
  installment_start_date: string | null
  contract_writer_id: string | null
  sold_by: string | null
  confirmed_by: string | null
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
  contract_writer?: {
    id: string
    name: string
    type: string
    location: string | null
  }
  seller?: {
    id: string
    name: string
    place: string | null
  }
  confirmedBy?: {
    id: string
    name: string
    place: string | null
  }
}

interface InstallmentPayment {
  id: string
  sale_id: string
  installment_number: number
  amount_due: number
  amount_paid: number
  due_date: string
  paid_date: string | null
  status: 'pending' | 'paid' | 'overdue'
}


/** When not searching, paginate by client box: this many boxes per page.
 *  Lowered from 15 → 10 with the redesign — each box is now compact, but the
 *  expectation is the user only scans the first page (priority-sorted), so a
 *  shorter page means less scrolling for the common case. */
const GROUPS_PER_PAGE = 10
/** When loading all sales (search or full list), load up to this many */
const SEARCH_LOAD_LIMIT = 5000
/** Debounce search so we don't refetch on every keystroke */
const SEARCH_DEBOUNCE_MS = 400
/** Max sales to load installments for in search mode (keeps batch requests low) */
const SEARCH_DISPLAY_CAP = 200
/** A sale is "due soon" when its next-due date is within this many days */
const DUE_SOON_DAYS = 7

function replaceVars(str: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)), str)
}

type SaleStats = {
  totalPaid: number
  remaining: number
  paidCount: number
  totalCount: number
  nextDueDate: string | null
  overdueAmount: number
  overdueCount: number
}

function computeStatsFromInstallments(sale: Sale, installments: InstallmentPayment[]): SaleStats {
  let totalPaid = sale.deposit_amount || 0
  if (sale.payment_offer && sale.piece) {
    const calc = calculateInstallmentWithDeposit(
      sale.piece.surface_m2,
      {
        price_per_m2_installment: sale.payment_offer.price_per_m2_installment,
        advance_mode: sale.payment_offer.advance_mode,
        advance_value: sale.payment_offer.advance_value,
        calc_mode: sale.payment_offer.calc_mode,
        monthly_amount: sale.payment_offer.monthly_amount,
        months: sale.payment_offer.months,
      },
      sale.deposit_amount || 0
    )
    totalPaid += calc.advanceAfterDeposit
  }
  totalPaid += installments.filter(i => i.status === 'paid').reduce((sum, i) => sum + (i.amount_paid || 0), 0)
  const remaining = sale.sale_price - totalPaid
  const paidCount = installments.filter(i => i.status === 'paid').length
  const totalCount = installments.length
  const now = new Date()
  const nextDue = installments.find(i => {
    const dueDate = new Date(i.due_date)
    return i.status === 'pending' && dueDate >= now
  })
  const overdue = installments.filter(i => {
    const dueDate = new Date(i.due_date)
    return i.status === 'pending' && dueDate < now
  })
  const overdueAmount = overdue.reduce((sum, i) => sum + (i.amount_due - i.amount_paid), 0)
  return {
    totalPaid,
    remaining,
    paidCount,
    totalCount,
    nextDueDate: nextDue?.due_date || null,
    overdueAmount,
    overdueCount: overdue.length,
  }
}

interface InstallmentsPageProps {
  onNavigate?: (page: string) => void
}

interface ClientGroup {
  client: Sale['client']
  offerGroups: Array<{ offer: Sale['payment_offer'] | null; sales: Sale[] }>
}

export function InstallmentsPage({ onNavigate }: InstallmentsPageProps) {
  const { t } = useLanguage()
  const { isOwner, systemUser } = useAuth()
  // Defense-in-depth scoping for workers — match Confirmation.tsx behavior.
  const allowedBatchIds = isOwner ? null : (systemUser?.allowed_batches ?? [])
  const [sales, setSales] = useState<Sale[]>([])
  const [_groupedSales, setGroupedSales] = useState<Sale[][]>([])
  const [clientGroups, setClientGroups] = useState<ClientGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [goToPageInput, setGoToPageInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  /** Debounced search: triggers load after user stops typing so search isn't slow on every keystroke */
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [showPieceSearchDialog, setShowPieceSearchDialog] = useState(false)
  const [pieceNumberSearchValue, setPieceNumberSearchValue] = useState('')
  /** When true, filter only by piece number (set when user searches from "Search by piece number" dialog) */
  const [searchByPieceOnly, setSearchByPieceOnly] = useState(false)
  /** Track search mode so we only load all data when user first enters search, not on every keystroke */
  const wasSearchModeRef = useRef(false)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Batched installment data for visible sales to avoid N requests per page (ERR_INSUFFICIENT_RESOURCES) */
  const [installmentsBySaleId, setInstallmentsBySaleId] = useState<Record<string, InstallmentPayment[]>>({})
  const [loadingInstallments, setLoadingInstallments] = useState(false)

  // Debounce search input
  useEffect(() => {
    if (!searchQuery.trim()) {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
      searchDebounceRef.current = null
      setDebouncedSearchQuery('')
      return
    }
    searchDebounceRef.current = setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), SEARCH_DEBOUNCE_MS)
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [searchQuery])

  // Load data when search query changes (not when page changes: pagination is over client groups in memory)
  useEffect(() => {
    const isSearchMode = debouncedSearchQuery.length > 0
    if (isSearchMode) {
      if (!wasSearchModeRef.current) loadInstallmentSales(true)
      wasSearchModeRef.current = true
    } else {
      loadInstallmentSales(false)
      wasSearchModeRef.current = false
      setCurrentPage(1) // reset to first page of client boxes when clearing search
    }

    const handleSaleUpdated = () => {
      loadInstallmentSales(debouncedSearchQuery.length > 0)
    }

    window.addEventListener('saleUpdated', handleSaleUpdated)

    return () => {
      window.removeEventListener('saleUpdated', handleSaleUpdated)
    }
  }, [debouncedSearchQuery])

  // Real-time updates for sales
  useSalesRealtime({
    onSaleUpdated: () => {
      // Only reload if sale status changed to completed or payment_method changed to installment
      if (!loading) {
        loadInstallmentSales()
      }
    },
  })

  async function loadInstallmentSales(_forSearch?: boolean) {
    if (sales.length === 0 && !loading) setLoading(true)
    setError(null)
    try {
      // Always load all installment sales so we can group by person and show one box per client with all pieces
      const from = 0
      const to = SEARCH_LOAD_LIMIT - 1

      let query = supabase
        .from('sales')
        .select(buildSaleQuery(`
          contract_writers:contract_writer_id (id, name, type, location)
        `))
        .eq('status', 'completed')
        .eq('payment_method', 'installment')
        .order('sale_date', { ascending: false })
        .range(from, to)
        .limit(SEARCH_LOAD_LIMIT)
      // Worker scope guard.
      if (allowedBatchIds !== null) {
        if (allowedBatchIds.length === 0) {
          setSales([]); setClientGroups([]); setGroupedSales([]); setTotalCount(0)
          setLoading(false)
          return
        }
        query = query.in('batch_id', allowedBatchIds)
      }
      const { data, error: err } = await query

      if (err) throw err

      // Format sales with seller information
      let formattedSales = await formatSalesWithSellers(data || [])
      
      // Add contract_writer (handled separately as it's not in the base query)
      formattedSales = formattedSales.map((sale: any) => ({
        ...sale,
        contract_writer: Array.isArray(sale.contract_writers) 
          ? sale.contract_writers[0] 
          : sale.contract_writers,
      }))

      // Group sales by client first, then by payment_offer_id within each client
      // Structure: Map<client_id, Map<payment_offer_id, Sale[]>>
      const clientGroupsMap = new Map<string, Map<string, Sale[]>>()
      
      formattedSales.forEach((sale) => {
        const clientId = sale.client_id
        const offerKey = sale.payment_offer_id || 'no-offer'
        
        if (!clientGroupsMap.has(clientId)) {
          clientGroupsMap.set(clientId, new Map())
        }
        
        const offerGroupsMap = clientGroupsMap.get(clientId)!
        if (!offerGroupsMap.has(offerKey)) {
          offerGroupsMap.set(offerKey, [])
        }
        
        offerGroupsMap.get(offerKey)!.push(sale)
      })

      // Convert to nested array structure: [clientGroup][offerGroup][sales]
      let clientGroups: Array<{ client: Sale['client']; offerGroups: Array<{ offer: Sale['payment_offer'] | null; sales: Sale[] }> }> = []
      
      clientGroupsMap.forEach((offerGroupsMap, _clientId) => {
        const firstSale = Array.from(offerGroupsMap.values())[0]?.[0]
        const offerGroups: Array<{ offer: Sale['payment_offer'] | null; sales: Sale[] }> = []

        offerGroupsMap.forEach((sales, _offerKey) => {
          offerGroups.push({
            offer: sales[0]?.payment_offer || null,
            sales: sales
          })
        })
        
        clientGroups.push({
          client: firstSale?.client,
          offerGroups: offerGroups
        })
      })

      // Merge by client.id so one box per client id
      const mergedByClientId = new Map<string, { client: Sale['client']; offerGroups: Array<{ offer: Sale['payment_offer'] | null; sales: Sale[] }> }>()
      clientGroups.forEach((cg) => {
        const id = cg.client?.id ?? `key-${mergedByClientId.size}`
        if (mergedByClientId.has(id)) {
          const existing = mergedByClientId.get(id)!
          existing.offerGroups.push(...cg.offerGroups)
        } else {
          mergedByClientId.set(id, { client: cg.client ?? undefined, offerGroups: [...cg.offerGroups] })
        }
      })
      clientGroups = Array.from(mergedByClientId.values())

      // Merge again by same person (name + CIN) so one box per person even if duplicate client records exist
      const personKey = (cg: { client: Sale['client'] }) =>
        `${(cg.client?.name ?? '').trim().toLowerCase()}|${(cg.client?.id_number ?? '').trim()}`
      const mergedByPerson = new Map<string, { client: Sale['client']; offerGroups: Array<{ offer: Sale['payment_offer'] | null; sales: Sale[] }> }>()
      clientGroups.forEach((cg) => {
        const key = personKey(cg)
        if (!key || key === '|') {
          mergedByPerson.set(`anon-${mergedByPerson.size}`, { client: cg.client ?? undefined, offerGroups: [...cg.offerGroups] })
          return
        }
        if (mergedByPerson.has(key)) {
          const existing = mergedByPerson.get(key)!
          cg.offerGroups.forEach((incomingOg) => {
            const offerId = incomingOg.offer?.id ?? 'no-offer'
            const found = existing.offerGroups.find(
              (eg) => (eg.offer?.id ?? 'no-offer') === offerId
            )
            if (found) {
              found.sales.push(...incomingOg.sales)
            } else {
              existing.offerGroups.push({ ...incomingOg, sales: [...incomingOg.sales] })
            }
          })
        } else {
          mergedByPerson.set(key, { client: cg.client ?? undefined, offerGroups: cg.offerGroups.map((og) => ({ ...og, sales: [...og.sales] })) })
        }
      })
      clientGroups = Array.from(mergedByPerson.values())

      // Flatten for backward compatibility
      const allSalesGroups: Sale[][] = []
      clientGroups.forEach(clientGroup => {
        clientGroup.offerGroups.forEach(offerGroup => {
          allSalesGroups.push(offerGroup.sales)
        })
      })

      setSales(allSalesGroups.flat())
      setGroupedSales(allSalesGroups)
      
      // Store full client groups; pagination by group is applied in groupsToRender
      setClientGroups(clientGroups)

      // Total count = number of client boxes (one per person), not number of sales
      setTotalCount(clientGroups.length)
    } catch (e: any) {
      setError(e.message || t('installments.loadError'))
    } finally {
      setLoading(false)
    }
  }

  function handleSaleClick(sale: Sale) {
    setSelectedSale(sale)
    setDetailsDialogOpen(true)
  }

  function handleDetailsClose() {
    setDetailsDialogOpen(false)
    setSelectedSale(null)
    // Refresh list when closing so totals/stats are up to date when user returns
    loadInstallmentSales(searchQuery.trim().length > 0)
  }

  // Filter client groups based on search query (optionally by piece number only)
  const filteredClientGroups = useMemo(() => {
    if (!searchQuery.trim()) {
      return clientGroups
    }

    const query = searchQuery.trim().toLowerCase()
    const normalizePhone = (p: string | null | undefined) => (p || '').replace(/[\s\/\-]/g, '').toLowerCase()
    return clientGroups
      .map(clientGroup => {
        const filteredOfferGroups = clientGroup.offerGroups
          .map(offerGroup => ({
            ...offerGroup,
            sales: offerGroup.sales.filter(sale => {
              const pieceNumber = sale.piece?.piece_number?.toLowerCase() || ''
              if (searchByPieceOnly) {
                return pieceNumber.includes(query)
              }
              const clientName = sale.client?.name?.toLowerCase() || ''
              const clientCIN = sale.client?.id_number?.toLowerCase() || ''
              const clientPhone = normalizePhone(sale.client?.phone)
              const qNorm = normalizePhone(query)
              return clientName.includes(query) ||
                     clientCIN.includes(query) ||
                     (qNorm.length >= 2 && clientPhone.includes(qNorm)) ||
                     pieceNumber.includes(query)
            })
          }))
          .filter(offerGroup => offerGroup.sales.length > 0)
        
        if (filteredOfferGroups.length > 0) {
          return {
            ...clientGroup,
            offerGroups: filteredOfferGroups
          }
        }
        return null
      })
      .filter((group): group is ClientGroup => group !== null)
  }, [clientGroups, searchQuery, searchByPieceOnly])

  // When not searching: show one page of client groups (paginate by box). When searching: show all matching groups.
  const paginatedClientGroups = useMemo(() => {
    if (searchQuery.trim()) return filteredClientGroups
    const start = (currentPage - 1) * GROUPS_PER_PAGE
    return clientGroups.slice(start, start + GROUPS_PER_PAGE)
  }, [clientGroups, searchQuery, filteredClientGroups, currentPage])

  // Sale IDs currently displayed (for batch loading installments); cap in search to avoid slow loads
  const displayedSaleIds = useMemo(() => {
    const ids: string[] = []
    paginatedClientGroups.forEach(cg => cg.offerGroups.forEach(og => og.sales.forEach(s => ids.push(s.id))))
    if (searchQuery.trim() && ids.length > SEARCH_DISPLAY_CAP) {
      return ids.slice(0, SEARCH_DISPLAY_CAP)
    }
    return ids
  }, [paginatedClientGroups, searchQuery])

  // When search is capped, only render groups/sales we loaded installments for; otherwise use paginated groups
  const groupsToRender = useMemo(() => {
    if (!searchQuery.trim()) return paginatedClientGroups
    if (displayedSaleIds.length >= SEARCH_DISPLAY_CAP) {
      const idSet = new Set(displayedSaleIds)
      return paginatedClientGroups
        .map(cg => ({
          ...cg,
          offerGroups: cg.offerGroups
            .map(og => ({ ...og, sales: og.sales.filter(s => idSet.has(s.id)) }))
            .filter(og => og.sales.length > 0),
        }))
        .filter(cg => cg.offerGroups.length > 0)
    }
    return paginatedClientGroups
  }, [searchQuery, paginatedClientGroups, displayedSaleIds])

  // Priority sort: once installments for the current page have loaded, lift the
  // overdue / due-soon clients to the top so the user lands on what needs to
  // be paid without scrolling. We also sort sales within each offer group by
  // the same priority. Falls back to identity order while installments load.
  // Does NOT touch the underlying clientGroups state — purely a render-time
  // re-order over the visible page (preserving DB / calc-memo invariants).
  type SalePriority = 0 | 1 | 2 | 3 // 0=overdue, 1=due-soon, 2=on-track, 3=fully-paid
  const salePriority = (sale: Sale): { priority: SalePriority; nextDueMs: number } => {
    const insts = installmentsBySaleId[sale.id]
    if (!insts || insts.length === 0) return { priority: 3, nextDueMs: Number.MAX_SAFE_INTEGER }
    const stats = computeStatsFromInstallments(sale, insts)
    if (stats.overdueCount > 0) {
      // Tie-break: bigger overdue first → larger amounts surface to the top.
      return { priority: 0, nextDueMs: -stats.overdueAmount }
    }
    if (!stats.nextDueDate) {
      // No pending installments → fully paid (or no schedule yet).
      return { priority: 3, nextDueMs: Number.MAX_SAFE_INTEGER }
    }
    const dueMs = new Date(stats.nextDueDate).getTime()
    const daysUntil = (dueMs - Date.now()) / (1000 * 60 * 60 * 24)
    if (daysUntil <= DUE_SOON_DAYS) return { priority: 1, nextDueMs: dueMs }
    return { priority: 2, nextDueMs: dueMs }
  }

  const prioritizedGroupsToRender = useMemo(() => {
    if (loadingInstallments) return groupsToRender
    // Reorder sales inside each offer group by priority (overdue → due-soon → on-track),
    // then reorder offer groups so the most urgent offer block leads, then sort
    // clients by their best (lowest) priority across all sales.
    const reordered = groupsToRender.map((cg) => {
      const offerGroups = cg.offerGroups.map((og) => {
        const sales = [...og.sales].sort((a, b) => {
          const pa = salePriority(a), pb = salePriority(b)
          if (pa.priority !== pb.priority) return pa.priority - pb.priority
          return pa.nextDueMs - pb.nextDueMs
        })
        const top = sales[0] ? salePriority(sales[0]).priority : 3
        return { ...og, sales, _topPriority: top as SalePriority }
      })
      offerGroups.sort((a, b) => a._topPriority - b._topPriority)
      const groupTop = offerGroups[0]?._topPriority ?? 3
      return { client: cg.client, offerGroups, _groupPriority: groupTop }
    })
    reordered.sort((a, b) => a._groupPriority - b._groupPriority)
    // Strip the helper fields before returning so consumers see the original shape.
    return reordered.map((cg) => ({
      client: cg.client,
      offerGroups: cg.offerGroups.map(({ _topPriority: _drop, ...og }) => { void _drop; return og }),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupsToRender, installmentsBySaleId, loadingInstallments])

  // Page-level summary (overdue / due-soon / on-track) computed across the
  // VISIBLE page only — so the chip count and the visible cards stay in sync
  // even before we can afford to score every loaded sale.
  const pageSummary = useMemo(() => {
    let overdue = 0, dueSoon = 0, onTrack = 0, totalOverdueAmount = 0
    if (loadingInstallments) return { overdue, dueSoon, onTrack, totalOverdueAmount }
    prioritizedGroupsToRender.forEach((cg) =>
      cg.offerGroups.forEach((og) =>
        og.sales.forEach((s) => {
          const insts = installmentsBySaleId[s.id]
          if (!insts) return
          const stats = computeStatsFromInstallments(s, insts)
          if (stats.overdueCount > 0) {
            overdue += 1
            totalOverdueAmount += stats.overdueAmount
            return
          }
          if (stats.nextDueDate) {
            const days = (new Date(stats.nextDueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            if (days <= DUE_SOON_DAYS) dueSoon += 1
            else onTrack += 1
          }
        })
      )
    )
    return { overdue, dueSoon, onTrack, totalOverdueAmount }
  }, [prioritizedGroupsToRender, installmentsBySaleId, loadingInstallments])

  // Batch load installment_payments; run multiple chunks in parallel (faster than strictly sequential)
  const BATCH_SIZE = 100
  const PARALLEL_CHUNKS = 5
  useEffect(() => {
    if (displayedSaleIds.length === 0) {
      setInstallmentsBySaleId({})
      setLoadingInstallments(false)
      return
    }
    let cancelled = false
    setLoadingInstallments(true)
    const run = async () => {
      const map: Record<string, InstallmentPayment[]> = {}
      const chunks: string[][] = []
      for (let i = 0; i < displayedSaleIds.length; i += BATCH_SIZE) {
        chunks.push(displayedSaleIds.slice(i, i + BATCH_SIZE))
      }
      for (let i = 0; i < chunks.length; i += PARALLEL_CHUNKS) {
        if (cancelled) return
        const batch = chunks.slice(i, i + PARALLEL_CHUNKS)
        const results = await Promise.all(
          batch.map(chunk =>
            supabase
              .from('installment_payments')
              .select('id, sale_id, installment_number, amount_due, amount_paid, due_date, paid_date, status')
              .in('sale_id', chunk)
              .order('installment_number', { ascending: true })
          )
        )
        if (cancelled) return
        results.forEach(({ data }) => {
          if (data) {
            data.forEach((row: InstallmentPayment) => {
              if (!map[row.sale_id]) map[row.sale_id] = []
              map[row.sale_id].push(row)
            })
          }
        })
      }
      if (!cancelled) {
        displayedSaleIds.forEach(id => { if (!(id in map)) map[id] = [] })
        setInstallmentsBySaleId(map)
        setLoadingInstallments(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [displayedSaleIds])

  const totalPages = searchQuery.trim()
    ? 1
    : Math.max(1, Math.ceil(totalCount / GROUPS_PER_PAGE))
  const hasNextPage = currentPage < totalPages
  const hasPrevPage = currentPage > 1
  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages) setCurrentPage(page)
  }
  function handleGoToPageInput() {
    const n = parseInt(goToPageInput, 10)
    if (!Number.isNaN(n) && n >= 1 && n <= totalPages) {
      goToPage(n)
      setGoToPageInput('')
    }
  }

  // Scroll to top when page changes for better UX
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [currentPage])

  // Pagination renderer (Confirmation-style numbered buttons). Defined inline
  // so it closes over currentPage/goToPage/etc. without prop-drilling and
  // returns null when there's only one page.
  const renderPagination = () => {
    if (totalPages <= 1) return null
    // Build a windowed list of page numbers + ellipses, like Confirmation.
    const window: Array<number | '...'> = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) window.push(i)
    } else {
      window.push(1)
      if (currentPage > 3) window.push('...')
      const start = Math.max(2, currentPage - 1)
      const end = Math.min(totalPages - 1, currentPage + 1)
      for (let i = start; i <= end; i++) window.push(i)
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
          title={t('installments.prev')}
          aria-label={t('installments.prev')}
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
          title={t('installments.next')}
          aria-label={t('installments.next')}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </button>
        <span className="inline-flex items-center gap-1 ms-2">
          <Input
            type="number"
            min={1}
            max={totalPages}
            value={goToPageInput}
            onChange={(e) => setGoToPageInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGoToPageInput()}
            placeholder={t('installments.pagePlaceholder')}
            className="w-12 h-9 text-center text-[12px] py-0 px-1 rounded-xl"
            size="sm"
          />
          <button
            type="button"
            onClick={handleGoToPageInput}
            className="h-9 px-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 text-[12px] font-bold shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            {t('installments.goToPage')}
          </button>
        </span>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-2 sm:px-4 lg:px-6 py-2 sm:py-4 lg:py-6 max-w-7xl space-y-2 sm:space-y-4">
      {/* HEADER — icon + title + subtitle, mirroring the Confirmation page so
          installments feels like part of the same surface, not a different app.
          Mobile sizes pulled down a tier per user feedback ("feels too zoomed"). */}
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
        <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 sm:w-[22px] sm:h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" />
            <path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] sm:text-2xl font-bold text-gray-900 tracking-tight truncate leading-tight">{t('installments.pageTitle')}</h1>
          <p className="text-[10.5px] sm:text-xs text-gray-500 font-medium truncate">{t('installments.subtitle')}</p>
        </div>
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate('confirmation')}
            className="flex-shrink-0 h-9 px-3 rounded-xl bg-white border border-gray-200 text-gray-700 text-[12px] font-bold shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-gray-50 hover:border-gray-300 transition-colors whitespace-nowrap"
          >
            {t('installments.goToConfirmation')}
          </button>
        )}
      </div>

      {/* PRIORITY SUMMARY — at-a-glance count of overdue / due-soon / on-track
          for the visible page. The point is that the user lands here and sees
          "X متأخر" without having to scan the cards one by one. */}
      {!loading && (pageSummary.overdue + pageSummary.dueSoon + pageSummary.onTrack) > 0 && (
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {pageSummary.overdue > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-100 text-[11.5px] font-bold tabular-nums">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              {pageSummary.overdue} {t('installments.summaryOverdue')}
              {pageSummary.totalOverdueAmount > 0 && (
                <span className="text-[10.5px] font-bold opacity-80">· {formatPrice(pageSummary.totalOverdueAmount)} DT</span>
              )}
            </span>
          )}
          {pageSummary.dueSoon > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100 text-[11.5px] font-bold tabular-nums">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {pageSummary.dueSoon} {t('installments.summaryDueSoon')}
            </span>
          )}
          {pageSummary.onTrack > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-[11.5px] font-bold tabular-nums">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {pageSummary.onTrack} {t('installments.summaryOnTrack')}
            </span>
          )}
        </div>
      )}

      {/* SEARCH ROW — single line on desktop, stacked on mobile, with the same
          inline icon pattern as Confirmation. */}
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
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setSearchByPieceOnly(false)
              }}
              placeholder={searchByPieceOnly ? t('installments.pieceNumberPlaceholder') : t('installments.searchPlaceholder')}
              className="ps-10 pe-10"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setSearchByPieceOnly(false)
                }}
                className="absolute inset-y-0 end-2 my-auto w-7 h-7 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition-colors"
                aria-label={t('installments.clearSearch')}
                title={t('installments.clearSearch')}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setPieceNumberSearchValue(searchQuery.trim())
              setShowPieceSearchDialog(true)
            }}
            className="h-10 px-3 rounded-xl bg-white border border-gray-200 text-gray-700 text-[12px] font-bold shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-gray-50 hover:border-gray-300 transition-colors whitespace-nowrap inline-flex items-center justify-center gap-1.5"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            {t('installments.searchByPieceNumber')}
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 px-1">
          <span className="text-[11.5px] text-gray-500 font-semibold tabular-nums">
            {searchQuery
              ? (() => {
                  const totalFiltered = filteredClientGroups.reduce((sum, cg) => sum + cg.offerGroups.reduce((s, og) => s + og.sales.length, 0), 0)
                  if (totalFiltered > SEARCH_DISPLAY_CAP) {
                    return replaceVars(t('installments.showingFirstResults'), { cap: SEARCH_DISPLAY_CAP })
                  }
                  return replaceVars(t('installments.showingResults'), { count: totalFiltered })
                })()
              : (totalCount > 0
                  ? t('installments.showingRange')
                      .replace('{{from}}', String((currentPage - 1) * GROUPS_PER_PAGE + 1))
                      .replace('{{to}}', String(Math.min(currentPage * GROUPS_PER_PAGE, totalCount)))
                      .replace('{{total}}', String(totalCount))
                  : '')}
          </span>
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('')
                setSearchByPieceOnly(false)
              }}
              className="h-7 px-2.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-[10.5px] font-bold hover:bg-blue-100 transition-colors"
            >
              {t('installments.clearSearch')}
            </button>
          )}
        </div>
      </div>

      {/* Search by piece number dialog */}
      <Dialog
        open={showPieceSearchDialog}
        onClose={() => setShowPieceSearchDialog(false)}
        title={t('installments.searchByPieceNumber')}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowPieceSearchDialog(false)} size="sm">
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const q = pieceNumberSearchValue.trim()
                setSearchQuery(q)
                setDebouncedSearchQuery(q)
                setSearchByPieceOnly(true)
                setShowPieceSearchDialog(false)
                setPieceNumberSearchValue('')
              }}
            >
              {t('installments.search')}
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="installments-piece-search" className="text-xs sm:text-sm">{t('installments.pieceNumber')}</Label>
          <Input
            id="installments-piece-search"
            type="text"
            value={pieceNumberSearchValue}
            onChange={(e) => setPieceNumberSearchValue(e.target.value)}
            placeholder={t('installments.pieceNumberPlaceholder')}
            size="sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const q = pieceNumberSearchValue.trim()
                setSearchQuery(q)
                setDebouncedSearchQuery(q)
                setSearchByPieceOnly(true)
                setShowPieceSearchDialog(false)
                setPieceNumberSearchValue('')
              }
            }}
          />
        </div>
      </Dialog>

      {error && (
        <Alert variant="error" className="text-xs sm:text-sm">{error}</Alert>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-blue-600 mb-3" />
          <p className="text-[13px] text-gray-500 font-semibold">{t('installments.loading')}</p>
        </div>
      ) : prioritizedGroupsToRender.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white/60 p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 mb-3 ring-1 ring-blue-100">
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" />
            </svg>
          </div>
          <p className="text-[13px] text-gray-700 font-semibold">
            {searchQuery ? t('installments.noSearchResults') : t('installments.noInstallmentSales')}
          </p>
          {searchQuery && (
            <p className="text-[11.5px] text-gray-500 mt-2 max-w-md mx-auto leading-relaxed">
              {t('installments.reservedPiecesHint')}
            </p>
          )}
        </div>
      ) : (
        <>
        {renderPagination()}

        <div className="space-y-3">
          {prioritizedGroupsToRender.map((clientGroup, clientIndex) => {
            const totalPieces = clientGroup.offerGroups.reduce((sum, og) => sum + og.sales.length, 0)
            // Aggregate remaining across all sales for this client (visible page).
            // Falls back to 0 while installments load — header still renders.
            const clientRemaining = clientGroup.offerGroups.reduce((sum, og) =>
              sum + og.sales.reduce((s, sale) => {
                const insts = installmentsBySaleId[sale.id]
                if (!insts) return s + sale.sale_price
                const stats = computeStatsFromInstallments(sale, insts)
                return s + Math.max(0, stats.remaining)
              }, 0), 0)
            return (
              <div key={clientGroup.client?.id ?? `client-${clientIndex}`} className="rounded-xl sm:rounded-2xl border border-gray-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
                {/* Compact client header — name + CIN on the left, totals on the right */}
                <div className="flex items-center justify-between gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 border-b border-gray-200/80 bg-gradient-to-l from-blue-50/40 via-indigo-50/30 to-white">
                  <div className="min-w-0">
                    <h2 className="text-[12.5px] sm:text-[15px] font-extrabold text-gray-900 tracking-tight truncate leading-tight">
                      {clientGroup.client?.name || t('shared.unknown')}
                    </h2>
                    <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-gray-500 font-semibold tabular-nums truncate">
                      <span className="truncate">CIN: {clientGroup.client?.id_number || '—'}</span>
                      {clientGroup.client?.phone && (<><span className="opacity-60">·</span><span className="truncate">{clientGroup.client.phone}</span></>)}
                    </div>
                  </div>
                  <div className="text-end flex-shrink-0">
                    <p className="num text-[12.5px] sm:text-[15px] font-extrabold text-gray-900 tracking-tight leading-tight">
                      {formatPrice(clientRemaining)} <span className="text-[9px] sm:text-[10px] font-bold text-gray-400">DT</span>
                    </p>
                    <p className="text-[9.5px] sm:text-[10.5px] text-gray-500 font-bold">
                      {totalPieces} {totalPieces === 1 ? t('installments.piece') : t('installments.pieces')} · {t('installments.remainingLabel')}
                    </p>
                  </div>
                </div>

                {/* Offer groups — single inline pill header, then a 2/3-col grid of compact piece cards */}
                <div className="p-2.5 sm:p-3 space-y-3">
                  {clientGroup.offerGroups.map((offerGroup, offerIndex) => {
                    const offerSales = offerGroup.sales
                    return (
                      <div key={`offer-${clientIndex}-${offerIndex}`}>
                        {/* Offer label — single inline pill, all metadata on one row */}
                        <div className="flex items-center gap-1.5 mb-2 ps-1 flex-wrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold border bg-blue-50 text-blue-700 border-blue-100">
                            📋 {offerGroup.offer?.name || t('installments.offerLabel')}
                          </span>
                          <span className="text-[10.5px] text-gray-500 font-semibold">
                            {offerSales.length} {offerSales.length === 1 ? t('installments.piece') : t('installments.pieces')}
                          </span>
                          {offerGroup.offer?.monthly_amount != null && (
                            <span className="text-[10.5px] text-gray-500 font-semibold">· {formatPrice(offerGroup.offer.monthly_amount)} DT/{t('installments.monthShort')}</span>
                          )}
                          {offerGroup.offer?.months != null && (
                            <span className="text-[10.5px] text-gray-500 font-semibold">· {offerGroup.offer.months} {t('installments.monthShort')}</span>
                          )}
                        </div>

                        {/* Pieces grid — 2 cols on mobile, 3 on desktop. No more separate desktop table —
                            cards scale and the table was eating horizontal space. */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {offerSales.map((sale) => (
                            <SaleCard
                              key={sale.id}
                              sale={sale}
                              onClick={() => handleSaleClick(sale)}
                              installments={installmentsBySaleId[sale.id] ?? []}
                              loadingInstallments={loadingInstallments}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {renderPagination()}
        </>
      )}

      {selectedSale && (
        <InstallmentDetailsDialog
          open={detailsDialogOpen}
          onClose={handleDetailsClose}
          sale={selectedSale}
          onPaymentSuccess={() => {
            // Do not refresh parent list here: dialog stays open and already refreshed its own installments
            // List will refresh when user closes the dialog (handleDetailsClose)
          }}
        />
      )}
          </div>
  )
}

// Compact piece card — single source of truth for both mobile and desktop now
// that the wide table is gone. Client identity already lives in the parent
// header, so this card only renders piece-level info to avoid restating things
// the user already sees one row up.
function SaleCard({ sale, onClick, installments = [], loadingInstallments = false }: { sale: Sale; onClick: () => void; installments?: InstallmentPayment[]; loadingInstallments?: boolean }) {
  const { t } = useLanguage()
  // Snapshot Date.now() inside the memo so render stays pure (React 19 strict
  // rules flag bare `Date.now()` during render). The snapshot only refreshes
  // when sale/installments change, which is fine — relative-day labels don't
  // need to tick on every re-render.
  const stats = useMemo(() => (loadingInstallments ? null : computeStatsFromInstallments(sale, installments)), [sale, installments, loadingInstallments])
  const dayCalc = useMemo(() => {
    if (!stats || !stats.nextDueDate) return { daysUntilDue: null as number | null, overdueDays: null as number | null, overdueDateIso: null as string | null }
    const now = new Date().getTime()
    const dayMs = 1000 * 60 * 60 * 24
    const daysUntilDue = Math.ceil((new Date(stats.nextDueDate).getTime() - now) / dayMs)
    const overdueInst = installments.find((i) => i.status === 'pending' && new Date(i.due_date).getTime() < now)
    const overdueDays = overdueInst ? Math.abs(Math.ceil((new Date(overdueInst.due_date).getTime() - now) / dayMs)) : null
    return { daysUntilDue, overdueDays, overdueDateIso: overdueInst?.due_date ?? null }
  }, [stats, installments])

  if (loadingInstallments || !stats) {
    return (
      <div className="rounded-xl border border-gray-200/80 bg-white p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] animate-pulse">
        <div className="h-3 bg-gray-100 rounded w-1/2 mb-2" />
        <div className="h-2 bg-gray-100 rounded w-3/4 mb-2" />
        <div className="h-1.5 bg-gray-100 rounded w-full" />
      </div>
    )
  }

  // Tone derives from priority. Border + background + status pill stay in lockstep
  // so a quick scan of the grid surfaces the urgent cards visually, not just textually.
  const isOverdue = stats.overdueCount > 0
  const { daysUntilDue, overdueDays, overdueDateIso } = dayCalc
  const isDueSoon = !isOverdue && daysUntilDue != null && daysUntilDue <= DUE_SOON_DAYS
  const tone = isOverdue
    ? 'border-red-200 bg-gradient-to-br from-red-50/60 to-white hover:border-red-300'
    : isDueSoon
    ? 'border-amber-200 bg-gradient-to-br from-amber-50/60 to-white hover:border-amber-300'
    : 'border-gray-200/80 bg-white hover:border-blue-200'
  const progressPct = stats.totalCount > 0 ? (stats.paidCount / stats.totalCount) * 100 : 0

  const statusPill = isOverdue
    ? <span className="inline-flex items-center gap-1 px-1.5 py-0 rounded-full text-[10px] font-bold border bg-red-50 text-red-700 border-red-100">⚠ {t('installments.badgeOverdue')}</span>
    : isDueSoon
    ? <span className="inline-flex items-center gap-1 px-1.5 py-0 rounded-full text-[10px] font-bold border bg-amber-50 text-amber-700 border-amber-100">⏰ {t('installments.badgeDueSoonShort')}</span>
    : <span className="inline-flex items-center gap-1 px-1.5 py-0 rounded-full text-[10px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-100">✓ {t('installments.badgeOnTrack')}</span>

  // Day chip text near next-due date — relative ("3 يوم", "اليوم", "متأخر 5 يوم").
  // All Date.now()-based math comes from the dayCalc memo above so render is pure.
  const nextDueLabel = (() => {
    if (!stats.nextDueDate) return null
    if (isOverdue) {
      if (overdueDays == null || !overdueDateIso) return null
      return `${formatDateShort(overdueDateIso)} · ${overdueDays} ${t('installments.dayWord')}`
    }
    if (daysUntilDue === 0) return `${formatDateShort(stats.nextDueDate)} · ${t('installments.today')}`
    return `${formatDateShort(stats.nextDueDate)} · ${daysUntilDue} ${t('installments.dayWord')}`
  })()

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className={`group relative rounded-lg sm:rounded-xl border p-2 sm:p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${tone}`}
    >
      {/* Top row: piece identity + status pill */}
      <div className="flex items-start justify-between gap-1.5 mb-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[11px] sm:text-[12.5px] font-extrabold text-gray-900 tracking-tight truncate">{sale.batch?.name || '-'}</span>
            <span className="text-[10px] sm:text-[11.5px] font-bold text-gray-500 tabular-nums">#{sale.piece?.piece_number || '-'}</span>
            {sale.piece?.surface_m2 != null && (
              <span className="text-[9px] sm:text-[10.5px] text-gray-400 font-semibold tabular-nums">{sale.piece.surface_m2} m²</span>
            )}
          </div>
        </div>
        <div className="flex-shrink-0">{statusPill}</div>
      </div>

      {/* Progress + counter */}
      <div className="mb-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9.5px] sm:text-[10.5px] text-gray-500 font-semibold">{t('installments.installmentsLabel')}</span>
          <span className="text-[10.5px] sm:text-[12px] font-extrabold text-gray-900 tabular-nums">
            {stats.paidCount}<span className="text-gray-400">/{stats.totalCount}</span>
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1 sm:h-1.5 overflow-hidden">
          <div
            className={`h-1 sm:h-1.5 rounded-full transition-all ${isOverdue ? 'bg-red-500' : isDueSoon ? 'bg-amber-500' : 'bg-blue-500'}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Next-due / overdue line — single dense row */}
      {nextDueLabel && (
        <div className={`flex items-center gap-1 mb-1 text-[9.5px] sm:text-[10.5px] font-semibold tabular-nums ${isOverdue ? 'text-red-700' : 'text-gray-600'}`}>
          <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
          </svg>
          <span className="truncate">{isOverdue ? t('installments.badgeOverdue') : t('installments.nextLabel')}: {nextDueLabel}</span>
        </div>
      )}

      {/* Paid / remaining — single row, no boxes (saves a lot of vertical space) */}
      <div className="flex items-end justify-between gap-2 mb-1">
        <div className="min-w-0">
          <div className="text-[8.5px] sm:text-[9.5px] text-gray-500 font-semibold uppercase tracking-wide">{t('installments.paidLabel')}</div>
          <div className="num text-[11px] sm:text-[12.5px] font-extrabold text-emerald-700 tabular-nums leading-tight">{formatPrice(stats.totalPaid)} <span className="text-[8.5px] sm:text-[9.5px] text-gray-400 font-bold">DT</span></div>
        </div>
        <div className="min-w-0 text-end">
          <div className="text-[8.5px] sm:text-[9.5px] text-gray-500 font-semibold uppercase tracking-wide">{t('installments.remainingLabel')}</div>
          <div className="num text-[11px] sm:text-[12.5px] font-extrabold text-gray-900 tabular-nums leading-tight">{formatPrice(stats.remaining)} <span className="text-[8.5px] sm:text-[9.5px] text-gray-400 font-bold">DT</span></div>
        </div>
      </div>

      {/* Overdue line — only when actually overdue, kept tight */}
      {stats.overdueAmount > 0 && (
        <div className="mb-1 flex items-center justify-between gap-2 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md sm:rounded-lg bg-red-50 border border-red-100">
          <span className="text-[9px] sm:text-[10px] font-bold text-red-700">⚠ {t('installments.overdueLabel')}</span>
          <span className="num text-[10px] sm:text-[11px] font-extrabold text-red-700 tabular-nums">{formatPrice(stats.overdueAmount)} DT</span>
        </div>
      )}

      {/* Primary action — full width, matches Confirmation's primary button */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClick() }}
        className={`w-full h-7 sm:h-8 rounded-md sm:rounded-lg text-[10.5px] sm:text-[11.5px] font-bold flex items-center justify-center gap-1 transition-colors ${
          isOverdue
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {t('installments.viewDetails')}
      </button>
    </div>
  )
}
