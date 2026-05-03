// ============================================================================
// PIECE PRICE DETAILS COMPONENT
// Reusable component to display piece price information
// ============================================================================

import { formatPrice } from '@/utils/priceCalculator'
import { useLanguage } from '@/i18n/context'

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
  advanceAmount: _advanceAmount,
  remainingAmount,
}: PiecePriceDetailsProps) {
  const { t } = useLanguage()
  const meterLabel = paymentType === 'installment'
    ? t('piecePriceDetails.installmentPricePerMeter')
    : t('piecePriceDetails.pricePerMeter')
  return (
    <div className="border-t border-gray-300 pt-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium">
            {batchName} - {pieceNumber}
          </p>
          <p className="text-sm text-gray-600 mt-1">{surfaceM2.toLocaleString()} {t('piecePriceDetails.surfaceUnit')}</p>
          {pricePerM2 && (
            <p className="text-xs text-gray-500 mt-1">
              {meterLabel}: {pricePerM2.toLocaleString()} {t('piecePriceDetails.pricePerMeterUnit')} · {t('piecePriceDetails.price')}: {formatPrice(totalPrice)} DT
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="font-semibold">{formatPrice(totalPrice)} DT</p>
          {paymentType === 'full' ? (
            <p className="text-sm text-gray-600 mt-1">
              {t('piecePriceDetails.fullAmount')}: {formatPrice(totalPrice)} DT
            </p>
          ) : paymentType === 'promise' ? (
            <p className="text-sm text-yellow-600 mt-1">
              {t('piecePriceDetails.promise')}: {formatPrice(totalPrice)} DT
            </p>
          ) : (
            remainingAmount !== undefined && (
              <p className="text-sm text-gray-600 mt-1">
                {t('piecePriceDetails.remaining')}: {formatPrice(remainingAmount)} DT
              </p>
            )
          )}
        </div>
      </div>
    </div>
  )
}

