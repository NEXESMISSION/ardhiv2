import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatPrice } from '@/utils/priceCalculator'
import { getPaymentTypeLabel } from '@/utils/paymentTerms'
import { calculateInstallmentWithDeposit } from '@/utils/installmentCalculator'
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
  notes: string | null
  created_at: string
  sold_by: string | null
  client?: {
    id: string
    name: string
    id_number: string
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
  confirmedBy?: {
    id: string
    name: string
    place: string | null
  }
}

export function SalesRecordsPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [selectedSales, setSelectedSales] = useState<Set<string>>(new Set())
  const [actionType, setActionType] = useState<'revert' | 'cancel' | 'revertFromInstallments' | 'remove' | null>(null)
  const [processing, setProcessing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('all')
  const [batchFilter, setBatchFilter] = useState<string>('all')

  useEffect(() => {
    loadAllSales()

    const handleSaleCreated = () => {
      loadAllSales()
    }

    const handleSaleUpdated = () => {
      loadAllSales()
    }

    window.addEventListener('saleCreated', handleSaleCreated)
    window.addEventListener('saleUpdated', handleSaleUpdated)

    return () => {
      window.removeEventListener('saleCreated', handleSaleCreated)
      window.removeEventListener('saleUpdated', handleSaleUpdated)
    }
  }, [])

  async function loadAllSales() {
    // Optimistic: don't show loading if we already have data
    if (sales.length === 0) {
    setLoading(true)
    }
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('sales')
        .select(buildSaleQuery())
        .order('created_at', { ascending: false })
        .limit(1000) // Limit for performance

      if (err) throw err

      const formattedSales = await formatSalesWithSellers(data || [])

      setSales(formattedSales)
    } catch (e: any) {
      setError(e.message || 'فشل تحميل سجل المبيعات')
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

  // Filter sales
  const filteredSales = useMemo(() => {
    return sales.filter(sale => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesClient = sale.client?.name?.toLowerCase().includes(query) || 
                             sale.client?.id_number?.includes(query)
        const matchesPiece = sale.piece?.piece_number?.toLowerCase().includes(query)
        const matchesBatch = sale.batch?.name?.toLowerCase().includes(query)
        if (!matchesClient && !matchesPiece && !matchesBatch) {
          return false
        }
      }

      // Status filter
      if (statusFilter !== 'all' && sale.status !== statusFilter) {
        return false
      }

      // Payment method filter
      if (paymentMethodFilter !== 'all' && sale.payment_method !== paymentMethodFilter) {
        return false
      }

      // Batch filter
      if (batchFilter !== 'all' && sale.batch?.name !== batchFilter) {
        return false
      }

      return true
    })
  }, [sales, searchQuery, statusFilter, paymentMethodFilter, batchFilter])

  async function getTotalPaidAmount(sale: Sale): Promise<number> {
    let totalPaid = sale.deposit_amount || 0

    // If sale is completed, calculate what was paid
    if (sale.status === 'completed') {
      // For installment sales, calculate advance payment
      if (sale.payment_method === 'installment' && sale.payment_offer && sale.piece) {
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
        const advanceAfterDeposit = calc.advanceAfterDeposit
        totalPaid += advanceAfterDeposit

        // Get installment payments
        const { data: installments } = await supabase
          .from('installment_payments')
          .select('amount_paid')
          .eq('sale_id', sale.id)
          .eq('status', 'paid')

        if (installments) {
          totalPaid += installments.reduce((sum, inst) => sum + (inst.amount_paid || 0), 0)
        }
      }

      // For promise sales
      if (sale.payment_method === 'promise' && sale.partial_payment_amount) {
        totalPaid += sale.partial_payment_amount - (sale.deposit_amount || 0)
      }

      // For full payment
      if (sale.payment_method === 'full') {
        totalPaid = sale.sale_price
      }
    }

    return totalPaid
  }

  function getActionDescription(sale: Sale, action: 'revert' | 'cancel' | 'revertFromInstallments' | 'remove'): string {
    if (action === 'remove') {
      return `⚠️ تحذير: سيتم حذف البيع نهائياً من قاعدة البيانات:
      
• سيتم حذف سجل البيع بالكامل
• سيتم حذف جميع الأقساط المرتبطة (إن وجدت)
• القطعة ستصبح متاحة للبيع مرة أخرى
• جميع المدفوعات المرتبطة ستُحذف

هذا الإجراء لا يمكن التراجع عنه!`
    }
    
    if (action === 'cancel') {
      return `سيتم إلغاء البيع بالكامل:
      
• القطعة ${sale.piece?.piece_number || 'غير محدد'} ستصبح متاحة للبيع مرة أخرى
• جميع الأموال المحصلة (${formatPrice(sale.deposit_amount || 0)} DT) ستعود للعميل
• سيتم إزالة البيع من صفحة المالية
• سيتم حذف جميع الأقساط المرتبطة (إن وجدت)

⚠️ تحذير: لا يمكن التراجع عن هذا الإجراء!`
    }

    if (action === 'revert') {
      return `سيتم إرجاع البيع إلى صفحة التأكيدات:
      
• حالة البيع ستصبح "معلق"
• سيتم الاحتفاظ بالعربون فقط (${formatPrice(sale.deposit_amount || 0)} DT)
• سيتم إزالة جميع الأموال الأخرى:
  ${sale.payment_method === 'installment' ? '  - التسبقة (إن تم دفعها)' : ''}
  ${sale.payment_method === 'installment' ? '  - جميع الأقساط المدفوعة' : ''}
  ${sale.payment_method === 'promise' && sale.partial_payment_amount ? '  - الجزء الأول من الدفع' : ''}
• القطعة ستبقى محجوزة حتى التأكيد النهائي`
    }

    if (action === 'revertFromInstallments') {
      return `سيتم إرجاع البيع من الأقساط إلى صفحة التأكيدات:
      
• حالة البيع ستصبح "معلق"
• سيتم الاحتفاظ بالعربون فقط (${formatPrice(sale.deposit_amount || 0)} DT)
• سيتم إزالة:
  - التسبقة (إن تم دفعها)
  - جميع الأقساط المدفوعة
• القطعة ستبقى محجوزة حتى التأكيد النهائي`
    }

    return ''
  }

  async function handleRevertToPending(salesToRevert?: Sale[]) {
    const sales = salesToRevert || (selectedSale ? [selectedSale] : getSelectedSalesArray())
    if (sales.length === 0) return

    setProcessing(true)
    setActionError(null)

    try {
      const saleIds = sales.map(s => s.id)

      // Update sales status to pending
      const { error: updateErr } = await supabase
        .from('sales')
        .update({ status: 'pending' })
        .in('id', saleIds)
        .eq('status', 'completed')

      if (updateErr) throw updateErr

      // Delete installment payments if any
      const installmentSales = sales.filter(s => s.payment_method === 'installment')
      if (installmentSales.length > 0) {
        const installmentSaleIds = installmentSales.map(s => s.id)
        await supabase
          .from('installment_payments')
          .delete()
          .in('sale_id', installmentSaleIds)
      }

      // Reset promise payment amounts if promise sale
      const promiseSales = sales.filter(s => s.payment_method === 'promise')
      if (promiseSales.length > 0) {
        const promiseSaleIds = promiseSales.map(s => s.id)
        await supabase
        .from('sales')
        .update({
            partial_payment_amount: null,
            remaining_payment_amount: null,
        })
          .in('id', promiseSaleIds)
      }

      alert(`✅ تم إرجاع ${sales.length} بيع إلى صفحة التأكيدات بنجاح`)
      setActionDialogOpen(false)
      setSelectedSale(null)
      setSelectedSales(new Set())
      setActionType(null)
      await loadAllSales()
      window.dispatchEvent(new CustomEvent('saleUpdated'))
    } catch (e: any) {
      setActionError(e.message || 'فشل إرجاع البيع')
    } finally {
      setProcessing(false)
    }
  }

  async function handleCancelSale(salesToCancel?: Sale[]) {
    const sales = salesToCancel || (selectedSale ? [selectedSale] : getSelectedSalesArray())
    if (sales.length === 0) return

    setProcessing(true)
    setActionError(null)

    try {
      const saleIds = sales.map(s => s.id)
      const pieceIds = sales.map(s => s.land_piece_id)

      // Update sales status to cancelled
      const { error: updateErr } = await supabase
              .from('sales')
        .update({ status: 'cancelled' })
        .in('id', saleIds)

      if (updateErr) throw updateErr

      // Make pieces available again
      const { error: pieceErr } = await supabase
              .from('land_pieces')
        .update({ status: 'Available', updated_at: new Date().toISOString() })
        .in('id', pieceIds)

      if (pieceErr) throw pieceErr

      // Delete installment payments if any
      const installmentSales = sales.filter(s => s.payment_method === 'installment')
      if (installmentSales.length > 0) {
        const installmentSaleIds = installmentSales.map(s => s.id)
            await supabase
          .from('installment_payments')
          .delete()
          .in('sale_id', installmentSaleIds)
      }

      alert(`✅ تم إلغاء ${sales.length} بيع بنجاح. القطع متاحة للبيع مرة أخرى.`)
      setActionDialogOpen(false)
      setSelectedSale(null)
      setSelectedSales(new Set())
      setActionType(null)
      await loadAllSales()
      window.dispatchEvent(new CustomEvent('saleUpdated'))
      window.dispatchEvent(new CustomEvent('pieceStatusChanged'))
    } catch (e: any) {
      setActionError(e.message || 'فشل إلغاء البيع')
    } finally {
      setProcessing(false)
    }
  }

  async function handleRemoveSale(salesToRemove?: Sale[]) {
    const sales = salesToRemove || (selectedSale ? [selectedSale] : getSelectedSalesArray())
    if (sales.length === 0) return

    setProcessing(true)
    setActionError(null)

    try {
      const saleIds = sales.map(s => s.id)
      const pieceIds = sales.map(s => s.land_piece_id)

      // Delete installment payments first (if any)
      const installmentSales = sales.filter(s => s.payment_method === 'installment')
      if (installmentSales.length > 0) {
        const installmentSaleIds = installmentSales.map(s => s.id)
        const { error: instErr } = await supabase
              .from('installment_payments')
              .delete()
          .in('sale_id', installmentSaleIds)

        if (instErr) throw instErr
      }

      // Delete the sales
      const { error: deleteErr } = await supabase
              .from('sales')
        .delete()
        .in('id', saleIds)

      if (deleteErr) throw deleteErr

      // Make pieces available again
      const { error: pieceErr } = await supabase
              .from('land_pieces')
        .update({ status: 'Available', updated_at: new Date().toISOString() })
        .in('id', pieceIds)

      if (pieceErr) throw pieceErr

      alert(`✅ تم حذف ${sales.length} بيع نهائياً بنجاح. القطع متاحة للبيع مرة أخرى.`)
      setActionDialogOpen(false)
      setSelectedSale(null)
      setSelectedSales(new Set())
      setActionType(null)
      await loadAllSales()
      window.dispatchEvent(new CustomEvent('saleUpdated'))
      window.dispatchEvent(new CustomEvent('pieceStatusChanged'))
    } catch (e: any) {
      setActionError(e.message || 'فشل حذف البيع')
    } finally {
      setProcessing(false)
    }
  }

  function openActionDialog(sale: Sale | null, action: 'revert' | 'cancel' | 'revertFromInstallments' | 'remove', useMultiSelect = false) {
    if (useMultiSelect) {
      // For multi-select operations
      const selectedArray = getSelectedSalesArray()
      if (selectedArray.length === 0) {
        alert('يرجى تحديد مبيعات أولاً')
        return
      }
      setSelectedSale(null)
      setActionType(action)
      setActionError(null)
      setActionDialogOpen(true)
    } else {
      // For single sale operations
      if (!sale) return
    setSelectedSale(sale)
    setActionType(action)
    setActionError(null)
    setActionDialogOpen(true)
    }
  }

  function toggleSaleSelection(saleId: string) {
    setSelectedSales(prev => {
      const newSet = new Set(prev)
      if (newSet.has(saleId)) {
        newSet.delete(saleId)
      } else {
        newSet.add(saleId)
      }
      return newSet
    })
  }

  function toggleSelectAll() {
    if (selectedSales.size === filteredSales.length) {
      setSelectedSales(new Set())
    } else {
      setSelectedSales(new Set(filteredSales.map(s => s.id)))
    }
  }

  function getSelectedSalesArray(): Sale[] {
    return filteredSales.filter(s => selectedSales.has(s.id))
  }

  function formatDate(dateString: string | null): string {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  function getStatusBadge(status: string) {
    if (status === 'completed') {
      return <Badge className="bg-green-100 text-green-800">مكتمل</Badge>
    }
    if (status === 'pending') {
      return <Badge className="bg-yellow-100 text-yellow-800">معلق</Badge>
    }
    if (status === 'cancelled') {
      return <Badge className="bg-red-100 text-red-800">ملغي</Badge>
    }
    return <Badge>{status}</Badge>
  }

  if (loading) {
    return (
      <div className="px-2 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6">
        <div className="text-center py-8 sm:py-12">
          <div className="inline-block animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-xs sm:text-sm text-gray-500">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-2 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6">
        <Alert variant="error">{error}</Alert>
      </div>
    )
  }

  return (
    <div className="px-2 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 space-y-3 sm:space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">سجل المبيعات</h1>
      </div>

      {/* Filters - Compact */}
      <div className="bg-white border border-gray-200 rounded-lg p-2 sm:p-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <Input
            type="text"
            placeholder="🔍 بحث (عميل، قطعة، دفعة)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="sm"
            className="text-xs sm:text-sm"
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs sm:text-sm"
          >
            <option value="all">جميع الحالات</option>
            <option value="pending">معلق</option>
            <option value="completed">مكتمل</option>
            <option value="cancelled">ملغي</option>
          </Select>
          <Select
            value={paymentMethodFilter}
            onChange={(e) => setPaymentMethodFilter(e.target.value)}
            className="text-xs sm:text-sm"
          >
            <option value="all">جميع أنواع الدفع</option>
            <option value="full">نقدي</option>
            <option value="installment">تقسيط</option>
            <option value="promise">وعد بالبيع</option>
          </Select>
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
        {(searchQuery || statusFilter !== 'all' || paymentMethodFilter !== 'all' || batchFilter !== 'all') && (
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>النتائج: {filteredSales.length} من {sales.length}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSearchQuery('')
                setStatusFilter('all')
                setPaymentMethodFilter('all')
                setBatchFilter('all')
              }}
              className="text-[10px] px-2 py-0.5"
            >
              إعادة تعيين
            </Button>
          </div>
        )}
      </div>

      {/* Bulk Actions Bar */}
      {selectedSales.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 sm:p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-medium text-gray-900">
              تم تحديد {selectedSales.size} بيع
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedSales(new Set())}
              className="text-xs px-2 py-1"
            >
              إلغاء التحديد
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {filteredSales.filter(s => selectedSales.has(s.id) && s.status === 'completed').length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                className="text-xs px-2 py-1"
                onClick={() => openActionDialog(null, 'revert', true)}
              >
                إرجاع إلى التأكيدات
              </Button>
            )}
            {filteredSales.filter(s => selectedSales.has(s.id) && (s.status === 'completed' || s.status === 'pending')).length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                className="text-xs px-2 py-1 bg-orange-600 text-white hover:bg-orange-700"
                onClick={() => openActionDialog(null, 'cancel', true)}
              >
                إلغاء
              </Button>
            )}
            <Button
              variant="danger"
              size="sm"
              className="text-xs px-2 py-1 bg-red-600 text-white hover:bg-red-700"
              onClick={() => openActionDialog(null, 'remove', true)}
            >
              إزالة كاملة
            </Button>
          </div>
        </div>
      )}

      {filteredSales.length === 0 ? (
        <Alert className="text-xs sm:text-sm">
          {sales.length === 0 ? 'لا توجد مبيعات مسجلة' : 'لا توجد نتائج للبحث'}
        </Alert>
      ) : (
        <>
          {/* Select All */}
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              checked={selectedSales.size === filteredSales.length && filteredSales.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label className="text-xs sm:text-sm text-gray-700 cursor-pointer" onClick={toggleSelectAll}>
              تم قراءة الكل ({filteredSales.length})
            </label>
          </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
          {filteredSales.map((sale) => {
            const batchName = sale.batch?.name || '-'
            const pieceNumber = sale.piece?.piece_number || '-'
            const canRevert = sale.status === 'completed'
            const canCancel = sale.status === 'completed' || sale.status === 'pending'
            const canRevertFromInstallments = sale.status === 'completed' && sale.payment_method === 'installment'
            
            return (
              <Card key={sale.id} className={`p-3 sm:p-4 lg:p-6 ${selectedSales.has(sale.id) ? 'ring-2 ring-blue-500 border-blue-500' : ''}`}>
                <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                  {/* Header with Checkbox */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedSales.has(sale.id)}
                        onChange={() => toggleSaleSelection(sale.id)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
                      />
                    <h3 className="text-sm sm:text-base lg:text-lg font-semibold text-gray-900 truncate flex-1 min-w-0">
                      {batchName} - {pieceNumber}
                    </h3>
                    </div>
                    <div className="ml-2 flex-shrink-0">{getStatusBadge(sale.status)}</div>
                  </div>

                  {/* Client */}
                  <div>
                    <span className="text-xs sm:text-sm font-medium text-gray-600">العميل:</span>{' '}
                    <span className="text-xs sm:text-sm text-gray-900">{sale.client?.name || '-'}</span>
                    {sale.seller?.name && (
                      <span className="text-xs text-gray-500">• باعه {sale.seller.name}{sale.seller.place ? ` (${sale.seller.place})` : ''}</span>
                    )}
                    {sale.confirmedBy?.name && (
                      <span className="text-xs text-gray-500">• أكده {sale.confirmedBy.name}{sale.confirmedBy.place ? ` (${sale.confirmedBy.place})` : ''}</span>
                    )}
                  </div>

                  {/* Payment Method */}
                  {sale.payment_method && (
                    <div>
                      <Badge variant="info" size="sm" className="text-xs">
                        {getPaymentTypeLabel(sale.payment_method)}
                      </Badge>
                    </div>
                  )}

                  {/* Sale Details */}
                  <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm border-t border-gray-200 pt-2 sm:pt-3 lg:pt-4">
                    <div className="flex justify-between">
                      <span className="text-gray-600">سعر البيع:</span>
                      <span className="font-semibold text-gray-900">
                        {formatPrice(sale.sale_price)} DT
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">العربون:</span>
                      <span className="font-semibold text-gray-900">
                        {formatPrice(sale.deposit_amount || 0)} DT
                      </span>
                    </div>
                    <div className="flex justify-between pt-1.5 sm:pt-2 border-t border-gray-100">
                      <span className="text-gray-600">التاريخ:</span>
                      <span className="text-gray-900 text-xs">{formatDate(sale.sale_date)}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="border-t border-gray-200 pt-2 sm:pt-3 lg:pt-4 space-y-1.5 sm:space-y-2">
                    {canRevert && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full text-xs sm:text-sm py-1.5 px-2"
                        onClick={() => openActionDialog(sale, 'revert')}
                      >
                        إرجاع إلى التأكيدات
                      </Button>
                    )}
                    {canRevertFromInstallments && (
                        <Button
                        variant="secondary"
                          size="sm"
                        className="w-full text-xs sm:text-sm py-1.5 px-2"
                        onClick={() => openActionDialog(sale, 'revertFromInstallments')}
                        >
                        إرجاع من الأقساط
                        </Button>
                      )}
                    {canCancel && (
                        <Button
                          variant="secondary"
                        size="sm"
                        className="w-full bg-orange-600 text-white hover:bg-orange-700 text-xs sm:text-sm py-1.5 px-2"
                        onClick={() => openActionDialog(sale, 'cancel')}
                        >
                        إلغاء البيع
                        </Button>
                      )}
                      <Button
                        variant="danger"
                      size="sm"
                      className="w-full bg-red-600 text-white hover:bg-red-700 text-xs sm:text-sm py-1.5 px-2"
                      onClick={() => openActionDialog(sale, 'remove')}
                      >
                      إزالة كاملة
                      </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
        </>
      )}

      {/* Action Confirmation Dialog */}
      {actionType && (selectedSale || selectedSales.size > 0) && (
        <ConfirmDialog
          open={actionDialogOpen}
        onClose={() => {
            if (!processing) {
              setActionDialogOpen(false)
          setSelectedSale(null)
              setActionType(null)
              setActionError(null)
            }
          }}
          onConfirm={() => {
            const selectedSalesArray = getSelectedSalesArray()
            if (actionType === 'remove') {
              if (selectedSalesArray.length > 0) {
                handleRemoveSale(selectedSalesArray)
              } else {
              handleRemoveSale()
              }
            } else if (actionType === 'cancel') {
              if (selectedSalesArray.length > 0) {
                handleCancelSale(selectedSalesArray)
              } else {
              handleCancelSale()
              }
            } else if (actionType === 'revert' || actionType === 'revertFromInstallments') {
              if (selectedSalesArray.length > 0) {
                handleRevertToPending(selectedSalesArray)
              } else {
              handleRevertToPending()
              }
            }
          }}
          title={
            actionType === 'remove'
              ? selectedSales.size > 0 ? `إزالة ${selectedSales.size} بيع نهائياً` : 'إزالة البيع نهائياً'
              : actionType === 'cancel'
                ? selectedSales.size > 0 ? `إلغاء ${selectedSales.size} بيع` : 'إلغاء البيع'
                : actionType === 'revert'
                  ? selectedSales.size > 0 ? `إرجاع ${selectedSales.size} بيع إلى التأكيدات` : 'إرجاع البيع إلى التأكيدات'
                  : 'إرجاع البيع من الأقساط'
          }
          description={
            selectedSales.size > 0
              ? (() => {
                  const count = selectedSales.size
                  if (actionType === 'remove') {
                    return `⚠️ تحذير: سيتم حذف ${count} بيع نهائياً من قاعدة البيانات:\n\n• سيتم حذف سجلات البيع بالكامل\n• سيتم حذف جميع الأقساط المرتبطة (إن وجدت)\n• القطع ستصبح متاحة للبيع مرة أخرى\n• جميع المدفوعات المرتبطة ستُحذف\n\nهذا الإجراء لا يمكن التراجع عنه!`
                  }
                  if (actionType === 'cancel') {
                    return `سيتم إلغاء ${count} بيع:\n\n• القطع ستصبح متاحة للبيع مرة أخرى\n• سيتم إزالة المبيعات من صفحة المالية\n• سيتم حذف جميع الأقساط المرتبطة (إن وجدت)\n\n⚠️ تحذير: لا يمكن التراجع عن هذا الإجراء!`
                  }
                  if (actionType === 'revert' || actionType === 'revertFromInstallments') {
                    return `سيتم إرجاع ${count} بيع إلى صفحة التأكيدات:\n\n• حالة المبيعات ستصبح "معلق"\n• سيتم الاحتفاظ بالعربون فقط\n• سيتم إزالة جميع الأموال الأخرى (التسبقة، الأقساط، إلخ)\n• القطع ستبقى محجوزة حتى التأكيد النهائي`
                  }
                  return `سيتم تطبيق هذا الإجراء على ${count} بيع محدد.`
                })()
              : selectedSale
                ? getActionDescription(selectedSale, actionType)
                : ''
          }
          confirmText={processing ? 'جاري المعالجة...' : 'تأكيد'}
          cancelText="إلغاء"
          variant="destructive"
          disabled={processing}
          loading={processing}
          errorMessage={actionError}
        />
        )}
    </div>
  )
}
