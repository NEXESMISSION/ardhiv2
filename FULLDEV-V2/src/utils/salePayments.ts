import { calculateInstallment } from '@/utils/installmentCalculator'

type SaleLike = {
  id: string
  status?: string
  sale_price?: number | null
  deposit_amount?: number | null
  payment_method?: string | null
  notes?: string | null
  partial_payment_amount?: number | null
  remaining_payment_amount?: number | null
  piece?: { surface_m2: number } | null
  batch?: { price_per_m2_cash: number | null } | null
  payment_offer?: {
    price_per_m2_installment: number
    advance_mode: 'fixed' | 'percent'
    advance_value: number
    calc_mode: 'monthlyAmount' | 'months'
    monthly_amount: number | null
    months: number | null
  } | null
}

export interface PromisePaymentInfo {
  partialPayment: number
  remainingAfterPartial: number
  basePrice: number
  depositAmount: number
}

const parseLocalizedNumber = (value: string | null | undefined): number => {
  if (!value) return 0
  const normalized = value.replace(/[^0-9.-]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Determine the base sale price using stored sale_price when available,
 * and fallback to batch cash price * surface when sale_price is missing.
 */
export const getBasePrice = (sale: SaleLike): number => {
  if (sale.sale_price && sale.sale_price > 0) return sale.sale_price
  if (sale.piece && sale.batch?.price_per_m2_cash) {
    return sale.piece.surface_m2 * sale.batch.price_per_m2_cash
  }
  return 0
}

/**
 * Extract promise-sale partial payment details from notes.
 * Format supported: "[وعد بالبيع - الدفعة الأولى: X DT، المتبقي: Y DT]"
 */
export const extractPromisePaymentInfo = (sale: SaleLike): PromisePaymentInfo | null => {
  if (sale.payment_method !== 'promise') return null

  const depositAmount = sale.deposit_amount || 0
  const basePrice = getBasePrice(sale)
  const notes = sale.notes || ''

  // Prefer structured fields when present
  const structuredPartial = sale.partial_payment_amount ?? null
  const structuredRemaining = sale.remaining_payment_amount ?? null

  if (structuredPartial !== null || structuredRemaining !== null) {
    const partialPayment = Math.max(0, structuredPartial ?? 0)
    const remainingAfterPartial =
      structuredRemaining !== null
        ? Math.max(0, structuredRemaining)
        : Math.max(0, basePrice - depositAmount - partialPayment)

    return {
      partialPayment: Math.min(basePrice, partialPayment),
      remainingAfterPartial,
      basePrice,
      depositAmount,
    }
  }

  // Fallback to legacy parsing from notes (for backward compatibility)
  const partialMatch = notes.match(/وعد بالبيع\s*-\s*الدفعة الأولى:\s*([\d.,]+)/i)
  const remainingMatch = notes.match(/المتبقي:\s*([\d.,]+)/i)

  const partialPayment = Math.min(
    Math.max(0, basePrice - depositAmount),
    parseLocalizedNumber(partialMatch?.[1])
  )

  const remainingAfterPartial =
    remainingMatch?.[1] != null
      ? parseLocalizedNumber(remainingMatch[1])
      : Math.max(0, basePrice - depositAmount - partialPayment)

  return {
    partialPayment,
    remainingAfterPartial,
    basePrice,
    depositAmount,
  }
}

/**
 * Calculate the amount received at confirmation (advance minus deposit for installment,
 * remaining for full cash, partial payment for promise).
 */
export const calculateConfirmationAmount = (sale: SaleLike): number => {
  if (!sale || sale.status !== 'completed') return 0
  const depositAmount = sale.deposit_amount || 0

  if (sale.payment_method === 'promise') {
    const basePrice = getBasePrice(sale)
    const remaining = sale.remaining_payment_amount
    // If we know what's left, confirmation = total paid after deposit
    if (remaining !== null && remaining !== undefined) {
      return Math.max(0, basePrice - depositAmount - remaining)
    }

    return extractPromisePaymentInfo(sale)?.partialPayment || 0
  }

  if (sale.payment_method === 'installment' && sale.payment_offer && sale.piece) {
    const calc = calculateInstallment(sale.piece.surface_m2, {
      price_per_m2_installment: sale.payment_offer.price_per_m2_installment,
      advance_mode: sale.payment_offer.advance_mode,
      advance_value: sale.payment_offer.advance_value,
      calc_mode: sale.payment_offer.calc_mode,
      monthly_amount: sale.payment_offer.monthly_amount,
      months: sale.payment_offer.months,
    })
    return Math.max(0, calc.advanceAmount - depositAmount)
  }

  if (sale.payment_method === 'full' && sale.batch && sale.piece) {
    const pricePerM2 = sale.batch.price_per_m2_cash || 0
    const basePrice = sale.piece.surface_m2 * pricePerM2
    return Math.max(0, basePrice - depositAmount)
  }

  return 0
}

/**
 * Calculate remaining amount after deposit, confirmation, and optional extra paid (e.g. installments).
 */
export const calculateRemainingAmount = (sale: SaleLike, extraPaid = 0): number => {
  const basePrice = getBasePrice(sale)
  const depositAmount = sale.deposit_amount || 0
  const confirmationPaid = calculateConfirmationAmount(sale)

  // If sale tracks remaining payment explicitly, prefer that value
  if (sale.remaining_payment_amount !== null && sale.remaining_payment_amount !== undefined) {
    return Math.max(0, sale.remaining_payment_amount - extraPaid)
  }

  return Math.max(0, basePrice - depositAmount - confirmationPaid - extraPaid)
}

