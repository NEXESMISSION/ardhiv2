// ============================================================================
// PIECE PRICE DETAILS COMPONENT
// Reusable component to display piece price information
// ============================================================================

import { formatPrice } from '@/utils/priceCalculator'

interface PiecePriceDetailsProps {
  batchName: string
  pieceNumber: string
  surfaceM2: number
  pricePerM2: number | null
  totalPrice: number
  paymentType: 'full' | 'installment' | 'promise'
  advanceAmount?: number
  remainingAmount?: number
}

export function PiecePriceDetails({
  batchName,
  pieceNumber,
  surfaceM2,
  pricePerM2,
  totalPrice,
  paymentType,
  advanceAmount,
  remainingAmount,
}: PiecePriceDetailsProps) {
  return (
    <div className="border-t border-gray-300 pt-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium">
            {batchName} - {pieceNumber}
          </p>
          <p className="text-sm text-gray-600 mt-1">{surfaceM2.toLocaleString()} م²</p>
          {pricePerM2 && (
            <p className="text-xs text-gray-500 mt-1">
              {paymentType === 'full' || paymentType === 'promise' ? (
                <>سعر المتر: {pricePerM2.toLocaleString()} دت/م² · السعر: {formatPrice(totalPrice)} DT</>
              ) : (
                <>سعر التقسيط: {pricePerM2.toLocaleString()} دت/م² · السعر: {formatPrice(totalPrice)} DT</>
              )}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="font-semibold">{formatPrice(totalPrice)} DT</p>
          {paymentType === 'full' ? (
            <p className="text-sm text-gray-600 mt-1">
              المبلغ الكامل: {formatPrice(totalPrice)} DT
            </p>
          ) : paymentType === 'promise' ? (
            <p className="text-sm text-yellow-600 mt-1">
              وعد بالبيع: {formatPrice(totalPrice)} DT
            </p>
          ) : (
            remainingAmount !== undefined && (
              <p className="text-sm text-gray-600 mt-1">
                المتبقي: {formatPrice(remainingAmount)} DT
              </p>
            )
          )}
        </div>
      </div>
    </div>
  )
}

