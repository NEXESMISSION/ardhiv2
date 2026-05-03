import { Dialog } from './ui/dialog'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { formatPrice, formatDate } from '@/utils/priceCalculator'
import { DeadlineCountdown } from './DeadlineCountdown'

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
}

interface GroupSaleDetailsDialogProps {
  open: boolean
  onClose: () => void
  sales: Sale[]
}

export function GroupSaleDetailsDialog({ open, onClose, sales }: GroupSaleDetailsDialogProps) {
  if (!sales || sales.length === 0) return null

  const firstSale = sales[0]
  const isInstallment = firstSale.payment_method === 'installment'
  const isPromise = firstSale.payment_method === 'promise'
  const isFull = firstSale.payment_method === 'full'

  const totalPrice = sales.reduce((sum, s) => sum + s.sale_price, 0)
  const totalDeposit = sales.reduce((sum, s) => sum + s.deposit_amount, 0)
  const totalSurface = sales.reduce((sum, s) => sum + (s.piece?.surface_m2 || 0), 0)
  const totalPartialPaid = sales.reduce((sum, s) => sum + (s.partial_payment_amount || s.deposit_amount), 0)
  const totalRemaining = sales.reduce((sum, s) => sum + (s.remaining_payment_amount || (s.sale_price - (s.partial_payment_amount || s.deposit_amount))), 0)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`تفاصيل المجموعة - ${sales.length} قطعة`}
      size="xl"
    >
      <div className="space-y-3 sm:space-y-4">
        {/* Client Info */}
        <Card className="p-2 sm:p-3 bg-blue-50 border-blue-200">
          <h3 className="text-xs sm:text-sm font-semibold text-blue-900 mb-2">معلومات العميل</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm">
            <div>
              <span className="text-gray-600">الاسم:</span>
              <span className="font-medium mr-1">{firstSale.client?.name || 'غير محدد'}</span>
            </div>
            <div>
              <span className="text-gray-600">رقم الهوية:</span>
              <span className="font-medium mr-1">{firstSale.client?.id_number || 'غير محدد'}</span>
            </div>
            <div>
              <span className="text-gray-600">الهاتف:</span>
              <span className="font-medium mr-1">{firstSale.client?.phone || 'غير محدد'}</span>
            </div>
          </div>
        </Card>

        {/* Summary */}
        <Card className="p-2 sm:p-3 bg-green-50 border-green-200">
          <h3 className="text-xs sm:text-sm font-semibold text-green-900 mb-2">ملخص المجموعة</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs sm:text-sm">
            <div>
              <span className="text-gray-600 block">عدد القطع:</span>
              <span className="font-bold text-gray-900">{sales.length}</span>
            </div>
            <div>
              <span className="text-gray-600 block">إجمالي المساحة:</span>
              <span className="font-bold text-gray-900">{totalSurface.toLocaleString('en-US')} م²</span>
            </div>
            <div>
              <span className="text-gray-600 block">إجمالي السعر:</span>
              <span className="font-bold text-gray-900">{formatPrice(totalPrice)} DT</span>
            </div>
            <div>
              <span className="text-gray-600 block">إجمالي العربون:</span>
              <span className="font-bold text-blue-600">{formatPrice(totalDeposit)} DT</span>
            </div>
            {isPromise && (
              <>
                <div>
                  <span className="text-gray-600 block">إجمالي المستلم:</span>
                  <span className="font-bold text-orange-600">{formatPrice(totalPartialPaid)} DT</span>
                </div>
                <div>
                  <span className="text-gray-600 block">إجمالي المتبقي:</span>
                  <span className="font-bold text-gray-700">{formatPrice(totalRemaining)} DT</span>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Sale Details */}
        <Card className="p-2 sm:p-3 bg-purple-50 border-purple-200">
          <h3 className="text-xs sm:text-sm font-semibold text-purple-900 mb-2">تفاصيل البيع</h3>
          <div className="space-y-2 text-xs sm:text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">نوع البيع:</span>
              <Badge 
                variant={isFull ? 'success' : isInstallment ? 'info' : 'warning'} 
                size="sm"
                className="text-xs"
              >
                {isFull ? 'نقدي' : isInstallment ? 'تقسيط' : 'وعد بالبيع'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">تاريخ البيع:</span>
              <span className="font-medium">{formatDate(firstSale.sale_date)}</span>
            </div>
            {firstSale.deadline_date && (
              <div className="flex justify-between items-center">
                <span className="text-gray-600">تاريخ آخر أجل:</span>
                <div className="text-left">
                  <p className="text-xs text-gray-500 mb-1">{formatDate(firstSale.deadline_date)}</p>
                  <DeadlineCountdown deadlineDate={firstSale.deadline_date} />
                </div>
              </div>
            )}
            {firstSale.appointment_date && (
              <div className="flex justify-between">
                <span className="text-gray-600">موعد:</span>
                <span className="font-medium">{formatDate(firstSale.appointment_date)}</span>
              </div>
            )}
            {firstSale.payment_offer && (
              <div className="flex justify-between">
                <span className="text-gray-600">عرض التقسيط:</span>
                <span className="font-medium">{firstSale.payment_offer.name || 'بدون اسم'}</span>
              </div>
            )}
          </div>
        </Card>

        {/* All Pieces */}
        <Card className="p-2 sm:p-3 bg-gray-50 border-gray-200">
          <h3 className="text-xs sm:text-sm font-semibold text-gray-900 mb-2">جميع القطع ({sales.length})</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {sales.map((sale, idx) => (
              <div key={sale.id} className="bg-white border border-gray-200 rounded p-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="default" size="sm" className="text-xs">
                      #{idx + 1}
                    </Badge>
                    <span className="text-xs sm:text-sm font-semibold text-gray-900">
                      {sale.batch?.name || '-'} - {sale.piece?.piece_number || '-'}
                    </span>
                  </div>
                  <Badge 
                    variant={isFull ? 'success' : isInstallment ? 'info' : 'warning'} 
                    size="sm"
                    className="text-xs"
                  >
                    {isFull ? 'نقدي' : isInstallment ? 'تقسيط' : 'وعد'}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-gray-600">
                  <div>
                    <span className="text-gray-500">المساحة:</span>
                    <span className="font-medium mr-1">{sale.piece?.surface_m2.toLocaleString('en-US')} م²</span>
                  </div>
                  <div>
                    <span className="text-gray-500">السعر:</span>
                    <span className="font-medium mr-1">{formatPrice(sale.sale_price)} DT</span>
                  </div>
                  <div>
                    <span className="text-gray-500">العربون:</span>
                    <span className="font-medium mr-1 text-blue-600">{formatPrice(sale.deposit_amount)} DT</span>
                  </div>
                </div>
                {sale.deadline_date && (
                  <div className="mt-1 pt-1 border-t border-gray-100">
                    <DeadlineCountdown deadlineDate={sale.deadline_date} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Payment Details */}
        <Card className="p-2 sm:p-3 bg-orange-50 border-orange-200">
          <h3 className="text-xs sm:text-sm font-semibold text-orange-900 mb-2">تفاصيل الدفع الإجمالية</h3>
          <div className="space-y-2 text-xs sm:text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">السعر الإجمالي:</span>
              <span className="font-bold">{formatPrice(totalPrice)} DT</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">إجمالي العربون:</span>
              <span className="font-semibold text-blue-600">{formatPrice(totalDeposit)} DT</span>
            </div>
            {isPromise && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-600">إجمالي المستلم:</span>
                  <span className="font-semibold text-orange-600">{formatPrice(totalPartialPaid)} DT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">إجمالي المتبقي:</span>
                  <span className="font-semibold text-gray-700">{formatPrice(totalRemaining)} DT</span>
                </div>
              </>
            )}
            {isInstallment && firstSale.payment_offer && (
              <div className="pt-2 border-t border-orange-200 space-y-1">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>سعر المتر (تقسيط):</span>
                  <span>{firstSale.payment_offer.price_per_m2_installment.toLocaleString('en-US')} د/م²</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>التسبقة:</span>
                  <span>
                    {firstSale.payment_offer.advance_value} {firstSale.payment_offer.advance_mode === 'percent' ? '%' : 'دت'}
                  </span>
                </div>
                {firstSale.payment_offer.calc_mode === 'monthlyAmount' && firstSale.payment_offer.monthly_amount && (
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>المبلغ الشهري:</span>
                    <span>{formatPrice(firstSale.payment_offer.monthly_amount)} DT</span>
                  </div>
                )}
                {firstSale.payment_offer.calc_mode === 'months' && firstSale.payment_offer.months && (
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>عدد الأشهر:</span>
                    <span>{firstSale.payment_offer.months} شهر</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Notes */}
        {firstSale.notes && (
          <Card className="p-2 sm:p-3 bg-gray-50 border-gray-200">
            <h3 className="text-xs sm:text-sm font-semibold text-gray-900 mb-2">ملاحظات</h3>
            <p className="text-xs sm:text-sm text-gray-700">{firstSale.notes}</p>
          </Card>
        )}
      </div>
    </Dialog>
  )
}

