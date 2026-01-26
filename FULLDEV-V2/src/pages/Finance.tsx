import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { formatPrice, formatDateShort } from '@/utils/priceCalculator'
import { Input } from '@/components/ui/input'
import { calculateInstallmentWithDeposit } from '@/utils/installmentCalculator'
import { buildSaleQuery, formatSalesWithSellers } from '@/utils/salesQueries'
import { FinanceDetailsDialog } from '@/components/FinanceDetailsDialog'
import { InstallmentStatsDialog } from '@/components/InstallmentStatsDialog'

type TimeFilter = 'today' | 'week' | 'month' | 'all'

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
  payment_offer_id: string | null
  partial_payment_amount: number | null
  company_fee_amount: number | null
  sold_by: string | null
  confirmed_by: string | null
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
  confirmedBy?: {
    id: string
    name: string
    place: string | null
  }
}

interface InstallmentPayment {
  id: string
  sale_id: string
  amount_due: number
  amount_paid: number
  due_date: string
  paid_date: string | null
  status: 'pending' | 'paid' | 'overdue'
}

interface PaymentTypeData {
  amount: number
  count: number
  pieces: number
  batches: Set<string>
  details: Array<{
    sale: Sale
    amount: number
    date: string
  }>
}

export function FinancePage() {
  const [loading, setLoading] = useState(true)
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [dateFilter, setDateFilter] = useState<string>('')
  const [sales, setSales] = useState<Sale[]>([])
  const [installmentPayments, setInstallmentPayments] = useState<InstallmentPayment[]>([])
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [selectedStatType, setSelectedStatType] = useState<'unpaid' | 'paid' | 'expected' | 'total' | null>(null)

  useEffect(() => {
    loadData()

    const handleSaleUpdated = () => {
      loadData()
    }

    window.addEventListener('saleUpdated', handleSaleUpdated)
    return () => {
      window.removeEventListener('saleUpdated', handleSaleUpdated)
    }
  }, [timeFilter, dateFilter])

  async function loadData() {
    setLoading(true)
    try {
      const [salesResult, installmentsResult] = await Promise.all([
        supabase
        .from('sales')
        .select(buildSaleQuery())
          .not('status', 'eq', 'cancelled') // Exclude cancelled sales
          .order('created_at', { ascending: false }),
        supabase
          .from('installment_payments')
          .select('*')
          .order('due_date', { ascending: true })
      ])

      if (salesResult.error) throw salesResult.error
      if (installmentsResult.error) throw installmentsResult.error

      const formattedSales = await formatSalesWithSellers(salesResult.data || [])

      setSales(formattedSales)
      setInstallmentPayments(installmentsResult.data || [])
    } catch (e: any) {
      console.error('Error loading finance data:', e)
    } finally {
      setLoading(false)
    }
  }

  // Filter data based on time filter and date
  const filteredData = useMemo(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfWeek = new Date(startOfToday)
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const filterDate = (date: string | null): boolean => {
      if (!date) return timeFilter === 'all' && !dateFilter
      const d = new Date(date)
      
      if (dateFilter) {
        const filterDateObj = new Date(dateFilter)
        return d.toDateString() === filterDateObj.toDateString()
      }
      
      switch (timeFilter) {
        case 'today':
          return d >= startOfToday
        case 'week':
          return d >= startOfWeek
        case 'month':
          return d >= startOfMonth
        default:
          return true
      }
    }

    return {
      sales: sales.filter((s) => filterDate(s.sale_date || s.created_at)),
      installments: installmentPayments.filter((i) => {
        if (dateFilter) {
          const filterDateObj = new Date(dateFilter)
          return new Date(i.paid_date || i.due_date).toDateString() === filterDateObj.toDateString()
        }
        const d = new Date(i.paid_date || i.due_date)
        switch (timeFilter) {
          case 'today':
            return d >= startOfToday
          case 'week':
            return d >= startOfWeek
          case 'month':
            return d >= startOfMonth
          default:
            return true
        }
      }),
    }
  }, [sales, installmentPayments, timeFilter, dateFilter])

  // Calculate statistics - ONLY for installments
  const stats = useMemo(() => {
    // Unpaid amount (overdue installments) - Only from non-cancelled sales
    const unpaidInstallments = filteredData.installments.filter((i) => {
      const sale = sales.find((s) => s.id === i.sale_id)
      if (!sale || sale.status === 'cancelled') return false
      return i.status === 'overdue' || (i.status === 'pending' && new Date(i.due_date) < new Date())
    })
    const unpaidAmount = unpaidInstallments.reduce((sum, i) => sum + (i.amount_due - i.amount_paid), 0)
    const uniqueClientsUnpaid = new Set(
      unpaidInstallments.map((i) => {
        const sale = sales.find((s) => s.id === i.sale_id && s.status !== 'cancelled')
        return sale?.client_id
      }).filter(Boolean)
    ).size

    // Paid installments ONLY (not deposits, advances, etc.) - Only from non-cancelled sales
    const paidInsts = filteredData.installments.filter((i) => {
      const sale = sales.find((s) => s.id === i.sale_id)
      return i.status === 'paid' && sale && sale.status !== 'cancelled'
    })
    const paidAmount = paidInsts.reduce((sum, i) => sum + (i.amount_paid || 0), 0)
    const paidInstallments = paidInsts.length
    const uniqueClientsPaid = new Set<string>()
    paidInsts.forEach((i) => {
      const sale = sales.find((s) => s.id === i.sale_id && s.status !== 'cancelled')
      if (sale) uniqueClientsPaid.add(sale.client_id)
    })

    // Expected this month (installments only) - Only from non-cancelled sales
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    
    const expectedThisMonth = filteredData.installments
      .filter((i) => {
        const sale = sales.find((s) => s.id === i.sale_id)
        if (!sale || sale.status === 'cancelled') return false
        const dueDate = new Date(i.due_date)
        return dueDate >= startOfMonth && dueDate <= endOfMonth && i.status === 'pending'
      })
      .reduce((sum, i) => sum + (i.amount_due - i.amount_paid), 0)

    // Total - Only installment sales (completed, non-cancelled ones with installment payment method)
    const total = filteredData.sales
      .filter((s) => s.status === 'completed' && s.payment_method === 'installment' && s.status !== 'cancelled')
      .reduce((sum, s) => sum + s.sale_price, 0)

    return {
      unpaidAmount,
      unpaidInstallments: unpaidInstallments.length,
      unpaidClients: uniqueClientsUnpaid,
      paidAmount,
      paidInstallments,
      paidClients: uniqueClientsPaid.size,
      expectedThisMonth,
      total,
    }
  }, [filteredData, sales])

  // Calculate payment types breakdown
  const paymentTypes = useMemo(() => {
    const types: Record<string, PaymentTypeData> = {
      installments: { amount: 0, count: 0, pieces: 0, batches: new Set(), details: [] },
      deposits: { amount: 0, count: 0, pieces: 0, batches: new Set(), details: [] },
      full: { amount: 0, count: 0, pieces: 0, batches: new Set(), details: [] },
      advance: { amount: 0, count: 0, pieces: 0, batches: new Set(), details: [] },
      promise: { amount: 0, count: 0, pieces: 0, batches: new Set(), details: [] },
      commission: { amount: 0, count: 0, pieces: 0, batches: new Set(), details: [] },
    }

    // Process deposits - Only from completed or pending sales (not cancelled)
    filteredData.sales
      .filter((s) => s.status !== 'cancelled')
      .forEach((sale) => {
        if (sale.deposit_amount) {
          types.deposits.amount += sale.deposit_amount
          types.deposits.count += 1
          types.deposits.pieces += 1
          if (sale.batch?.id) types.deposits.batches.add(sale.batch.id)
          types.deposits.details.push({
            sale,
            amount: sale.deposit_amount,
            date: sale.sale_date || sale.created_at,
          })
        }
      })

    // Process paid installments - Only from non-cancelled sales
    filteredData.installments
      .filter((i) => i.status === 'paid')
      .forEach((inst) => {
        const sale = sales.find((s) => s.id === inst.sale_id && s.status !== 'cancelled')
        if (sale) {
          types.installments.amount += inst.amount_paid || 0
          types.installments.count += 1
          types.installments.pieces += 1
          if (sale.batch?.id) types.installments.batches.add(sale.batch.id)
          types.installments.details.push({
            sale,
            amount: inst.amount_paid || 0,
            date: inst.paid_date || inst.due_date,
      })
        }
    })

    // Process full payments - Only completed, non-cancelled sales
    filteredData.sales
      .filter((s) => s.status === 'completed' && s.payment_method === 'full' && s.status !== 'cancelled')
      .forEach((sale) => {
        const fullPayment = sale.sale_price - (sale.deposit_amount || 0)
        if (fullPayment > 0) {
          types.full.amount += fullPayment
          types.full.count += 1
          types.full.pieces += 1
          if (sale.batch?.id) types.full.batches.add(sale.batch.id)
          types.full.details.push({
            sale,
            amount: fullPayment,
            date: sale.sale_date || sale.created_at,
        })
        }
    })

    // Process advances - Only completed, non-cancelled installment sales
    filteredData.sales
      .filter((s) => s.status === 'completed' && s.payment_method === 'installment' && s.payment_offer && s.piece && s.status !== 'cancelled')
      .forEach((sale) => {
        const calc = calculateInstallmentWithDeposit(
          sale.piece!.surface_m2,
          {
            price_per_m2_installment: sale.payment_offer!.price_per_m2_installment,
            advance_mode: sale.payment_offer!.advance_mode,
            advance_value: sale.payment_offer!.advance_value,
            calc_mode: sale.payment_offer!.calc_mode,
            monthly_amount: sale.payment_offer!.monthly_amount,
            months: sale.payment_offer!.months,
          },
          sale.deposit_amount || 0
        )
        const advanceAfterDeposit = calc.advanceAfterDeposit
        if (advanceAfterDeposit > 0) {
          types.advance.amount += advanceAfterDeposit
          types.advance.count += 1
          types.advance.pieces += 1
          if (sale.batch?.id) types.advance.batches.add(sale.batch.id)
          types.advance.details.push({
            sale,
            amount: advanceAfterDeposit,
            date: sale.sale_date || sale.created_at,
          })
        }
      })

    // Process promise payments - Only non-cancelled sales
    filteredData.sales
      .filter((s) => s.payment_method === 'promise' && s.partial_payment_amount && s.status !== 'cancelled')
      .forEach((sale) => {
        const promisePayment = (sale.partial_payment_amount || 0) - (sale.deposit_amount || 0)
        if (promisePayment > 0) {
          types.promise.amount += promisePayment
          types.promise.count += 1
          types.promise.pieces += 1
          if (sale.batch?.id) types.promise.batches.add(sale.batch.id)
          types.promise.details.push({
            sale,
            amount: promisePayment,
            date: sale.sale_date || sale.created_at,
          })
        }
    })

    // Process commission - Only non-cancelled sales
    filteredData.sales
      .filter((s) => s.company_fee_amount && s.status !== 'cancelled')
      .forEach((sale) => {
        types.commission.amount += sale.company_fee_amount || 0
        types.commission.count += 1
        types.commission.pieces += 1
        if (sale.batch?.id) types.commission.batches.add(sale.batch.id)
        types.commission.details.push({
          sale,
          amount: sale.company_fee_amount || 0,
          date: sale.sale_date || sale.created_at,
        })
      })

    return types
  }, [filteredData, sales])

  // Calculate totals by batch
  const batchTotals = useMemo(() => {
    const batches: Record<string, {
      name: string
      installments: number
      deposits: number
      full: number
      advance: number
      promise: number
      commission: number
      total: number
    }> = {}

    Object.entries(paymentTypes).forEach(([type, data]) => {
      data.details.forEach((detail) => {
        const batchId = detail.sale.batch?.id || 'unknown'
        const batchName = detail.sale.batch?.name || 'غير محدد'
        
        if (!batches[batchId]) {
          batches[batchId] = {
            name: batchName,
            installments: 0,
            deposits: 0,
          full: 0,
          advance: 0,
          promise: 0,
          commission: 0,
          total: 0,
        }
      }

        if (type === 'installments') batches[batchId].installments += detail.amount
        if (type === 'deposits') batches[batchId].deposits += detail.amount
        if (type === 'full') batches[batchId].full += detail.amount
        if (type === 'advance') batches[batchId].advance += detail.amount
        if (type === 'promise') batches[batchId].promise += detail.amount
        if (type === 'commission') batches[batchId].commission += detail.amount
        
        batches[batchId].total += detail.amount
      })
    })

    return Object.values(batches).sort((a, b) => b.total - a.total)
  }, [paymentTypes])

  const typeLabels: Record<string, string> = {
    installments: 'بالتقسيط',
    deposits: 'العربون',
      full: 'بالحاضر',
    advance: 'التسبقة',
    promise: 'وعد بالبيع',
    commission: 'العمولة',
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

  return (
    <div className="px-2 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 space-y-3 sm:space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">المالية</h1>
      </div>

      {/* Time Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 lg:gap-4">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
        <Button
            variant={timeFilter === 'today' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setTimeFilter('today')}
            className="text-xs sm:text-sm py-1.5 px-2"
        >
          اليوم
        </Button>
        <Button
            variant={timeFilter === 'week' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setTimeFilter('week')}
            className="text-xs sm:text-sm py-1.5 px-2"
        >
          هذا الأسبوع
        </Button>
        <Button
            variant={timeFilter === 'month' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setTimeFilter('month')}
            className="text-xs sm:text-sm py-1.5 px-2"
        >
          هذا الشهر
        </Button>
        <Button
            variant={timeFilter === 'all' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setTimeFilter('all')}
            className="text-xs sm:text-sm py-1.5 px-2"
        >
          الكل
        </Button>
      </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full sm:w-40 text-xs sm:text-sm"
            placeholder="تاريخ محدد"
            size="sm"
          />
          {dateFilter && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDateFilter('')}
              className="text-xs sm:text-sm py-1.5 px-2"
            >
              إزالة
            </Button>
              )}
        </div>
      </div>

      {/* Statistics Cards - Installments Only */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
        <Card 
          className="p-3 sm:p-4 lg:p-5 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => {
            setSelectedStatType('unpaid')
            setDetailsDialogOpen(true)
          }}
        >
          <p className="text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">المبلغ غير المدفوع</p>
          <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-1">{formatPrice(stats.unpaidAmount)} DT</p>
          <p className="text-xs text-gray-500">
            {stats.unpaidInstallments} قسط | {stats.unpaidClients} عميل
          </p>
        </Card>

        <Card 
          className="p-3 sm:p-4 lg:p-5 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => {
            setSelectedStatType('paid')
            setDetailsDialogOpen(true)
          }}
        >
          <p className="text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">المبالغ المدفوعة</p>
          <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-1">{formatPrice(stats.paidAmount)} DT</p>
          <p className="text-xs text-gray-500">
            {stats.paidInstallments} قسط | {stats.paidClients} عميل
          </p>
      </Card>

        <Card 
          className="p-3 sm:p-4 lg:p-5 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => {
            setSelectedStatType('expected')
            setDetailsDialogOpen(true)
          }}
        >
          <p className="text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">المتوقع هذا الشهر</p>
          <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-1">{formatPrice(stats.expectedThisMonth)} DT</p>
        </Card>
      </div>

      {/* Installment Statistics Dialog */}
      {selectedStatType && (
        <InstallmentStatsDialog
          open={detailsDialogOpen && !!selectedStatType}
          onClose={() => {
            setDetailsDialogOpen(false)
            setSelectedStatType(null)
          }}
          statType={selectedStatType}
          stats={stats}
          filteredData={filteredData}
          sales={sales}
          installmentPayments={installmentPayments}
        />
      )}

      {/* Payment Types - Mobile-Friendly Cards */}
      <div>
        <h2 className="text-sm sm:text-base lg:text-lg font-semibold text-gray-900 mb-2 sm:mb-3 lg:mb-4">المدفوعات والعمولة</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
          {Object.entries(paymentTypes).map(([type, data]) => (
            <Card
              key={type}
              className={`p-3 sm:p-4 cursor-pointer hover:shadow-md transition-shadow ${
                data.count === 0 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              onClick={() => {
                if (data.count > 0) {
                  setSelectedType(type)
                  setDetailsDialogOpen(true)
                }
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs sm:text-sm font-medium text-gray-700 mb-1">{typeLabels[type]}</p>
                  <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 mb-1">{formatPrice(data.amount)} DT</p>
                  <p className="text-xs text-gray-500">{data.count} عملية</p>
                </div>
                {data.count > 0 && (
                  <Badge variant="info" size="sm" className="text-xs">
                    {data.pieces} قطعة
                  </Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Batch Totals - Mobile-Friendly Cards */}
      {batchTotals.length > 0 && (
        <div>
          <h2 className="text-sm sm:text-base lg:text-lg font-semibold text-gray-900 mb-2 sm:mb-3 lg:mb-4">الإجمالي حسب الدفعة</h2>
          <div className="space-y-2 sm:space-y-3">
            {batchTotals.map((batch) => (
              <Card key={batch.name} className="p-3 sm:p-4">
                <div className="space-y-2">
                  <h3 className="text-sm sm:text-base font-semibold text-gray-900 border-b border-gray-200 pb-2">
                    {batch.name}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">الأقساط</p>
                      <p className="text-sm sm:text-base font-semibold text-gray-900">{formatPrice(batch.installments)} DT</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">العربون</p>
                      <p className="text-sm sm:text-base font-semibold text-blue-600">{formatPrice(batch.deposits)} DT</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">بالحاضر</p>
                      <p className="text-sm sm:text-base font-semibold text-gray-900">{formatPrice(batch.full)} DT</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">التسبقة</p>
                      <p className="text-sm sm:text-base font-semibold text-orange-600">{formatPrice(batch.advance)} DT</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">وعد بالبيع</p>
                      <p className="text-sm sm:text-base font-semibold text-gray-900">{formatPrice(batch.promise)} DT</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">العمولة</p>
                      <p className="text-sm sm:text-base font-semibold text-purple-600">{formatPrice(batch.commission)} DT</p>
                    </div>
                    <div className="col-span-2 sm:col-span-4 pt-2 border-t border-gray-200">
                      <div className="flex justify-between items-center">
                        <p className="text-xs sm:text-sm text-gray-600">الإجمالي</p>
                        <p className="text-base sm:text-lg font-bold text-gray-900">{formatPrice(batch.total)} DT</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
              ))}
            
            {/* Total Summary Card */}
            <Card className="p-3 sm:p-4 bg-gray-50 border-2 border-gray-300">
              <h3 className="text-sm sm:text-base font-bold text-gray-900 mb-3 border-b border-gray-300 pb-2">
                الإجمالي الكلي
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                <div>
                  <p className="text-xs text-gray-600 mb-0.5">الأقساط</p>
                  <p className="text-sm sm:text-base font-semibold text-gray-900">
                    {formatPrice(batchTotals.reduce((sum, b) => sum + b.installments, 0))} DT
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-0.5">العربون</p>
                  <p className="text-sm sm:text-base font-semibold text-blue-600">
                    {formatPrice(batchTotals.reduce((sum, b) => sum + b.deposits, 0))} DT
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-0.5">بالحاضر</p>
                  <p className="text-sm sm:text-base font-semibold text-gray-900">
                    {formatPrice(batchTotals.reduce((sum, b) => sum + b.full, 0))} DT
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-0.5">التسبقة</p>
                  <p className="text-sm sm:text-base font-semibold text-orange-600">
                    {formatPrice(batchTotals.reduce((sum, b) => sum + b.advance, 0))} DT
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-0.5">وعد بالبيع</p>
                  <p className="text-sm sm:text-base font-semibold text-gray-900">
                    {formatPrice(batchTotals.reduce((sum, b) => sum + b.promise, 0))} DT
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-0.5">العمولة</p>
                  <p className="text-sm sm:text-base font-semibold text-purple-600">
                    {formatPrice(batchTotals.reduce((sum, b) => sum + b.commission, 0))} DT
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-4 pt-2 border-t border-gray-300">
                  <div className="flex justify-between items-center">
                    <p className="text-sm sm:text-base font-semibold text-gray-700">الإجمالي الكلي</p>
                    <p className="text-lg sm:text-xl font-bold text-gray-900">
                      {formatPrice(batchTotals.reduce((sum, b) => sum + b.total, 0))} DT
                    </p>
                  </div>
                </div>
        </div>
      </Card>
          </div>
        </div>
      )}

      {/* Payment Types Details Dialog */}
      {selectedType && (
        <FinanceDetailsDialog
          open={detailsDialogOpen && !!selectedType && !selectedStatType}
          onClose={() => {
            setDetailsDialogOpen(false)
            setSelectedType(null)
          }}
          type={selectedType}
          typeLabel={typeLabels[selectedType]}
          details={paymentTypes[selectedType].details}
          totalAmount={paymentTypes[selectedType].amount}
        />
      )}
    </div>
  )
}
