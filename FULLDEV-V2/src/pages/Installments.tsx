import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { formatPrice, formatDateShort } from '@/utils/priceCalculator'
import { calculateInstallmentWithDeposit } from '@/utils/installmentCalculator'
import { buildSaleQuery, formatSalesWithSellers } from '@/utils/salesQueries'
import { InstallmentDetailsDialog } from '@/components/InstallmentDetailsDialog'

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

interface InstallmentsPageProps {
  onNavigate?: (page: string) => void
}

export function InstallmentsPage({ onNavigate }: InstallmentsPageProps) {
  const [sales, setSales] = useState<Sale[]>([])
  const [groupedSales, setGroupedSales] = useState<Sale[][]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

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

      // Group sales by client + payment_offer_id (for current page only)
      const groupedSalesMap = new Map<string, Sale[]>()
      
      formattedSales.forEach((sale) => {
        const groupKey = sale.payment_offer_id
          ? `${sale.client_id}-${sale.payment_offer_id}`
          : `${sale.client_id}-no-offer`
        
        if (!groupedSalesMap.has(groupKey)) {
          groupedSalesMap.set(groupKey, [])
        }
        groupedSalesMap.get(groupKey)!.push(sale)
      })

      const salesGroups = Array.from(groupedSalesMap.values())
      setSales(salesGroups.flat())
      setGroupedSales(salesGroups)

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
      setError(e.message || 'فشل تحميل المبيعات بالتقسيط')
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
          <h1 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900">الأقساط</h1>
          {onNavigate && (
            <Button type="button" variant="secondary" size="sm" onClick={() => onNavigate('confirmation')}>
              انتقل إلى التأكيدات
            </Button>
          )}
        </div>
        {totalCount > 0 && (
          <span className="text-xs sm:text-sm text-gray-600">
            عرض {sales.length > 0 ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0} -{' '}
            {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} من {totalCount}
          </span>
        )}
      </div>

      {error && (
        <Alert variant="error" className="text-xs sm:text-sm">{error}</Alert>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 min-h-[120px]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            <p className="mt-2 text-xs text-gray-500">جاري التحميل...</p>
          </div>
        </div>
      ) : groupedSales.length === 0 ? (
        <Card className="p-3 sm:p-4 lg:p-6 text-center">
          <p className="text-xs sm:text-sm text-gray-500">لا توجد مبيعات بالتقسيط</p>
        </Card>
      ) : (
        <>
        <div className="space-y-2 sm:space-y-3">
          {groupedSales.map((salesGroup, groupIndex) => {
            const firstSale = salesGroup[0]
            const canGroupTogether = salesGroup.length > 1 && 
              salesGroup.every(s => s.client_id === firstSale.client_id) &&
              salesGroup.every(s => s.payment_offer_id === firstSale.payment_offer_id)

            if (canGroupTogether) {
              // Render as grouped card - mobile optimized
              return (
                <Card key={`group-${groupIndex}`} className="p-2 sm:p-3 lg:p-4 hover:shadow-md transition-shadow">
                  <div className="mb-2 sm:mb-3">
                    <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-1">
                      <h3 className="text-sm sm:text-base font-semibold text-gray-900 truncate">
                        {firstSale.client?.name || 'غير محدد'}
                      </h3>
                      <Badge variant="info" size="sm" className="text-xs">
                        {salesGroup.length} {salesGroup.length === 1 ? 'قطعة' : 'قطع'}
                      </Badge>
                      {firstSale.payment_offer && (
                        <Badge variant="secondary" size="sm" className="text-xs">
                          {firstSale.payment_offer.name || 'عرض التقسيط'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{firstSale.client?.id_number || ''}</p>
                  </div>

                  {/* Mobile: Card layout, Desktop: Table layout */}
                  <div className="space-y-2 sm:space-y-2 lg:hidden">
                    {salesGroup.map((sale) => (
                      <SaleCard key={sale.id} sale={sale} onClick={() => handleSaleClick(sale)} />
                    ))}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b-2 border-gray-300 bg-gray-50">
                          <th className="text-right py-2 px-3 font-semibold text-xs">الصفقة</th>
                          <th className="text-right py-2 px-3 font-semibold text-xs">القطع</th>
                          <th className="text-right py-2 px-3 font-semibold text-xs">الأقساط</th>
                          <th className="text-right py-2 px-3 font-semibold text-xs">المدفوع</th>
                          <th className="text-right py-2 px-3 font-semibold text-xs">المتبقي</th>
                          <th className="text-right py-2 px-3 font-semibold text-xs">المتأخر</th>
                          <th className="text-right py-2 px-3 font-semibold text-xs">تاريخ الاستحقاق</th>
                          <th className="text-right py-2 px-3 font-semibold text-xs">الحالة</th>
                          <th className="text-right py-2 px-3 font-semibold text-xs">إجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salesGroup.map((sale) => (
                          <SaleRow key={sale.id} sale={sale} onClick={() => handleSaleClick(sale)} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )
            } else {
              // Render individual sales - mobile optimized
              return (
                <div key={`group-${groupIndex}`}>
                  {/* Mobile: Card layout */}
                  <div className="space-y-2 lg:hidden">
                    {salesGroup.map((sale) => (
                      <SaleCard key={sale.id} sale={sale} onClick={() => handleSaleClick(sale)} />
                    ))}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      {groupIndex === 0 && (
                        <thead>
                          <tr className="border-b-2 border-gray-300 bg-gray-50">
                            <th className="text-right py-2 px-3 font-semibold text-xs">العميل</th>
                            <th className="text-right py-2 px-3 font-semibold text-xs">الصفقة</th>
                            <th className="text-right py-2 px-3 font-semibold text-xs">القطع</th>
                            <th className="text-right py-2 px-3 font-semibold text-xs">الأقساط</th>
                            <th className="text-right py-2 px-3 font-semibold text-xs">المدفوع</th>
                            <th className="text-right py-2 px-3 font-semibold text-xs">المتبقي</th>
                            <th className="text-right py-2 px-3 font-semibold text-xs">المتأخر</th>
                            <th className="text-right py-2 px-3 font-semibold text-xs">تاريخ الاستحقاق</th>
                            <th className="text-right py-2 px-3 font-semibold text-xs">الحالة</th>
                            <th className="text-right py-2 px-3 font-semibold text-xs">إجراء</th>
                          </tr>
                        </thead>
                      )}
                      <tbody>
                        {salesGroup.map((sale) => (
                          <SaleRow key={sale.id} sale={sale} onClick={() => handleSaleClick(sale)} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
            )
            }
          })}
        </div>

        {/* Pagination - same style as إدارة العملاء */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap mt-4">
            <Button variant="secondary" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={!hasPrevPage} className="text-xs sm:text-sm py-1.5 px-2">
              السابق
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
              التالي
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
          جاري التحميل...
        </td>
      </tr>
    )
  }

  if (!stats) return null

  const getStatusBadge = () => {
    if (stats.overdueCount > 0) {
      return <Badge variant="danger" size="sm" className="text-xs">⚠️ متأخر</Badge>
    }
    if (stats.nextDueDate) {
      const daysUntilDue = Math.ceil(
        (new Date(stats.nextDueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      )
      if (daysUntilDue <= 7) {
        return <Badge variant="warning" size="sm" className="text-xs">⏰ قريب الاستحقاق</Badge>
      }
    }
    return <Badge variant="success" size="sm" className="text-xs">🟢 على المسار</Badge>
  }

  const formatNextDueDate = () => {
    if (!stats.nextDueDate) return '-'
    const date = new Date(stats.nextDueDate)
    const now = new Date()
    const daysDiff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (daysDiff < 0) return `(${Math.abs(daysDiff)} يوم)`
    if (daysDiff === 0) return '(اليوم)'
    return `(${daysDiff} يوم)`
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
          عرض التفاصيل
                      </Button>
      </td>
    </tr>
            )
}

// Mobile-optimized card component
function SaleCard({ sale, onClick }: { sale: Sale; onClick: () => void }) {
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
        <div className="text-center py-2 text-xs text-gray-500">جاري التحميل...</div>
              </Card>
            )
  }

  if (!stats) return null

  const getStatusBadge = () => {
    if (stats.overdueCount > 0) {
      return <Badge variant="danger" size="sm" className="text-xs">⚠️ متأخر</Badge>
    }
    if (stats.nextDueDate) {
      const daysUntilDue = Math.ceil(
        (new Date(stats.nextDueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      )
      if (daysUntilDue <= 7) {
        return <Badge variant="warning" size="sm" className="text-xs">⏰ قريب</Badge>
        }
    }
    return <Badge variant="success" size="sm" className="text-xs">🟢 على المسار</Badge>
  }

  const formatNextDueDate = () => {
    if (!stats.nextDueDate) return '-'
    const date = new Date(stats.nextDueDate)
    const now = new Date()
    const daysDiff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysDiff < 0) return `${Math.abs(daysDiff)} يوم`
    if (daysDiff === 0) return 'اليوم'
    return `${daysDiff} يوم`
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
      className="p-2 hover:shadow-md transition-shadow cursor-pointer" 
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
    >
      <div className="space-y-1.5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-xs text-gray-900 truncate">
              {sale.client?.name || 'غير محدد'}
                      </div>
            <div className="text-xs text-gray-500">{sale.client?.id_number || ''}</div>
                      </div>
          {getStatusBadge()}
                      </div>

        {/* Piece info */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-600">القطعة:</span>
          <span className="font-medium">{sale.piece?.piece_number || '-'}</span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-600">التاريخ:</span>
          <span>{formatDateShort(sale.sale_date)}</span>
                          </div>

        {/* Installments progress */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-600">الأقساط:</span>
            <span className="font-semibold">{stats.paidCount}/{stats.totalCount}</span>
                        </div>
          {stats.nextDueDate && (
            <div className="text-gray-500">
              {formatDateShort(stats.nextDueDate)} ({formatNextDueDate()})
          </div>
        )}
          </div>

        {/* Amounts */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-100">
                <div>
            <div className="text-xs text-gray-500">المدفوع</div>
            <div className="font-semibold text-xs text-green-600">{formatPrice(stats.totalPaid)} DT</div>
                </div>
                <div>
            <div className="text-xs text-gray-500">المتبقي</div>
            <div className="font-semibold text-xs text-gray-700">{formatPrice(stats.remaining)} DT</div>
                </div>
                </div>

        {/* Overdue */}
        {stats.overdueAmount > 0 && (
          <div className="pt-1 border-t border-red-100">
            <div className="flex items-center justify-between">
              <span className="text-xs text-red-600 font-semibold">المتأخر:</span>
              <span className="text-xs text-red-600 font-semibold">{formatPrice(stats.overdueAmount)} DT</span>
              </div>
            </div>
        )}

        {/* Action button */}
        <div className="pt-1">
                            <Button
                              size="sm"
            variant="secondary" 
            onClick={(e) => { 
              e.preventDefault()
              e.stopPropagation()
              onClick()
                              }}
            className="w-full text-xs py-1"
          >
            📋 عرض التفاصيل
                            </Button>
            </div>
          </div>
    </Card>
  )
}
