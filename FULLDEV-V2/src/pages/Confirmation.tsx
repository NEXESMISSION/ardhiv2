import { useState, useEffect, useMemo } from 'react'
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

  useEffect(() => {
    loadPendingSales()
    
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

  async function loadPendingSales() {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('sales')
        .select(buildSaleQuery())
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

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
    } catch (e: any) {
      setError(e.message || 'فشل تحميل المبيعات المعلقة')
    } finally {
      setLoading(false)
        }
      }

  // Get unique batches for filter
  const batches = useMemo(() => {
    const batchSet = new Set<string>()
    sales.forEach(sale => {
      if (sale.batch?.name) {
        batchSet.add(sale.batch.name)
      }
    })
    return Array.from(batchSet).sort()
  }, [sales])

  // Filter grouped sales
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
          <p className="text-sm text-gray-500">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-2 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 max-w-7xl">
      {/* Header */}
      <div className="mb-3 sm:mb-4 lg:mb-6">
        <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 mb-1">التأكيدات</h1>
        <p className="text-xs sm:text-sm text-gray-600">المراجعة وتأكيد المبيعات المعلقة</p>
      </div>

      {error && (
        <div className="mb-4">
          <Alert variant="error" className="text-xs sm:text-sm">{error}</Alert>
        </div>
      )}

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
              className="text-xs sm:text-sm"
            >
              <option value="all">جميع الدفعات</option>
              {batches.map(batch => (
                <option key={batch} value={batch}>{batch}</option>
              ))}
            </Select>
          </div>
          {(searchQuery || batchFilter !== 'all') && (
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>النتائج: {filteredGroupedSales.length} من {groupedSales.length}</span>
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
          </div>
          )}
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
              
              return (
                <Card key={`sale-${sale.id}`} className="overflow-hidden hover:shadow-md transition-shadow border border-gray-200 mb-3">
                  {/* Header Section - Compact */}
                  <div className="bg-blue-50 border-b border-blue-200 p-2 sm:p-2.5">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      {/* Right Side - Client and Sale Info */}
                      <div className="flex-1 space-y-0.5 min-w-0">
                        <div className="text-xs sm:text-sm font-semibold text-gray-900 truncate">
                          ({sale.client?.id_number || ''}) #{sale.id.substring(0, 8)} - {sale.client?.name || 'غير محدد'}
                        </div>
                        <div className="text-xs text-gray-600">
                          {formatSaleDateTime(sale.sale_date)} باعه {sale.seller?.name || 'غير محدد'}
                          {sale.seller?.place && ` (${sale.seller.place})`}
                          {sale.confirmedBy?.name && ` • أكده ${sale.confirmedBy.name}${sale.confirmedBy.place ? ` (${sale.confirmedBy.place})` : ''}`}
                </div>
              </div>

                      {/* Left Side - Status Badges and Remaining */}
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <div className="flex items-center gap-1 flex-wrap justify-end">
                          {deadlineStatus?.overdue && (
                            <Badge className="bg-red-600 text-white border-0 text-xs px-2 py-0.5 font-medium">
                              ⚠️ تجاوز {deadlineStatus.days} يوم
                            </Badge>
                          )}
                          {isPromise && (
                            <Badge className="bg-purple-600 text-white border-0 text-xs px-2 py-0.5 font-medium">
                              وعد بالبيع
                            </Badge>
                          )}
                          {isInstallment && (
                            <Badge className="bg-blue-600 text-white border-0 text-xs px-2 py-0.5 font-medium">
                              تقسيط
                            </Badge>
                          )}
                          {sale.status === 'pending' && (
                            <Badge className="bg-orange-500 text-white border-0 text-xs px-2 py-0.5 font-medium">
                              محجوز
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs sm:text-sm font-bold text-gray-900">
                          متبقي: {formatPrice(remaining)} DT
                        </div>
                      </div>
                  </div>
                </div>

                  {/* Content Section - Compact */}
                  <div className="p-2 sm:p-2.5 bg-white">
                    {/* Piece Info - Compact */}
                    <div className="mb-2">
                      <h4 className="text-sm sm:text-base font-bold text-gray-900">
                        {sale.batch?.name || '-'} - {sale.piece?.piece_number || '-'}
                      </h4>
                      <p className="text-xs text-gray-600">
                        {sale.piece?.surface_m2.toLocaleString('en-US')} م²
                    </p>
                  </div>
                    
                    {/* Financial Table - Compact 2 columns */}
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-2">
                      {/* Right Column */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-600">السعر:</span>
                          <span className="text-xs sm:text-sm font-bold text-red-600">{formatPrice(sale.sale_price)} DT</span>
                </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-600">المستلم:</span>
                          <span className="text-xs sm:text-sm font-bold text-gray-900">{formatPrice(received)} DT</span>
                  </div>
                  </div>
                      
                      {/* Left Column */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-600">العربون:</span>
                          <span className="text-xs sm:text-sm font-bold text-blue-600">{formatPrice(sale.deposit_amount || 0)} DT</span>
                    </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-600">المتبقي:</span>
                          <span className="text-xs sm:text-sm font-bold text-red-600">{formatPrice(remaining)} DT</span>
                </div>
                  </div>
                    </div>
              </div>

                  {/* Action Buttons Section - Compact */}
                  <div className="border-t border-gray-200 p-2 sm:p-2.5 bg-gray-50">
                    <div className="text-xs font-medium text-gray-700 mb-2">إجراء</div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  className={`flex-1 sm:flex-initial ${getConfirmButtonColor(sale)} text-white text-xs px-3 py-1.5 font-medium`}
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
                  className="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-medium"
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
                  className="text-xs px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-medium"
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
                  className="text-xs px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-medium"
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

      {/* Edit Sale Dialog */}
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
