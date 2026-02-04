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


export function ConfirmationPage() {
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
  const itemsPerPage = 20
  const prevBatchFilterRef = useRef<string>(batchFilter)

  useEffect(() => {
    loadAllBatches()
    return () => {}
  }, [])

  useEffect(() => {
    const pageToLoad = prevBatchFilterRef.current !== batchFilter ? 1 : currentPage
    if (prevBatchFilterRef.current !== batchFilter) {
      prevBatchFilterRef.current = batchFilter
      setCurrentPage(1)
    }
    loadPendingSales(pageToLoad)
  }, [currentPage, batchFilter, allBatches.length])

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

  async function loadPendingSales(overridePage?: number) {
    const page = overridePage ?? currentPage
    if (sales.length === 0 && !loading) setLoading(true)
    setError(null)
    try {
      const from = (page - 1) * itemsPerPage
      const to = from + itemsPerPage - 1
      const batchId = batchFilter === 'all' ? null : allBatches.find(b => b.name === batchFilter)?.id

      let query = supabase
        .from('sales')
        .select(buildSaleQuery())
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .range(from, to)
        .limit(itemsPerPage)
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
      
      // Debug: Log all installment sales and their payment_offer status (development only)
      if (process.env.NODE_ENV === 'development') {
        const installmentSales = formattedSales.filter(s => s.payment_method === 'installment')
        if (installmentSales.length > 0) {
          console.log('All installment sales after processing:', installmentSales.map(s => ({
            sale_id: s.id,
            payment_offer_id: s.payment_offer_id,
            has_payment_offer: !!s.payment_offer,
            payment_offer: s.payment_offer
          })))
        }
      }

      // Group sales by client + payment_method + payment_offer_id (for installments)
      const groupedSales = new Map<string, Sale[]>()
      
      formattedSales.forEach((sale) => {
        const groupKey = sale.payment_method === 'installment' && sale.payment_offer_id
          ? `${sale.client_id}-${sale.payment_method}-${sale.payment_offer_id}`
          : `${sale.client_id}-${sale.payment_method}`
        
        if (!groupedSales.has(groupKey)) {
          groupedSales.set(groupKey, [])
      }
        groupedSales.get(groupKey)!.push(sale)
      })

      const salesGroups = Array.from(groupedSales.values())
      setSales(formattedSales)
      setGroupedSales(salesGroups)

      // Approximate total count from this page
      const loaded = (data || []).length
      if (loaded === itemsPerPage) {
        setTotalCount((page * itemsPerPage) + 1)
      } else {
        setTotalCount((page - 1) * itemsPerPage + loaded)
      }
      // Exact count in background (same filters)
      const countQuery = batchId
        ? supabase.from('sales').select('*', { count: 'exact', head: true }).eq('status', 'pending').eq('batch_id', batchId)
        : supabase.from('sales').select('*', { count: 'exact', head: true }).eq('status', 'pending')
      void Promise.resolve(countQuery).then((res: { count: number | null }) => {
        if (res.count != null) setTotalCount(res.count)
      }).catch(() => {})
    } catch (e: any) {
      setError(e.message || 'فشل تحميل المبيعات المعلقة')
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

  // Filter grouped sales (client-side search on current page)
  const filteredGroupedSales = useMemo(() => {
    return groupedSales.filter(salesGroup => {
      const firstSale = salesGroup[0]
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesClient = firstSale.client?.name?.toLowerCase().includes(query) || 
                             firstSale.client?.id_number?.includes(query) ||
                             firstSale.client?.phone?.includes(query)
        const matchesPiece = salesGroup.some(s => s.piece?.piece_number?.toLowerCase().includes(query))
        const matchesBatch = firstSale.batch?.name?.toLowerCase().includes(query)
        if (!matchesClient && !matchesPiece && !matchesBatch) {
          return false
        }
      }

      // Batch filter
      if (batchFilter !== 'all' && firstSale.batch?.name !== batchFilter) {
        return false
      }

              return true
    })
  }, [groupedSales, searchQuery, batchFilter])

  function getConfirmButtonText(sale: Sale): string {
    if (sale.payment_method === 'promise' && sale.partial_payment_amount) {
      return 'استكمال الوعد بالبيع'
    }
    if (sale.payment_method === 'promise' && !sale.partial_payment_amount) {
      return 'تأكيد وعد بالبيع'
    }
    if (sale.payment_method === 'installment') {
      return 'تأكيد بيع بالتقسيط'
    }
    if (sale.payment_method === 'full') {
      return 'تأكيد بيع نقدي'
    }
    return 'تأكيد البيع'
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
      const clientName = sale.client?.name || 'عميل غير معروف'
      const pieceNumber = sale.piece?.piece_number || 'غير معروف'
      const batchName = sale.batch?.name || 'غير معروف'
      
      await notifyOwners(
        'sale_cancelled',
        'تم إلغاء البيع',
        `تم إلغاء بيع القطعة ${pieceNumber} للعميل ${clientName} من دفعة ${batchName}`,
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

      setSuccessMessage('تم إلغاء البيع بنجاح')
      setShowSuccessDialog(true)
      setCancelDialogOpen(false)
      setSaleToCancel(null)
      loadPendingSales()
      window.dispatchEvent(new CustomEvent('saleUpdated'))
      window.dispatchEvent(new CustomEvent('pieceStatusChanged'))
    } catch (e: any) {
      setErrorMessage(e.message || 'فشل إلغاء البيع')
      setShowErrorDialog(true)
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="container mx-auto px-2 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 max-w-7xl">
      {/* Header - always visible so page opens fast */}
      <div className="mb-3 sm:mb-4 lg:mb-6">
        <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 mb-1">التأكيدات</h1>
        <p className="text-xs sm:text-sm text-gray-600">المراجعة وتأكيد المبيعات المعلقة</p>
      </div>

      {error && (
        <div className="mb-4">
          <Alert variant="error" className="text-xs sm:text-sm">{error}</Alert>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2" />
            <p className="text-sm text-gray-500">جاري تحميل المبيعات المعلقة...</p>
          </div>
        </div>
      ) : (
        <>
      {/* Filters - Compact */}
      {groupedSales.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-2 sm:p-3 mb-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input
              type="text"
              placeholder="🔍 بحث (عميل، قطعة، دفعة)..."
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
              <option value="all" className="text-gray-900">جميع الدفعات</option>
              {batches.map(batch => (
                <option key={batch} value={batch} className="text-gray-900">{batch}</option>
              ))}
            </Select>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-600 flex-wrap gap-2">
            {searchQuery ? (
              <span>النتائج على هذه الصفحة: {filteredGroupedSales.length} من {groupedSales.length}</span>
            ) : (
              <span>عرض {groupedSales.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} -{' '}
                {Math.min(currentPage * itemsPerPage, totalCount)} من {totalCount}</span>
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
                إعادة تعيين
            </Button>
            )}
          </div>
                  </div>
      )}

      {filteredGroupedSales.length === 0 ? (
        <Card className="p-6 sm:p-8 text-center">
          <p className="text-sm sm:text-base text-gray-500">
            {groupedSales.length === 0 ? 'لا توجد مبيعات معلقة تحتاج للتأكيد' : 'لا توجد نتائج للبحث'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {filteredGroupedSales.flatMap((salesGroup, groupIndex) => {
            // Calculate overdue status helper
            const getDeadlineStatus = (sale: Sale) => {
              if (!sale.deadline_date) return null
              const deadline = new Date(sale.deadline_date)
              const now = new Date()
              const diffMs = now.getTime() - deadline.getTime()
              const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
              return diffMs > 0 ? { overdue: true, days: diffDays } : { overdue: false, days: Math.abs(diffDays) }
            }
            
            // Format sale date and time
            const formatSaleDateTime = (dateStr: string) => {
              const date = new Date(dateStr)
              const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
              const day = date.getDate()
              const month = months[date.getMonth()]
              const year = date.getFullYear()
              const hours = date.getHours().toString().padStart(2, '0')
              const minutes = date.getMinutes().toString().padStart(2, '0')
              return `${day} ${month} ${year} ${hours}:${minutes}`
            }
            
            return salesGroup.map((sale, saleIdx) => {
              const isFull = sale.payment_method === 'full'
              const isInstallment = sale.payment_method === 'installment'
              const isPromise = sale.payment_method === 'promise'
              
              // IMPORTANT: This page only shows PENDING sales
              // Commission (company_fee_amount) is ONLY set during confirmation dialog
              // Commission is NOT shown or calculated here - it's entered manually during confirmation
              
              // Calculate received and remaining
              const received = isPromise 
                ? (sale.partial_payment_amount || sale.deposit_amount || 0)
                : (sale.deposit_amount || 0)
              const remaining = isPromise
                ? (sale.remaining_payment_amount || (sale.sale_price - (sale.partial_payment_amount || sale.deposit_amount || 0)))
                : (sale.sale_price - (sale.deposit_amount || 0))
              
              const deadlineStatus = getDeadlineStatus(sale)
              
              // Determine card color scheme based on sale type
              const cardColorScheme = isInstallment 
                ? 'from-blue-500 to-blue-600' 
                : isPromise 
                ? 'from-purple-500 to-purple-600'
                : 'from-green-500 to-green-600'
              
              return (
                <Card key={`sale-${sale.id}`} className="overflow-hidden hover:shadow-xl transition-all duration-300 border-0 shadow-lg mb-4 bg-gradient-to-br from-white to-gray-50">
                  {/* Modern Header with Gradient */}
                  <div className={`bg-gradient-to-r ${cardColorScheme} p-4 text-white relative overflow-hidden`}>
                    {/* Decorative Pattern */}
                    <div className="absolute inset-0 opacity-10">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-full -mr-16 -mt-16"></div>
                      <div className="absolute bottom-0 left-0 w-24 h-24 bg-white rounded-full -ml-12 -mb-12"></div>
                        </div>
                    
                    <div className="relative z-10">
                      {/* Top Row - Client Info */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold mb-1 truncate">
                            {sale.client?.name || 'غير محدد'}
                          </div>
                          <div className="text-xs opacity-90 flex items-center gap-2 flex-wrap">
                            <span>#{sale.id.substring(0, 8)}</span>
                            <span className="opacity-60">•</span>
                            <span>{sale.client?.id_number || ''}</span>
                </div>
              </div>

                        {/* Status Badges */}
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          {deadlineStatus?.overdue && (
                            <Badge className="bg-red-100 text-red-800 border border-red-200 text-xs px-2.5 py-1 font-semibold">
                              ⚠️ تجاوز {deadlineStatus.days} يوم
                            </Badge>
                          )}
                          <div className="flex items-center gap-1 flex-wrap justify-end">
                          {isPromise && (
                              <Badge className="bg-purple-100 text-purple-800 border border-purple-200 text-xs px-2 py-0.5 font-medium">
                              وعد بالبيع
                            </Badge>
                          )}
                          {isInstallment && (
                              <Badge className="bg-blue-100 text-blue-800 border border-blue-200 text-xs px-2 py-0.5 font-medium">
                              تقسيط
                            </Badge>
                          )}
                          {sale.status === 'pending' && (
                              <Badge className="bg-amber-100 text-amber-800 border border-amber-200 text-xs px-2 py-0.5 font-medium">
                              محجوز
                            </Badge>
                          )}
                        </div>
                        </div>
                      </div>
                      
                      {/* Bottom Row - Sale Info */}
                      <div className="text-xs opacity-90 border-t border-white/20 pt-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>📅 {formatSaleDateTime(sale.sale_date)}</span>
                          <span className="opacity-60">•</span>
                          <span>👤 باعه {sale.seller?.name || 'غير محدد'}</span>
                          {sale.seller?.place && <span className="opacity-75">({sale.seller.place})</span>}
                        </div>
                        {sale.confirmedBy?.name && (
                          <div className="mt-1 text-xs opacity-80">
                            ✓ أكده {sale.confirmedBy.name}{sale.confirmedBy.place ? ` (${sale.confirmedBy.place})` : ''}
                          </div>
                        )}
                      </div>
                  </div>
                </div>

                  {/* Content Section - Modern Design */}
                  <div className="p-4 bg-white">
                    {/* Piece Info - Prominent */}
                    <div className="mb-4 pb-4 border-b border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-base sm:text-lg font-bold text-gray-900">
                          {sale.batch?.name || '-'}
                      </h4>
                        <div className="text-sm font-semibold text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                          #{sale.piece?.piece_number || '-'}
                  </div>
                </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="font-medium">المساحة:</span>
                        <span className="text-gray-900 font-semibold">{sale.piece?.surface_m2.toLocaleString('en-US')} م²</span>
                  </div>
                  </div>
                      
                    {/* Financial Info - Modern Cards */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {/* Price Card */}
                      <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-3 border border-red-200">
                        <div className="text-xs text-red-700 font-medium mb-1">السعر الكلي</div>
                        <div className="text-lg font-bold text-red-700">{formatPrice(sale.sale_price)} DT</div>
                    </div>
                      
                      {/* Received Card */}
                      <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-3 border border-green-200">
                        <div className="text-xs text-green-700 font-medium mb-1">المستلم</div>
                        <div className="text-lg font-bold text-green-700">{formatPrice(received)} DT</div>
                </div>
                      
                      {/* Deposit Card */}
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3 border border-blue-200">
                        <div className="text-xs text-blue-700 font-medium mb-1">العربون</div>
                        <div className="text-lg font-bold text-blue-700">{formatPrice(sale.deposit_amount || 0)} DT</div>
                      </div>
                      
                      {/* Remaining Card - Highlighted */}
                      <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-3 border-2 border-orange-300 shadow-sm">
                        <div className="text-xs text-orange-700 font-medium mb-1">المتبقي</div>
                        <div className="text-lg font-bold text-orange-700">{formatPrice(remaining)} DT</div>
                  </div>
                    </div>
              </div>

                  {/* Action Buttons - Modern Design */}
                  <div className="bg-gray-50 p-4 border-t border-gray-200">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <Button
                  size="sm"
                        className={`${getConfirmButtonColor(sale)} text-white text-xs px-3 py-2.5 font-semibold shadow-md hover:shadow-lg transition-all`}
                        onClick={() => {
                          setSelectedSale(sale)
                          setConfirmDialogOpen(true)
                        }}
                      >
                        ✅ {getConfirmButtonText(sale)}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                        className="text-xs px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 font-medium transition-all"
                        onClick={() => {
                          setSelectedSale(sale)
                          setSaleDetailsDialogOpen(true)
                        }}
                      >
                        📋 تفاصيل
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                        className="text-xs px-3 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold shadow-md hover:shadow-lg transition-all"
                        onClick={async () => {
                          setSaleToCancel(sale)
                          setCancelDialogOpen(true)
                        }}
                      >
                        ❌ إلغاء
                </Button>
                <Button
                        variant="secondary"
                  size="sm"
                        className="text-xs px-3 py-2.5 bg-white hover:bg-gray-100 border-2 border-gray-300 text-gray-700 font-semibold shadow-sm hover:shadow-md transition-all"
                  onClick={() => {
                    setSelectedSale(sale)
                          const tomorrow = new Date()
                          tomorrow.setDate(tomorrow.getDate() + 1)
                          setAppointmentDate(tomorrow.toISOString().split('T')[0])
                          setAppointmentTime('09:00')
                          setAppointmentNotes('')
                          setAppointmentDialogOpen(true)
                        }}
                      >
                        📅 موعد
                </Button>
                <Button
                        variant="secondary"
                  size="sm"
                        className="text-xs px-3 py-2.5 bg-white hover:bg-gray-100 border-2 border-gray-300 text-gray-700 font-semibold shadow-sm hover:shadow-md transition-all"
                        onClick={() => {
                          setSelectedSale(sale)
                          setEditDialogOpen(true)
                        }}
                      >
                        ✏️ تعديل
                </Button>
                    </div>
              </div>
            </Card>
              )
            })
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
            السابق
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
            التالي
          </Button>
        </div>
      )}
        </>
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
            loadPendingSales()
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
            loadPendingSales()
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
          onSave={() => {
            loadPendingSales()
            setSuccessMessage('تم تحديث تفاصيل البيع بنجاح')
            setShowSuccessDialog(true)
            window.dispatchEvent(new CustomEvent('saleUpdated'))
          }}
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
          title="موعد البيع (Rendez-vous de vente)"
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
              إلغاء
            </Button>
            <Button
                onClick={async () => {
                  if (!selectedSale || !appointmentDate || !appointmentTime) return

                  // Validate client_id exists
                  if (!selectedSale.client_id) {
                    setErrorMessage('خطأ: البيع المحدد لا يحتوي على معرف عميل. يرجى التحقق من بيانات البيع.')
                    setShowErrorDialog(true)
                    return
                  }

                  setSavingAppointment(true)
                  try {
                    // Create appointment record
                    const { error: appointmentError } = await supabase
                      .from('appointments')
                      .insert({
                        sale_id: selectedSale.id,
                        client_id: selectedSale.client_id,
                        appointment_date: appointmentDate,
                        appointment_time: appointmentTime,
                        notes: appointmentNotes.trim() || null,
                        status: 'scheduled',
                      })

                    if (appointmentError) throw appointmentError

                    // Notify owners about appointment creation
                    const clientName = selectedSale.client?.name || 'عميل غير معروف'
                    const pieceNumber = selectedSale.piece?.piece_number || 'غير معروف'
                    
                    await notifyOwners(
                      'appointment_created',
                      'موعد جديد',
                      `تم إنشاء موعد جديد للعميل ${clientName} للقطعة ${pieceNumber} في ${appointmentDate} الساعة ${appointmentTime}`,
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

                    setSuccessMessage('تم حفظ الموعد بنجاح!')
                    setShowSuccessDialog(true)
                    setAppointmentDialogOpen(false)
                    setSelectedSale(null)
                    setAppointmentDate('')
                    setAppointmentTime('')
                    setAppointmentNotes('')
                    loadPendingSales()
                  } catch (e: any) {
                    setErrorMessage(e.message || 'فشل حفظ الموعد')
                    setShowErrorDialog(true)
                  } finally {
                    setSavingAppointment(false)
                  }
                }} 
                disabled={savingAppointment || !appointmentDate || !appointmentTime} 
                className="bg-green-600 hover:bg-green-700 active:bg-green-800 focus-visible:ring-green-500"
              >
                {savingAppointment ? 'جاري الحفظ...' : 'حفظ الموعد'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {selectedSale && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1.5 text-sm">
              <p><span className="font-medium">العميل:</span> {selectedSale.client?.name || 'غير محدد'}</p>
              <p><span className="font-medium">رقم البيع:</span> #{selectedSale.id.substring(0, 8)}</p>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-xs sm:text-sm">
              التاريخ * <span className="text-red-500">*</span>
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
              الوقت * <span className="text-red-500">*</span>
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
            <Label className="text-xs sm:text-sm">ملاحظات</Label>
            <Textarea
              value={appointmentNotes}
              onChange={(e) => setAppointmentNotes(e.target.value)}
              placeholder="ملاحظات إضافية حول الموعد..."
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
        title="نجح العملية"
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
        title="فشل العملية"
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
          title="إلغاء البيع"
          description={`هل أنت متأكد من إلغاء هذا البيع؟\n\nالقطعة: ${saleToCancel.batch?.name || '-'} - ${saleToCancel.piece?.piece_number || '-'}\n\nسيتم:\n- إلغاء البيع\n- إرجاع القطعة إلى الحالة المتاحة\n- إزالة جميع الأموال المرتبطة من صفحة المالية`}
          confirmText={cancelling ? 'جاري الإلغاء...' : 'نعم، إلغاء'}
        cancelText="إلغاء"
          variant="destructive"
          disabled={cancelling}
          loading={cancelling}
      />
      )}
    </div>
  )
}
