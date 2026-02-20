import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatPrice, formatDateShort } from '@/utils/priceCalculator'
import { buildSaleQuery, formatSalesWithSellers } from '@/utils/salesQueries'
import { SaleDetailsDialog } from '@/components/SaleDetailsDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { getPaymentTypeLabel } from '@/utils/paymentTerms'
import { useLanguage } from '@/i18n/context'
import { useSalesRealtime } from '@/hooks/useSalesRealtime'

type TimeFilter = 'today' | 'week' | 'month' | 'all'

const ITEMS_PER_PAGE = 20

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
  payment_method: 'full' | 'installment' | 'promise' | null
  confirmed_at: string | null
  created_at: string
  sold_by?: string | null
  confirmed_by?: string | null
  client?: { id: string; name: string; id_number: string; phone: string }
  piece?: { id: string; piece_number: string; surface_m2: number }
  batch?: { id: string; name: string }
  payment_offer?: { id: string; name: string | null }
  confirmedBy?: { id: string; name: string; place: string | null }
  seller?: { id: string; name: string; place: string | null }
}

interface ConfirmationHistoryPageProps {
  onNavigate: (page: string) => void
}

export function ConfirmationHistoryPage({ onNavigate }: ConfirmationHistoryPageProps) {
  const { t } = useLanguage()
  const [sales, setSales] = useState<Sale[]>([])
  const [allSales, setAllSales] = useState<Sale[]>([]) // Store all sales for search
  const [loading, setLoading] = useState(true)
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sellerFilter, setSellerFilter] = useState<string>('all')
  const [availableSellers, setAvailableSellers] = useState<Array<{ id: string; name: string; type: 'seller' | 'confirmedBy' }>>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [detailsSale, setDetailsSale] = useState<Sale | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [revertingSale, setRevertingSale] = useState<Sale | null>(null)
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [revertError, setRevertError] = useState<string | null>(null)

  useEffect(() => {
    loadConfirmedSales()
    const handleUpdated = () => {
      setCurrentPage(1) // Reset to first page on update
      loadConfirmedSales()
    }
    window.addEventListener('saleUpdated', handleUpdated)
    return () => window.removeEventListener('saleUpdated', handleUpdated)
  }, []) // Remove currentPage dependency to avoid reload loop

  // Real-time updates for sales
  useSalesRealtime({
    onSaleUpdated: () => {
      // Only reload if sale status changed to completed
      if (!loading) {
        setCurrentPage(1)
        loadConfirmedSales()
      }
    },
  })

  async function loadConfirmedSales() {
    setLoading(true)
    try {
      // If searching or filtering by seller, load all data (up to reasonable limit) for client-side filtering
      // Otherwise, use server-side pagination
      if (searchQuery.trim() || sellerFilter !== 'all') {
        const { data, error } = await supabase
          .from('sales')
          .select(buildSaleQuery())
          .eq('status', 'completed')
          .order('confirmed_at', { ascending: false, nullsFirst: false })
          .limit(1000) // Load more for search/filter

        if (error) throw error
        const formatted = await formatSalesWithSellers(data || [])
        
        // Debug logging for seller filter
        if (sellerFilter !== 'all') {
          const [type, userId] = sellerFilter.split('-')
          console.log('Seller filter debug:', {
            filterType: type,
            userId,
            totalSales: formatted.length,
            matchingSales: formatted.filter(s => {
              if (type === 'seller') {
                return (s.seller?.id === userId) || (s.sold_by === userId)
              } else {
                return (s.confirmedBy?.id === userId) || (s.confirmed_by === userId)
              }
            }).length,
            sampleSale: formatted[0] ? {
              id: formatted[0].id,
              sold_by: formatted[0].sold_by,
              confirmed_by: formatted[0].confirmed_by,
              seller_id: formatted[0].seller?.id,
              confirmedBy_id: formatted[0].confirmedBy?.id,
            } : null
          })
        }
        
        setAllSales(formatted)
        setSales(formatted) // Use all sales for filtering
        setTotalCount(formatted.length)
        // Extract unique sellers and confirmedBy users
        extractSellers(formatted)
      } else {
        // Server-side pagination when not searching or filtering
        const from = (currentPage - 1) * ITEMS_PER_PAGE
        const to = from + ITEMS_PER_PAGE - 1

        const { data, error, count } = await supabase
          .from('sales')
          .select(buildSaleQuery(), { count: 'exact' })
          .eq('status', 'completed')
          .order('confirmed_at', { ascending: false, nullsFirst: false })
          .range(from, to)

        if (error) throw error
        const formatted = await formatSalesWithSellers(data || [])
        setSales(formatted)
        setTotalCount(count || 0)
        // Extract unique sellers and confirmedBy users
        extractSellers(formatted)
      }
    } catch (e: any) {
      console.error('Error loading confirmation history:', e)
    } finally {
      setLoading(false)
    }
  }

  // Extract unique sellers and confirmedBy users from sales
  function extractSellers(salesData: Sale[]) {
    const sellersMap = new Map<string, { id: string; name: string; type: 'seller' | 'confirmedBy' }>()
    
    salesData.forEach(sale => {
      if (sale.seller?.id && sale.seller?.name) {
        const key = `seller-${sale.seller.id}`
        if (!sellersMap.has(key)) {
          sellersMap.set(key, {
            id: sale.seller.id,
            name: sale.seller.name,
            type: 'seller'
          })
        }
      }
      if (sale.confirmedBy?.id && sale.confirmedBy?.name) {
        const key = `confirmedBy-${sale.confirmedBy.id}`
        if (!sellersMap.has(key)) {
          sellersMap.set(key, {
            id: sale.confirmedBy.id,
            name: sale.confirmedBy.name,
            type: 'confirmedBy'
          })
        }
      }
    })
    
    // Sort by name
    const sellersArray = Array.from(sellersMap.values()).sort((a, b) => 
      a.name.localeCompare(b.name)
    )
    setAvailableSellers(sellersArray)
  }

  const filteredSales = useMemo(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfWeek = new Date(startOfToday)
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const confirmDate = (s: Sale) => s.confirmed_at || s.sale_date || s.created_at

    const filtered = sales.filter((s) => {
      // Time filter
      const d = new Date(confirmDate(s))
      let timeMatch = true
      switch (timeFilter) {
        case 'today':
          timeMatch = d >= startOfToday
          break
        case 'week':
          timeMatch = d >= startOfWeek
          break
        case 'month':
          timeMatch = d >= startOfMonth
          break
        default:
          timeMatch = true
      }
      if (!timeMatch) return false

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase()
        const clientName = s.client?.name?.toLowerCase() || ''
        const clientCIN = s.client?.id_number?.toLowerCase() || ''
        const pieceNumber = s.piece?.piece_number?.toLowerCase() || ''
        const batchName = s.batch?.name?.toLowerCase() || ''
        
        const searchMatch = clientName.includes(query) || 
                           clientCIN.includes(query) || 
                           pieceNumber.includes(query) ||
                           batchName.includes(query)
        if (!searchMatch) return false
      }

      // Seller filter
      if (sellerFilter !== 'all') {
        const [type, userId] = sellerFilter.split('-')
        if (type === 'seller') {
          // Check both seller object and sold_by field - keep if EITHER matches
          const sellerMatches = (s.seller?.id === userId) || (s.sold_by === userId)
          if (!sellerMatches) return false
        } else if (type === 'confirmedBy') {
          // Check both confirmedBy object and confirmed_by field - keep if EITHER matches
          const confirmedByMatches = (s.confirmedBy?.id === userId) || (s.confirmed_by === userId)
          if (!confirmedByMatches) return false
        }
      }

      return true
    })

    // When searching or filtering by seller, paginate the filtered results client-side
    if (searchQuery.trim() || sellerFilter !== 'all') {
      const start = (currentPage - 1) * ITEMS_PER_PAGE
      const end = start + ITEMS_PER_PAGE
      return filtered.slice(start, end)
    }

    return filtered
  }, [sales, timeFilter, searchQuery, sellerFilter, currentPage])

  const filterButtons: { value: TimeFilter; label: string }[] = [
    { value: 'today', label: t('confirmationHistory.filterToday') },
    { value: 'week', label: t('confirmationHistory.filterWeek') },
    { value: 'month', label: t('confirmationHistory.filterMonth') },
    { value: 'all', label: t('confirmationHistory.filterAll') },
  ]

  // Calculate total count for pagination
  const totalFilteredCount = useMemo(() => {
    if (searchQuery.trim() || sellerFilter !== 'all') {
      // When searching or filtering by seller, count filtered results
      const now = new Date()
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const startOfWeek = new Date(startOfToday)
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

      const confirmDate = (s: Sale) => s.confirmed_at || s.sale_date || s.created_at
      const query = searchQuery.trim().toLowerCase()

      return sales.filter((s) => {
        // Time filter
        const d = new Date(confirmDate(s))
        let timeMatch = true
        switch (timeFilter) {
          case 'today':
            timeMatch = d >= startOfToday
            break
          case 'week':
            timeMatch = d >= startOfWeek
            break
          case 'month':
            timeMatch = d >= startOfMonth
            break
          default:
            timeMatch = true
        }
        if (!timeMatch) return false

        // Search filter
        if (searchQuery.trim()) {
          const clientName = s.client?.name?.toLowerCase() || ''
          const clientCIN = s.client?.id_number?.toLowerCase() || ''
          const pieceNumber = s.piece?.piece_number?.toLowerCase() || ''
          const batchName = s.batch?.name?.toLowerCase() || ''
          
          const searchMatch = clientName.includes(query) || 
                             clientCIN.includes(query) || 
                             pieceNumber.includes(query) ||
                             batchName.includes(query)
          if (!searchMatch) return false
        }

        // Seller filter
        if (sellerFilter !== 'all') {
          const [type, userId] = sellerFilter.split('-')
          if (type === 'seller') {
            // Check both seller object and sold_by field - keep if EITHER matches
            const sellerMatches = (s.seller?.id === userId) || (s.sold_by === userId)
            if (!sellerMatches) return false
          } else if (type === 'confirmedBy') {
            // Check both confirmedBy object and confirmed_by field - keep if EITHER matches
            const confirmedByMatches = (s.confirmedBy?.id === userId) || (s.confirmed_by === userId)
            if (!confirmedByMatches) return false
          }
        }
        return true
      }).length
    }
    return totalCount
  }, [sales, searchQuery, timeFilter, sellerFilter, totalCount])

  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / ITEMS_PER_PAGE))
  const hasNextPage = currentPage < totalPages
  const hasPrevPage = currentPage > 1
  
  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
      window.scrollTo(0, 0)
    }
  }

  // Reset to page 1 when search or filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, timeFilter, sellerFilter])

  // Reload data when search query or seller filter changes
  const prevSearchQueryRef = useRef(searchQuery)
  const prevSellerFilterRef = useRef(sellerFilter)
  useEffect(() => {
    const searchChanged = prevSearchQueryRef.current !== searchQuery
    const sellerChanged = prevSellerFilterRef.current !== sellerFilter
    
    if (searchChanged || sellerChanged) {
      prevSearchQueryRef.current = searchQuery
      prevSellerFilterRef.current = sellerFilter
      // Reset to first page when filter changes
      setCurrentPage(1)
      // Force reload when filter changes
      loadConfirmedSales()
    }
  }, [searchQuery, sellerFilter])

  // Load all sellers on initial mount to populate dropdown
  useEffect(() => {
    async function loadAllSellers() {
      try {
        const { data } = await supabase
          .from('sales')
          .select('sold_by, confirmed_by')
          .eq('status', 'completed')
          .limit(1000)
        
        if (data) {
          const sellerIds = [...new Set(data.map(s => s.sold_by).filter(Boolean))]
          const confirmedByIds = [...new Set(data.map(s => s.confirmed_by).filter(Boolean))]
          
          // Fetch seller details
          const { data: sellersData } = await supabase
            .from('users')
            .select('id, name')
            .in('id', [...sellerIds, ...confirmedByIds])
          
          if (sellersData) {
            const sellersMap = new Map(sellersData.map(u => [u.id, u]))
            const sellersList: Array<{ id: string; name: string; type: 'seller' | 'confirmedBy' }> = []
            
            // Add sellers
            sellerIds.forEach(id => {
              const seller = sellersMap.get(id)
              if (seller && !sellersList.find(s => s.id === id && s.type === 'seller')) {
                sellersList.push({ id: seller.id, name: seller.name, type: 'seller' })
              }
            })
            
            // Add confirmedBy users
            confirmedByIds.forEach(id => {
              const confirmer = sellersMap.get(id)
              if (confirmer && !sellersList.find(s => s.id === id && s.type === 'confirmedBy')) {
                sellersList.push({ id: confirmer.id, name: confirmer.name, type: 'confirmedBy' })
              }
            })
            
            // Sort by name
            sellersList.sort((a, b) => a.name.localeCompare(b.name))
            setAvailableSellers(sellersList)
          }
        }
      } catch (e) {
        console.error('Error loading sellers:', e)
      }
    }
    
    loadAllSellers()
  }, [])

  function openRevertConfirm(sale: Sale, e: React.MouseEvent) {
    e.stopPropagation()
    setRevertingSale(sale)
    setRevertError(null)
    setRevertConfirmOpen(true)
  }

  async function confirmSendBackToConfirmation() {
    if (!revertingSale) return
    setReverting(true)
    setRevertError(null)
    try {
      const saleId = revertingSale.id
      const pieceId = revertingSale.land_piece_id

      const { error: saleError } = await supabase
        .from('sales')
        .update({
          status: 'pending',
          confirmed_at: null,
          confirmed_by: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', saleId)

      if (saleError) throw saleError

      if (pieceId) {
        await supabase
          .from('land_pieces')
          .update({ status: 'Reserved', updated_at: new Date().toISOString() })
          .eq('id', pieceId)
      }

      window.dispatchEvent(new CustomEvent('saleUpdated'))
      setRevertConfirmOpen(false)
      setRevertingSale(null)
      setDetailsOpen(false)
      setDetailsSale(null)
      await loadConfirmedSales()
      onNavigate('confirmation')
    } catch (e: any) {
      setRevertError(e.message || t('confirmationHistory.revertError'))
    } finally {
      setReverting(false)
    }
  }

  return (
    <div className="space-y-4 p-3 sm:p-4 lg:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">{t('confirmationHistory.title')}</h2>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => onNavigate('confirmation')}
          className="w-full sm:w-auto"
        >
          {t('confirmationHistory.goToConfirmation')}
        </Button>
      </div>

      <p className="text-sm text-gray-600">
        {t('confirmationHistory.description')}
      </p>

      {/* Search Bar and Seller Filter */}
      <div className="bg-white border border-gray-200 rounded-lg p-2 sm:p-3 shadow-sm space-y-2">
        <div className="relative">
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('confirmationHistory.searchPlaceholder')}
            size="sm"
            className="text-xs sm:text-sm pr-10"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              title={t('confirmationHistory.clearSearch')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {/* Seller Filter */}
        <div>
          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
            {t('confirmationHistory.filterBySeller')}
          </label>
          <Select
            value={sellerFilter}
            onChange={(e) => setSellerFilter(e.target.value)}
            className="text-xs sm:text-sm"
          >
            <option value="all">{t('confirmationHistory.allSellers')}</option>
            {availableSellers.map((seller) => (
              <option key={`${seller.type}-${seller.id}`} value={`${seller.type}-${seller.id}`}>
                {seller.name} ({seller.type === 'seller' ? t('confirmationHistory.seller') : t('confirmationHistory.confirmedBy')})
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filterButtons.map(({ value, label }) => (
          <Button
            key={value}
            variant={timeFilter === value ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setTimeFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between text-xs sm:text-sm text-gray-600">
        {searchQuery ? (
          <span>
            {replaceVars(t('confirmationHistory.showingRange'), {
              from: filteredSales.length > 0 ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0,
              to: Math.min(currentPage * ITEMS_PER_PAGE, totalFilteredCount),
              total: totalFilteredCount,
            })}
          </span>
        ) : (
          <span>
            {replaceVars(t('confirmationHistory.showingRange'), {
              from: sales.length > 0 ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0,
              to: Math.min(currentPage * ITEMS_PER_PAGE, totalCount),
              total: totalCount,
            })}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : filteredSales.length === 0 ? (
        <Card className="p-6 text-center text-gray-500">
          {searchQuery ? t('confirmationHistory.noSearchResults') : t('confirmationHistory.noConfirmations')}
        </Card>
      ) : (
        <>
        <div className="space-y-2">
          {filteredSales.map((sale) => {
            const dateStr = sale.confirmed_at || sale.sale_date || sale.created_at
            return (
              <Card
                key={sale.id}
                className="p-3 sm:p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => {
                  setDetailsSale(sale)
                  setDetailsOpen(true)
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="font-medium text-gray-900">
                      {sale.client?.name || '—'}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {sale.batch?.name || '—'} / {sale.piece?.piece_number || '—'}
                    </Badge>
                    <span className="text-sm text-gray-600">
                      {formatDateShort(dateStr)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">
                      {formatPrice(sale.sale_price)} DT
                    </span>
                    <Badge variant="default" className="text-xs">
                      {getPaymentTypeLabel(sale.payment_method)}
                    </Badge>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="text-xs"
                      onClick={(e) => openRevertConfirm(sale, e)}
                    >
                      {t('confirmationHistory.revertToConfirmations')}
                    </Button>
                  </div>
                </div>
                {sale.confirmedBy && (
                  <p className="text-xs text-gray-500 mt-1">
                    {t('confirmationHistory.confirmedBy')} {sale.confirmedBy.name}
                    {sale.confirmedBy.place ? ` (${sale.confirmedBy.place})` : ''}
                  </p>
                )}
              </Card>
            )
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap mt-4">
            <Button variant="secondary" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={!hasPrevPage} className="text-xs sm:text-sm py-1.5 px-2">
              {t('confirmationHistory.prev')}
            </Button>
            {totalPages <= 7 ? (
              Array.from({ length: totalPages }, (_, i) => {
                const pageNum = i + 1
                return (
                  <Button key={pageNum} variant={currentPage === pageNum ? 'primary' : 'secondary'} size="sm" onClick={() => goToPage(pageNum)} className="text-xs sm:text-sm py-1.5 px-2 min-w-[32px] sm:min-w-[36px]">
                    {pageNum}
                  </Button>
                )
              })
            ) : (
              <>
                <Button variant={currentPage === 1 ? 'primary' : 'secondary'} size="sm" onClick={() => goToPage(1)} className="text-xs sm:text-sm py-1.5 px-2 min-w-[32px] sm:min-w-[36px]">1</Button>
                {currentPage > 3 && <span className="px-1 sm:px-2 text-xs sm:text-sm text-gray-500">...</span>}
                {currentPage > 1 && currentPage < totalPages && (
                  <>
                    {currentPage > 2 && <Button variant="secondary" size="sm" onClick={() => goToPage(currentPage - 1)} className="text-xs sm:text-sm py-1.5 px-2 min-w-[32px] sm:min-w-[36px]">{currentPage - 1}</Button>}
                    <Button variant="primary" size="sm" className="text-xs sm:text-sm py-1.5 px-2 min-w-[32px] sm:min-w-[36px]">{currentPage}</Button>
                    {currentPage < totalPages - 1 && <Button variant="secondary" size="sm" onClick={() => goToPage(currentPage + 1)} className="text-xs sm:text-sm py-1.5 px-2 min-w-[32px] sm:min-w-[36px]">{currentPage + 1}</Button>}
                  </>
                )}
                {currentPage < totalPages - 2 && <span className="px-1 sm:px-2 text-xs sm:text-sm text-gray-500">...</span>}
                <Button variant={currentPage === totalPages ? 'primary' : 'secondary'} size="sm" onClick={() => goToPage(totalPages)} className="text-xs sm:text-sm py-1.5 px-2 min-w-[32px] sm:min-w-[36px]">{totalPages}</Button>
              </>
            )}
            <Button variant="secondary" size="sm" onClick={() => goToPage(currentPage + 1)} disabled={!hasNextPage} className="text-xs sm:text-sm py-1.5 px-2">
              {t('confirmationHistory.next')}
            </Button>
          </div>
        )}
        </>
      )}

      <SaleDetailsDialog
        open={detailsOpen}
        onClose={() => {
          setDetailsOpen(false)
          setDetailsSale(null)
        }}
        sale={detailsSale as any}
      />

      <ConfirmDialog
        open={revertConfirmOpen}
        onClose={() => {
          if (!reverting) {
            setRevertConfirmOpen(false)
            setRevertingSale(null)
            setRevertError(null)
          }
        }}
        onConfirm={confirmSendBackToConfirmation}
        title={t('confirmationHistory.revertTitle')}
        description={t('confirmationHistory.revertDescription')}
        confirmText={t('confirmationHistory.confirmRevert')}
        cancelText={t('common.cancel')}
        variant="warning"
        loading={reverting}
        disabled={reverting}
        errorMessage={revertError}
      />
    </div>
  )
}
