// ============================================================================
// INSTALLMENT CALCULATION UTILITIES
// ============================================================================

interface InstallmentOffer {
  price_per_m2_installment: number
  advance_mode: 'fixed' | 'percent'
  advance_value: number
  calc_mode: 'monthlyAmount' | 'months'
  monthly_amount: number | null
  months: number | null
}

interface InstallmentCalculationResult {
  basePrice: number
  advanceAmount: number
  remainingAmount: number
  monthlyPayment: number
  numberOfMonths: number
}

/**
 * Calculate installment payment breakdown
 */
export function calculateInstallment(
  surfaceM2: number,
  offer: InstallmentOffer
): InstallmentCalculationResult {
  // Step 1: Calculate base price
  const basePrice = offer.price_per_m2_installment * surfaceM2

  // Step 2: Calculate advance payment
  let advanceAmount = 0
  if (offer.advance_mode === 'fixed') {
    advanceAmount = offer.advance_value
  } else if (offer.advance_mode === 'percent') {
    advanceAmount = (basePrice * offer.advance_value) / 100
  }

  // Step 3: Calculate remaining after advance
  const remainingAmount = basePrice - advanceAmount

  // Step 4: Calculate monthly payment and number of months
  let monthlyPayment = 0
  let numberOfMonths = 0

  if (offer.calc_mode === 'months') {
    // If months is specified, use it
    numberOfMonths = offer.months || 0
    monthlyPayment = numberOfMonths > 0 ? remainingAmount / numberOfMonths : 0
  } else if (offer.calc_mode === 'monthlyAmount') {
    // If monthly amount is specified
    monthlyPayment = offer.monthly_amount || 0
    if (monthlyPayment > 0) {
      // If months is also specified in the offer, use it
      if (offer.months && offer.months > 0) {
        numberOfMonths = offer.months
        // If months is specified with monthlyAmount, recalculate to ensure it matches remainingAmount
        // Otherwise use the specified monthly amount (last installment will be adjusted)
        const totalWithSpecifiedMonthly = monthlyPayment * numberOfMonths
        if (totalWithSpecifiedMonthly > remainingAmount + 0.01) { // Allow small rounding differences
          // Recalculate monthly payment to fit the remaining amount
          monthlyPayment = remainingAmount / numberOfMonths
        }
      } else {
        // Otherwise calculate months from remaining amount
        numberOfMonths = Math.ceil(remainingAmount / monthlyPayment)
      }
    }
  }

  return {
    basePrice,
    advanceAmount,
    remainingAmount,
    monthlyPayment,
    numberOfMonths,
  }
}

/**
 * CENTRALIZED INSTALLMENT CALCULATION WITH DEPOSIT
 * This is the main function to use for all installment calculations across the app
 * 
 * Formula:
 * - المتبقي للتقسيط = السعر الإجمالي - (التسبقة بعد خصم العربون)
 * - المتبقي للتقسيط = basePrice - (advanceAmount - depositAmount)
 * - المتبقي للتقسيط = basePrice - advanceAmount + depositAmount
 */
export function calculateInstallmentWithDeposit(
  surfaceM2: number,
  offer: InstallmentOffer,
  depositAmount: number = 0
): {
  basePrice: number
  advanceAmount: number
  depositAmount: number
  advanceAfterDeposit: number // التسبقة بعد خصم العربون
  remainingForInstallments: number // المتبقي للتقسيط
  monthlyPayment: number
  numberOfMonths: number
  // Recalculated values based on remainingForInstallments
  recalculatedMonthlyPayment: number
  recalculatedNumberOfMonths: number
} {
  // Step 1: Calculate base installment
  const calc = calculateInstallment(surfaceM2, offer)

  // Step 2: Calculate advance after deposit
  // التسبقة بعد خصم العربون = advanceAmount - depositAmount (but not negative)
  const advanceAfterDeposit = Math.max(0, calc.advanceAmount - depositAmount)

  // Step 3: Calculate remaining for installments
  // If deposit > advance: remove advance from total, then remove remaining deposit
  // If deposit <= advance: remove (advance - deposit) from total
  // Formula: basePrice - advanceAmount - Math.max(0, depositAmount - advanceAmount)
  // Simplified: basePrice - Math.max(advanceAmount, depositAmount)
  const remainingForInstallments = calc.basePrice - Math.max(calc.advanceAmount, depositAmount)

  // Step 4: Recalculate monthly payment and number of months based on remainingForInstallments
  let recalculatedMonthlyPayment = 0
  let recalculatedNumberOfMonths = 0

  if (offer.calc_mode === 'months') {
    // If months is specified, use it and recalculate monthly payment
    recalculatedNumberOfMonths = offer.months || 0
    recalculatedMonthlyPayment = recalculatedNumberOfMonths > 0 
      ? remainingForInstallments / recalculatedNumberOfMonths 
      : 0
  } else if (offer.calc_mode === 'monthlyAmount') {
    // If monthly amount is specified, use it and recalculate number of months
    recalculatedMonthlyPayment = offer.monthly_amount || 0
    if (recalculatedMonthlyPayment > 0) {
      if (offer.months && offer.months > 0) {
        // If months is also specified, use it and verify/adjust monthly payment
        recalculatedNumberOfMonths = offer.months
        const totalWithSpecifiedMonthly = recalculatedMonthlyPayment * recalculatedNumberOfMonths
        if (totalWithSpecifiedMonthly > remainingForInstallments + 0.01) {
          // Recalculate monthly payment to fit the remaining amount
          recalculatedMonthlyPayment = remainingForInstallments / recalculatedNumberOfMonths
        }
      } else {
        // Otherwise calculate months from remaining amount
        recalculatedNumberOfMonths = Math.ceil(remainingForInstallments / recalculatedMonthlyPayment)
      }
    }
  }

  return {
    basePrice: calc.basePrice,
    advanceAmount: calc.advanceAmount,
    depositAmount,
    advanceAfterDeposit,
    remainingForInstallments,
    monthlyPayment: calc.monthlyPayment, // Original calculation
    numberOfMonths: calc.numberOfMonths, // Original calculation
    recalculatedMonthlyPayment,
    recalculatedNumberOfMonths,
  }
}
