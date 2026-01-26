// ============================================================================
// PAYMENT BREAKDOWN COMPONENT
// Reusable component to display payment calculations
// ============================================================================

import { formatPrice } from '@/utils/priceCalculator'
import { PaymentTerms } from '@/utils/paymentTerms'

interface PaymentBreakdownProps {
  totalPrice: number
  advanceAmount: number
  remainingAmount: number
  monthlyPayment: number
  numberOfMonths: number
  paymentType: 'full' | 'installment' | 'promise'
  surfaceM2?: number
  pricePerM2?: number | null
  installmentPricePerM2?: number | null
  advanceMode?: 'fixed' | 'percent'
  advanceValue?: number
  depositAmount?: number
}

export function PaymentBreakdown({
  totalPrice,
  advanceAmount,
  remainingAmount,
  monthlyPayment,
  numberOfMonths,
  paymentType,
  surfaceM2,
  pricePerM2,
  installmentPricePerM2,
  advanceMode,
  advanceValue,
  depositAmount = 0,
}: PaymentBreakdownProps) {
  const basePrice = (paymentType === 'full' || paymentType === 'promise') && surfaceM2 && pricePerM2 
    ? surfaceM2 * pricePerM2 
    : totalPrice

  if (paymentType === 'promise') {
    return (
      <div className="space-y-3">
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
          <p className="text-xs text-yellow-700 mb-2 font-medium">⚠️ وعد بالبيع</p>
          <p className="text-sm text-yellow-800">
            سيتم الدفع على جزئين: عند التأكيد الأول يتم إدخال المبلغ المحصل، والباقي سيتم إدخاله في تأكيد ثاني لاحقاً
          </p>
        </div>
        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-700 mb-1">عدد القطع</p>
            <p className="text-2xl font-bold text-blue-900">1</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-600 mb-1">السعر الإجمالي</p>
            <p className="text-xl font-bold text-gray-900">{formatPrice(totalPrice)} DT</p>
          </div>
          <div className="bg-green-50 border-2 border-green-400 rounded-lg p-3">
            <p className="text-xs text-green-700 mb-1 font-medium">المتبقي بعد العربون</p>
            <p className="text-2xl font-bold text-green-600">{formatPrice(remainingAmount > 0 ? remainingAmount : totalPrice)} DT</p>
          </div>
        </div>

        {/* Detailed Calculation */}
        {surfaceM2 && pricePerM2 && (
          <div className="bg-white border-2 border-blue-300 rounded-xl p-4 shadow-sm">
            <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-blue-500 rounded"></span>
              تفاصيل الحساب
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center py-1">
                <span className="text-gray-600">المساحة</span>
                <span className="font-semibold text-gray-900">{surfaceM2.toLocaleString()} م²</span>
              </div>
              <div className="flex justify-between items-center py-1 border-t border-gray-100">
                <span className="text-gray-600">سعر المتر المربع</span>
                <span className="font-semibold text-gray-900">{pricePerM2.toLocaleString()} دت/م²</span>
              </div>
              {depositAmount > 0 && (
                <div className="flex justify-between items-center py-1 border-t border-gray-100">
                  <span className="text-gray-600">العربون (المحصل الآن):</span>
                  <span className="font-semibold text-blue-600">- {formatPrice(depositAmount)} DT</span>
                </div>
              )}
              <div className="flex justify-between items-center py-2 border-t-2 border-yellow-200 mt-2">
                <span className="font-bold text-gray-800">المبلغ المتبقي (سيتم دفعه على جزئين)</span>
                <span className="text-xl font-bold text-yellow-600">{formatPrice(remainingAmount > 0 ? remainingAmount : totalPrice)} DT</span>
              </div>
              <div className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded mt-2 font-mono">
                {(() => {
                  const parts = [`${surfaceM2?.toLocaleString()} × ${pricePerM2?.toLocaleString()}`]
                  if (depositAmount > 0) {
                    parts.push(`- ${formatPrice(depositAmount)}`)
                  }
                  parts.push(`= ${formatPrice(remainingAmount > 0 ? remainingAmount : totalPrice)}`)
                  return parts.join(' ')
                })()} DT
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (paymentType === 'full') {
    return (
      <div className="space-y-3">
        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-700 mb-1">عدد القطع</p>
            <p className="text-2xl font-bold text-blue-900">1</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-600 mb-1">السعر الإجمالي</p>
            <p className="text-xl font-bold text-gray-900">{formatPrice(totalPrice)} DT</p>
          </div>
          <div className="bg-green-50 border-2 border-green-400 rounded-lg p-3">
            <p className="text-xs text-green-700 mb-1 font-medium">المبلغ المستحق</p>
            <p className="text-2xl font-bold text-green-600">{formatPrice(remainingAmount > 0 ? remainingAmount : totalPrice)} DT</p>
          </div>
        </div>

        {/* Detailed Calculation */}
        {surfaceM2 && pricePerM2 && (
          <div className="bg-white border-2 border-blue-300 rounded-xl p-4 shadow-sm">
            <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-blue-500 rounded"></span>
              تفاصيل الحساب
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center py-1">
                <span className="text-gray-600">المساحة</span>
                <span className="font-semibold text-gray-900">{surfaceM2.toLocaleString()} م²</span>
              </div>
              <div className="flex justify-between items-center py-1 border-t border-gray-100">
                <span className="text-gray-600">سعر المتر المربع</span>
                <span className="font-semibold text-gray-900">{pricePerM2.toLocaleString()} دت/م²</span>
              </div>
              {depositAmount > 0 && (
                <div className="flex justify-between items-center py-1 border-t border-gray-100">
                  <span className="text-gray-600">العربون (المحصل الآن):</span>
                  <span className="font-semibold text-blue-600">- {formatPrice(depositAmount)} DT</span>
                </div>
              )}
              <div className="flex justify-between items-center py-2 border-t-2 border-blue-200 mt-2">
                <span className="font-bold text-gray-800">المبلغ المستحق (سيتم تحصيله عند التأكيد)</span>
                <span className="text-xl font-bold text-green-600">{formatPrice(remainingAmount > 0 ? remainingAmount : totalPrice)} DT</span>
              </div>
              <div className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded mt-2 font-mono">
                {(() => {
                  const parts = [`${surfaceM2?.toLocaleString()} × ${pricePerM2?.toLocaleString()}`]
                  if (depositAmount > 0) {
                    parts.push(`- ${formatPrice(depositAmount)}`)
                  }
                  parts.push(`= ${formatPrice(remainingAmount > 0 ? remainingAmount : totalPrice)}`)
                  return parts.join(' ')
                })()} DT
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Installment breakdown with detailed calculations
  return (
    <div className="space-y-3">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-700 mb-1">عدد القطع</p>
          <p className="text-2xl font-bold text-blue-900">1</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-600 mb-1">السعر الإجمالي</p>
          <p className="text-xl font-bold text-gray-900">{formatPrice(totalPrice)} DT</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
          <p className="text-xs text-purple-700 mb-1">المبلغ المتبقي</p>
          <p className="text-xl font-bold text-purple-600">{formatPrice(remainingAmount)} DT</p>
        </div>
      </div>

      {/* Detailed Installment Calculation */}
      <div className="bg-white border-2 border-blue-300 rounded-xl p-4 shadow-sm">
        <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <span className="w-1 h-5 bg-blue-500 rounded"></span>
          تفاصيل الحساب
        </h4>
        
        <div className="space-y-3 text-sm">
          {/* Base Price */}
          {surfaceM2 && installmentPricePerM2 && (
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-700 font-medium">السعر الأساسي</span>
                <span className="font-bold text-gray-900">{formatPrice(totalPrice)} DT</span>
              </div>
              <div className="text-xs text-gray-600 space-y-1">
                <div className="flex justify-between">
                  <span>المساحة:</span>
                  <span className="font-medium">{surfaceM2.toLocaleString()} م²</span>
                </div>
                <div className="flex justify-between">
                  <span>سعر المتر (تقسيط):</span>
                  <span className="font-medium">{installmentPricePerM2.toLocaleString()} دت/م²</span>
                </div>
                <div className="text-gray-500 mt-2 pt-2 border-t border-gray-200 font-mono">
                  {surfaceM2.toLocaleString()} × {installmentPricePerM2.toLocaleString()} = {formatPrice(totalPrice)} DT
                </div>
              </div>
            </div>
          )}


          {/* Advance Payment */}
          {advanceAmount > 0 && advanceMode && advanceValue !== undefined && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-blue-800 font-medium">{PaymentTerms.advanceLabel}</span>
                <span className="font-bold text-blue-600">- {formatPrice(advanceAmount)} DT</span>
              </div>
              <div className="text-xs text-blue-700">
                {advanceMode === 'fixed' ? (
                  <>مبلغ ثابت: {formatPrice(advanceValue)} DT</>
                ) : (
                  <>{advanceValue}% من {formatPrice(totalPrice)} DT</>
                )}
              </div>
            </div>
          )}

          {/* Remaining Amount - Highlighted */}
          <div className="bg-green-50 border-2 border-green-400 rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-green-800 font-bold text-base">المبلغ المتبقي</span>
              <span className="text-2xl font-bold text-green-600">{formatPrice(remainingAmount)} DT</span>
            </div>
            <div className="text-xs text-green-700 font-mono bg-white px-2 py-1 rounded">
              {(() => {
                const parts = [formatPrice(totalPrice)]
                if (advanceAmount > 0) {
                  parts.push(`- ${formatPrice(advanceAmount)}`)
                }
                if (depositAmount > 0) {
                  parts.push(`- ${formatPrice(depositAmount)}`)
                }
                parts.push(`= ${formatPrice(remainingAmount)}`)
                return parts.join(' ')
              })()} DT
            </div>
          </div>

          {/* Monthly Payment - Highlighted */}
          {numberOfMonths > 0 && monthlyPayment > 0 && (
            <div className="bg-purple-50 border-2 border-purple-400 rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-purple-800 font-bold text-base">القسط الشهري ({numberOfMonths} شهر)</span>
                <span className="text-2xl font-bold text-purple-600">{formatPrice(monthlyPayment)} DT</span>
              </div>
              <div className="text-xs text-purple-700 font-mono bg-white px-2 py-1 rounded">
                {formatPrice(remainingAmount)} ÷ {numberOfMonths} = {formatPrice(monthlyPayment)} DT/شهر
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

