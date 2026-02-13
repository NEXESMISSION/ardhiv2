import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatPrice, formatDateShort } from '@/utils/priceCalculator'
import { buildSaleQuery, formatSalesWithSellers } from '@/utils/salesQueries'
import { SaleDetailsDialog } from '@/components/SaleDetailsDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { getPaymentTypeLabel } from '@/utils/paymentTerms'

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
  confirmed_at: string | null
  created_at: string
  client?: { id: string; name: string; id_number: string; phone: string }
  piece?: { id: string; piece_number: string; surface_m2: number }
  batch?: { id: string; name: string }
  payment_offer?: { id: string; name: string | null }
  confirmedBy?: { id: string; name: string; place: string | null }
}

interface ConfirmationHistoryPageProps {
  onNavigate: (page: string) => void
}

export function ConfirmationHistoryPage({ onNavigate }: ConfirmationHistoryPageProps) {
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [detailsSale, setDetailsSale] = useState<Sale | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [revertingSale, setRevertingSale] = useState<Sale | null>(null)
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [revertError, setRevertError] = useState<string | null>(null)

  useEffect(() => {
    loadConfirmedSales()
    const handleUpdated = () => loadConfirmedSales()
    window.addEventListener('saleUpdated', handleUpdated)
    return () => window.removeEventListener('saleUpdated', handleUpdated)
  }, [])

  async function loadConfirmedSales() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('sales')
        .select(buildSaleQuery())
        .eq('status', 'completed')
        .order('confirmed_at', { ascending: false, nullsFirst: false })
        .limit(500)

      if (error) throw error
      const formatted = await formatSalesWithSellers(data || [])
      setSales(formatted)
    } catch (e: any) {
      console.error('Error loading confirmation history:', e)
    } finally {
      setLoading(false)
    }
  }

  const filteredSales = useMemo(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfWeek = new Date(startOfToday)
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const confirmDate = (s: Sale) => s.confirmed_at || s.sale_date || s.created_at

    return sales.filter((s) => {
      const d = new Date(confirmDate(s))
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
    })
  }, [sales, timeFilter])

  const filterButtons: { value: TimeFilter; label: string }[] = [
    { value: 'today', label: 'اليوم' },
    { value: 'week', label: 'هذا الأسبوع' },
    { value: 'month', label: 'هذا الشهر' },
    { value: 'all', label: 'الكل' },
  ]

  function openRevertConfirm(sale: Sale, e: React.MouseEvent) {
    e.stopPropagation()
    setRevertingSale(sale)
    setRevertError(null)
    setRevertConfirmOpen(true)
  }

  async function confirmSendBackToConfirmation() {
    if (!revertingSale) return
    setReverting(true)
    setRevertError(null)
    try {
      const saleId = revertingSale.id
      const pieceId = revertingSale.land_piece_id

      const { error: saleError } = await supabase
        .from('sales')
        .update({
          status: 'pending',
          confirmed_at: null,
          confirmed_by: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', saleId)

      if (saleError) throw saleError

      if (pieceId) {
        await supabase
          .from('land_pieces')
          .update({ status: 'Reserved', updated_at: new Date().toISOString() })
          .eq('id', pieceId)
      }

      window.dispatchEvent(new CustomEvent('saleUpdated'))
      setRevertConfirmOpen(false)
      setRevertingSale(null)
      setDetailsOpen(false)
      setDetailsSale(null)
      await loadConfirmedSales()
      onNavigate('confirmation')
    } catch (e: any) {
      setRevertError(e.message || 'فشل إرجاع البيع')
    } finally {
      setReverting(false)
    }
  }

  return (
    <div className="space-y-4 p-3 sm:p-4 lg:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">سجل التأكيدات</h2>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => onNavigate('confirmation')}
          className="w-full sm:w-auto"
        >
          انتقل إلى التأكيدات
        </Button>
      </div>

      <p className="text-sm text-gray-600">
        المبيعات المؤكدة هنا تُعرض في المالية حسب تاريخ التأكيد (اليوم = ما تم تأكيده اليوم).
      </p>

      <div className="flex flex-wrap gap-2">
        {filterButtons.map(({ value, label }) => (
          <Button
            key={value}
            variant={timeFilter === value ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setTimeFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : filteredSales.length === 0 ? (
        <Card className="p-6 text-center text-gray-500">
          لا توجد تأكيدات في هذه الفترة.
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredSales.map((sale) => {
            const dateStr = sale.confirmed_at || sale.sale_date || sale.created_at
            return (
              <Card
                key={sale.id}
                className="p-3 sm:p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => {
                  setDetailsSale(sale)
                  setDetailsOpen(true)
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="font-medium text-gray-900">
                      {sale.client?.name || '—'}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {sale.batch?.name || '—'} / {sale.piece?.piece_number || '—'}
                    </Badge>
                    <span className="text-sm text-gray-600">
                      {formatDateShort(dateStr)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">
                      {formatPrice(sale.sale_price)} DT
                    </span>
                    <Badge variant="default" className="text-xs">
                      {getPaymentTypeLabel(sale.payment_method)}
                    </Badge>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="text-xs"
                      onClick={(e) => openRevertConfirm(sale, e)}
                    >
                      إرجاع إلى التأكيدات
                    </Button>
                  </div>
                </div>
                {sale.confirmedBy && (
                  <p className="text-xs text-gray-500 mt-1">
                    تم التأكيد بواسطة: {sale.confirmedBy.name}
                    {sale.confirmedBy.place ? ` (${sale.confirmedBy.place})` : ''}
                  </p>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <SaleDetailsDialog
        open={detailsOpen}
        onClose={() => {
          setDetailsOpen(false)
          setDetailsSale(null)
        }}
        sale={detailsSale as any}
      />

      <ConfirmDialog
        open={revertConfirmOpen}
        onClose={() => {
          if (!reverting) {
            setRevertConfirmOpen(false)
            setRevertingSale(null)
            setRevertError(null)
          }
        }}
        onConfirm={confirmSendBackToConfirmation}
        title="إرجاع البيع إلى التأكيدات"
        description="سيتم إرجاع هذا البيع إلى صفحة التأكيدات (حالة معلقة) ولن يُحسب في المالية كبيع مؤكد. القطعة ستعود إلى حالة محجوزة. هل تتابع؟"
        confirmText="نعم، إرجاع"
        cancelText="إلغاء"
        variant="warning"
        loading={reverting}
        disabled={reverting}
        errorMessage={revertError}
      />
    </div>
  )
}
