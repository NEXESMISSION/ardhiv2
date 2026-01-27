import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/utils/priceCalculator'
import { Input } from '@/components/ui/input'
import { calculateInstallmentWithDeposit } from '@/utils/installmentCalculator'
import { buildSaleQuery, formatSalesWithSellers } from '@/utils/salesQueries'
import { FinanceDetailsDialog } from '@/components/FinanceDetailsDialog'
import { InstallmentStatsDialog } from '@/components/InstallmentStatsDialog'
import { Dialog } from '@/components/ui/dialog'

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
  created_at: string
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
    location?: string | null
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
  installment_number: number | null
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
  const [selectedPlaceDetails, setSelectedPlaceDetails] = useState<{
    name: string
    totalRevenue: number
    totalCollected: number
    batches: Set<string>
    sales: Sale[]
    pieces: number
    clients: Set<string>
  } | null>(null)
  const [placeDetailsDialogOpen, setPlaceDetailsDialogOpen] = useState(false)

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

  // Calculate comprehensive statistics
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

    // Total Revenue - All completed sales (all payment methods)
    const totalRevenue = filteredData.sales
      .filter((s) => s.status === 'completed')
      .reduce((sum, s) => sum + s.sale_price, 0)

    // Total Collected - All payments received (deposits + advances + full payments + installment payments + promise payments)
    // Calculate directly from data to avoid circular dependency
    let totalCollected = 0
    
    // Deposits from all non-cancelled sales
    filteredData.sales
      .filter((s) => s.status !== 'cancelled')
      .forEach((sale) => {
        if (sale.deposit_amount) {
          totalCollected += sale.deposit_amount
        }
      })
    
    // Paid installments
    filteredData.installments
      .filter((i) => i.status === 'paid')
      .forEach((inst) => {
        const sale = sales.find((s) => s.id === inst.sale_id && s.status !== 'cancelled')
        if (sale) {
          totalCollected += inst.amount_paid || 0
        }
      })
    
    // Full payments (completed full payment sales)
    filteredData.sales
      .filter((s) => s.status === 'completed' && s.payment_method === 'full')
      .forEach((sale) => {
        const fullPayment = sale.sale_price - (sale.deposit_amount || 0)
        if (fullPayment > 0) {
          totalCollected += fullPayment
        }
      })
    
    // Advances from installment sales
    filteredData.sales
      .filter((s) => s.status === 'completed' && s.payment_method === 'installment' && s.payment_offer && s.piece)
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
          totalCollected += advanceAfterDeposit
        }
      })
    
    // Promise payments
    filteredData.sales
      .filter((s) => s.payment_method === 'promise' && s.partial_payment_amount && s.status !== 'cancelled')
      .forEach((sale) => {
        const promisePayment = (sale.partial_payment_amount || 0) - (sale.deposit_amount || 0)
        if (promisePayment > 0) {
          totalCollected += promisePayment
        }
      })

    // Total Pending - Sales that are pending confirmation
    const pendingSales = filteredData.sales.filter((s) => s.status === 'pending')
    const totalPending = pendingSales.reduce((sum, s) => sum + s.sale_price, 0)

    // Total Pieces Sold
    const totalPiecesSold = filteredData.sales
      .filter((s) => s.status === 'completed')
      .length

    // Total Clients
    const totalClients = new Set(
      filteredData.sales
        .filter((s) => s.status === 'completed')
        .map((s) => s.client_id)
    ).size

    return {
      unpaidAmount,
      unpaidInstallments: unpaidInstallments.length,
      unpaidClients: uniqueClientsUnpaid,
      paidAmount,
      paidInstallments,
      paidClients: uniqueClientsPaid.size,
      expectedThisMonth,
      total: totalRevenue, // Keep for backward compatibility
      totalRevenue,
      totalCollected,
      totalPending,
      totalPiecesSold,
      totalClients,
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
      .filter((s) => s.status === 'completed' && s.payment_method === 'full')
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
      .filter((s) => s.status === 'completed' && s.payment_method === 'installment' && s.payment_offer && s.piece)
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

  // Get unique batches and places for filters
  const availableBatches = useMemo(() => {
    const batchSet = new Set<string>()
    const batchMap = new Map<string, { id: string; name: string; location: string | null }>()
    
    Object.entries(paymentTypes).forEach(([, data]) => {
      data.details.forEach((detail) => {
        if (detail.sale.batch) {
          batchSet.add(detail.sale.batch.id)
          batchMap.set(detail.sale.batch.id, {
            id: detail.sale.batch.id,
            name: detail.sale.batch.name,
            location: detail.sale.batch.location || null
          })
        }
      })
    })
    
    return Array.from(batchMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [paymentTypes])


  // Calculate seller performance
  const sellerPerformance = useMemo(() => {
    const sellers: Record<string, { id: string; name: string; place: string | null; count: number; total: number }> = {}
    
    Object.entries(paymentTypes).forEach(([, data]) => {
      data.details.forEach((detail) => {
        if (detail.sale.seller) {
          const sellerId = detail.sale.seller.id
          if (!sellers[sellerId]) {
            sellers[sellerId] = {
              id: sellerId,
              name: detail.sale.seller.name,
              place: detail.sale.seller.place,
              count: 0,
              total: 0
            }
          }
          sellers[sellerId].count += 1
          sellers[sellerId].total += detail.amount
        }
      })
    })
    
    return Object.values(sellers).sort((a, b) => b.total - a.total)
  }, [paymentTypes])


  // Use payment types directly (no filtering needed since we removed filter sections)
  const filteredPaymentTypes = paymentTypes

  // Calculate place-based breakdown (after filteredPaymentTypes is calculated)
  const placeBreakdown = useMemo(() => {
    const places: Record<string, {
      name: string
      totalRevenue: number
      totalCollected: number
      batches: Set<string>
      sales: Sale[]
      pieces: number
      clients: Set<string>
    }> = {}

    filteredData.sales
      .filter((s) => s.status !== 'cancelled' && s.batch?.location)
      .forEach((sale) => {
        const place = sale.batch!.location!
        if (!places[place]) {
          places[place] = {
            name: place,
            totalRevenue: 0,
            totalCollected: 0,
            batches: new Set(),
            sales: [],
            pieces: 0,
            clients: new Set(),
          }
        }
        places[place].sales.push(sale)
        places[place].batches.add(sale.batch!.id)
        places[place].pieces += 1
        places[place].clients.add(sale.client_id)
        if (sale.status === 'completed') {
          places[place].totalRevenue += sale.sale_price
        }
      })

    // Calculate collected amounts per place from all payment types (not filtered)
    Object.entries(paymentTypes).forEach(([, data]) => {
      data.details.forEach((detail) => {
        if (detail.sale.batch?.location) {
          const place = detail.sale.batch.location
          if (places[place]) {
            places[place].totalCollected += detail.amount
          }
        }
      })
    })

    return Object.values(places).sort((a, b) => b.totalCollected - a.totalCollected)
  }, [filteredData.sales, paymentTypes])

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

      {/* Main Statistics Cards - Comprehensive Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
        {/* Total Revenue */}
        <Card className="p-4 lg:p-5 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs sm:text-sm font-semibold text-blue-900">إجمالي الإيرادات</p>
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-blue-900 mb-1">{formatPrice(stats.totalRevenue)} DT</p>
          <p className="text-xs text-blue-700">
            {stats.totalPiecesSold} قطعة | {stats.totalClients} عميل
          </p>
        </Card>

        {/* Total Collected */}
        <Card className="p-4 lg:p-5 bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs sm:text-sm font-semibold text-green-900">إجمالي المحصل</p>
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-green-900 mb-1">{formatPrice(stats.totalCollected)} DT</p>
          <div className="mt-2">
            <div className="w-full bg-green-200 rounded-full h-2">
              <div 
                className="bg-green-600 h-2 rounded-full transition-all"
                style={{ width: `${stats.totalRevenue > 0 ? (stats.totalCollected / stats.totalRevenue) * 100 : 0}%` }}
              ></div>
            </div>
            <p className="text-xs text-green-700 mt-1">
              {stats.totalRevenue > 0 ? Math.round((stats.totalCollected / stats.totalRevenue) * 100) : 0}% من الإيرادات
            </p>
          </div>
        </Card>

        {/* Unpaid Amount */}
        <Card 
          className="p-4 lg:p-5 bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-300 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => {
            setSelectedStatType('unpaid')
            setDetailsDialogOpen(true)
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs sm:text-sm font-semibold text-red-900">المبلغ غير المدفوع</p>
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-red-900 mb-1">{formatPrice(stats.unpaidAmount)} DT</p>
          <p className="text-xs text-red-700">
            {stats.unpaidInstallments} قسط | {stats.unpaidClients} عميل
          </p>
        </Card>

        {/* Expected This Month */}
        <Card 
          className="p-4 lg:p-5 bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-300 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => {
            setSelectedStatType('expected')
            setDetailsDialogOpen(true)
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs sm:text-sm font-semibold text-orange-900">المتوقع هذا الشهر</p>
            <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-orange-900 mb-1">{formatPrice(stats.expectedThisMonth)} DT</p>
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
          {Object.entries(filteredPaymentTypes).map(([type, data]) => (
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

      {/* Place-Based Breakdown */}
      {placeBreakdown.length > 0 && (
        <div>
          <h2 className="text-sm sm:text-base lg:text-lg font-semibold text-gray-900 mb-2 sm:mb-3 lg:mb-4">الإيرادات حسب الموقع</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {placeBreakdown.map((place) => {
              const collectionRate = place.totalRevenue > 0 
                ? (place.totalCollected / place.totalRevenue) * 100 
                : 0
              
              return (
                <Card 
                  key={place.name}
                  className="p-4 lg:p-5 bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-200 hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => {
                    setSelectedPlaceDetails(place)
                    setPlaceDetailsDialogOpen(true)
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base sm:text-lg font-bold text-purple-900">{place.name}</h3>
                    <Badge variant="info" size="sm" className="text-xs">
                      {place.batches.size} دفعة
                    </Badge>
                  </div>
                  
                  <div className="space-y-2 mb-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs sm:text-sm text-gray-700">إجمالي الإيرادات:</span>
                      <span className="text-sm sm:text-base font-bold text-gray-900">{formatPrice(place.totalRevenue)} DT</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs sm:text-sm text-gray-700">إجمالي المحصل:</span>
                      <span className="text-sm sm:text-base font-bold text-green-600">{formatPrice(place.totalCollected)} DT</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs sm:text-sm text-gray-700">معدل التحصيل:</span>
                      <span className={`text-sm sm:text-base font-bold ${collectionRate >= 70 ? 'text-green-600' : collectionRate >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {Math.round(collectionRate)}%
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                    <div 
                      className={`h-3 rounded-full transition-all ${
                        collectionRate >= 70 ? 'bg-green-500' : collectionRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(collectionRate, 100)}%` }}
                    ></div>
                  </div>

                  <div className="flex justify-between text-xs text-gray-600 pt-2 border-t border-gray-200">
                    <span>{place.pieces} قطعة</span>
                    <span>{place.clients.size} عميل</span>
                    <span>{place.sales.length} عملية</span>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* User Performance Tracking */}
      {sellerPerformance.length > 0 && (
        <div>
          <h2 className="text-sm sm:text-base lg:text-lg font-semibold text-gray-900 mb-2 sm:mb-3 lg:mb-4">أداء البائعين</h2>
          <Card className="p-4 lg:p-5">
            <div className="space-y-3 sm:space-y-4">
              {sellerPerformance.map((seller, index) => {
                const maxTotal = sellerPerformance[0]?.total || 1
                const performancePercentage = (seller.total / maxTotal) * 100
                
                return (
                  <div key={seller.id} className="border-b border-gray-200 last:border-b-0 pb-3 last:pb-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs sm:text-sm ${
                          index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-orange-600' : 'bg-blue-500'
                        }`}>
                          {index + 1}
                        </div>
                        <div>
                          <p className="text-sm sm:text-base font-semibold text-gray-900">{seller.name}</p>
                          {seller.place && (
                            <p className="text-xs text-gray-500">{seller.place}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-base sm:text-lg font-bold text-gray-900">{formatPrice(seller.total)} DT</p>
                        <p className="text-xs text-gray-500">{seller.count} عملية</p>
                      </div>
                    </div>
                    
                    {/* Performance Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-3 sm:h-4">
                      <div 
                        className={`h-3 sm:h-4 rounded-full transition-all ${
                          performancePercentage >= 80 ? 'bg-green-500' : 
                          performancePercentage >= 50 ? 'bg-blue-500' : 
                          performancePercentage >= 30 ? 'bg-yellow-500' : 
                          'bg-red-500'
                        }`}
                        style={{ width: `${performancePercentage}%` }}
                      ></div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
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
          details={filteredPaymentTypes[selectedType].details}
          totalAmount={filteredPaymentTypes[selectedType].amount}
        />
      )}

      {/* Statistics Graphs Section */}
      <div>
        <h2 className="text-sm sm:text-base lg:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">الرسوم البيانية والإحصائيات</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Revenue vs Collected Line Chart */}
          <Card className="p-4 lg:p-6">
            <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-4">الإيرادات مقابل المحصل</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs sm:text-sm text-gray-600">إجمالي الإيرادات</span>
                <span className="font-bold text-blue-600">{formatPrice(stats.totalRevenue)} DT</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs sm:text-sm text-gray-600">إجمالي المحصل</span>
                <span className="font-bold text-green-600">{formatPrice(stats.totalCollected)} DT</span>
              </div>
              <div className="relative h-48 sm:h-56 bg-gray-50 rounded-lg p-4 border border-gray-200">
                <svg className="w-full h-full" viewBox="0 0 400 200" preserveAspectRatio="none">
                  {/* Grid lines */}
                  {[0, 25, 50, 75, 100].map((y) => (
                    <line
                      key={y}
                      x1="40"
                      y1={160 - (y * 1.4)}
                      x2="380"
                      y2={160 - (y * 1.4)}
                      stroke="#e5e7eb"
                      strokeWidth="1"
                      strokeDasharray="2,2"
                    />
                  ))}
                  
                  {/* Revenue line (blue) */}
                  <path
                    d={`M 40,160 L 380,20`}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="3"
                    strokeLinecap="round"
                    className="drop-shadow-sm"
                  />
                  
                  {/* Collected line (green) - curved */}
                  {(() => {
                    const collectedPercent = stats.totalRevenue > 0 ? (stats.totalCollected / stats.totalRevenue) * 100 : 0
                    const startY = 160
                    const endY = 20
                    const collectedY = startY - ((collectedPercent / 100) * (startY - endY))
                    
                    // Create smooth curve using quadratic bezier
                    const midX = 210
                    const controlY = collectedY + (startY - collectedY) * 0.3
                    
                    return (
                      <path
                        d={`M 40,${startY} Q ${midX},${controlY} 380,${collectedY}`}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="3"
                        strokeLinecap="round"
                        className="drop-shadow-sm"
                      />
                    )
                  })()}
                  
                  {/* Data points */}
                  <circle cx="40" cy="160" r="4" fill="#3b82f6" className="drop-shadow-md" />
                  <circle cx="380" cy="20" r="4" fill="#3b82f6" className="drop-shadow-md" />
                  {(() => {
                    const collectedPercent = stats.totalRevenue > 0 ? (stats.totalCollected / stats.totalRevenue) * 100 : 0
                    const collectedY = 160 - ((collectedPercent / 100) * 140)
                    return (
                      <>
                        <circle cx="40" cy="160" r="4" fill="#10b981" className="drop-shadow-md" />
                        <circle cx="380" cy={collectedY} r="4" fill="#10b981" className="drop-shadow-md" />
                      </>
                    )
                  })()}
                  
                  {/* Labels */}
                  <text x="20" y="170" fontSize="10" fill="#6b7280" textAnchor="middle">0%</text>
                  <text x="20" y="30" fontSize="10" fill="#6b7280" textAnchor="middle">100%</text>
                  <text x="200" y="185" fontSize="11" fill="#374151" textAnchor="middle" fontWeight="600">الإيرادات</text>
                </svg>
                <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-4 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-0.5 bg-blue-500"></div>
                    <span className="text-gray-600">إيرادات</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-0.5 bg-green-500"></div>
                    <span className="text-gray-600">محصل</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Payment Types Distribution */}
          <Card className="p-4 lg:p-6">
            <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-4">توزيع أنواع المدفوعات</h3>
            <div className="space-y-3">
              {Object.entries(filteredPaymentTypes)
                .filter(([, data]) => data.amount > 0)
                .sort(([, a], [, b]) => b.amount - a.amount)
                .map(([type, data]) => {
                  const maxAmount = Math.max(...Object.values(filteredPaymentTypes).map(t => t.amount))
                  const percentage = maxAmount > 0 ? (data.amount / maxAmount) * 100 : 0
                  const colors: Record<string, string> = {
                    installments: 'bg-purple-500',
                    deposits: 'bg-blue-500',
                    full: 'bg-green-500',
                    advance: 'bg-orange-500',
                    promise: 'bg-yellow-500',
                    commission: 'bg-indigo-500',
                  }
                  
                  return (
                    <div key={type}>
                      <div className="flex justify-between text-xs sm:text-sm mb-1.5">
                        <span className="text-gray-700 font-medium">{typeLabels[type]}</span>
                        <span className="font-bold text-gray-900">{formatPrice(data.amount)} DT</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-4 sm:h-5">
                        <div 
                          className={`${colors[type] || 'bg-gray-500'} h-4 sm:h-5 rounded-full transition-all flex items-center justify-end pr-2`}
                          style={{ width: `${percentage}%` }}
                        >
                          {percentage > 15 && (
                            <span className="text-xs font-semibold text-white">
                              {data.count} عملية
                            </span>
                          )}
                        </div>
                      </div>
                      {percentage <= 15 && (
                        <p className="text-xs text-gray-500 mt-0.5">{data.count} عملية</p>
                      )}
                    </div>
                  )
                })}
            </div>
          </Card>

          {/* Monthly Trends Line Chart */}
          <Card className="p-4 lg:p-6">
            <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-4">الاتجاهات الشهرية</h3>
            <div className="relative h-64 sm:h-72 bg-gray-50 rounded-lg p-4 border border-gray-200">
              {(() => {
                // Group sales by month
                const monthlyData = new Map<string, { revenue: number; collected: number }>()
                filteredData.sales
                  .filter(s => s.status === 'completed')
                  .forEach(sale => {
                    const month = new Date(sale.sale_date || sale.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
                    if (!monthlyData.has(month)) {
                      monthlyData.set(month, { revenue: 0, collected: 0 })
                    }
                    const data = monthlyData.get(month)!
                    data.revenue += sale.sale_price
                  })
                
                // Add collected amounts from payment types
                Object.entries(filteredPaymentTypes).forEach(([, typeData]) => {
                  typeData.details.forEach(detail => {
                    const month = new Date(detail.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
                    if (monthlyData.has(month)) {
                      monthlyData.get(month)!.collected += detail.amount
                    }
                  })
                })
                
                const sortedMonths = Array.from(monthlyData.entries())
                  .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
                  .slice(-6) // Last 6 months
                
                if (sortedMonths.length === 0) {
                  return (
                    <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                      لا توجد بيانات شهرية متاحة
                    </div>
                  )
                }
                
                const maxValue = Math.max(...sortedMonths.map(([, d]) => Math.max(d.revenue, d.collected)), 1)
                const chartWidth = 360
                const chartHeight = 200
                const padding = 40
                const pointSpacing = chartWidth / (sortedMonths.length - 1 || 1)
                
                // Generate smooth curve points for revenue
                const revenuePoints = sortedMonths.map(([, data], index) => {
                  const x = padding + (index * pointSpacing)
                  const y = chartHeight - padding - ((data.revenue / maxValue) * (chartHeight - padding * 2))
                  return { x, y, value: data.revenue }
                })
                
                // Generate smooth curve points for collected
                const collectedPoints = sortedMonths.map(([, data], index) => {
                  const x = padding + (index * pointSpacing)
                  const y = chartHeight - padding - ((data.collected / maxValue) * (chartHeight - padding * 2))
                  return { x, y, value: data.collected }
                })
                
                // Create smooth path using quadratic bezier curves
                const createSmoothPath = (points: { x: number; y: number }[]) => {
                  if (points.length < 2) return ''
                  
                  let path = `M ${points[0].x},${points[0].y}`
                  
                  for (let i = 1; i < points.length; i++) {
                    const curr = points[i]
                    const next = points[i + 1]
                    
                    if (next) {
                      // Use control point between current and next for smooth curve
                      const cpX = (curr.x + next.x) / 2
                      const cpY = (curr.y + next.y) / 2
                      path += ` Q ${curr.x},${curr.y} ${cpX},${cpY}`
                    } else {
                      path += ` L ${curr.x},${curr.y}`
                    }
                  }
                  
                  return path
                }
                
                return (
                  <svg className="w-full h-full" viewBox={`0 0 ${chartWidth + padding * 2} ${chartHeight}`} preserveAspectRatio="none">
                    {/* Grid lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                      const y = chartHeight - padding - (ratio * (chartHeight - padding * 2))
                      return (
                        <line
                          key={ratio}
                          x1={padding}
                          y1={y}
                          x2={chartWidth + padding}
                          y2={y}
                          stroke="#e5e7eb"
                          strokeWidth="1"
                          strokeDasharray="2,2"
                        />
                      )
                    })}
                    
                    {/* Revenue line (blue) - smooth curve */}
                    <path
                      d={createSmoothPath(revenuePoints)}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      className="drop-shadow-sm"
                    />
                    
                    {/* Collected line (green) - smooth curve */}
                    <path
                      d={createSmoothPath(collectedPoints)}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      className="drop-shadow-sm"
                    />
                    
                    {/* Data points for revenue */}
                    {revenuePoints.map((point, index) => (
                      <g key={`revenue-${index}`}>
                        <circle cx={point.x} cy={point.y} r="4" fill="#3b82f6" className="drop-shadow-md" />
                        <title>{formatPrice(point.value)} DT</title>
                      </g>
                    ))}
                    
                    {/* Data points for collected */}
                    {collectedPoints.map((point, index) => (
                      <g key={`collected-${index}`}>
                        <circle cx={point.x} cy={point.y} r="4" fill="#10b981" className="drop-shadow-md" />
                        <title>{formatPrice(point.value)} DT</title>
                      </g>
                    ))}
                    
                    {/* Month labels */}
                    {sortedMonths.map(([month], index) => {
                      const x = padding + (index * pointSpacing)
                      return (
                        <text
                          key={month}
                          x={x}
                          y={chartHeight - 10}
                          fontSize="9"
                          fill="#6b7280"
                          textAnchor="middle"
                        >
                          {month.split(' ')[0]}
                        </text>
                      )
                    })}
                  </svg>
                )
              })()}
              <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-0.5 bg-blue-500"></div>
                  <span className="text-gray-600">إيرادات</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-0.5 bg-green-500"></div>
                  <span className="text-gray-600">محصل</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Payment Status Overview */}
          <Card className="p-4 lg:p-6">
            <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-4">نظرة عامة على حالة المدفوعات</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs sm:text-sm mb-2">
                  <span className="text-gray-600">مدفوع</span>
                  <span className="font-bold text-green-600">{formatPrice(stats.paidAmount)} DT</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-5 sm:h-6">
                  <div 
                    className="bg-green-500 h-5 sm:h-6 rounded-full flex items-center justify-end pr-2 transition-all"
                    style={{ width: `${(stats.totalCollected + stats.unpaidAmount) > 0 ? (stats.paidAmount / (stats.totalCollected + stats.unpaidAmount)) * 100 : 0}%` }}
                  >
                    <span className="text-xs sm:text-sm font-semibold text-white">
                      {stats.paidInstallments} قسط
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs sm:text-sm mb-2">
                  <span className="text-gray-600">غير مدفوع</span>
                  <span className="font-bold text-red-600">{formatPrice(stats.unpaidAmount)} DT</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-5 sm:h-6">
                  <div 
                    className="bg-red-500 h-5 sm:h-6 rounded-full flex items-center justify-end pr-2 transition-all"
                    style={{ width: `${(stats.totalCollected + stats.unpaidAmount) > 0 ? (stats.unpaidAmount / (stats.totalCollected + stats.unpaidAmount)) * 100 : 0}%` }}
                  >
                    <span className="text-xs sm:text-sm font-semibold text-white">
                      {stats.unpaidInstallments} قسط
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs sm:text-sm mb-2">
                  <span className="text-gray-600">المتوقع هذا الشهر</span>
                  <span className="font-bold text-orange-600">{formatPrice(stats.expectedThisMonth)} DT</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-5 sm:h-6">
                  <div 
                    className="bg-orange-500 h-5 sm:h-6 rounded-full flex items-center justify-end pr-2 transition-all"
                    style={{ width: `${stats.totalRevenue > 0 ? Math.min((stats.expectedThisMonth / stats.totalRevenue) * 100, 100) : 0}%` }}
                  >
                    <span className="text-xs sm:text-sm font-semibold text-white">
                      {stats.totalRevenue > 0 ? Math.round((stats.expectedThisMonth / stats.totalRevenue) * 100) : 0}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Place Details Dialog */}
      {selectedPlaceDetails && (
        <Dialog
          open={placeDetailsDialogOpen}
          onClose={() => {
            setPlaceDetailsDialogOpen(false)
            setSelectedPlaceDetails(null)
          }}
          title={`تفاصيل الموقع: ${selectedPlaceDetails.name}`}
          size="xl"
        >
          <div className="space-y-4 sm:space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <Card className="p-3 sm:p-4 bg-blue-50 border-blue-200">
                <p className="text-xs sm:text-sm text-gray-600 mb-1">إجمالي الإيرادات</p>
                <p className="text-lg sm:text-xl font-bold text-blue-900">{formatPrice(selectedPlaceDetails.totalRevenue)} DT</p>
              </Card>
              <Card className="p-3 sm:p-4 bg-green-50 border-green-200">
                <p className="text-xs sm:text-sm text-gray-600 mb-1">إجمالي المحصل</p>
                <p className="text-lg sm:text-xl font-bold text-green-900">{formatPrice(selectedPlaceDetails.totalCollected)} DT</p>
              </Card>
              <Card className="p-3 sm:p-4 bg-purple-50 border-purple-200">
                <p className="text-xs sm:text-sm text-gray-600 mb-1">عدد القطع</p>
                <p className="text-lg sm:text-xl font-bold text-purple-900">{selectedPlaceDetails.pieces}</p>
              </Card>
              <Card className="p-3 sm:p-4 bg-orange-50 border-orange-200">
                <p className="text-xs sm:text-sm text-gray-600 mb-1">عدد العملاء</p>
                <p className="text-lg sm:text-xl font-bold text-orange-900">{selectedPlaceDetails.clients.size}</p>
              </Card>
            </div>

            {/* Collection Rate */}
            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm sm:text-base font-semibold text-gray-900">معدل التحصيل</p>
                <span className={`text-lg sm:text-xl font-bold ${
                  (selectedPlaceDetails.totalCollected / selectedPlaceDetails.totalRevenue) >= 0.7 
                    ? 'text-green-600' 
                    : (selectedPlaceDetails.totalCollected / selectedPlaceDetails.totalRevenue) >= 0.5
                    ? 'text-yellow-600'
                    : 'text-red-600'
                }`}>
                  {selectedPlaceDetails.totalRevenue > 0 
                    ? Math.round((selectedPlaceDetails.totalCollected / selectedPlaceDetails.totalRevenue) * 100) 
                    : 0}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 sm:h-5">
                <div 
                  className={`h-4 sm:h-5 rounded-full transition-all ${
                    (selectedPlaceDetails.totalCollected / selectedPlaceDetails.totalRevenue) >= 0.7 
                      ? 'bg-green-500' 
                      : (selectedPlaceDetails.totalCollected / selectedPlaceDetails.totalRevenue) >= 0.5
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                  }`}
                  style={{ 
                    width: `${selectedPlaceDetails.totalRevenue > 0 
                      ? Math.min((selectedPlaceDetails.totalCollected / selectedPlaceDetails.totalRevenue) * 100, 100) 
                      : 0}%` 
                  }}
                ></div>
              </div>
            </Card>

            {/* Batches */}
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-3">الدفعات ({selectedPlaceDetails.batches.size})</h3>
              <div className="space-y-2">
                {Array.from(selectedPlaceDetails.batches).map((batchId) => {
                  const batch = availableBatches.find(b => b.id === batchId)
                  if (!batch) return null
                  return (
                    <Card key={batchId} className="p-3 sm:p-4">
                      <p className="text-sm sm:text-base font-medium text-gray-900">{batch.name}</p>
                    </Card>
                  )
                })}
              </div>
            </div>

            {/* Sales List */}
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-3">المبيعات ({selectedPlaceDetails.sales.length})</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {selectedPlaceDetails.sales.map((sale) => (
                  <Card key={sale.id} className="p-3 sm:p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-sm sm:text-base font-semibold text-gray-900">
                            القطعة {sale.piece?.piece_number || 'غير معروف'}
                          </p>
                          <Badge 
                            variant={sale.status === 'completed' ? 'success' : sale.status === 'pending' ? 'warning' : 'error'}
                            size="sm"
                          >
                            {sale.status === 'completed' ? 'مكتمل' : sale.status === 'pending' ? 'معلق' : sale.status}
                          </Badge>
                        </div>
                        <p className="text-xs sm:text-sm text-gray-600 mb-1">
                          العميل: {sale.client?.name || 'غير معروف'}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-600 mb-1">
                          الدفعة: {sale.batch?.name || 'غير معروف'}
                        </p>
                        <p className="text-sm sm:text-base font-bold text-gray-900">
                          السعر: {formatPrice(sale.sale_price)} DT
                        </p>
                        {sale.deposit_amount && (
                          <p className="text-xs sm:text-sm text-gray-600">
                            العربون: {formatPrice(sale.deposit_amount)} DT
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
