// ============================================================================
// INSTALLMENT SCHEDULE UTILITIES
// ============================================================================

import { calculateInstallmentWithDeposit } from './installmentCalculator'

interface InstallmentOffer {
  price_per_m2_installment: number
  advance_mode: 'fixed' | 'percent'
  advance_value: number
  calc_mode: 'monthlyAmount' | 'months'
  monthly_amount: number | null
  months: number | null
}

interface InstallmentScheduleItem {
  installmentNumber: number
  amountDue: number
  dueDate: Date
}

/**
 * Generate installment schedule based on offer and start date
 * 
 * IMPORTANT: Uses the centralized calculator to ensure consistency
 * 
 * Payment flow:
 * - Phase 1 (Sale): Deposit (العربون) is paid
 * - Phase 2 (Confirmation): Advance - Deposit (التسبقة) is paid
 * - Phase 3 (Installments): Only the remaining amount is divided into monthly installments
 * 
 * Formula:
 * - المتبقي للتقسيط = السعر الإجمالي - (التسبقة بعد خصم العربون)
 */
export function generateInstallmentSchedule(
  surfaceM2: number,
  offer: InstallmentOffer,
  startDate: Date,
  depositAmount: number = 0
): InstallmentScheduleItem[] {
  // Use centralized calculator
  const calc = calculateInstallmentWithDeposit(surfaceM2, offer, depositAmount)
  
  const schedule: InstallmentScheduleItem[] = []
  const numberOfMonths = calc.recalculatedNumberOfMonths || 0
  const monthlyPayment = calc.recalculatedMonthlyPayment || 0
  
  // Validate that we have valid installment data
  if (!Number.isFinite(numberOfMonths) || numberOfMonths <= 0) {
    console.error('Invalid installment calculation:', { numberOfMonths, calc })
    return schedule // Return empty schedule if invalid
  }
  
  if (monthlyPayment <= 0) {
    console.error('Monthly payment is zero or negative:', { monthlyPayment, remainingForInstallments: calc.remainingForInstallments, numberOfMonths })
    return schedule
  }
  
  // Generate equal monthly installments
  // Create a clean date object to avoid timezone issues
  const cleanStartDate = new Date(
    Date.UTC(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate(),
      0,
      0,
      0,
      0
    )
  )

  for (let i = 1; i <= numberOfMonths; i++) {
    // Calculate target month and year
    const targetMonth = cleanStartDate.getMonth() + i - 1
    const targetYear = cleanStartDate.getFullYear() + Math.floor(targetMonth / 12)
    const finalMonth = targetMonth % 12

    // Get the last day of the target month to handle edge cases
    const lastDayOfMonth = new Date(Date.UTC(targetYear, finalMonth + 1, 0)).getDate()
    
    // Use the same day of month as start date, but clamp to last day if needed
    // This prevents issues like Jan 31 -> Feb 31 (invalid) -> Feb 28/29
    const targetDay = Math.min(cleanStartDate.getDate(), lastDayOfMonth)

    // Create date in UTC to avoid timezone issues
    const dueDate = new Date(Date.UTC(targetYear, finalMonth, targetDay, 0, 0, 0, 0))
    
    // Last installment might need adjustment for rounding
    const isLast = i === numberOfMonths
    const amountDue = isLast 
      ? calc.remainingForInstallments - (monthlyPayment * (numberOfMonths - 1))
      : monthlyPayment
    
    schedule.push({
      installmentNumber: i,
      amountDue: Math.round(amountDue * 100) / 100, // Round to 2 decimal places
      dueDate,
    })
  }
  
  return schedule
}

/**
 * Calculate payment statistics
 */
export function calculatePaymentStats(
  totalAmount: number,
  depositAmount: number,
  paidAmount: number
) {
  const remaining = totalAmount - paidAmount
  const progress = totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0
  
  return {
    totalAmount,
    depositAmount,
    paidAmount,
    remaining,
    progress: Math.round(progress * 100) / 100,
  }
}

