import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { formatPrice, formatDateShort } from '@/utils/priceCalculator'
import { calculateInstallmentWithDeposit } from '@/utils/installmentCalculator'
import { buildSaleQuery, formatSalesWithSellers } from '@/utils/salesQueries'
import { InstallmentDetailsDialog } from '@/components/InstallmentDetailsDialog'
import { useLanguage } from '@/i18n/context'
import { useSalesRealtime } from '@/hooks/useSalesRealtime'

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


const ITEMS_PER_PAGE = 20

function replaceVars(str: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)), str)
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
  const [sales, setSales] = useState<Sale[]>([])
  const [groupedSales, setGroupedSales] = useState<Sale[][]>([])
  const [clientGroups, setClientGroups] = useState<ClientGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadInstallmentSales()

    const handleSaleUpdated = () => {
      loadInstallmentSales()
    }

    window.addEventListener('saleUpdated', handleSaleUpdated)

    return () => {
      window.removeEventListener('saleUpdated', handleSaleUpdated)
    }
  }, [currentPage])

  // Real-time updates for sales
  useSalesRealtime({
    onSaleUpdated: () => {
      // Only reload if sale status changed to completed or payment_method changed to installment
      if (!loading) {
        loadInstallmentSales()
      }
    },
  })

  async function loadInstallmentSales() {
    if (sales.length === 0 && !loading) setLoading(true)
    setError(null)
    try {
      const from = (currentPage - 1) * ITEMS_PER_PAGE
      const to = from + ITEMS_PER_PAGE - 1

      const { data, error: err } = await supabase
        .from('sales')
        .select(buildSaleQuery(`
          contract_writers:contract_writer_id (id, name, type, location)
        `))
        .eq('status', 'completed')
        .eq('payment_method', 'installment')
        .order('sale_date', { ascending: false })
        .range(from, to)
        .limit(ITEMS_PER_PAGE)

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
      const clientGroups: Array<{ client: Sale['client']; offerGroups: Array<{ offer: Sale['payment_offer'] | null; sales: Sale[] }> }> = []
      
      clientGroupsMap.forEach((offerGroupsMap, clientId) => {
        const firstSale = Array.from(offerGroupsMap.values())[0]?.[0]
        const offerGroups: Array<{ offer: Sale['payment_offer'] | null; sales: Sale[] }> = []
        
        offerGroupsMap.forEach((sales, offerKey) => {
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

      // Flatten for backward compatibility
      const allSalesGroups: Sale[][] = []
      clientGroups.forEach(clientGroup => {
        clientGroup.offerGroups.forEach(offerGroup => {
          allSalesGroups.push(offerGroup.sales)
        })
      })

      setSales(allSalesGroups.flat())
      setGroupedSales(allSalesGroups)
      
      // Store client groups for rendering
      setClientGroups(clientGroups)

      // Approximate total count
      const loaded = (data || []).length
      if (loaded === ITEMS_PER_PAGE) {
        setTotalCount((currentPage * ITEMS_PER_PAGE) + 1)
      } else {
        setTotalCount((currentPage - 1) * ITEMS_PER_PAGE + loaded)
      }
      // Exact count in background
      void Promise.resolve(
        supabase.from('sales').select('*', { count: 'exact', head: true }).eq('status', 'completed').eq('payment_method', 'installment')
      ).then((res: { count: number | null }) => {
        if (res.count != null) setTotalCount(res.count)
      }).catch(() => {})
    } catch (e: any) {
      setError(e.message || t('installments.loadError'))
    } finally {
      setLoading(false)
    }
  }

  async function getSaleStats(sale: Sale) {
    // Calculate total paid
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

      // Get paid installments
      const { data: installments } = await supabase
        .from('installment_payments')
        .select('amount_paid')
        .eq('sale_id', sale.id)
        .eq('status', 'paid')

      if (installments) {
        totalPaid += installments.reduce((sum, inst) => sum + (inst.amount_paid || 0), 0)
      }
    }

    const remaining = sale.sale_price - totalPaid

    // Get installment payments for stats
    const { data: allInstallments } = await supabase
        .from('installment_payments')
      .select('*')
      .eq('sale_id', sale.id)
      .order('installment_number', { ascending: true })

    const paidCount = allInstallments?.filter((i: InstallmentPayment) => i.status === 'paid').length || 0
    const totalCount = allInstallments?.length || 0

    // Find next due date
    const now = new Date()
    const nextDue = allInstallments?.find((i: InstallmentPayment) => {
      const dueDate = new Date(i.due_date)
      return i.status === 'pending' && dueDate >= now
    })

    // Find overdue
    const overdue = allInstallments?.filter((i: InstallmentPayment) => {
      const dueDate = new Date(i.due_date)
      return i.status === 'pending' && dueDate < now
    }) || []

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

  function handleSaleClick(sale: Sale) {
    setSelectedSale(sale)
    setDetailsDialogOpen(true)
  }

  function handleDetailsClose() {
    setDetailsDialogOpen(false)
    setSelectedSale(null)
  }

  // Filter client groups based on search query
  const filteredClientGroups = useMemo(() => {
    if (!searchQuery.trim()) {
      return clientGroups
    }

    const query = searchQuery.trim().toLowerCase()
    return clientGroups
      .map(clientGroup => {
        // Filter offer groups within this client
        const filteredOfferGroups = clientGroup.offerGroups
          .map(offerGroup => ({
            ...offerGroup,
            sales: offerGroup.sales.filter(sale => {
              const clientName = sale.client?.name?.toLowerCase() || ''
              const clientCIN = sale.client?.id_number?.toLowerCase() || ''
              const pieceNumber = sale.piece?.piece_number?.toLowerCase() || ''
              
              return clientName.includes(query) || 
                     clientCIN.includes(query) || 
                     pieceNumber.includes(query)
            })
          }))
          .filter(offerGroup => offerGroup.sales.length > 0)
        
        // Only include client if they have matching sales
        if (filteredOfferGroups.length > 0) {
          return {
            ...clientGroup,
            offerGroups: filteredOfferGroups
          }
        }
        return null
      })
      .filter((group): group is ClientGroup => group !== null)
  }, [clientGroups, searchQuery])

  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE))
  const hasNextPage = currentPage < totalPages
  const hasPrevPage = currentPage > 1
  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages) setCurrentPage(page)
  }

  // Scroll to top when page changes for better UX
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [currentPage])

  return (
    <div className="px-2 sm:px-4 lg:px-6 py-2 sm:py-3 lg:py-4 space-y-2 sm:space-y-3 lg:space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900">{t('installments.pageTitle')}</h1>
          {onNavigate && (
            <Button type="button" variant="secondary" size="sm" onClick={() => onNavigate('confirmation')}>
              {t('installments.goToConfirmation')}
            </Button>
          )}
        </div>
        {totalCount > 0 && !searchQuery && (
          <span className="text-xs sm:text-sm text-gray-600">
            {t('installments.showingRange')
              .replace('{{from}}', String(sales.length > 0 ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0))
              .replace('{{to}}', String(Math.min(currentPage * ITEMS_PER_PAGE, totalCount)))
              .replace('{{total}}', String(totalCount))}
          </span>
        )}
        {searchQuery && (
          <span className="text-xs sm:text-sm text-gray-600">
            {replaceVars(t('installments.showingResults'), { 
              count: filteredClientGroups.reduce((sum, cg) => sum + cg.offerGroups.reduce((s, og) => s + og.sales.length, 0), 0)
            })}
          </span>
        )}
      </div>

      {/* Search Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-2 sm:p-3 shadow-sm">
        <div className="relative">
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('installments.searchPlaceholder')}
            size="sm"
            className="text-xs sm:text-sm pr-10"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              title={t('installments.clearSearch')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="error" className="text-xs sm:text-sm">{error}</Alert>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 min-h-[120px]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            <p className="mt-2 text-xs text-gray-500">{t('installments.loading')}</p>
          </div>
        </div>
      ) : (searchQuery ? filteredClientGroups : clientGroups).length === 0 ? (
        <Card className="p-3 sm:p-4 lg:p-6 text-center">
          <p className="text-xs sm:text-sm text-gray-500">
            {searchQuery ? t('installments.noSearchResults') : t('installments.noInstallmentSales')}
          </p>
        </Card>
      ) : (
        <>
        <div className="space-y-4 sm:space-y-5">
          {(searchQuery ? filteredClientGroups : clientGroups).map((clientGroup, clientIndex) => {
            const totalPieces = clientGroup.offerGroups.reduce((sum, og) => sum + og.sales.length, 0)
            
            return (
              <Card key={`client-${clientIndex}`} className="p-4 sm:p-5 lg:p-6 hover:shadow-xl transition-shadow border-2 border-blue-200 rounded-lg bg-gradient-to-br from-blue-50 to-white">
                {/* Client Header */}
                <div className="mb-4 pb-4 border-b-2 border-blue-200">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                      👤 {clientGroup.client?.name || t('shared.unknown')}
                    </h2>
                    <Badge variant="info" size="lg" className="text-sm font-semibold">
                      {totalPieces} {totalPieces === 1 ? t('installments.piece') : t('installments.pieces')}
                    </Badge>
                  </div>
                  <p className="text-sm sm:text-base text-gray-600 font-medium">
                    CIN: {clientGroup.client?.id_number || ''}
                  </p>
                </div>

                {/* Payment Offer Groups */}
                <div className="space-y-4">
                  {clientGroup.offerGroups.map((offerGroup, offerIndex) => {
                    const offerSales = offerGroup.sales
                    const firstSale = offerSales[0]
                    
                    return (
                      <Card 
                        key={`offer-${clientIndex}-${offerIndex}`} 
                        className="p-3 sm:p-4 border-2 border-gray-200 hover:border-gray-300 bg-white rounded-lg"
                      >
                        {/* Payment Offer Header */}
                        {offerGroup.offer && (
                          <div className="mb-3 pb-3 border-b border-gray-200">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <Badge variant="secondary" size="md" className="text-xs sm:text-sm font-semibold">
                                📋 {offerGroup.offer.name || t('installments.offerLabel')}
                              </Badge>
                              <Badge variant="info" size="sm" className="text-xs">
                                {offerSales.length} {offerSales.length === 1 ? t('installments.piece') : t('installments.pieces')}
                              </Badge>
                            </div>
                            <div className="text-xs sm:text-sm text-gray-600 space-y-0.5">
                              <div>💰 المبلغ الشهري: {offerGroup.offer.monthly_amount?.toLocaleString() || '-'} DT</div>
                              {offerGroup.offer.months && (
                                <div>📅 عدد الأشهر: {offerGroup.offer.months}</div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {!offerGroup.offer && offerSales.length > 1 && (
                          <div className="mb-3 pb-3 border-b border-gray-200">
                            <Badge variant="secondary" size="sm" className="text-xs">
                              {offerSales.length} {offerSales.length === 1 ? t('installments.piece') : t('installments.pieces')} بدون عرض
                            </Badge>
                          </div>
                        )}

                        {/* Mobile: Card layout - 2 columns smart design */}
                        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:hidden">
                          {offerSales.map((sale) => (
                            <SaleCard key={sale.id} sale={sale} onClick={() => handleSaleClick(sale)} />
                          ))}
                        </div>

                        {/* Desktop table */}
                        <div className="hidden lg:block overflow-x-auto">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="border-b-2 border-gray-300 bg-gray-50">
                                <th className="text-right py-2 px-3 font-semibold text-xs">{t('installments.dealColumn')}</th>
                                <th className="text-right py-2 px-3 font-semibold text-xs">{t('installments.piecesColumn')}</th>
                                <th className="text-right py-2 px-3 font-semibold text-xs">{t('installments.installmentsColumn')}</th>
                                <th className="text-right py-2 px-3 font-semibold text-xs">{t('installments.paidColumn')}</th>
                                <th className="text-right py-2 px-3 font-semibold text-xs">{t('installments.remainingColumn')}</th>
                                <th className="text-right py-2 px-3 font-semibold text-xs">{t('installments.overdueColumn')}</th>
                                <th className="text-right py-2 px-3 font-semibold text-xs">{t('installments.dueDateColumn')}</th>
                                <th className="text-right py-2 px-3 font-semibold text-xs">{t('installments.statusColumn')}</th>
                                <th className="text-right py-2 px-3 font-semibold text-xs">{t('installments.actionColumn')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {offerSales.map((sale) => (
                                <SaleRow key={sale.id} sale={sale} onClick={() => handleSaleClick(sale)} />
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </Card>
            )
          })}
        </div>

        {/* Pagination - same style as إدارة العملاء */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap mt-4">
            <Button variant="secondary" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={!hasPrevPage} className="text-xs sm:text-sm py-1.5 px-2">
              {t('installments.prev')}
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
              {t('installments.next')}
            </Button>
          </div>
        )}
        </>
      )}

      {selectedSale && (
        <InstallmentDetailsDialog
          open={detailsDialogOpen}
          onClose={handleDetailsClose}
          sale={selectedSale}
          onPaymentSuccess={() => {
            loadInstallmentSales()
            handleDetailsClose()
          }}
        />
      )}
          </div>
  )
}

// Separate component for sale row to handle async stats
function SaleRow({ sale, onClick }: { sale: Sale; onClick: () => void }) {
  const { t } = useLanguage()
  const [stats, setStats] = useState<{
    totalPaid: number
    remaining: number
    paidCount: number
    totalCount: number
    nextDueDate: string | null
    overdueAmount: number
    overdueCount: number
  } | null>(null)
  const [loadingStats, setLoadingStats] = useState(true)
  const [touchStart, setTouchStart] = useState<{ x: number; y: number; time: number; isScrolling?: boolean } | null>(null)

  useEffect(() => {
    async function loadStats() {
      setLoadingStats(true)
      try {
        // Calculate total paid
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

          // Get paid installments - optimized query
          const { data: installments } = await supabase
            .from('installment_payments')
            .select('amount_paid')
            .eq('sale_id', sale.id)
            .eq('status', 'paid')

          if (installments) {
            totalPaid += installments.reduce((sum: number, inst: any) => sum + (inst.amount_paid || 0), 0)
          }
        }

        const remaining = sale.sale_price - totalPaid

        // Get installment payments for stats - optimized query (only needed fields)
        const { data: allInstallments } = await supabase
        .from('installment_payments')
          .select('installment_number, amount_due, amount_paid, due_date, status')
          .eq('sale_id', sale.id)
          .order('installment_number', { ascending: true })

        const paidCount = allInstallments?.filter((i: any) => i.status === 'paid').length || 0
        const totalCount = allInstallments?.length || 0

        // Find next due date
        const now = new Date()
        const nextDue = allInstallments?.find((i: any) => {
          const dueDate = new Date(i.due_date)
          return i.status === 'pending' && dueDate >= now
        })

        // Find overdue
        const overdue = allInstallments?.filter((i: any) => {
          const dueDate = new Date(i.due_date)
          return i.status === 'pending' && dueDate < now
        }) || []

        const overdueAmount = overdue.reduce((sum: number, i: any) => sum + (i.amount_due - i.amount_paid), 0)

        setStats({
          totalPaid,
          remaining,
          paidCount,
          totalCount,
          nextDueDate: nextDue?.due_date || null,
          overdueAmount,
          overdueCount: overdue.length,
        })
      } catch (e) {
        console.error('Error loading stats:', e)
    } finally {
        setLoadingStats(false)
    }
  }

    loadStats()
  }, [sale])

  if (loadingStats) {
    return (
      <tr>
        <td colSpan={10} className="py-2 sm:py-3 lg:py-4 text-center text-xs sm:text-sm text-gray-500">
          {t('installments.loading')}
        </td>
      </tr>
    )
  }

  if (!stats) return null

  const getStatusBadge = () => {
    if (stats.overdueCount > 0) {
      return <Badge variant="danger" size="sm" className="text-xs">⚠️ {t('installments.badgeOverdue')}</Badge>
    }
    if (stats.nextDueDate) {
      const daysUntilDue = Math.ceil(
        (new Date(stats.nextDueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      )
      if (daysUntilDue <= 7) {
        return <Badge variant="warning" size="sm" className="text-xs">⏰ {t('installments.badgeDueSoon')}</Badge>
      }
    }
    return <Badge variant="success" size="sm" className="text-xs">🟢 {t('installments.badgeOnTrack')}</Badge>
  }

  const formatNextDueDate = () => {
    if (!stats.nextDueDate) return '-'
    const date = new Date(stats.nextDueDate)
    const now = new Date()
    const daysDiff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (daysDiff < 0) return `(${Math.abs(daysDiff)} ${t('installments.dayWord')})`
    if (daysDiff === 0) return `(${t('installments.today')})`
    return `(${daysDiff} ${t('installments.dayWord')})`
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    setTouchStart({
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      isScrolling: false,
    })
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart) return
    const touch = e.touches[0]
    const deltaX = Math.abs(touch.clientX - touchStart.x)
    const deltaY = Math.abs(touch.clientY - touchStart.y)
    
    // If moved more than 5px, it's definitely a scroll
    if (deltaX > 5 || deltaY > 5) {
      setTouchStart({ ...touchStart, isScrolling: true })
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return
    
    // Don't handle touch if clicking on a button or interactive element
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('a') || target.closest('[role="button"]')) {
      setTouchStart(null)
      return
    }
    
    // If we detected scrolling, don't treat as click
    if (touchStart.isScrolling) {
      setTouchStart(null)
      return
    }
    
    const touch = e.changedTouches[0]
    const deltaX = Math.abs(touch.clientX - touchStart.x)
    const deltaY = Math.abs(touch.clientY - touchStart.y)
    const deltaTime = Date.now() - touchStart.time
    
    // Increased threshold to 20px and 250ms
    if (deltaX > 20 || deltaY > 20 || deltaTime > 250) {
      setTouchStart(null)
      return
    }
    
    // It's a click - only prevent default at the very end
    e.preventDefault()
    e.stopPropagation()
    onClick()
    setTouchStart(null)
  }

  const handleClick = (e: React.MouseEvent) => {
    // Don't handle click if clicking on a button or interactive element
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('a') || target.closest('[role="button"]')) {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    onClick()
  }

            return (
    <tr 
      className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer" 
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
                  >
      <td className="py-2 px-3">
                    <div>
          <div className="font-medium text-xs">{sale.client?.name || '-'}</div>
          <div className="text-xs text-gray-500">{sale.client?.id_number || ''}</div>
                      </div>
      </td>
      <td className="py-2 px-3 text-xs">
        {formatDateShort(sale.sale_date)}
      </td>
      <td className="py-2 px-3 text-xs">
        {sale.piece?.piece_number || '-'}
      </td>
      <td className="py-2 px-3 text-xs">
        {stats.paidCount}/{stats.totalCount}
      </td>
      <td className="py-2 px-3 font-semibold text-xs">
        {formatPrice(stats.totalPaid)} DT
      </td>
      <td className="py-2 px-3 font-semibold text-gray-700 text-xs">
        {formatPrice(stats.remaining)} DT
      </td>
      <td className="py-2 px-3 text-xs">
        {stats.overdueAmount > 0 ? (
          <span className="text-red-600 font-semibold">{formatPrice(stats.overdueAmount)} DT</span>
        ) : (
          '-'
        )}
      </td>
      <td className="py-2 px-3 text-xs">
        {stats.nextDueDate ? (
                          <div>
            <div>{formatDateShort(stats.nextDueDate)}</div>
            <div className="text-xs text-gray-500">{formatNextDueDate()}</div>
                          </div>
        ) : (
          '-'
                        )}
      </td>
      <td className="py-2 px-3">
        {getStatusBadge()}
      </td>
      <td className="py-2 px-3">
                      <Button
          size="sm" 
          variant="secondary" 
                        onClick={(e) => {
            e.preventDefault()
                          e.stopPropagation()
            onClick()
                        }}
          className="text-xs py-1 px-2"
                      >
          {t('installments.viewDetails')}
                      </Button>
      </td>
    </tr>
            )
}

// Mobile-optimized card component
function SaleCard({ sale, onClick }: { sale: Sale; onClick: () => void }) {
  const { t } = useLanguage()
  const [stats, setStats] = useState<{
    totalPaid: number
    remaining: number
    paidCount: number
    totalCount: number
    nextDueDate: string | null
    overdueAmount: number
    overdueCount: number
  } | null>(null)
  const [loadingStats, setLoadingStats] = useState(true)
  const [touchStart, setTouchStart] = useState<{ x: number; y: number; time: number } | null>(null)

  useEffect(() => {
    async function loadStats() {
      setLoadingStats(true)
      try {
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

          const { data: installments } = await supabase
            .from('installment_payments')
            .select('amount_paid')
            .eq('sale_id', sale.id)
            .eq('status', 'paid')

          if (installments) {
            totalPaid += installments.reduce((sum: number, inst: any) => sum + (inst.amount_paid || 0), 0)
          }
        }

        const remaining = sale.sale_price - totalPaid

        // Optimized query - only select needed fields
        const { data: allInstallments } = await supabase
          .from('installment_payments')
          .select('installment_number, amount_due, amount_paid, due_date, status')
          .eq('sale_id', sale.id)
          .order('installment_number', { ascending: true })

        const paidCount = allInstallments?.filter((i: any) => i.status === 'paid').length || 0
        const totalCount = allInstallments?.length || 0

        const now = new Date()
        const nextDue = allInstallments?.find((i: any) => {
          const dueDate = new Date(i.due_date)
          return i.status === 'pending' && dueDate >= now
        })

        const overdue = allInstallments?.filter((i: any) => {
          const dueDate = new Date(i.due_date)
          return i.status === 'pending' && dueDate < now
        }) || []

        const overdueAmount = overdue.reduce((sum: number, i: any) => sum + (i.amount_due - i.amount_paid), 0)

        setStats({
          totalPaid,
          remaining,
          paidCount,
          totalCount,
          nextDueDate: nextDue?.due_date || null,
          overdueAmount,
          overdueCount: overdue.length,
        })
      } catch (e) {
        console.error('Error loading stats:', e)
      } finally {
        setLoadingStats(false)
      }
    }

    loadStats()
  }, [sale])

  if (loadingStats) {
              return (
      <Card className="p-2">
        <div className="text-center py-2 text-xs text-gray-500">{t('installments.loading')}</div>
              </Card>
            )
  }

  if (!stats) return null

  const getStatusBadge = () => {
    if (stats.overdueCount > 0) {
      return <Badge variant="danger" size="sm" className="text-xs">⚠️ {t('installments.badgeOverdue')}</Badge>
    }
    if (stats.nextDueDate) {
      const daysUntilDue = Math.ceil(
        (new Date(stats.nextDueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      )
      if (daysUntilDue <= 7) {
        return <Badge variant="warning" size="sm" className="text-xs">⏰ {t('installments.badgeDueSoonShort')}</Badge>
        }
    }
    return <Badge variant="success" size="sm" className="text-xs">🟢 {t('installments.badgeOnTrack')}</Badge>
  }

  const formatNextDueDate = () => {
    if (!stats.nextDueDate) return '-'
    const date = new Date(stats.nextDueDate)
    const now = new Date()
    const daysDiff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysDiff < 0) return `${Math.abs(daysDiff)} ${t('installments.dayWord')}`
    if (daysDiff === 0) return t('installments.today')
    return `${daysDiff} ${t('installments.dayWord')}`
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    setTouchStart({
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      isScrolling: false,
    })
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart) return
    const touch = e.touches[0]
    const deltaX = Math.abs(touch.clientX - touchStart.x)
    const deltaY = Math.abs(touch.clientY - touchStart.y)
    
    // If moved more than 5px, it's definitely a scroll
    if (deltaX > 5 || deltaY > 5) {
      setTouchStart({ ...touchStart, isScrolling: true })
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return
    
    // Don't handle touch if clicking on a button or interactive element
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('a') || target.closest('[role="button"]')) {
      setTouchStart(null)
      return
    }
    
    // If we detected scrolling, don't treat as click
    if (touchStart.isScrolling) {
      setTouchStart(null)
      return
    }
    
    const touch = e.changedTouches[0]
    const deltaX = Math.abs(touch.clientX - touchStart.x)
    const deltaY = Math.abs(touch.clientY - touchStart.y)
    const deltaTime = Date.now() - touchStart.time
    
    // Increased threshold to 20px and 250ms
    if (deltaX > 20 || deltaY > 20 || deltaTime > 250) {
      setTouchStart(null)
      return
    }
    
    // It's a click - only prevent default at the very end
    e.preventDefault()
    e.stopPropagation()
    onClick()
    setTouchStart(null)
  }

  const handleClick = (e: React.MouseEvent) => {
    // Don't handle click if clicking on a button or interactive element
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('a') || target.closest('[role="button"]')) {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    onClick()
  }

              return (
    <Card 
      className="p-2.5 sm:p-3 hover:shadow-lg transition-all cursor-pointer border border-gray-200 hover:border-blue-400 bg-white rounded-lg h-full flex flex-col" 
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
    >
      <div className="space-y-2 flex-1 flex flex-col">
        {/* Header - Client Name & Status */}
        <div className="flex items-start justify-between gap-1.5 pb-2 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-xs sm:text-sm text-gray-900 truncate leading-tight mb-0.5">
              {sale.client?.name || t('shared.unknown')}
            </div>
            <div className="text-[10px] sm:text-xs text-gray-500 truncate">
              {sale.client?.id_number || ''}
            </div>
          </div>
          <div className="flex-shrink-0">
            {getStatusBadge()}
          </div>
        </div>

        {/* Piece & Date - Compact */}
        <div className="flex items-center justify-between text-[10px] sm:text-xs">
          <div className="flex items-center gap-1">
            <span className="text-gray-500">📋</span>
            <span className="font-semibold text-gray-900">{sale.piece?.piece_number || '-'}</span>
          </div>
          <div className="text-gray-500">
            {formatDateShort(sale.sale_date)}
          </div>
        </div>

        {/* Installments Progress - Compact & Visual */}
        <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-md p-2 border border-blue-200">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] sm:text-xs font-medium text-gray-700">{t('installments.installmentsLabel')}</span>
            <span className="font-bold text-sm sm:text-base text-blue-600">{stats.paidCount}/{stats.totalCount}</span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-blue-200 rounded-full h-1.5 mb-1">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all"
              style={{ width: `${stats.totalCount > 0 ? (stats.paidCount / stats.totalCount) * 100 : 0}%` }}
            />
          </div>
          {stats.nextDueDate && (
            <div className="text-[9px] sm:text-[10px] text-gray-600 truncate">
              ⏰ {formatDateShort(stats.nextDueDate)}
            </div>
          )}
        </div>

        {/* Financial Summary - Compact Grid */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="bg-green-50 rounded-md p-1.5 sm:p-2 border border-green-200">
            <div className="text-[9px] sm:text-[10px] text-gray-600 mb-0.5">💰 {t('installments.paidLabel')}</div>
            <div className="font-bold text-xs sm:text-sm text-green-700 leading-tight">{formatPrice(stats.totalPaid)}</div>
          </div>
          <div className="bg-gray-50 rounded-md p-1.5 sm:p-2 border border-gray-200">
            <div className="text-[9px] sm:text-[10px] text-gray-600 mb-0.5">📊 {t('installments.remainingLabel')}</div>
            <div className="font-bold text-xs sm:text-sm text-gray-800 leading-tight">{formatPrice(stats.remaining)}</div>
          </div>
        </div>

        {/* Overdue Alert - Compact */}
        {stats.overdueAmount > 0 && (
          <div className="bg-red-50 rounded-md p-1.5 sm:p-2 border border-red-300">
            <div className="flex items-center justify-between">
              <span className="text-[9px] sm:text-[10px] font-semibold text-red-700">⚠️ {t('installments.overdueLabel')}</span>
              <span className="font-bold text-xs sm:text-sm text-red-700">{formatPrice(stats.overdueAmount)}</span>
            </div>
          </div>
        )}

        {/* Action Button - Compact */}
        <div className="pt-1.5 mt-auto">
          <Button
            size="sm"
            variant="primary" 
            onClick={(e) => { 
              e.preventDefault()
              e.stopPropagation()
              onClick()
            }}
            className="w-full text-[10px] sm:text-xs py-1.5 px-2 font-semibold"
          >
            📋 {t('installments.viewDetails')}
          </Button>
        </div>
      </div>
    </Card>
  )
}
