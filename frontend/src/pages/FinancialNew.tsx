import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { DollarSign, CreditCard, TrendingUp } from 'lucide-react'
import type { Sale, Client, Payment } from '@/types/database'

interface SaleWithClient extends Sale {
  client?: Client
}

interface PaymentWithClient extends Payment {
  client?: Client
  sale?: {
    land_piece_ids?: string[]
  }
}

interface GroupedPayment {
  clientId: string
  clientName: string
  clientCin?: string
  piecesCount: number
  paymentDate: string
  totalAmount: number
  payments: PaymentWithClient[]
}

type DateFilter = 'today' | 'week' | 'month' | 'all'

export function Financial() {
  const { hasPermission } = useAuth()
  const [sales, setSales] = useState<SaleWithClient[]>([])
  const [payments, setPayments] = useState<PaymentWithClient[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')

  useEffect(() => {
    if (!hasPermission('view_financial')) return
    fetchData()
  }, [hasPermission])

  const fetchData = async () => {
    try {
      const [salesRes, paymentsRes] = await Promise.all([
        supabase
          .from('sales')
          .select('*, client:clients(*)')
          .order('sale_date', { ascending: false }),
        supabase
          .from('payments')
          .select('*, client:clients(*), sale:sales(land_piece_ids)')
          .order('payment_date', { ascending: false }),
      ])

      if (salesRes.error) {
        // Error fetching sales - silent fail
      }
      if (paymentsRes.error) {
        // Error fetching payments - silent fail
      }

      setSales((salesRes.data as SaleWithClient[]) || [])
      setPayments((paymentsRes.data as PaymentWithClient[]) || [])
    } catch (error) {
      // Error fetching financial data - silent fail
    } finally {
      setLoading(false)
    }
  }

  // Filter data by date
  const getDateRange = (filter: DateFilter): { start: Date; end: Date | null } => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    today.setHours(0, 0, 0, 0)
    
    switch (filter) {
      case 'today':
        const todayEnd = new Date(today)
        todayEnd.setHours(23, 59, 59, 999)
        return { start: today, end: todayEnd }
      case 'week':
        const weekAgo = new Date(today)
        weekAgo.setDate(weekAgo.getDate() - 7)
        weekAgo.setHours(0, 0, 0, 0)
        return { start: weekAgo, end: null }
      case 'month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        monthStart.setHours(0, 0, 0, 0)
        return { start: monthStart, end: null }
      case 'all':
        return { start: new Date(0), end: null }
    }
  }

  const filteredData = useMemo(() => {
    const { start: startDate, end: endDate } = getDateRange(dateFilter)
    
    // Helper function to compare dates
    const isDateInRange = (dateString: string, start: Date, end: Date | null): boolean => {
      const date = new Date(dateString)
      date.setHours(0, 0, 0, 0)
      const startOnly = new Date(start)
      startOnly.setHours(0, 0, 0, 0)
      
      if (end) {
        const endOnly = new Date(end)
        endOnly.setHours(23, 59, 59, 999)
        return date >= startOnly && date <= endOnly
      } else {
        return date >= startOnly
      }
    }
    
    const filteredSales = sales.filter(s => {
      return isDateInRange(s.sale_date, startDate, endDate)
    })
    
    // Exclude refunds from payments completely
    const filteredPayments = payments
      .filter(p => {
        return isDateInRange(p.payment_date, startDate, endDate)
      })
      .filter(p => p.payment_type !== 'Refund')
    
    // Separate sales by type
    const fullSales = filteredSales.filter(s => s.payment_type === 'Full')
    const installmentSales = filteredSales.filter(s => s.payment_type === 'Installment')
    
    // Calculate profits
    const fullSalesProfit = fullSales.reduce((sum, s) => sum + s.profit_margin, 0)
    const fullSalesRevenue = fullSales.reduce((sum, s) => sum + s.total_selling_price, 0)
    
    const installmentProfit = installmentSales.reduce((sum, s) => sum + s.profit_margin, 0)
    const installmentRevenue = installmentSales.reduce((sum, s) => sum + s.total_selling_price, 0)
    
    // Separate payments by type - organized sections
    const installmentPaymentsList = filteredPayments.filter(p => p.payment_type === 'Installment')
    const bigAdvancePaymentsList = filteredPayments.filter(p => p.payment_type === 'BigAdvance')
    const smallAdvancePaymentsList = filteredPayments.filter(p => p.payment_type === 'SmallAdvance')
    const fullPaymentsList = filteredPayments.filter(p => p.payment_type === 'Full')
    
    // Calculate totals from payments
    const installmentPaymentsTotal = installmentPaymentsList.reduce((sum, p) => sum + p.amount_paid, 0)
    const bigAdvanceTotal = bigAdvancePaymentsList.reduce((sum, p) => sum + p.amount_paid, 0)
    const fullPaymentsTotal = fullPaymentsList.reduce((sum, p) => sum + p.amount_paid, 0)
    
    // Calculate small advance (reservation) from sales table - this is the actual amount paid on the spot
    // The small_advance_amount in sales table represents the reservation amount paid when sale was created
    const smallAdvanceFromPayments = smallAdvancePaymentsList.reduce((sum, p) => sum + p.amount_paid, 0)
    const smallAdvanceFromSales = filteredSales
      .filter(s => s.status !== 'Cancelled') // Only count active sales
      .reduce((sum, s) => sum + (s.small_advance_amount || 0), 0)
    
    // Use the higher value (payments if recorded, otherwise from sales table)
    // This ensures we show the actual reservation amounts
    const smallAdvanceTotal = smallAdvanceFromPayments > 0 ? smallAdvanceFromPayments : smallAdvanceFromSales
    
    const cashReceived = filteredPayments.reduce((sum, p) => sum + p.amount_paid, 0)

    // Group payments by client and date to prevent stacking
    const groupPayments = (paymentList: PaymentWithClient[]): GroupedPayment[] => {
      const groups = new Map<string, GroupedPayment>()
      
      paymentList.forEach(payment => {
        const clientId = payment.client_id || 'unknown'
        const clientName = (payment.client as any)?.name || 'عميل غير معروف'
        const clientCin = (payment.client as any)?.cin || ''
        const paymentDate = payment.payment_date
        const key = `${clientId}-${paymentDate}`
        
        if (!groups.has(key)) {
          const piecesCount = payment.sale?.land_piece_ids?.length || 0
          groups.set(key, {
            clientId,
            clientName,
            clientCin,
            piecesCount,
            paymentDate,
            totalAmount: 0,
            payments: [],
          })
        }
        
        const group = groups.get(key)!
        group.totalAmount += payment.amount_paid
        group.payments.push(payment)
      })
      
      return Array.from(groups.values()).sort((a, b) => 
        new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
      )
    }

    const groupedInstallmentPayments = groupPayments(installmentPaymentsList)
    const groupedBigAdvancePayments = groupPayments(bigAdvancePaymentsList)
    const groupedSmallAdvancePayments = groupPayments(smallAdvancePaymentsList)
    const groupedFullPayments = groupPayments(fullPaymentsList)

    return {
      sales: filteredSales,
      payments: filteredPayments,
      fullSales,
      installmentSales,
      fullSalesProfit,
      fullSalesRevenue,
      installmentProfit,
      installmentRevenue,
      cashReceived,
      // Payment lists by type - organized sections
      installmentPaymentsList,
      bigAdvancePaymentsList,
      smallAdvancePaymentsList,
      fullPaymentsList,
      // Grouped payments
      groupedInstallmentPayments,
      groupedBigAdvancePayments,
      groupedSmallAdvancePayments,
      groupedFullPayments,
      // Payment totals
      installmentPaymentsTotal,
      bigAdvanceTotal,
      smallAdvanceTotal,
      fullPaymentsTotal,
      totalProfit: fullSalesProfit + installmentProfit,
      totalRevenue: fullSalesRevenue + installmentRevenue,
    }
  }, [sales, payments, dateFilter])

  if (!hasPermission('view_financial')) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">ليس لديك صلاحية</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">جاري التحميل...</div>
      </div>
    )
  }

  const filterLabels: Record<DateFilter, string> = {
    today: 'اليوم',
    week: 'هذا الأسبوع',
    month: 'هذا الشهر',
    all: 'الكل',
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold">المالية</h1>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {(['today', 'week', 'month', 'all'] as DateFilter[]).map(filter => (
            <Button
              key={filter}
              variant={dateFilter === filter ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateFilter(filter)}
              className="flex-1 sm:flex-none"
            >
              {filterLabels[filter]}
            </Button>
          ))}
        </div>
      </div>

      {/* Summary Stats - Responsive grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex-1">
                <p className="text-sm font-medium text-green-700 mb-1">الدفع الكامل</p>
                <p className="text-xl sm:text-2xl font-bold text-green-800">{formatCurrency(filteredData.fullSalesRevenue)}</p>
              </div>
              <DollarSign className="h-6 w-6 sm:h-8 sm:w-8 text-green-500 flex-shrink-0" />
            </div>
            {hasPermission('view_profit') && (
              <p className="text-xs sm:text-sm text-green-600 mb-1">ربح: {formatCurrency(filteredData.fullSalesProfit)}</p>
            )}
            <p className="text-xs text-green-600">{filteredData.fullSales.length} صفقة</p>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-700 mb-1">الأقساط</p>
                <p className="text-xl sm:text-2xl font-bold text-blue-800">{formatCurrency(filteredData.installmentRevenue)}</p>
              </div>
              <CreditCard className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500 flex-shrink-0" />
            </div>
            {hasPermission('view_profit') && (
              <p className="text-xs sm:text-sm text-blue-600 mb-1">ربح: {formatCurrency(filteredData.installmentProfit)}</p>
            )}
            <p className="text-xs text-blue-600">{filteredData.installmentSales.length} صفقة</p>
          </CardContent>
        </Card>

        <Card className="bg-purple-50 border-purple-200 sm:col-span-2 lg:col-span-1">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex-1">
                <p className="text-sm font-medium text-purple-700 mb-1">المستلم نقداً</p>
                <p className="text-xl sm:text-2xl font-bold text-purple-800">{formatCurrency(filteredData.cashReceived)}</p>
              </div>
              <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-purple-500 flex-shrink-0" />
            </div>
            {hasPermission('view_profit') && (
              <p className="text-xs sm:text-sm text-purple-600 mb-1">إجمالي الربح: {formatCurrency(filteredData.totalProfit)}</p>
            )}
            <p className="text-xs text-purple-600">{filteredData.payments.length} عملية دفع</p>
          </CardContent>
        </Card>
      </div>

      {/* Payments - Organized by Type - Clean Organized Sections */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold">المدفوعات</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* الأقساط - Installments Section */}
          <Card className="border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg text-blue-700">الأقساط</h3>
                <span className="text-xl font-bold text-blue-600">{formatCurrency(filteredData.installmentPaymentsTotal)}</span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {filteredData.groupedInstallmentPayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">لا توجد أقساط</p>
                ) : (
                  filteredData.groupedInstallmentPayments.map((group) => (
                    <div key={`${group.clientId}-${group.paymentDate}`} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <div className="flex flex-col flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-blue-800">{group.clientName}</span>
                          {group.clientCin && (
                            <span className="text-xs text-blue-600">({group.clientCin})</span>
                          )}
                          {group.piecesCount > 0 && (
                            <span className="text-xs text-blue-500">{group.piecesCount} قطعة</span>
                          )}
                        </div>
                        <span className="text-xs text-blue-600">{formatDate(group.paymentDate)}</span>
                      </div>
                      <span className="font-bold text-blue-700">+{formatCurrency(group.totalAmount)}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* العربون (مبلغ الحجز) - Reservation/Deposit Section */}
          <Card className="border-orange-200">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg text-orange-700">العربون (مبلغ الحجز)</h3>
                <span className="text-xl font-bold text-orange-600">{formatCurrency(filteredData.smallAdvanceTotal)}</span>
              </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {filteredData.smallAdvanceTotal === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">لا توجد عربون</p>
              ) : filteredData.groupedSmallAdvancePayments.length > 0 ? (
                // Show grouped payments if they exist
                filteredData.groupedSmallAdvancePayments.map((group) => (
                  <div key={`${group.clientId}-${group.paymentDate}`} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-100">
                    <div className="flex flex-col flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-orange-800">{group.clientName}</span>
                        {group.clientCin && (
                          <span className="text-xs text-orange-600">({group.clientCin})</span>
                        )}
                        {group.piecesCount > 0 && (
                          <span className="text-xs text-orange-500">{group.piecesCount} قطعة</span>
                        )}
                      </div>
                      <span className="text-xs text-orange-600">{formatDate(group.paymentDate)}</span>
                    </div>
                    <span className="font-bold text-orange-700">+{formatCurrency(group.totalAmount)}</span>
                  </div>
                ))
              ) : (
                // Show summary from sales if no individual payments recorded
                filteredData.sales
                  .filter(s => s.small_advance_amount && s.small_advance_amount > 0 && s.status !== 'Cancelled')
                  .slice(0, 5)
                  .map((sale) => (
                    <div key={sale.id} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-100">
                      <div className="flex flex-col flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-orange-800">{sale.client?.name || 'عميل غير معروف'}</span>
                          {sale.client?.cin && (
                            <span className="text-xs text-orange-600">({sale.client.cin})</span>
                          )}
                          {sale.land_piece_ids && sale.land_piece_ids.length > 0 && (
                            <span className="text-xs text-orange-500">{sale.land_piece_ids.length} قطعة</span>
                          )}
                        </div>
                        <span className="text-xs text-orange-600">{formatDate(sale.sale_date)}</span>
                      </div>
                      <span className="font-bold text-orange-700">+{formatCurrency(sale.small_advance_amount || 0)}</span>
                    </div>
                  ))
              )}
            </div>
            </CardContent>
          </Card>

          {/* الدفع الكامل - Full Payment Section */}
          <Card className="border-green-200">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg text-green-700">الدفع الكامل</h3>
                <span className="text-xl font-bold text-green-600">{formatCurrency(filteredData.fullPaymentsTotal)}</span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {filteredData.groupedFullPayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">لا توجد دفعات كاملة</p>
                ) : (
                  filteredData.groupedFullPayments.map((group) => (
                    <div key={`${group.clientId}-${group.paymentDate}`} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-100">
                      <div className="flex flex-col flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-green-800">{group.clientName}</span>
                          {group.clientCin && (
                            <span className="text-xs text-green-600">({group.clientCin})</span>
                          )}
                          {group.piecesCount > 0 && (
                            <span className="text-xs text-green-500">{group.piecesCount} قطعة</span>
                          )}
                        </div>
                        <span className="text-xs text-green-600">{formatDate(group.paymentDate)}</span>
                      </div>
                      <span className="font-bold text-green-700">+{formatCurrency(group.totalAmount)}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* الدفعة الأولى (الكبيرة) - Big Advance Payments Section */}
          <Card className="border-purple-200">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg text-purple-700">الدفعة الأولى (الكبيرة)</h3>
                <span className="text-xl font-bold text-purple-600">{formatCurrency(filteredData.bigAdvanceTotal)}</span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {filteredData.groupedBigAdvancePayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">لا توجد دفعات أولى</p>
                ) : (
                  filteredData.groupedBigAdvancePayments.map((group) => (
                    <div key={`${group.clientId}-${group.paymentDate}`} className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-100">
                      <div className="flex flex-col flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-purple-800">{group.clientName}</span>
                          {group.clientCin && (
                            <span className="text-xs text-purple-600">({group.clientCin})</span>
                          )}
                          {group.piecesCount > 0 && (
                            <span className="text-xs text-purple-500">{group.piecesCount} قطعة</span>
                          )}
                        </div>
                        <span className="text-xs text-purple-600">{formatDate(group.paymentDate)}</span>
                      </div>
                      <span className="font-bold text-purple-700">+{formatCurrency(group.totalAmount)}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Sales - Compact Cards */}
      {filteredData.sales.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-bold text-sm">المبيعات</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filteredData.sales.slice(0, 6).map((sale) => (
              <div key={sale.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium">{sale.client?.name || '-'}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant={sale.payment_type === 'Full' ? 'success' : 'secondary'} className="text-xs">
                      {sale.payment_type === 'Full' ? 'كامل' : 'أقساط'}
                    </Badge>
                    <span>{formatCurrency(sale.total_selling_price)}</span>
                  </div>
                </div>
                {hasPermission('view_profit') && (
                  <span className="text-green-600 font-bold">+{formatCurrency(sale.profit_margin)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {filteredData.payments.length === 0 && filteredData.sales.length === 0 && (
        <p className="text-center text-muted-foreground py-8">لا توجد بيانات لهذه الفترة</p>
      )}
    </div>
  )
}
