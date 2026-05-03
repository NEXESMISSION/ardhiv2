import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/utils/priceCalculator'
import { calculateInstallmentWithDeposit } from '@/utils/installmentCalculator'
import { buildSaleQuery, formatSalesWithSellers } from '@/utils/salesQueries'
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
  status: string
  payment_method: 'full' | 'installment' | 'promise' | null
  payment_offer_id: string | null
  partial_payment_amount: number | null
  company_fee_amount: number | null
  sold_by: string | null
  confirmed_by: string | null
  confirmed_at: string | null
  created_at: string
  client?: { id: string; name: string; id_number: string }
  piece?: { id: string; piece_number: string; surface_m2: number }
  batch?: { id: string; name: string; location?: string | null }
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
  seller?: { id: string; name: string; place: string | null }
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

interface FinanceV2PageProps {
  onNavigate?: (page: string) => void
}

// Compute "money collected" inside a [from, to) window. This includes:
// deposits, advances (after deposit), full payments, paid installments, and
// promise partial payments — exactly the same definition as v1's totalCollected,
// but date-filtered.
function collectedInWindow(
  sales: Sale[],
  installments: InstallmentPayment[],
  saleById: Map<string, Sale>,
  from: Date,
  to: Date
) {
  const inWindow = (date: string | null | undefined) => {
    if (!date) return false
    const d = new Date(date)
    return d >= from && d < to
  }

  let total = 0
  // Deposits — paid at sale_date (or confirmed_at when set)
  sales
    .filter((s) => s.status !== 'cancelled' && s.deposit_amount)
    .forEach((s) => {
      if (inWindow(s.confirmed_at || s.sale_date || s.created_at)) {
        total += s.deposit_amount || 0
      }
    })
  // Paid installments — paid_date
  installments
    .filter((i) => i.status === 'paid' && i.paid_date)
    .forEach((inst) => {
      const sale = saleById.get(inst.sale_id)
      if (!sale || sale.status === 'cancelled') return
      if (inWindow(inst.paid_date)) {
        total += inst.amount_paid || 0
      }
    })
  // Full payments
  sales
    .filter((s) => s.status === 'completed' && s.payment_method === 'full')
    .forEach((s) => {
      if (inWindow(s.confirmed_at || s.sale_date || s.created_at)) {
        const fullPayment = s.sale_price - (s.deposit_amount || 0)
        if (fullPayment > 0) total += fullPayment
      }
    })
  // Advances
  sales
    .filter((s) => s.status === 'completed' && s.payment_method === 'installment' && s.payment_offer && s.piece)
    .forEach((s) => {
      if (inWindow(s.confirmed_at || s.sale_date || s.created_at)) {
        const calc = calculateInstallmentWithDeposit(
          s.piece!.surface_m2,
          {
            price_per_m2_installment: s.payment_offer!.price_per_m2_installment,
            advance_mode: s.payment_offer!.advance_mode,
            advance_value: s.payment_offer!.advance_value,
            calc_mode: s.payment_offer!.calc_mode,
            monthly_amount: s.payment_offer!.monthly_amount,
            months: s.payment_offer!.months,
          },
          s.deposit_amount || 0
        )
        if (calc.advanceAfterDeposit > 0) total += calc.advanceAfterDeposit
      }
    })
  // Promise payments
  sales
    .filter((s) => s.payment_method === 'promise' && s.partial_payment_amount && s.status !== 'cancelled')
    .forEach((s) => {
      if (inWindow(s.confirmed_at || s.sale_date || s.created_at)) {
        const promisePayment = (s.partial_payment_amount || 0) - (s.deposit_amount || 0)
        if (promisePayment > 0) total += promisePayment
      }
    })

  return total
}

type Period = 'week' | 'month'

function getPeriodBounds(period: Period, now = new Date()) {
  if (period === 'week') {
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const day = startOfDay.getDay() // 0 = Sunday
    const startOfThisWeek = new Date(startOfDay)
    startOfThisWeek.setDate(startOfDay.getDate() - day)
    const startOfNextWeek = new Date(startOfThisWeek)
    startOfNextWeek.setDate(startOfThisWeek.getDate() + 7)
    const startOfLastWeek = new Date(startOfThisWeek)
    startOfLastWeek.setDate(startOfThisWeek.getDate() - 7)
    return { start: startOfThisWeek, end: startOfNextWeek, prevStart: startOfLastWeek, prevEnd: startOfThisWeek }
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return { start, end, prevStart, prevEnd: start }
}

export function FinanceV2Page({ onNavigate }: FinanceV2PageProps) {
  const { t, language } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sales, setSales] = useState<Sale[]>([])
  const [installmentPayments, setInstallmentPayments] = useState<InstallmentPayment[]>([])

  const [period, setPeriod] = useState<Period>('week')
  const [overdueShown, setOverdueShown] = useState(5)
  const [upcomingShown, setUpcomingShown] = useState(5)

  useEffect(() => {
    loadData()
    const onUpdated = () => loadData()
    window.addEventListener('saleUpdated', onUpdated)
    return () => window.removeEventListener('saleUpdated', onUpdated)
  }, [])

  useSalesRealtime({
    onSaleUpdated: () => {
      if (!loading) loadData()
    },
  })

  async function loadData() {
    setLoading(true)
    setLoadError(null)
    try {
      const [salesResult, instResult] = await Promise.all([
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
          .limit(5000),
      ])
      if (salesResult.error) throw salesResult.error
      if (instResult.error) throw instResult.error
      const formatted = await formatSalesWithSellers(salesResult.data || [])
      setSales(formatted)
      setInstallmentPayments(instResult.data || [])
    } catch (e: any) {
      console.error('FinanceV2 load error:', e)
      setLoadError(e?.message || t('finance.loadingData'))
    } finally {
      setLoading(false)
    }
  }

  // ─── Computed insights ───────────────────────────────────────────────
  const insights = useMemo(() => {
    const saleById = new Map<string, Sale>()
    for (const s of sales) saleById.set(s.id, s)

    const now = new Date()
    const { start: pStart, end: pEnd, prevStart, prevEnd } = getPeriodBounds(period, now)

    // Money collected in this/previous period
    const collectedThis = collectedInWindow(sales, installmentPayments, saleById, pStart, pEnd)
    const collectedPrev = collectedInWindow(sales, installmentPayments, saleById, prevStart, prevEnd)

    // Revenue (price of completed sales) in same windows
    const revenueInWindow = (from: Date, to: Date) => {
      return sales
        .filter((s) => s.status === 'completed')
        .filter((s) => {
          const d = new Date(s.confirmed_at || s.sale_date || s.created_at)
          return d >= from && d < to
        })
        .reduce((sum, s) => sum + s.sale_price, 0)
    }
    const revenueThis = revenueInWindow(pStart, pEnd)
    const revenuePrev = revenueInWindow(prevStart, prevEnd)

    // Delta — % change in collections
    const deltaPct = collectedPrev > 0
      ? Math.round(((collectedThis - collectedPrev) / collectedPrev) * 100)
      : (collectedThis > 0 ? 100 : 0)

    // Upcoming installments — pending and due in [today, today+7d)
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const sevenDaysOut = new Date(startOfToday)
    sevenDaysOut.setDate(startOfToday.getDate() + 7)
    type Upcoming = {
      id: string
      clientId: string
      clientName: string
      amount: number
      dueDate: string
      daysUntil: number
    }
    const upcoming: Upcoming[] = installmentPayments
      .filter((i) => {
        if (i.status !== 'pending') return false
        const d = new Date(i.due_date)
        if (d < startOfToday || d >= sevenDaysOut) return false
        const sale = saleById.get(i.sale_id)
        return !!sale && sale.status !== 'cancelled'
      })
      .map((i) => {
        const sale = saleById.get(i.sale_id)!
        const due = new Date(i.due_date)
        const daysUntil = Math.max(0, Math.ceil((due.getTime() - startOfToday.getTime()) / 86_400_000))
        return {
          id: i.id,
          clientId: sale.client_id,
          clientName: sale.client?.name || '—',
          amount: i.amount_due - i.amount_paid,
          dueDate: i.due_date,
          daysUntil,
        }
      })
      .filter((u) => u.amount > 0)
      .sort((a, b) => a.daysUntil - b.daysUntil)

    // Overdue: pending or overdue installments past due date, grouped by client
    type Overdue = {
      clientId: string
      clientName: string
      idNumber: string
      totalOwed: number
      installments: number
      oldestDaysLate: number
    }
    const overdueMap = new Map<string, Overdue>()
    installmentPayments
      .filter((i) => {
        const sale = saleById.get(i.sale_id)
        if (!sale || sale.status === 'cancelled') return false
        if (i.status !== 'overdue' && !(i.status === 'pending' && new Date(i.due_date) < now)) return false
        return true
      })
      .forEach((i) => {
        const sale = saleById.get(i.sale_id)!
        const clientId = sale.client_id
        const owed = (i.amount_due - i.amount_paid)
        if (owed <= 0) return
        const days = Math.max(0, Math.floor((now.getTime() - new Date(i.due_date).getTime()) / 86_400_000))
        const existing = overdueMap.get(clientId)
        if (existing) {
          existing.totalOwed += owed
          existing.installments += 1
          existing.oldestDaysLate = Math.max(existing.oldestDaysLate, days)
        } else {
          overdueMap.set(clientId, {
            clientId,
            clientName: sale.client?.name || '—',
            idNumber: sale.client?.id_number || '',
            totalOwed: owed,
            installments: 1,
            oldestDaysLate: days,
          })
        }
      })

    const overdueClients = Array.from(overdueMap.values())
      .sort((a, b) => b.totalOwed - a.totalOwed)
    const totalOverdue = overdueClients.reduce((s, c) => s + c.totalOwed, 0)

    // Lifetime revenue + collected (for collection-rate health)
    const totalRevenueAllTime = sales
      .filter((s) => s.status === 'completed')
      .reduce((sum, s) => sum + s.sale_price, 0)
    let totalCollectedAllTime = 0
    sales.filter((s) => s.status !== 'cancelled').forEach((s) => {
      if (s.deposit_amount) totalCollectedAllTime += s.deposit_amount
    })
    installmentPayments.filter((i) => i.status === 'paid').forEach((inst) => {
      const sale = saleById.get(inst.sale_id)
      if (sale && sale.status !== 'cancelled') totalCollectedAllTime += inst.amount_paid || 0
    })
    sales
      .filter((s) => s.status === 'completed' && s.payment_method === 'full')
      .forEach((s) => {
        const fp = s.sale_price - (s.deposit_amount || 0)
        if (fp > 0) totalCollectedAllTime += fp
      })
    sales
      .filter((s) => s.status === 'completed' && s.payment_method === 'installment' && s.payment_offer && s.piece)
      .forEach((s) => {
        const calc = calculateInstallmentWithDeposit(
          s.piece!.surface_m2,
          {
            price_per_m2_installment: s.payment_offer!.price_per_m2_installment,
            advance_mode: s.payment_offer!.advance_mode,
            advance_value: s.payment_offer!.advance_value,
            calc_mode: s.payment_offer!.calc_mode,
            monthly_amount: s.payment_offer!.monthly_amount,
            months: s.payment_offer!.months,
          },
          s.deposit_amount || 0
        )
        if (calc.advanceAfterDeposit > 0) totalCollectedAllTime += calc.advanceAfterDeposit
      })
    sales
      .filter((s) => s.payment_method === 'promise' && s.partial_payment_amount && s.status !== 'cancelled')
      .forEach((s) => {
        const pp = (s.partial_payment_amount || 0) - (s.deposit_amount || 0)
        if (pp > 0) totalCollectedAllTime += pp
      })

    const collectionRate = totalRevenueAllTime > 0
      ? totalCollectedAllTime / totalRevenueAllTime
      : 0

    // Health label based on rate AND overdue count
    let health: 'good' | 'watch' | 'act' = 'good'
    if (collectionRate < 0.4 || overdueClients.length >= 20) health = 'act'
    else if (collectionRate < 0.65 || overdueClients.length >= 5) health = 'watch'

    // Top location (highest collected this month) — fall back to all-time
    const placeMap = new Map<string, { name: string; collected: number; sales: number }>()
    sales
      .filter((s) => s.batch?.location && s.status !== 'cancelled')
      .forEach((s) => {
        const place = s.batch!.location!
        if (!placeMap.has(place)) placeMap.set(place, { name: place, collected: 0, sales: 0 })
        const entry = placeMap.get(place)!
        entry.sales += 1
      })
    // Add collected per place
    const collectedPerPlace = (from: Date, to: Date) => {
      const inWindow = (date: string | null | undefined) => {
        if (!date) return false
        const d = new Date(date)
        return d >= from && d < to
      }
      sales
        .filter((s) => s.status !== 'cancelled' && s.batch?.location && s.deposit_amount && inWindow(s.confirmed_at || s.sale_date || s.created_at))
        .forEach((s) => {
          const m = placeMap.get(s.batch!.location!)
          if (m) m.collected += s.deposit_amount || 0
        })
      installmentPayments
        .filter((i) => i.status === 'paid' && i.paid_date && inWindow(i.paid_date))
        .forEach((inst) => {
          const sale = saleById.get(inst.sale_id)
          if (sale && sale.status !== 'cancelled' && sale.batch?.location) {
            const m = placeMap.get(sale.batch.location)
            if (m) m.collected += inst.amount_paid || 0
          }
        })
    }
    collectedPerPlace(pStart, pEnd)
    const topLocation = Array.from(placeMap.values()).sort((a, b) => b.collected - a.collected)[0] || null

    // Top seller (highest collected this period)
    const sellerMap = new Map<string, { id: string; name: string; place: string | null; total: number; ops: number }>()
    sales
      .filter((s) => s.seller && s.status !== 'cancelled')
      .forEach((s) => {
        const sellerId = s.seller!.id
        if (!sellerMap.has(sellerId)) {
          sellerMap.set(sellerId, { id: sellerId, name: s.seller!.name, place: s.seller!.place, total: 0, ops: 0 })
        }
        const inPeriod = (date: string | null | undefined) => {
          if (!date) return false
          const d = new Date(date)
          return d >= pStart && d < pEnd
        }
        if (inPeriod(s.confirmed_at || s.sale_date || s.created_at)) {
          const entry = sellerMap.get(sellerId)!
          entry.total += s.deposit_amount || 0
          entry.ops += 1
        }
      })
    installmentPayments
      .filter((i) => i.status === 'paid' && i.paid_date)
      .forEach((inst) => {
        const sale = saleById.get(inst.sale_id)
        if (!sale || !sale.seller || sale.status === 'cancelled') return
        const d = new Date(inst.paid_date!)
        if (d >= pStart && d < pEnd) {
          const entry = sellerMap.get(sale.seller.id)
          if (entry) {
            entry.total += inst.amount_paid || 0
            entry.ops += 1
          }
        }
      })
    const topSeller = Array.from(sellerMap.values()).sort((a, b) => b.total - a.total)[0] || null

    // Portfolio KPIs (lifetime, not period-scoped)
    const activeClients = new Set(
      sales.filter((s) => s.status !== 'cancelled').map((s) => s.client_id)
    ).size
    const piecesSold = sales.filter((s) => s.status === 'completed').length
    const locations = new Set(
      sales.filter((s) => s.status !== 'cancelled' && s.batch?.location).map((s) => s.batch!.location!)
    ).size
    const activeSellers = new Set(
      sales.filter((s) => s.status !== 'cancelled' && s.seller?.id).map((s) => s.seller!.id)
    ).size

    return {
      collectedThis,
      collectedPrev,
      revenueThis,
      revenuePrev,
      deltaPct,
      upcoming,
      overdueClients,
      totalOverdue,
      collectionRate,
      health,
      topLocation,
      topSeller,
      activeClients,
      piecesSold,
      locations,
      activeSellers,
    }
  }, [sales, installmentPayments, period])

  // ─── Render helpers ──────────────────────────────────────────────────
  const Hero = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
    <div className={`relative overflow-hidden rounded-3xl border border-gray-200/80 bg-white p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>
      {children}
    </div>
  )

  const healthMeta = {
    good: { label: t('finance.v2StatusGood'), tile: 'bg-emerald-100 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
    watch: { label: t('finance.v2StatusWatch'), tile: 'bg-amber-100 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
    act: { label: t('finance.v2StatusAct'), tile: 'bg-rose-100 text-rose-700 ring-rose-200', dot: 'bg-rose-500' },
  } as const

  const isUp = insights.deltaPct >= 0

  return (
    <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 space-y-4 sm:space-y-5 lg:space-y-6">
      {/* Header — title + version toggle (V1 / V2) */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 ring-1 ring-blue-100">
            <svg className="w-5 h-5 sm:w-[22px] sm:h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="m7 14 4-4 4 4 5-5" />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-[19px] sm:text-2xl font-bold text-gray-900 tracking-tight truncate">{t('finance.v2Title')}</h1>
            <p className="text-[11.5px] sm:text-xs text-gray-500 font-medium">{t('finance.v2Subtitle')}</p>
          </div>
        </div>

        {/* Right side: period + version toggles, stacked on mobile */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {/* Period toggle (Week / Month) */}
          <div className="inline-flex items-center p-0.5 rounded-full bg-white border border-gray-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <button
              type="button"
              onClick={() => setPeriod('week')}
              className={`px-3 py-1.5 rounded-full text-[11.5px] font-bold transition-all ${
                period === 'week'
                  ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-500/30'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('finance.v2PeriodWeek')}
            </button>
            <button
              type="button"
              onClick={() => setPeriod('month')}
              className={`px-3 py-1.5 rounded-full text-[11.5px] font-bold transition-all ${
                period === 'month'
                  ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-500/30'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('finance.v2PeriodMonth')}
            </button>
          </div>

          {/* V1 / V2 toggle */}
          <div className="inline-flex items-center p-0.5 rounded-full bg-white border border-gray-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <button
              type="button"
              onClick={() => onNavigate?.('finance')}
              className="px-3 py-1 rounded-full text-[10.5px] font-bold text-gray-600 hover:text-gray-900 transition-colors"
            >
              V1
            </button>
            <button
              type="button"
              className="px-3 py-1 rounded-full text-[10.5px] font-bold bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-500/30"
            >
              V2
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 min-h-[240px]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-blue-600 mb-3" />
            <p className="text-[13px] text-gray-500 font-semibold">{t('finance.loadingData')}</p>
          </div>
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50/70 p-6 text-center">
          <p className="text-red-700 font-bold mb-3 text-sm">{loadError}</p>
          <button
            type="button"
            onClick={loadData}
            className="h-9 px-4 rounded-xl bg-white border border-red-200 text-[12.5px] font-bold text-red-700 hover:bg-red-50"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : (
        <>
          {/* HERO — "How are we doing?" */}
          <Hero>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-[12px] sm:text-[13px] text-gray-500 font-semibold mb-1">
                  {period === 'week' ? t('finance.v2HeroLabelWeek') : t('finance.v2HeroLabelMonth')}
                </p>
                <p className="num text-[34px] sm:text-5xl font-extrabold text-gray-900 leading-none tracking-tight">
                  {formatPrice(insights.collectedThis)} <span className="text-base sm:text-lg font-bold text-gray-400">DT</span>
                </p>
              </div>

              {/* Status badge */}
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ring-1 text-[11px] font-bold ${healthMeta[insights.health].tile}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${healthMeta[insights.health].dot}`} />
                {healthMeta[insights.health].label}
              </span>
            </div>

            {/* Delta vs previous period */}
            <div className="flex items-center gap-2 mb-4">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                isUp ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
              }`}>
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  {isUp ? (
                    <>
                      <path d="m6 12 6-6 6 6" />
                      <path d="M12 6v12" />
                    </>
                  ) : (
                    <>
                      <path d="m18 12-6 6-6-6" />
                      <path d="M12 18V6" />
                    </>
                  )}
                </svg>
                {Math.abs(insights.deltaPct)}%
              </span>
              <span className="text-[11.5px] text-gray-500 font-semibold">
                {period === 'week' ? t('finance.v2VsPrevWeek') : t('finance.v2VsPrevMonth')}
              </span>
              <span className="num text-[11.5px] text-gray-400 font-semibold ms-auto">
                {formatPrice(insights.collectedPrev)} DT
              </span>
            </div>

            {/* Collection-rate strip */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="font-semibold text-gray-500">{t('finance.collectionRate')}</span>
                <span className={`num font-extrabold ${
                  insights.collectionRate >= 0.65 ? 'text-emerald-700' :
                  insights.collectionRate >= 0.4 ? 'text-amber-700' : 'text-rose-700'
                }`}>
                  {Math.round(insights.collectionRate * 100)}%
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full bg-gradient-to-r transition-all duration-500 ${
                    insights.collectionRate >= 0.65 ? 'from-emerald-500 to-emerald-600' :
                    insights.collectionRate >= 0.4 ? 'from-amber-500 to-amber-600' :
                    'from-rose-500 to-rose-600'
                  }`}
                  style={{ width: `${Math.min(insights.collectionRate * 100, 100)}%` }}
                />
              </div>
            </div>
          </Hero>

          {/* PORTFOLIO KPI STRIP — at-a-glance lifetime totals */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5">
            {[
              {
                label: t('finance.v2KpiClients'),
                value: insights.activeClients,
                tile: 'bg-violet-50 text-violet-600 ring-violet-100',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                ),
              },
              {
                label: t('finance.v2KpiPiecesSold'),
                value: insights.piecesSold,
                tile: 'bg-cyan-50 text-cyan-600 ring-cyan-100',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 22h20" /><path d="M3 22V8l9-6 9 6v14" /><path d="M7 22v-7h10v7" />
                  </svg>
                ),
              },
              {
                label: t('finance.v2KpiLocations'),
                value: insights.locations,
                tile: 'bg-pink-50 text-pink-600 ring-pink-100',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12Z" />
                    <circle cx="12" cy="10" r="2.5" />
                  </svg>
                ),
              },
              {
                label: t('finance.v2KpiSellers'),
                value: insights.activeSellers,
                tile: 'bg-amber-50 text-amber-600 ring-amber-100',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                ),
              },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-2xl border border-gray-200/80 bg-white p-2.5 sm:p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex items-center gap-2.5">
                <span className={`w-9 h-9 rounded-xl ring-1 flex items-center justify-center flex-shrink-0 ${kpi.tile}`}>
                  <span className="w-[18px] h-[18px]">{kpi.icon}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="num text-[16px] sm:text-[18px] font-extrabold text-gray-900 leading-none tracking-tight tabular-nums">
                    {kpi.value}
                  </p>
                  <p className="text-[10.5px] text-gray-500 font-semibold truncate mt-0.5">{kpi.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* COMING UP — installments due in next 7 days (preventive) */}
          {insights.upcoming.length > 0 && (
            <div>
              <div className="flex items-end justify-between gap-2 mb-2.5 sm:mb-3">
                <div>
                  <h2 className="text-[15px] sm:text-base lg:text-lg font-bold text-gray-900 tracking-tight">{t('finance.v2ComingUpTitle')}</h2>
                  <p className="text-[11.5px] text-gray-500 font-medium">
                    {insights.upcoming.length} {t('finance.installmentUnit')} · {t('finance.v2ComingUpSubtitle')}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {insights.upcoming.slice(0, upcomingShown).map((u) => {
                  const isToday = u.daysUntil === 0
                  const isTomorrow = u.daysUntil === 1
                  const tone = isToday
                    ? { tile: 'bg-amber-100 text-amber-700', text: 'text-amber-700', ring: 'border-amber-200' }
                    : { tile: 'bg-cyan-50 text-cyan-700', text: 'text-cyan-700', ring: 'border-gray-200/80' }
                  return (
                    <div
                      key={u.id}
                      className={`rounded-2xl border ${tone.ring} bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex items-center gap-2.5`}
                    >
                      <div className={`w-10 h-10 rounded-xl ${tone.tile} flex flex-col items-center justify-center flex-shrink-0`}>
                        <span className="num text-[14px] font-extrabold leading-none">{u.daysUntil}</span>
                        <span className="text-[8px] font-bold leading-none mt-0.5">{t('finance.v2DueInDays')}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] font-bold text-gray-900 truncate tracking-tight">{u.clientName}</p>
                        <p className={`text-[10.5px] font-semibold ${tone.text}`}>
                          {isToday ? t('finance.v2DueToday') : isTomorrow ? t('finance.v2DueTomorrow') : new Date(u.dueDate).toLocaleDateString(language === 'ar' ? 'ar' : 'fr-FR', { day: '2-digit', month: 'short' })}
                        </p>
                      </div>
                      <div className="text-end flex-shrink-0">
                        <p className="num text-[14px] font-extrabold text-gray-900 tracking-tight">
                          {formatPrice(u.amount)} <span className="text-[10px] font-bold text-gray-400">DT</span>
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
              {insights.upcoming.length > upcomingShown && (
                <div className="mt-3 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => setUpcomingShown((p) => p + 5)}
                    className="h-9 px-4 rounded-full bg-white border border-gray-200 text-[12.5px] font-bold text-gray-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-gray-50 hover:border-gray-300 transition-colors inline-flex items-center gap-1.5"
                  >
                    <span>{t('common.loadMore')}</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] tabular-nums">
                      +{Math.min(5, insights.upcoming.length - upcomingShown)}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ACTION REQUIRED — Overdue clients */}
          <div>
            <div className="flex items-end justify-between gap-2 mb-2.5 sm:mb-3">
              <div>
                <h2 className="text-[15px] sm:text-base lg:text-lg font-bold text-gray-900 tracking-tight">{t('finance.v2ActionTitle')}</h2>
                <p className="text-[11.5px] text-gray-500 font-medium">
                  {insights.overdueClients.length === 0
                    ? t('finance.v2ActionEmpty')
                    : `${insights.overdueClients.length} ${t('finance.clientUnit')} · ${formatPrice(insights.totalOverdue)} DT`}
                </p>
              </div>
              {insights.overdueClients.length > 0 && (
                <button
                  type="button"
                  onClick={() => onNavigate?.('installments')}
                  className="h-8 px-2.5 rounded-full bg-white border border-gray-200 text-[11px] font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-300 inline-flex items-center gap-1 flex-shrink-0"
                >
                  {t('finance.v2ViewAll')}
                  <svg className={`w-3 h-3 ${language === 'ar' ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              )}
            </div>

            {insights.overdueClients.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white p-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 mb-2 ring-1 ring-emerald-200">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <path d="m9 11 3 3L22 4" />
                  </svg>
                </div>
                <p className="text-[13.5px] font-bold text-emerald-900">{t('finance.v2ActionEmpty')}</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {insights.overdueClients.slice(0, overdueShown).map((c, idx) => {
                    const sev =
                      c.oldestDaysLate >= 60 ? { ring: 'border-rose-200', tile: 'bg-rose-100 text-rose-700', text: 'text-rose-700' } :
                      c.oldestDaysLate >= 30 ? { ring: 'border-amber-200', tile: 'bg-amber-100 text-amber-700', text: 'text-amber-700' } :
                      { ring: 'border-orange-200', tile: 'bg-orange-100 text-orange-700', text: 'text-orange-700' }
                    return (
                      <div
                        key={c.clientId}
                        className={`rounded-2xl border ${sev.ring} bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-extrabold text-[13px] flex-shrink-0 ${sev.tile}`}>
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13.5px] font-bold text-gray-900 truncate tracking-tight">{c.clientName}</p>
                            <p className="text-[10.5px] text-gray-500 font-semibold truncate">
                              {c.idNumber && `CIN: ${c.idNumber} · `}
                              {c.installments} {t('finance.installmentUnit')} · {' '}
                              <span className={`font-extrabold ${sev.text}`}>
                                {c.oldestDaysLate === 1 ? t('finance.v2DaysLateOne') : `${c.oldestDaysLate} ${t('finance.v2DaysLate')}`}
                              </span>
                            </p>
                          </div>
                          <div className="text-end flex-shrink-0">
                            <p className="num text-[14px] sm:text-[15px] font-extrabold text-gray-900 tracking-tight">
                              {formatPrice(c.totalOwed)} <span className="text-[10px] font-bold text-gray-400">DT</span>
                            </p>
                            <p className="text-[10px] text-gray-500 font-semibold">{t('finance.v2OverdueAmount')}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {insights.overdueClients.length > overdueShown && (
                  <div className="mt-3 flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => setOverdueShown((p) => p + 5)}
                      className="h-9 px-4 rounded-full bg-white border border-gray-200 text-[12.5px] font-bold text-gray-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-gray-50 hover:border-gray-300 transition-colors inline-flex items-center gap-1.5"
                    >
                      <span>{t('common.loadMore')}</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] tabular-nums">
                        +{Math.min(5, insights.overdueClients.length - overdueShown)}
                      </span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* PERIOD-OVER-PERIOD — 2 boxes side-by-side, always */}
          <div>
            <div className="flex items-center justify-between mb-2.5 sm:mb-3">
              <h2 className="text-[15px] sm:text-base lg:text-lg font-bold text-gray-900 tracking-tight">{t('finance.v2MonthCompareTitle')}</h2>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {/* This period */}
              <div className="relative overflow-hidden rounded-2xl border border-blue-200/70 bg-gradient-to-br from-blue-50 via-blue-50/60 to-white p-3.5 sm:p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] sm:text-[12px] font-bold text-blue-900">
                    {period === 'week' ? t('finance.v2PeriodWeek') : t('finance.v2PeriodMonth')}
                  </p>
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold uppercase tracking-wider">
                    {t('finance.v2Active')}
                  </span>
                </div>
                <p className="num text-[18px] sm:text-2xl font-extrabold text-blue-900 leading-tight tracking-tight mb-1">
                  {formatPrice(insights.collectedThis)} <span className="text-[10px] sm:text-[11px] font-bold text-blue-700/70">DT</span>
                </p>
                <p className="text-[10.5px] text-blue-700/70 font-semibold">
                  {t('finance.totalRevenue')}: <span className="num font-extrabold">{formatPrice(insights.revenueThis)}</span>
                </p>
              </div>

              {/* Previous period */}
              <div className="relative overflow-hidden rounded-2xl border border-gray-200/80 bg-white p-3.5 sm:p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] sm:text-[12px] font-bold text-gray-700">
                    {period === 'week' ? t('finance.v2PrevWeek') : t('finance.v2PrevMonth')}
                  </p>
                </div>
                <p className="num text-[18px] sm:text-2xl font-extrabold text-gray-900 leading-tight tracking-tight mb-1">
                  {formatPrice(insights.collectedPrev)} <span className="text-[10px] sm:text-[11px] font-bold text-gray-400">DT</span>
                </p>
                <p className="text-[10.5px] text-gray-500 font-semibold">
                  {t('finance.totalRevenue')}: <span className="num font-extrabold">{formatPrice(insights.revenuePrev)}</span>
                </p>
              </div>
            </div>
          </div>

          {/* HIGHLIGHTS — 2 in a row, always */}
          <div>
            <div className="flex items-center justify-between mb-2.5 sm:mb-3">
              <h2 className="text-[15px] sm:text-base lg:text-lg font-bold text-gray-900 tracking-tight">{t('finance.v2Highlights')}</h2>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {/* Top location */}
              <div className="rounded-2xl border border-gray-200/80 bg-white p-3.5 sm:p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 ring-1 ring-violet-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-[16px] h-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12Z" />
                      <circle cx="12" cy="10" r="2.5" />
                    </svg>
                  </div>
                  <p className="text-[11px] font-bold text-gray-500 truncate">{t('finance.v2TopLocation')}</p>
                </div>
                {insights.topLocation ? (
                  <>
                    <p className="text-[14px] sm:text-[15px] font-extrabold text-gray-900 truncate tracking-tight mb-0.5">
                      {insights.topLocation.name}
                    </p>
                    <p className="num text-[13px] sm:text-[14px] font-extrabold text-violet-700 tracking-tight">
                      {formatPrice(insights.topLocation.collected)} <span className="text-[10px] font-bold text-violet-700/60">DT</span>
                    </p>
                    <p className="text-[10px] text-gray-500 font-semibold">{insights.topLocation.sales} {t('finance.v2OperationsCount')}</p>
                  </>
                ) : (
                  <p className="text-[12px] text-gray-400 font-semibold">{t('finance.v2NoData')}</p>
                )}
              </div>

              {/* Top seller */}
              <div className="rounded-2xl border border-gray-200/80 bg-white p-3.5 sm:p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 ring-1 ring-amber-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-[16px] h-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                      <path d="M4 22h16" />
                      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                    </svg>
                  </div>
                  <p className="text-[11px] font-bold text-gray-500 truncate">{t('finance.v2TopSeller')}</p>
                </div>
                {insights.topSeller ? (
                  <>
                    <p className="text-[14px] sm:text-[15px] font-extrabold text-gray-900 truncate tracking-tight mb-0.5">
                      {insights.topSeller.name}
                    </p>
                    <p className="num text-[13px] sm:text-[14px] font-extrabold text-amber-700 tracking-tight">
                      {formatPrice(insights.topSeller.total)} <span className="text-[10px] font-bold text-amber-700/60">DT</span>
                    </p>
                    <p className="text-[10px] text-gray-500 font-semibold truncate">{insights.topSeller.ops} {t('finance.v2OperationsCount')}{insights.topSeller.place ? ` · ${insights.topSeller.place}` : ''}</p>
                  </>
                ) : (
                  <p className="text-[12px] text-gray-400 font-semibold">{t('finance.v2NoData')}</p>
                )}
              </div>
            </div>
          </div>

          {/* QUICK LINKS — drill into v1 detail views */}
          <div>
            <div className="flex items-center justify-between mb-2.5 sm:mb-3">
              <h2 className="text-[15px] sm:text-base lg:text-lg font-bold text-gray-900 tracking-tight">{t('finance.v2QuickLinks')}</h2>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {[
                {
                  label: t('finance.v2DetailedView'),
                  sub: t('finance.pageTitle') + ' · V1',
                  to: 'finance' as const,
                  tile: 'bg-blue-50 text-blue-600 ring-blue-100',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M9 3v18" />
                      <path d="M3 9h18" />
                    </svg>
                  ),
                },
                {
                  label: t('pageNames.installments'),
                  sub: t('finance.unpaidAmount'),
                  to: 'installments' as const,
                  tile: 'bg-rose-50 text-rose-600 ring-rose-100',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="5" width="20" height="14" rx="2.5" />
                      <path d="M2 10h20" />
                      <path d="M6 15h4" />
                    </svg>
                  ),
                },
                {
                  label: t('pageNames.sales-records'),
                  sub: t('finance.salesLabel'),
                  to: 'sales-records' as const,
                  tile: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M8 8h8" />
                      <path d="M8 12h8" />
                      <path d="M8 16h5" />
                    </svg>
                  ),
                },
                {
                  label: t('pageNames.confirmation'),
                  sub: t('finance.statusPending'),
                  to: 'confirmation' as const,
                  tile: 'bg-amber-50 text-amber-600 ring-amber-100',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <path d="m9 11 3 3L22 4" />
                    </svg>
                  ),
                },
              ].map((link) => (
                <button
                  key={link.to}
                  type="button"
                  onClick={() => onNavigate?.(link.to)}
                  className="text-right relative rounded-2xl border border-gray-200/80 bg-white p-3 sm:p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-md hover:border-blue-200 hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className={`w-9 h-9 rounded-xl ring-1 flex items-center justify-center flex-shrink-0 ${link.tile}`}>
                      <span className="w-[18px] h-[18px]">{link.icon}</span>
                    </span>
                    <span className="text-[13px] font-bold text-gray-900 truncate tracking-tight">{link.label}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 font-semibold truncate">{link.sub}</p>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
