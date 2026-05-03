import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/utils/priceCalculator'
import { calculateInstallmentWithDeposit } from '@/utils/installmentCalculator'
import { buildSaleQuery, formatSalesWithSellers } from '@/utils/salesQueries'
import { FinanceDetailsDialog } from '@/components/FinanceDetailsDialog'
import { InstallmentStatsDialog } from '@/components/InstallmentStatsDialog'
import { Dialog } from '@/components/ui/dialog'
import { useLanguage } from '@/i18n/context'
import { useSalesRealtime } from '@/hooks/useSalesRealtime'

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
  confirmed_at: string | null
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

interface FinancePageProps {
  onNavigate?: (page: string) => void
}

export function FinancePage({ onNavigate }: FinancePageProps = {}) {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('week')
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

  // Pagination — render-only, no extra fetches
  const PAGE_SIZE_PLACES = 6
  const PAGE_SIZE_SELLERS = 6
  const PAGE_SIZE_DIALOG_SALES = 20
  const [placesShown, setPlacesShown] = useState(PAGE_SIZE_PLACES)
  const [sellersShown, setSellersShown] = useState(PAGE_SIZE_SELLERS)
  const [dialogSalesShown, setDialogSalesShown] = useState(PAGE_SIZE_DIALOG_SALES)

  // Reset list pagination when the time/date filter changes (results change shape).
  useEffect(() => {
    setPlacesShown(PAGE_SIZE_PLACES)
    setSellersShown(PAGE_SIZE_SELLERS)
  }, [timeFilter, dateFilter])

  // Reset dialog pagination each time a new place is opened.
  useEffect(() => {
    if (placeDetailsDialogOpen) {
      setDialogSalesShown(PAGE_SIZE_DIALOG_SALES)
    }
  }, [placeDetailsDialogOpen, selectedPlaceDetails?.name])

  // Single fetch on mount + on remote sale updates. We DO NOT reload on filter
  // change — the same dataset is filtered client-side via `filteredData` below.
  useEffect(() => {
    loadData()

    const handleSaleUpdated = () => {
      loadData()
    }

    window.addEventListener('saleUpdated', handleSaleUpdated)
    return () => {
      window.removeEventListener('saleUpdated', handleSaleUpdated)
    }
  }, [])

  // Real-time updates for sales
  useSalesRealtime({
    onSaleUpdated: () => {
      // Reload finance data when sales are updated
      if (!loading) {
        loadData()
      }
    },
  })

  async function loadData() {
    setLoading(true)
    setLoadError(null)
    try {
      const [salesResult, installmentsResult] = await Promise.all([
        supabase
          .from('sales')
          .select(buildSaleQuery())
          .not('status', 'eq', 'cancelled')
          .order('created_at', { ascending: false })
          .limit(2000),
        supabase
          .from('installment_payments')
          .select('*')
          .order('due_date', { ascending: true })
          .limit(5000)
      ])

      if (salesResult.error) throw salesResult.error
      if (installmentsResult.error) throw installmentsResult.error

      const formattedSales = await formatSalesWithSellers(salesResult.data || [])

      setSales(formattedSales)
      setInstallmentPayments(installmentsResult.data || [])
    } catch (e: any) {
      console.error('Error loading finance data:', e)
      setLoadError(e?.message || t('finance.loadError'))
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

    // For completed sales, use confirmed_at as "date we sold" so Finance "today" = what we confirmed today
    const saleEffectiveDate = (s: Sale) =>
      s.status === 'completed' && s.confirmed_at ? s.confirmed_at : (s.sale_date || s.created_at)

    return {
      sales: sales.filter((s) => filterDate(saleEffectiveDate(s))),
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
    // Index sales by id once so the per-installment lookups below run in
    // O(1) instead of `sales.find()` scanning the whole array each time
    // (which made this memo O(installments × sales) — pinning the main thread
    // when toggling Today/Week/Month with thousands of installments).
    const saleById = new Map<string, Sale>()
    for (const s of sales) saleById.set(s.id, s)

    // Unpaid amount (overdue installments) - Only from non-cancelled sales
    const unpaidInstallments = filteredData.installments.filter((i) => {
      const sale = saleById.get(i.sale_id)
      if (!sale || sale.status === 'cancelled') return false
      return i.status === 'overdue' || (i.status === 'pending' && new Date(i.due_date) < new Date())
    })
    const unpaidAmount = unpaidInstallments.reduce((sum, i) => sum + (i.amount_due - i.amount_paid), 0)
    const uniqueClientsUnpaid = new Set(
      unpaidInstallments.map((i) => {
        const sale = saleById.get(i.sale_id)
        return sale && sale.status !== 'cancelled' ? sale.client_id : undefined
      }).filter(Boolean)
    ).size

    // Paid installments ONLY (not deposits, advances, etc.) - Only from non-cancelled sales
    const paidInsts = filteredData.installments.filter((i) => {
      const sale = saleById.get(i.sale_id)
      return i.status === 'paid' && sale && sale.status !== 'cancelled'
    })
    const paidAmount = paidInsts.reduce((sum, i) => sum + (i.amount_paid || 0), 0)
    const paidInstallments = paidInsts.length
    const uniqueClientsPaid = new Set<string>()
    paidInsts.forEach((i) => {
      const sale = saleById.get(i.sale_id)
      if (sale && sale.status !== 'cancelled') uniqueClientsPaid.add(sale.client_id)
    })

    // Expected this month (installments only) - Only from non-cancelled sales
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    const expectedThisMonth = filteredData.installments
      .filter((i) => {
        const sale = saleById.get(i.sale_id)
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
        const sale = saleById.get(inst.sale_id)
        if (sale && sale.status !== 'cancelled') {
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

    // Same O(1) sale-by-id index trick as the `stats` memo above.
    const saleById = new Map<string, Sale>()
    for (const s of sales) saleById.set(s.id, s)

    const effectiveDate = (s: Sale) => s.status === 'completed' && s.confirmed_at ? s.confirmed_at : (s.sale_date || s.created_at)

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
            date: effectiveDate(sale),
          })
        }
      })

    // Process paid installments - Only from non-cancelled sales
    filteredData.installments
      .filter((i) => i.status === 'paid')
      .forEach((inst) => {
        const sale = saleById.get(inst.sale_id)
        if (sale && sale.status !== 'cancelled') {
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
            date: effectiveDate(sale),
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
            date: effectiveDate(sale),
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
            date: effectiveDate(sale),
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
          date: effectiveDate(sale),
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
    installments: t('finance.typeInstallments'),
    deposits: t('finance.typeDeposits'),
    full: t('finance.typeFull'),
    advance: t('finance.typeAdvance'),
    promise: t('finance.typePromise'),
    commission: t('finance.typeCommission'),
  }

  const filterPills = [
    { id: 'today' as const, label: t('finance.filterToday') },
    { id: 'week' as const, label: t('finance.filterWeek') },
    { id: 'month' as const, label: t('finance.filterMonth') },
    { id: 'all' as const, label: t('finance.filterAll') },
  ]

  return (
    <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 space-y-4 sm:space-y-5 lg:space-y-6">
      {/* Header — title + time filter pills + date input */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0 ring-1 ring-amber-100">
              <svg className="w-5 h-5 sm:w-[22px] sm:h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12V8a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2" />
                <path d="M3 4v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" />
                <circle cx="17" cy="14" r="1.4" fill="currentColor" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-[19px] sm:text-2xl font-bold text-gray-900 tracking-tight truncate">{t('finance.pageTitle')}</h1>
              <p className="text-[11.5px] sm:text-xs text-gray-500 font-medium">{t('finance.paymentsAndCommission')}</p>
            </div>

          </div>

          {/* V1 / V2 toggle */}
          {onNavigate && (
            <div className="inline-flex items-center p-0.5 rounded-full bg-white border border-gray-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex-shrink-0">
              <button
                type="button"
                className="px-3 py-1.5 rounded-full text-[11.5px] font-bold bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-500/30"
              >
                V1
              </button>
              <button
                type="button"
                onClick={() => onNavigate('finance-v2')}
                className="px-3 py-1.5 rounded-full text-[11.5px] font-bold text-gray-600 hover:text-gray-900 transition-colors"
              >
                V2
              </button>
            </div>
          )}
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center p-0.5 rounded-full bg-white border border-gray-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            {filterPills.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setTimeFilter(p.id)}
                className={`px-3 sm:px-3.5 py-1.5 rounded-full text-[12px] sm:text-[12.5px] font-bold transition-all ${
                  timeFilter === p.id
                    ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-500/30'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 ms-auto">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className={`h-9 px-3 rounded-full bg-white border text-[12.5px] text-gray-800 font-medium shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 ${
                dateFilter ? 'border-blue-500 ring-1 ring-blue-500/30' : 'border-gray-200'
              }`}
              placeholder={t('finance.datePlaceholder')}
            />
            {dateFilter && (
              <button
                type="button"
                onClick={() => setDateFilter('')}
                className="h-9 px-3 rounded-full bg-white border border-gray-200 text-[12px] text-gray-700 font-semibold hover:bg-gray-50 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              >
                {t('finance.remove')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ALERT BANNER — visible whenever the user is viewing a non-default scope.
          The numbers shown below this banner reflect ONLY the active filter, so
          we make this clearly noticeable instead of a tiny chip. */}
      {(timeFilter !== 'week' || dateFilter) && (
        <div
          role="status"
          className="animate-slide-down relative overflow-hidden rounded-2xl border-2 border-blue-300/70 bg-gradient-to-l from-blue-50 via-indigo-50/60 to-white shadow-[0_4px_12px_-2px_rgba(59,130,246,0.18)]"
        >
          {/* Accent strip */}
          <span className="absolute inset-y-0 start-0 w-1 bg-gradient-to-b from-blue-500 to-indigo-500" />
          <div className="flex items-center gap-3 px-4 py-3 ps-5">
            {/* Icon tile with pulse halo */}
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-b from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/30 flex items-center justify-center animate-alert-pulse">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
                </svg>
              </div>
            </div>
            {/* Message */}
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-blue-700/80 uppercase tracking-wider mb-0.5">
                {t('notifications.filterLabel') || 'Filter'}
              </p>
              <p className="text-[14px] sm:text-[15px] font-extrabold text-blue-900 tracking-tight truncate">
                {dateFilter ||
                  (timeFilter === 'today' ? t('finance.filterToday')
                  : timeFilter === 'week' ? t('finance.filterWeek')
                  : timeFilter === 'month' ? t('finance.filterMonth')
                  : t('finance.filterAll'))}
              </p>
            </div>
            {/* Clear button — visible and prominent */}
            <button
              type="button"
              onClick={() => { setTimeFilter('week'); setDateFilter('') }}
              className="flex-shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-white border border-blue-200 text-blue-700 text-[12.5px] font-bold hover:bg-blue-50 hover:border-blue-300 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors"
              title={t('finance.remove')}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
              <span className="hidden sm:inline">{t('finance.remove')}</span>
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 min-h-[240px]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-blue-600 mb-3" />
            <p className="text-[13px] text-gray-500 font-semibold">{t('finance.loadingData')}</p>
          </div>
        </div>
      ) : loadError ? (
        <div className="flex items-center justify-center py-12 min-h-[200px]">
          <div className="text-center max-w-md">
            <p className="text-red-700 font-medium mb-3">{loadError}</p>
            <Button onClick={() => loadData()} variant="primary">{t('common.retry') || 'Retry'}</Button>
          </div>
        </div>
      ) : (
        <>
      {/* Main Statistics — 4 colored cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 lg:gap-4">
        {/* Total Revenue (blue) */}
        <div className="relative overflow-hidden rounded-2xl border border-blue-200/70 bg-gradient-to-br from-blue-50 via-blue-50/60 to-white p-3.5 sm:p-4 lg:p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] sm:text-[12.5px] font-bold text-blue-900 tracking-tight">{t('finance.totalRevenue')}</p>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-[15px] h-[15px] sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
          </div>
          <p className="num text-[20px] sm:text-2xl lg:text-3xl font-extrabold text-blue-900 leading-tight tracking-tight mb-1">
            {formatPrice(stats.totalRevenue)} <span className="text-[11px] sm:text-xs font-bold text-blue-700/70">DT</span>
          </p>
          <p className="text-[10.5px] sm:text-[11px] text-blue-700/80 font-semibold">
            {stats.totalPiecesSold} {t('finance.pieceUnit')} · {stats.totalClients} {t('finance.clientUnit')}
          </p>
        </div>

        {/* Total Collected (green) */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-emerald-50/60 to-white p-3.5 sm:p-4 lg:p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] sm:text-[12.5px] font-bold text-emerald-900 tracking-tight">{t('finance.totalCollected')}</p>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-[15px] h-[15px] sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <path d="m9 11 3 3L22 4" />
              </svg>
            </div>
          </div>
          <p className="num text-[20px] sm:text-2xl lg:text-3xl font-extrabold text-emerald-900 leading-tight tracking-tight mb-1">
            {formatPrice(stats.totalCollected)} <span className="text-[11px] sm:text-xs font-bold text-emerald-700/70">DT</span>
          </p>
          <div className="w-full bg-emerald-100/80 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${stats.totalRevenue > 0 ? Math.min((stats.totalCollected / stats.totalRevenue) * 100, 100) : 0}%` }}
            />
          </div>
          <p className="text-[10.5px] sm:text-[11px] text-emerald-700/80 font-semibold mt-1">
            {stats.totalRevenue > 0 ? Math.round((stats.totalCollected / stats.totalRevenue) * 100) : 0}% {t('finance.percentOfRevenue')}
          </p>
        </div>

        {/* Unpaid Amount (red) — clickable */}
        <button
          type="button"
          onClick={() => {
            setSelectedStatType('unpaid')
            setDetailsDialogOpen(true)
          }}
          className="text-right relative overflow-hidden rounded-2xl border border-red-200/70 bg-gradient-to-br from-red-50 via-red-50/60 to-white p-3.5 sm:p-4 lg:p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-md hover:-translate-y-0.5 transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] sm:text-[12.5px] font-bold text-red-900 tracking-tight">{t('finance.unpaidAmount')}</p>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-[15px] h-[15px] sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
            </div>
          </div>
          <p className="num text-[20px] sm:text-2xl lg:text-3xl font-extrabold text-red-900 leading-tight tracking-tight mb-1">
            {formatPrice(stats.unpaidAmount)} <span className="text-[11px] sm:text-xs font-bold text-red-700/70">DT</span>
          </p>
          <p className="text-[10.5px] sm:text-[11px] text-red-700/80 font-semibold">
            {stats.unpaidInstallments} {t('finance.installmentUnit')} · {stats.unpaidClients} {t('finance.clientUnit')}
          </p>
        </button>

        {/* Expected This Month (orange) — clickable */}
        <button
          type="button"
          onClick={() => {
            setSelectedStatType('expected')
            setDetailsDialogOpen(true)
          }}
          className="text-right relative overflow-hidden rounded-2xl border border-orange-200/70 bg-gradient-to-br from-orange-50 via-orange-50/60 to-white p-3.5 sm:p-4 lg:p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-md hover:-translate-y-0.5 transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] sm:text-[12.5px] font-bold text-orange-900 tracking-tight">{t('finance.expectedThisMonth')}</p>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-[15px] h-[15px] sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4" />
                <path d="M8 2v4" />
                <path d="M3 10h18" />
              </svg>
            </div>
          </div>
          <p className="num text-[20px] sm:text-2xl lg:text-3xl font-extrabold text-orange-900 leading-tight tracking-tight mb-1">
            {formatPrice(stats.expectedThisMonth)} <span className="text-[11px] sm:text-xs font-bold text-orange-700/70">DT</span>
          </p>
          <p className="text-[10.5px] sm:text-[11px] text-orange-700/80 font-semibold">
            {t('finance.filterMonth')}
          </p>
        </button>
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


      {/* Payment Types */}
      <div>
        <div className="flex items-center justify-between mb-2.5 sm:mb-3">
          <h2 className="text-[15px] sm:text-base lg:text-lg font-bold text-gray-900 tracking-tight">{t('finance.paymentsAndCommission')}</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
          {(() => {
            const typeMeta: Record<string, { tile: string; ring: string; chip: string; icon: ReactNode }> = {
              installments: {
                tile: 'bg-violet-50 text-violet-600',
                ring: 'ring-violet-100',
                chip: 'bg-violet-100 text-violet-700',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="5" width="20" height="14" rx="2.5" />
                    <path d="M2 10h20" />
                    <path d="M6 15h4" />
                  </svg>
                ),
              },
              deposits: {
                tile: 'bg-blue-50 text-blue-600',
                ring: 'ring-blue-100',
                chip: 'bg-blue-100 text-blue-700',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12V8a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2" />
                    <path d="M3 4v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" />
                    <circle cx="17" cy="14" r="1.4" fill="currentColor" />
                  </svg>
                ),
              },
              full: {
                tile: 'bg-emerald-50 text-emerald-600',
                ring: 'ring-emerald-100',
                chip: 'bg-emerald-100 text-emerald-700',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <path d="m9 11 3 3L22 4" />
                  </svg>
                ),
              },
              advance: {
                tile: 'bg-orange-50 text-orange-600',
                ring: 'ring-orange-100',
                chip: 'bg-orange-100 text-orange-700',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v20" />
                    <path d="m17 5-5 5-5-5" />
                  </svg>
                ),
              },
              promise: {
                tile: 'bg-amber-50 text-amber-600',
                ring: 'ring-amber-100',
                chip: 'bg-amber-100 text-amber-700',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                ),
              },
              commission: {
                tile: 'bg-indigo-50 text-indigo-600',
                ring: 'ring-indigo-100',
                chip: 'bg-indigo-100 text-indigo-700',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="m16 8-8 8" />
                    <circle cx="9" cy="9" r="1" fill="currentColor" />
                    <circle cx="15" cy="15" r="1" fill="currentColor" />
                  </svg>
                ),
              },
            }
            return Object.entries(filteredPaymentTypes).map(([type, data]) => {
              const m = typeMeta[type] || typeMeta.deposits
              const disabled = data.count === 0
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    if (!disabled) {
                      setSelectedType(type)
                      setDetailsDialogOpen(true)
                    }
                  }}
                  disabled={disabled}
                  className={`group text-right relative rounded-2xl border bg-white p-3 sm:p-3.5 transition-all
                    ${disabled
                      ? 'opacity-50 cursor-not-allowed border-gray-200/70'
                      : 'border-gray-200/80 hover:border-blue-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
                    }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl ring-1 flex items-center justify-center flex-shrink-0 ${m.tile} ${m.ring}`}>
                      <span className="w-[18px] h-[18px] sm:w-5 sm:h-5">{m.icon}</span>
                    </div>
                    {data.count > 0 && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${m.chip} whitespace-nowrap`}>
                        {data.pieces} {t('finance.pieceUnit')}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] sm:text-[12px] font-semibold text-gray-500 mb-0.5">{typeLabels[type]}</p>
                  <p className="num text-[16px] sm:text-[18px] lg:text-xl font-extrabold text-gray-900 leading-tight tracking-tight mb-0.5">
                    {formatPrice(data.amount)} <span className="text-[10px] sm:text-[11px] font-bold text-gray-400">DT</span>
                  </p>
                  <p className="text-[10.5px] text-gray-400 font-semibold">{data.count} {t('finance.operationCount')}</p>
                </button>
              )
            })
          })()}
        </div>
      </div>

      {/* Place-Based Breakdown — always 2 columns minimum */}
      {placeBreakdown.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2.5 sm:mb-3">
            <h2 className="text-[15px] sm:text-base lg:text-lg font-bold text-gray-900 tracking-tight">{t('finance.placeDetailsTitle')}</h2>
            <span className="text-[11px] text-gray-400 font-semibold tabular-nums">
              {Math.min(placesShown, placeBreakdown.length)} / {placeBreakdown.length}
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
            {placeBreakdown.slice(0, placesShown).map((place) => {
              const collectionRate = place.totalRevenue > 0
                ? (place.totalCollected / place.totalRevenue) * 100
                : 0
              const tone =
                collectionRate >= 70
                  ? { bar: 'from-emerald-500 to-emerald-600', text: 'text-emerald-700', chip: 'bg-emerald-50 text-emerald-700 border-emerald-100' }
                  : collectionRate >= 50
                  ? { bar: 'from-amber-500 to-amber-600', text: 'text-amber-700', chip: 'bg-amber-50 text-amber-700 border-amber-100' }
                  : { bar: 'from-rose-500 to-rose-600', text: 'text-rose-700', chip: 'bg-rose-50 text-rose-700 border-rose-100' }

              return (
                <button
                  key={place.name}
                  type="button"
                  onClick={() => {
                    setSelectedPlaceDetails(place)
                    setPlaceDetailsDialogOpen(true)
                  }}
                  className="text-right relative overflow-hidden rounded-2xl border border-gray-200/80 bg-white p-3 sm:p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-md hover:border-blue-200 hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0 ring-1 ring-violet-100">
                        <svg className="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12Z" />
                          <circle cx="12" cy="10" r="2.5" />
                        </svg>
                      </div>
                      <h3 className="text-[12.5px] sm:text-[14px] font-bold text-gray-900 truncate">{place.name}</h3>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded-full text-[9.5px] font-bold border ${tone.chip} whitespace-nowrap flex-shrink-0`}>
                      {place.batches.size}
                    </span>
                  </div>

                  <div className="space-y-1 mb-2 text-[11.5px]">
                    <div className="flex justify-between items-baseline gap-1">
                      <span className="text-gray-500 font-medium truncate">{t('finance.totalCollected')}</span>
                      <span className="num font-extrabold text-emerald-600 whitespace-nowrap">{formatPrice(place.totalCollected)}</span>
                    </div>
                    <div className="flex justify-between items-baseline gap-1">
                      <span className="text-gray-500 font-medium truncate">{t('finance.totalRevenue')}</span>
                      <span className="num font-bold text-gray-900 whitespace-nowrap">{formatPrice(place.totalRevenue)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full bg-gradient-to-r ${tone.bar} transition-all duration-500`}
                        style={{ width: `${Math.min(collectionRate, 100)}%` }}
                      />
                    </div>
                    <span className={`num text-[11.5px] font-extrabold ${tone.text}`}>{Math.round(collectionRate)}%</span>
                  </div>

                  <div className="flex justify-between gap-1 text-[10px] text-gray-500 font-semibold pt-1.5 border-t border-gray-100">
                    <span className="truncate">{place.pieces} {t('finance.pieceUnit')}</span>
                    <span className="truncate">{place.clients.size} {t('finance.clientUnit')}</span>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Load more / collapse */}
          {placeBreakdown.length > PAGE_SIZE_PLACES && (
            <div className="mt-3 flex items-center justify-center gap-2">
              {placesShown < placeBreakdown.length ? (
                <button
                  type="button"
                  onClick={() => setPlacesShown((p) => p + PAGE_SIZE_PLACES)}
                  className="h-9 px-4 rounded-full bg-white border border-gray-200 text-[12.5px] font-bold text-gray-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-gray-50 hover:border-gray-300 transition-colors inline-flex items-center gap-1.5"
                >
                  <span>{t('common.loadMore') || 'Charger plus'}</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] tabular-nums">
                    +{Math.min(PAGE_SIZE_PLACES, placeBreakdown.length - placesShown)}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPlacesShown(PAGE_SIZE_PLACES)}
                  className="h-9 px-4 rounded-full bg-white border border-gray-200 text-[12.5px] font-bold text-gray-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-gray-50 transition-colors"
                >
                  {t('common.collapse') || 'Réduire'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Seller Performance — 2-column grid (always paired) */}
      {sellerPerformance.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2.5 sm:mb-3">
            <h2 className="text-[15px] sm:text-base lg:text-lg font-bold text-gray-900 tracking-tight">{t('finance.sellerPerformance')}</h2>
            <span className="text-[11px] text-gray-400 font-semibold tabular-nums">
              {Math.min(sellersShown, sellerPerformance.length)} / {sellerPerformance.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {sellerPerformance.slice(0, sellersShown).map((seller, index) => {
              const maxTotal = sellerPerformance[0]?.total || 1
              const performancePercentage = (seller.total / maxTotal) * 100
              const rankStyles = [
                'bg-gradient-to-br from-yellow-400 to-yellow-500 text-white shadow-md shadow-yellow-500/30',
                'bg-gradient-to-br from-gray-300 to-gray-400 text-white shadow-md shadow-gray-400/30',
                'bg-gradient-to-br from-orange-400 to-orange-500 text-white shadow-md shadow-orange-500/30',
              ]
              const defaultRank = 'bg-gray-100 text-gray-700'
              const barTone =
                performancePercentage >= 80 ? 'from-emerald-500 to-emerald-600' :
                performancePercentage >= 50 ? 'from-blue-500 to-blue-600' :
                performancePercentage >= 30 ? 'from-amber-500 to-amber-600' :
                'from-rose-500 to-rose-600'

              return (
                <div key={seller.id} className="rounded-2xl border border-gray-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center gap-2 mb-2 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-[12px] flex-shrink-0 ${rankStyles[index] || defaultRank}`}>
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] sm:text-[13.5px] font-bold text-gray-900 truncate tracking-tight">{seller.name}</p>
                      {seller.place && (
                        <p className="text-[10px] text-gray-500 truncate font-semibold">{seller.place}</p>
                      )}
                    </div>
                  </div>
                  <p className="num text-[14px] sm:text-[15px] font-extrabold text-gray-900 tracking-tight mb-0.5">
                    {formatPrice(seller.total)} <span className="text-[9.5px] font-bold text-gray-400">DT</span>
                  </p>
                  <p className="text-[10px] text-gray-500 font-semibold mb-2">{seller.count} {t('finance.operationCount')}</p>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full bg-gradient-to-r ${barTone} transition-all duration-500`}
                      style={{ width: `${performancePercentage}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Load more / collapse */}
          {sellerPerformance.length > PAGE_SIZE_SELLERS && (
            <div className="mt-3 flex items-center justify-center gap-2">
              {sellersShown < sellerPerformance.length ? (
                <button
                  type="button"
                  onClick={() => setSellersShown((p) => p + PAGE_SIZE_SELLERS)}
                  className="h-9 px-4 rounded-full bg-white border border-gray-200 text-[12.5px] font-bold text-gray-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-gray-50 hover:border-gray-300 transition-colors inline-flex items-center gap-1.5"
                >
                  <span>{t('common.loadMore') || 'Charger plus'}</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] tabular-nums">
                    +{Math.min(PAGE_SIZE_SELLERS, sellerPerformance.length - sellersShown)}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSellersShown(PAGE_SIZE_SELLERS)}
                  className="h-9 px-4 rounded-full bg-white border border-gray-200 text-[12.5px] font-bold text-gray-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-gray-50 transition-colors"
                >
                  {t('common.collapse') || 'Réduire'}
                </button>
              )}
            </div>
          )}
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


      {/* Place Details Dialog */}
      {selectedPlaceDetails && (
        <Dialog
          open={placeDetailsDialogOpen}
          onClose={() => {
            setPlaceDetailsDialogOpen(false)
            setSelectedPlaceDetails(null)
          }}
          title={`${t('finance.placeDetailsTitle')}: ${selectedPlaceDetails.name}`}
          size="xl"
        >
          {(() => {
            const cr = selectedPlaceDetails.totalRevenue > 0
              ? selectedPlaceDetails.totalCollected / selectedPlaceDetails.totalRevenue
              : 0
            const tone = cr >= 0.7
              ? { bar: 'from-emerald-500 to-emerald-600', text: 'text-emerald-700' }
              : cr >= 0.5
              ? { bar: 'from-amber-500 to-amber-600', text: 'text-amber-700' }
              : { bar: 'from-rose-500 to-rose-600', text: 'text-rose-700' }
            return (
              <div className="space-y-4">
                {/* Summary tiles */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                  <div className="rounded-2xl border border-blue-200/70 bg-gradient-to-br from-blue-50 via-blue-50/60 to-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <p className="text-[11px] font-bold text-blue-900 mb-1">{t('finance.totalRevenue')}</p>
                    <p className="num text-[18px] sm:text-xl font-extrabold text-blue-900 tracking-tight">
                      {formatPrice(selectedPlaceDetails.totalRevenue)} <span className="text-[10px] font-bold text-blue-700/70">DT</span>
                    </p>
                  </div>
                  <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-emerald-50/60 to-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <p className="text-[11px] font-bold text-emerald-900 mb-1">{t('finance.totalCollected')}</p>
                    <p className="num text-[18px] sm:text-xl font-extrabold text-emerald-900 tracking-tight">
                      {formatPrice(selectedPlaceDetails.totalCollected)} <span className="text-[10px] font-bold text-emerald-700/70">DT</span>
                    </p>
                  </div>
                  <div className="rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50 via-violet-50/60 to-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <p className="text-[11px] font-bold text-violet-900 mb-1">{t('finance.pieceCount')}</p>
                    <p className="num text-[18px] sm:text-xl font-extrabold text-violet-900 tracking-tight">{selectedPlaceDetails.pieces}</p>
                  </div>
                  <div className="rounded-2xl border border-orange-200/70 bg-gradient-to-br from-orange-50 via-orange-50/60 to-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <p className="text-[11px] font-bold text-orange-900 mb-1">{t('finance.clientCount')}</p>
                    <p className="num text-[18px] sm:text-xl font-extrabold text-orange-900 tracking-tight">{selectedPlaceDetails.clients.size}</p>
                  </div>
                </div>

                {/* Collection rate */}
                <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-[13px] font-bold text-gray-900 tracking-tight">{t('finance.collectionRate')}</p>
                    <span className={`num text-xl font-extrabold ${tone.text}`}>
                      {Math.round(cr * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-2.5 rounded-full bg-gradient-to-r ${tone.bar} transition-all duration-500`}
                      style={{ width: `${Math.min(cr * 100, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Batches */}
                <div>
                  <h3 className="text-[13.5px] font-bold text-gray-900 mb-2 tracking-tight flex items-center gap-2">
                    {t('finance.batchesLabel')}
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold">{selectedPlaceDetails.batches.size}</span>
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Array.from(selectedPlaceDetails.batches).map((batchId) => {
                      const batch = availableBatches.find(b => b.id === batchId)
                      if (!batch) return null
                      return (
                        <div key={batchId} className="rounded-xl border border-gray-200/80 bg-white p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex items-center gap-2">
                          <span className="w-7 h-7 rounded-lg bg-cyan-50 text-cyan-600 ring-1 ring-cyan-100 flex items-center justify-center flex-shrink-0">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2 22h20" /><path d="M3 22V8l9-6 9 6v14" /><path d="M7 22v-7h10v7" />
                            </svg>
                          </span>
                          <p className="text-[12.5px] font-bold text-gray-900 truncate">{batch.name}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Sales list — paginated to keep the DOM light */}
                <div>
                  <h3 className="text-[13.5px] font-bold text-gray-900 mb-2 tracking-tight flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      {t('finance.salesLabel')}
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold tabular-nums">
                        {selectedPlaceDetails.sales.length}
                      </span>
                    </span>
                    {selectedPlaceDetails.sales.length > PAGE_SIZE_DIALOG_SALES && (
                      <span className="text-[10.5px] font-semibold text-gray-400 tabular-nums">
                        {Math.min(dialogSalesShown, selectedPlaceDetails.sales.length)} / {selectedPlaceDetails.sales.length}
                      </span>
                    )}
                  </h3>
                  <div className="space-y-2 pe-1">
                    {selectedPlaceDetails.sales.slice(0, dialogSalesShown).map((sale) => {
                      const tone =
                        sale.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                        sale.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                        'bg-rose-50 text-rose-700 border-rose-100'
                      return (
                        <div key={sale.id} className="rounded-xl border border-gray-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-blue-200 transition-colors">
                          <div className="flex items-start justify-between gap-3 mb-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100 flex items-center justify-center flex-shrink-0 text-[11px] font-extrabold">
                                #{sale.piece?.piece_number || '?'}
                              </span>
                              <p className="text-[13px] font-bold text-gray-900 truncate">
                                {sale.client?.name || t('shared.unknown')}
                              </p>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${tone}`}>
                              {sale.status === 'completed' ? t('finance.statusCompleted') : sale.status === 'pending' ? t('finance.statusPending') : sale.status}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
                            <div className="flex justify-between">
                              <span className="text-gray-500 font-medium">{t('finance.batch')}</span>
                              <span className="font-bold text-gray-800 truncate">{sale.batch?.name || t('shared.unknown')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500 font-medium">{t('finance.price')}</span>
                              <span className="num font-extrabold text-gray-900">{formatPrice(sale.sale_price)} DT</span>
                            </div>
                            {sale.deposit_amount ? (
                              <div className="flex justify-between col-span-2">
                                <span className="text-gray-500 font-medium">{t('finance.deposit')}</span>
                                <span className="num font-bold text-blue-700">{formatPrice(sale.deposit_amount)} DT</span>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Load more / collapse for dialog sales */}
                  {selectedPlaceDetails.sales.length > PAGE_SIZE_DIALOG_SALES && (
                    <div className="mt-3 flex items-center justify-center">
                      {dialogSalesShown < selectedPlaceDetails.sales.length ? (
                        <button
                          type="button"
                          onClick={() => setDialogSalesShown((p) => p + PAGE_SIZE_DIALOG_SALES)}
                          className="h-9 px-4 rounded-full bg-white border border-gray-200 text-[12.5px] font-bold text-gray-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-gray-50 hover:border-gray-300 transition-colors inline-flex items-center gap-1.5"
                        >
                          <span>{t('common.loadMore') || 'Charger plus'}</span>
                          <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] tabular-nums">
                            +{Math.min(PAGE_SIZE_DIALOG_SALES, selectedPlaceDetails.sales.length - dialogSalesShown)}
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDialogSalesShown(PAGE_SIZE_DIALOG_SALES)}
                          className="h-9 px-4 rounded-full bg-white border border-gray-200 text-[12.5px] font-bold text-gray-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-gray-50 transition-colors"
                        >
                          {t('common.collapse') || 'Réduire'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </Dialog>
      )}
        </>
      )}
    </div>
  )
}
