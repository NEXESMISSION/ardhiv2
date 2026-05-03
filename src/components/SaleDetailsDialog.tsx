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
  seller?: {
    id: string
    name: string
    place: string | null
  }
}

interface SaleDetailsDialogProps {
  open: boolean
  onClose: () => void
  sale: Sale | null
}

export function SaleDetailsDialog({ open, onClose, sale }: SaleDetailsDialogProps) {
  if (!sale) return null

  const isInstallment = sale.payment_method === 'installment'
  const isPromise = sale.payment_method === 'promise'
  const isFull = sale.payment_method === 'full'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`تفاصيل البيع - ${sale.piece?.piece_number || 'غير محدد'}`}
      size="lg"
    >
      <div className="space-y-3 sm:space-y-4">
        {/* Client Info */}
        <Card className="p-2 sm:p-3 bg-blue-50 border-blue-200">
          <h3 className="text-xs sm:text-sm font-semibold text-blue-900 mb-2">معلومات العميل</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm">
            <div>
              <span className="text-gray-600">الاسم:</span>
              <span className="font-medium mr-1">{sale.client?.name || 'غير محدد'}</span>
            </div>
            <div>
              <span className="text-gray-600">رقم الهوية:</span>
              <span className="font-medium mr-1">{sale.client?.id_number || 'غير محدد'}</span>
            </div>
            <div>
              <span className="text-gray-600">الهاتف:</span>
              <span className="font-medium mr-1">{sale.client?.phone || 'غير محدد'}</span>
            </div>
          </div>
        </Card>

        {/* Seller / Place */}
        {(sale.seller?.name || sale.seller?.place) && (
          <Card className="p-2 sm:p-3 bg-indigo-50 border-indigo-200">
            <h3 className="text-xs sm:text-sm font-semibold text-indigo-900 mb-2">البائع / المكان</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm">
              {sale.seller?.name && (
                <div>
                  <span className="text-gray-600">البائع:</span>
                  <span className="font-medium mr-1">{sale.seller.name}</span>
                </div>
              )}
              {sale.seller?.place && (
                <div>
                  <span className="text-gray-600">المكان:</span>
                  <span className="font-medium mr-1">{sale.seller.place}</span>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Piece Info */}
        <Card className="p-2 sm:p-3 bg-green-50 border-green-200">
          <h3 className="text-xs sm:text-sm font-semibold text-green-900 mb-2">معلومات القطعة</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm">
            <div>
              <span className="text-gray-600">الدفعة:</span>
              <span className="font-medium mr-1">{sale.batch?.name || 'غير محدد'}</span>
            </div>
            <div>
              <span className="text-gray-600">رقم القطعة:</span>
              <span className="font-medium mr-1">{sale.piece?.piece_number || 'غير محدد'}</span>
            </div>
            <div>
              <span className="text-gray-600">المساحة:</span>
              <span className="font-medium mr-1">{sale.piece?.surface_m2.toLocaleString('en-US')} م²</span>
            </div>
            <div>
              <span className="text-gray-600">السعر:</span>
              <span className="font-medium mr-1">{formatPrice(sale.sale_price)} DT</span>
            </div>
          </div>
        </Card>

        {/* Payment offer (installment) – full offer details in one block */}
        {sale.payment_offer && (
          <Card className="p-2 sm:p-3 bg-cyan-50 border-cyan-200">
            <h3 className="text-xs sm:text-sm font-semibold text-cyan-900 mb-2">📋 عرض التقسيط</h3>
            <div className="space-y-1.5 text-xs sm:text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">اسم العرض:</span>
                <span className="font-medium">{sale.payment_offer.name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">سعر المتر (تقسيط):</span>
                <span className="font-medium">{sale.payment_offer.price_per_m2_installment?.toLocaleString('en-US') ?? '—'} د/م²</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">التسبقة:</span>
                <span className="font-medium">
                  {sale.payment_offer.advance_value} {sale.payment_offer.advance_mode === 'percent' ? '%' : 'DT'}
                </span>
              </div>
              {sale.payment_offer.calc_mode === 'monthlyAmount' && sale.payment_offer.monthly_amount != null && (
                <div className="flex justify-between">
                  <span className="text-gray-600">المبلغ الشهري:</span>
                  <span className="font-medium">{formatPrice(sale.payment_offer.monthly_amount)} DT</span>
                </div>
              )}
              {sale.payment_offer.calc_mode === 'months' && sale.payment_offer.months != null && (
                <div className="flex justify-between">
                  <span className="text-gray-600">عدد الأشهر:</span>
                  <span className="font-medium">{sale.payment_offer.months} شهر</span>
                </div>
              )}
            </div>
          </Card>
        )}

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
              <span className="font-medium">{formatDate(sale.sale_date)}</span>
            </div>
            {sale.deadline_date && (
              <div className="flex justify-between items-center">
                <span className="text-gray-600">تاريخ آخر أجل:</span>
                <div className="text-left">
                  <p className="text-xs text-gray-500 mb-1">{formatDate(sale.deadline_date)}</p>
                  <DeadlineCountdown deadlineDate={sale.deadline_date} />
                </div>
              </div>
            )}
            {sale.appointment_date && (
              <div className="flex justify-between">
                <span className="text-gray-600">موعد:</span>
                <span className="font-medium">{formatDate(sale.appointment_date)}</span>
              </div>
            )}
            <div className="pt-2 mt-2 border-t border-purple-200">
              <span className="text-gray-600 block mb-1">ملاحظات البيع (من مرحلة البيع):</span>
              <p className="text-gray-800 font-medium whitespace-pre-wrap">{sale.notes?.trim() || '—'}</p>
            </div>
          </div>
        </Card>

        {/* Payment Details */}
        <Card className="p-2 sm:p-3 bg-orange-50 border-orange-200">
          <h3 className="text-xs sm:text-sm font-semibold text-orange-900 mb-2">تفاصيل الدفع</h3>
          <div className="space-y-2 text-xs sm:text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">السعر الإجمالي:</span>
              <span className="font-bold">{formatPrice(sale.sale_price)} DT</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">العربون:</span>
              <span className="font-semibold text-blue-600">{formatPrice(sale.deposit_amount)} DT</span>
            </div>
            {isPromise && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-600">المستلم:</span>
                  <span className="font-semibold text-orange-600">
                    {formatPrice(sale.partial_payment_amount || sale.deposit_amount)} DT
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">المتبقي:</span>
                  <span className="font-semibold text-gray-700">
                    {formatPrice(sale.remaining_payment_amount || (sale.sale_price - (sale.partial_payment_amount || sale.deposit_amount)))} DT
                  </span>
                </div>
              </>
            )}
            {isInstallment && sale.payment_offer && (
              <div className="pt-2 border-t border-orange-200 space-y-1">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>سعر المتر (تقسيط):</span>
                  <span>{sale.payment_offer.price_per_m2_installment.toLocaleString('en-US')} د/م²</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>التسبقة:</span>
                  <span>
                    {sale.payment_offer.advance_value} {sale.payment_offer.advance_mode === 'percent' ? '%' : 'دت'}
                  </span>
                </div>
                {sale.payment_offer.calc_mode === 'monthlyAmount' && sale.payment_offer.monthly_amount && (
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>المبلغ الشهري:</span>
                    <span>{formatPrice(sale.payment_offer.monthly_amount)} DT</span>
                  </div>
                )}
                {sale.payment_offer.calc_mode === 'months' && sale.payment_offer.months && (
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>عدد الأشهر:</span>
                    <span>{sale.payment_offer.months} شهر</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

      </div>
    </Dialog>
  )
}

