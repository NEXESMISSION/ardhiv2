import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { NotificationDialog } from '@/components/ui/notification-dialog'
import { formatPrice, formatDate, formatDateShort } from '@/utils/priceCalculator'
import { getPaymentTypeLabel } from '@/utils/paymentTerms'
import { ConfirmSaleDialog } from '@/components/ConfirmSaleDialog'
import { ConfirmGroupSaleDialog } from '@/components/ConfirmGroupSaleDialog'
import { SaleDetailsDialog } from '@/components/SaleDetailsDialog'
import { GroupSaleDetailsDialog } from '@/components/GroupSaleDetailsDialog'
import { EditSaleDialog } from '@/components/EditSaleDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DeadlineCountdown } from '@/components/DeadlineCountdown'
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
  const { isOwner } = useAuth()
  const { t } = useLanguage()
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
  const [groupedSales, setGroupedSales] = useState<Sale[][]>([])
  const [clientGroups, setClientGroups] = useState<ClientGroup[]>([])
  const [selectedSalesGroup, setSelectedSalesGroup] = useState<Sale[] | null>(null)
  const [confirmGroupDialogOpen, setConfirmGroupDialogOpen] = useState(false)
  const [saleDetailsDialogOpen, setSaleDetailsDialogOpen] = useState(false)
  const [groupSaleDetailsDialogOpen, setGroupSaleDetailsDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [saleToCancel, setSaleToCancel] = useState<Sale | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [batchFilter, setBatchFilter] = useState<string>('all')
  const [allBatches, setAllBatches] = useState<Array<{ id: string; name: string }>>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  /** Clients per page (each client box shows all their pieces) */
  const itemsPerPage = 15
  const prevBatchFilterRef = useRef<string>(batchFilter)

  /** Max pending sales to load so we can group by client (one box per client with all pieces) */
  const PENDING_SALES_LOAD_LIMIT = 5000

  useEffect(() => {
    loadAllBatches()
    prefetchContractWriters()
    return () => {}
  }, [])

  // Load sales when page, batch filter, or search query changes. When filter is a specific batch, also run once batches are loaded.
  const batchesReady = batchFilter === 'all' ? 1 : allBatches.length
  const prevSearchQueryRef = useRef<string>(searchQuery)
  useEffect(() => {
    const pageToLoad = prevBatchFilterRef.current !== batchFilter ? 1 : currentPage
    if (prevBatchFilterRef.current !== batchFilter) {
      prevBatchFilterRef.current = batchFilter
      setCurrentPage(1)
    }
    // Reset to page 1 when search query changes
    if (prevSearchQueryRef.current !== searchQuery) {
      prevSearchQueryRef.current = searchQuery
      setCurrentPage(1)
      loadPendingSales(1)
      return
    }
    loadPendingSales(pageToLoad)
  }, [currentPage, batchFilter, batchesReady, searchQuery])

  useEffect(() => {
    const handleSaleCreated = () => {
      loadPendingSales()
    }
    const handleSaleUpdated = () => {
      loadPendingSales()
    }
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
      const { data, error } = await supabase
        .from('land_batches')
        .select('id, name')
        .order('name', { ascending: true })

      if (error) throw error
      setAllBatches(data || [])
    } catch (e: any) {
      console.error('Error loading batches:', e)
    }
  }

  async function loadPendingSales(_overridePage?: number) {
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

      const { data, error: err } = await query

      if (err) throw err

      // Format sales with seller information
      let formattedSales = await formatSalesWithSellers(data || [])
      
      // If any sales have payment_offer_id but no payment_offer, fetch them manually
      const salesNeedingOffer = formattedSales.filter(
        s => s.payment_offer_id && !s.payment_offer && s.payment_method === 'installment'
      )
      
      if (salesNeedingOffer.length > 0) {
        if (process.env.NODE_ENV === 'development') {
          console.log('Sales needing payment_offer:', salesNeedingOffer.map(s => ({
            sale_id: s.id,
            payment_offer_id: s.payment_offer_id,
            payment_method: s.payment_method
          })))
        }
        
        const offerIds = [...new Set(salesNeedingOffer.map(s => s.payment_offer_id).filter(Boolean))]
        
        if (offerIds.length > 0) {
          if (process.env.NODE_ENV === 'development') {
            console.log('Fetching payment_offers for IDs:', offerIds)
          }
          
          const { data: offersData, error: offersError } = await supabase
            .from('payment_offers')
            .select('id, name, price_per_m2_installment, advance_mode, advance_value, calc_mode, monthly_amount, months')
            .in('id', offerIds)
          
          if (offersError) {
            console.error('Error fetching payment_offers:', offersError)
          } else {
            if (process.env.NODE_ENV === 'development') {
              console.log('Fetched payment_offers:', offersData)
            }
            
            if (offersData && offersData.length > 0) {
              const offersMap = new Map(offersData.map(offer => [offer.id, offer]))
              
              formattedSales = formattedSales.map(sale => {
                if (sale.payment_offer_id && !sale.payment_offer && offersMap.has(sale.payment_offer_id)) {
                  if (process.env.NODE_ENV === 'development') {
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
              if (process.env.NODE_ENV === 'development') {
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
      clientGroupsMap.forEach((offerMap, clientId) => {
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
      setSales(formattedSales)
      setClientGroups(clientGroupsList)
      setGroupedSales(clientGroupsList.flatMap(cg => cg.offerGroups.map(og => og.sales)))
      setTotalCount(clientGroupsList.length)
    } catch (e: any) {
      setError(e.message || t('confirmation.loadError'))
    } finally {
      setLoading(false)
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

  function getConfirmButtonColor(sale: Sale): string {
    if (sale.payment_method === 'promise' && sale.partial_payment_amount) {
      return 'bg-orange-600 hover:bg-orange-700 active:bg-orange-800'
    }
    if (sale.payment_method === 'promise') {
      return 'bg-purple-600 hover:bg-purple-700 active:bg-purple-800'
    }
    if (sale.payment_method === 'installment') {
      return 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
    }
    return 'bg-green-600 hover:bg-green-700 active:bg-green-800'
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

  return (
    <div className="container mx-auto px-2 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 max-w-7xl">
      {/* Header - always visible so page opens fast */}
      <div className="mb-3 sm:mb-4 lg:mb-6">
        <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 mb-1">{t('confirmation.title')}</h1>
        <p className="text-xs sm:text-sm text-gray-600">{t('confirmation.subtitle')}</p>
      </div>

      {error && (
        <div className="mb-4">
          <Alert variant="error" className="text-xs sm:text-sm">{error}</Alert>
        </div>
      )}

      {/* Filters - always visible when we have batches */}
      {allBatches.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-2 sm:p-3 mb-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input
              type="text"
              placeholder={`🔍 ${t('confirmation.searchPlaceholder')}`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              size="sm"
              className="text-xs sm:text-sm"
            />
            <Select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              className="text-xs sm:text-sm text-gray-900 bg-white"
            >
              <option value="all" className="text-gray-900">{t('confirmation.allBatches')}</option>
              {batches.map(batch => (
                <option key={batch} value={batch} className="text-gray-900">{batch}</option>
              ))}
            </Select>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-600 flex-wrap gap-2">
            {searchQuery.trim() ? (
              <span>{replaceVars(t('confirmation.resultsOnPage'), { 
                count: paginatedClientGroups.length, 
                total: filteredClientGroups.length 
              })} {t('confirmation.clients')}</span>
            ) : (
              <span>{replaceVars(t('confirmation.showingRange'), {
                from: clientGroups.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0,
                to: Math.min(currentPage * itemsPerPage, totalCount),
                total: totalCount,
              })} {t('confirmation.clients')}</span>
            )}
            {(searchQuery || batchFilter !== 'all') && (
            <Button
              variant="secondary"
              size="sm"
                onClick={() => {
                  setSearchQuery('')
                  setBatchFilter('all')
              }}
                className="text-[10px] px-2 py-0.5"
            >
                {t('confirmation.reset')}
            </Button>
            )}
          </div>
                  </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 min-h-[120px]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            <p className="mt-2 text-xs text-gray-500">{t('confirmation.loading')}</p>
          </div>
        </div>
      ) : filteredClientGroups.length === 0 ? (
        <Card className="p-6 sm:p-8 text-center">
          <p className="text-sm sm:text-base text-gray-500">
            {clientGroups.length === 0 ? t('confirmation.noPendingSales') : t('confirmation.noSearchResults')}
          </p>
        </Card>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {paginatedClientGroups.map((clientGroup, clientIndex) => {
            const totalPieces = clientGroup.offerGroups.reduce((sum, og) => sum + og.sales.length, 0)
            const clientTotal = clientGroup.offerGroups.reduce((sum, og) => sum + og.sales.reduce((s, sale) => s + sale.sale_price, 0), 0)
            const firstSale = clientGroup.offerGroups[0]?.sales[0]

            const getDeadlineStatus = (sale: Sale) => {
              if (!sale.deadline_date) return null
              const deadline = new Date(sale.deadline_date)
              const now = new Date()
              const diffMs = now.getTime() - deadline.getTime()
              const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
              return diffMs > 0 ? { overdue: true, days: diffDays } : { overdue: false, days: Math.abs(diffDays) }
            }
            const monthKeys = ['monthJan', 'monthFeb', 'monthMar', 'monthApr', 'monthMay', 'monthJun', 'monthJul', 'monthAug', 'monthSep', 'monthOct', 'monthNov', 'monthDec'] as const
            const formatSaleDateTime = (dateStr: string) => {
              const date = new Date(dateStr)
              const month = t(`confirmation.${monthKeys[date.getMonth()]}`)
              const day = date.getDate()
              const year = date.getFullYear()
              const hours = date.getHours().toString().padStart(2, '0')
              const minutes = date.getMinutes().toString().padStart(2, '0')
              return `${day} ${month} ${year} ${hours}:${minutes}`
            }

            return (
              <Card key={`client-${clientIndex}`} className="overflow-hidden border border-gray-200 shadow-md bg-white">
                {/* Client header (like Installments) */}
                <div className="bg-gradient-to-r from-slate-600 to-slate-700 p-4 text-white">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <div className="font-bold text-base sm:text-lg truncate">{clientGroup.client?.name || t('confirmation.unknown')}</div>
                    <Badge className="bg-white/20 text-xs">
                      {totalPieces} {totalPieces === 1 ? t('confirmation.piece') : t('confirmation.pieces')}
                    </Badge>
                  </div>
                  <div className="text-xs sm:text-sm opacity-90 flex items-center gap-2 flex-wrap">
                    <span>{clientGroup.client?.id_number || ''}</span>
                    {clientGroup.client?.phone && (
                      <>
                        <span className="opacity-60">•</span>
                        <span>{clientGroup.client.phone}</span>
                      </>
                    )}
                  </div>
                  <div className="text-sm font-medium mt-2 opacity-95">
                    {replaceVars(t('confirmation.piecesAndTotal'), { count: totalPieces, total: formatPrice(clientTotal) + ' DT' })}
                  </div>
                </div>

                {/* Offer groups (installment offer / full / promise) then pieces */}
                <div className="p-3 sm:p-4 space-y-4 bg-gray-50/50">
                  {clientGroup.offerGroups.map((offerGroup, offerIndex) => (
                    <Card key={`offer-${clientIndex}-${offerIndex}`} className="overflow-hidden border border-gray-200 shadow-sm bg-white">
                      {/* Offer / payment method label */}
                      {offerGroup.offer ? (
                        <div className="px-3 py-2 bg-blue-50 border-b border-blue-100 flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" size="sm" className="text-xs font-semibold">
                            📋 {offerGroup.offer.name || t('confirmation.offerLabel')}
                          </Badge>
                          <span className="text-xs text-gray-600">
                            {offerGroup.sales.length} {offerGroup.sales.length === 1 ? t('confirmation.piece') : t('confirmation.pieces')}
                          </span>
                          {offerGroup.offer.monthly_amount != null && (
                            <span className="text-xs text-gray-600">• {formatPrice(offerGroup.offer.monthly_amount)} DT/{t('confirmation.month')}</span>
                          )}
                        </div>
                      ) : (
                        <div className="px-3 py-2 bg-gray-100 border-b border-gray-200 flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" size="sm" className="text-xs">
                            {offerGroup.paymentMethod === 'full' ? t('confirmation.paymentFull') : offerGroup.paymentMethod === 'promise' ? t('confirmation.promiseSale') : t('confirmation.installment')}
                          </Badge>
                          <span className="text-xs text-gray-600">
                            {offerGroup.sales.length} {offerGroup.sales.length === 1 ? t('confirmation.piece') : t('confirmation.pieces')}
                          </span>
                        </div>
                      )}
                      <div className="p-3 space-y-3">
                  {offerGroup.sales.map((sale) => {
                    const isInstallment = sale.payment_method === 'installment'
                    const isPromise = sale.payment_method === 'promise'
                    const received = isPromise
                      ? (sale.partial_payment_amount || sale.deposit_amount || 0)
                      : (sale.deposit_amount || 0)
                    const remaining = isPromise
                      ? (sale.remaining_payment_amount ?? (sale.sale_price - (sale.partial_payment_amount || sale.deposit_amount || 0)))
                      : (sale.sale_price - (sale.deposit_amount || 0))
                    const deadlineStatus = getDeadlineStatus(sale)
                    const cardColorScheme = isInstallment
                      ? 'from-blue-500 to-blue-600'
                      : isPromise
                        ? 'from-purple-500 to-purple-600'
                        : 'from-green-500 to-green-600'

                    return (
                      <Card key={sale.id} className="overflow-hidden border border-gray-200 shadow-sm bg-white">
                        <div className={`bg-gradient-to-r ${cardColorScheme} p-3 text-white`}>
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold">{sale.batch?.name || '-'}</span>
                              <span className="opacity-90">#{sale.piece?.piece_number || '-'}</span>
                              <span className="text-xs opacity-85">{sale.piece?.surface_m2 != null ? `${sale.piece.surface_m2} m²` : ''}</span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {deadlineStatus?.overdue && (
                                <Badge className="bg-red-100 text-red-800 border border-red-200 text-xs">
                                  ⚠️ {replaceVars(t('confirmation.overdueDays'), { days: deadlineStatus.days })}
                                </Badge>
                              )}
                              {isPromise && <Badge className="bg-purple-100 text-purple-800 border border-purple-200 text-xs">{t('confirmation.promiseSale')}</Badge>}
                              {isInstallment && <Badge className="bg-blue-100 text-blue-800 border border-blue-200 text-xs">{t('confirmation.installment')}</Badge>}
                              {sale.status === 'pending' && <Badge className="bg-amber-100 text-amber-800 border border-amber-200 text-xs">{t('confirmation.reserved')}</Badge>}
                            </div>
                          </div>
                          <div className="text-xs opacity-90 mt-1">
                            📅 {formatSaleDateTime(sale.sale_date)} • 👤 {sale.seller?.name || t('confirmation.unknown')}
                          </div>
                        </div>
                        <div className="p-3 sm:p-4">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                            <div className="bg-red-50 rounded p-2 border border-red-100">
                              <div className="text-xs text-red-700">{t('confirmation.totalPrice')}</div>
                              <div className="font-bold text-red-700">{formatPrice(sale.sale_price)} DT</div>
                            </div>
                            <div className="bg-green-50 rounded p-2 border border-green-100">
                              <div className="text-xs text-green-700">{t('confirmation.received')}</div>
                              <div className="font-bold text-green-700">{formatPrice(received)} DT</div>
                            </div>
                            <div className="bg-blue-50 rounded p-2 border border-blue-100">
                              <div className="text-xs text-blue-700">{t('confirmation.deposit')}</div>
                              <div className="font-bold text-blue-700">{formatPrice(sale.deposit_amount || 0)} DT</div>
                            </div>
                            <div className="bg-orange-50 rounded p-2 border border-orange-200">
                              <div className="text-xs text-orange-700">{t('confirmation.remaining')}</div>
                              <div className="font-bold text-orange-700">{formatPrice(remaining)} DT</div>
                            </div>
                          </div>
                          {sale.notes?.trim() && (
                            <div className="mb-3 rounded p-2 bg-gray-50 border border-gray-200 text-sm">{sale.notes.trim()}</div>
                          )}
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                            <Button size="sm" className={`${getConfirmButtonColor(sale)} text-white text-xs`} onClick={() => { setSelectedSale(sale); setConfirmDialogOpen(true) }}>
                              ✅ {getConfirmButtonText(sale)}
                            </Button>
                            <Button variant="secondary" size="sm" className="text-xs" onClick={() => { setSelectedSale(sale); setSaleDetailsDialogOpen(true) }}>
                              📋 {t('confirmation.details')}
                            </Button>
                            <Button variant="secondary" size="sm" className="text-xs bg-red-600 hover:bg-red-700 text-white" onClick={() => { setSaleToCancel(sale); setCancelDialogOpen(true) }}>
                              ❌ {t('confirmation.cancel')}
                            </Button>
                            <Button variant="secondary" size="sm" className="text-xs" onClick={() => { setSelectedSale(sale); const tmr = new Date(); tmr.setDate(tmr.getDate() + 1); setAppointmentDate(tmr.toISOString().split('T')[0]); setAppointmentTime('09:00'); setAppointmentNotes(''); setAppointmentDialogOpen(true) }}>
                              📅 {t('confirmation.appointment')}
                            </Button>
                            <Button variant="secondary" size="sm" className="text-xs" onClick={() => { setSelectedSale(sale); setEditDialogOpen(true) }}>
                              ✏️ {t('confirmation.edit')}
                            </Button>
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                      </div>
                    </Card>
                  ))}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Pagination - same style as إدارة العملاء */}
      {!searchQuery && totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap mt-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => goToPage(currentPage - 1)}
            disabled={!hasPrevPage}
            className="text-xs sm:text-sm py-1.5 px-2"
          >
            {t('confirmation.prev')}
          </Button>
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
              <Button
                variant={currentPage === 1 ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => goToPage(1)}
                className="text-xs sm:text-sm py-1.5 px-2 min-w-[32px] sm:min-w-[36px]"
              >
                1
              </Button>
              {currentPage > 3 && <span className="px-1 sm:px-2 text-xs sm:text-sm text-gray-500">...</span>}
              {currentPage > 1 && currentPage < totalPages && (
                <>
                  {currentPage > 2 && (
                    <Button variant="secondary" size="sm" onClick={() => goToPage(currentPage - 1)} className="text-xs sm:text-sm py-1.5 px-2 min-w-[32px] sm:min-w-[36px]">
                      {currentPage - 1}
                    </Button>
                  )}
                  <Button variant="primary" size="sm" className="text-xs sm:text-sm py-1.5 px-2 min-w-[32px] sm:min-w-[36px]">
                    {currentPage}
                  </Button>
                  {currentPage < totalPages - 1 && (
                    <Button variant="secondary" size="sm" onClick={() => goToPage(currentPage + 1)} className="text-xs sm:text-sm py-1.5 px-2 min-w-[32px] sm:min-w-[36px]">
                      {currentPage + 1}
                    </Button>
                  )}
                </>
              )}
              {currentPage < totalPages - 2 && <span className="px-1 sm:px-2 text-xs sm:text-sm text-gray-500">...</span>}
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
            {t('confirmation.next')}
          </Button>
        </div>
      )}

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
            <Label className="text-xs sm:text-sm">
              {t('confirmation.dateRequired')} <span className="text-red-500">*</span>
            </Label>
            <Input
              type="date"
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              size="sm"
              className="text-base"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs sm:text-sm">
              {t('confirmation.timeRequired')} <span className="text-red-500">*</span>
            </Label>
            <Input
              type="time"
              value={appointmentTime}
              onChange={(e) => setAppointmentTime(e.target.value)}
              size="sm"
              className="text-base"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs sm:text-sm">{t('confirmation.notes')}</Label>
            <Textarea
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
