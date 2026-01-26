// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validate a numeric amount
 */
export function validateAmount(
  value: string | number | null | undefined,
  options?: {
    min?: number
    max?: number
    required?: boolean
    precision?: number
  }
): { valid: boolean; error?: string; value?: number } {
  const { min = 0, max = Number.MAX_SAFE_INTEGER, required = true, precision = 2 } = options || {}

  if (value === null || value === undefined || value === '') {
    if (required) {
      return { valid: false, error: 'المبلغ مطلوب' }
    }
    return { valid: true, value: 0 }
  }

  const numValue = typeof value === 'string' ? parseFloat(value) : value

  if (isNaN(numValue)) {
    return { valid: false, error: 'المبلغ يجب أن يكون رقماً صحيحاً' }
  }

  if (!isFinite(numValue)) {
    return { valid: false, error: 'المبلغ غير صالح' }
  }

  if (numValue < min) {
    return { valid: false, error: `المبلغ يجب أن يكون على الأقل ${min.toLocaleString('ar-DZ')} DT` }
  }

  if (numValue > max) {
    return { valid: false, error: `المبلغ يجب أن يكون على الأكثر ${max.toLocaleString('ar-DZ')} DT` }
  }

  // Check precision
  const decimals = numValue.toString().split('.')[1]?.length || 0
  if (decimals > precision) {
    return { valid: false, error: `المبلغ يجب أن يحتوي على ${precision} منازل عشرية على الأكثر` }
  }

  return { valid: true, value: numValue }
}

/**
 * Validate a date
 */
export function validateDate(
  value: string | null | undefined,
  options?: {
    required?: boolean
    minDate?: Date
    maxDate?: Date
    allowFuture?: boolean
    allowPast?: boolean
  }
): { valid: boolean; error?: string; value?: Date } {
  const { required = true, minDate, maxDate, allowFuture = true, allowPast = true } = options || {}

  if (!value || value.trim() === '') {
    if (required) {
      return { valid: false, error: 'التاريخ مطلوب' }
    }
    return { valid: true }
  }

  const date = new Date(value)

  if (isNaN(date.getTime())) {
    return { valid: false, error: 'التاريخ غير صالح' }
  }

  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const checkDate = new Date(date)
  checkDate.setHours(0, 0, 0, 0)

  if (!allowPast && checkDate < now) {
    return { valid: false, error: 'التاريخ يجب أن يكون في المستقبل' }
  }

  if (!allowFuture && checkDate > now) {
    return { valid: false, error: 'التاريخ يجب أن يكون في الماضي' }
  }

  if (minDate && checkDate < minDate) {
    return { valid: false, error: `التاريخ يجب أن يكون بعد ${minDate.toLocaleDateString('ar-SA')}` }
  }

  if (maxDate && checkDate > maxDate) {
    return { valid: false, error: `التاريخ يجب أن يكون قبل ${maxDate.toLocaleDateString('ar-SA')}` }
  }

  return { valid: true, value: date }
}

/**
 * Validate deposit cannot exceed base price
 */
export function validateDepositAgainstBasePrice(
  depositAmount: number,
  basePrice: number
): { valid: boolean; error?: string } {
  if (depositAmount < 0) {
    return { valid: false, error: 'مبلغ العربون لا يمكن أن يكون سالباً' }
  }

  if (depositAmount > basePrice) {
    return {
      valid: false,
      error: `مبلغ العربون (${depositAmount.toLocaleString('ar-DZ')} DT) لا يمكن أن يتجاوز سعر القطعة (${basePrice.toLocaleString('ar-DZ')} DT)`,
    }
  }

  return { valid: true }
}

/**
 * Validate advance cannot exceed base price
 */
export function validateAdvanceAgainstBasePrice(
  advanceAmount: number,
  basePrice: number
): { valid: boolean; error?: string } {
  if (advanceAmount < 0) {
    return { valid: false, error: 'مبلغ التسبقة لا يمكن أن يكون سالباً' }
  }

  if (advanceAmount > basePrice) {
    return {
      valid: false,
      error: `مبلغ التسبقة (${advanceAmount.toLocaleString('ar-DZ')} DT) لا يمكن أن يتجاوز سعر القطعة (${basePrice.toLocaleString('ar-DZ')} DT)`,
    }
  }

  return { valid: true }
}

/**
 * Validate that deposit + advance doesn't exceed base price
 */
export function validateDepositAndAdvance(
  depositAmount: number,
  advanceAmount: number,
  basePrice: number
): { valid: boolean; error?: string } {
  const total = depositAmount + advanceAmount

  if (total > basePrice) {
    return {
      valid: false,
      error: `مجموع العربون والتسبقة (${total.toLocaleString('ar-DZ')} DT) لا يمكن أن يتجاوز سعر القطعة (${basePrice.toLocaleString('ar-DZ')} DT)`,
    }
  }

  return { valid: true }
}

/**
 * Validate months and monthly amount consistency
 */
export function validateInstallmentCalculation(
  calcMode: 'monthlyAmount' | 'months',
  monthlyAmount: number | null,
  months: number | null,
  remainingAmount: number
): { valid: boolean; error?: string } {
  if (calcMode === 'monthlyAmount') {
    if (!monthlyAmount || monthlyAmount <= 0) {
      return { valid: false, error: 'المبلغ الشهري مطلوب ويجب أن يكون أكبر من الصفر' }
    }

    if (monthlyAmount > remainingAmount) {
      return {
        valid: false,
        error: `المبلغ الشهري (${monthlyAmount.toLocaleString('ar-DZ')} DT) لا يمكن أن يتجاوز المبلغ المتبقي (${remainingAmount.toLocaleString('ar-DZ')} DT)`,
      }
    }

    // If months is also specified, validate consistency
    if (months && months > 0) {
      const calculatedMonths = Math.ceil(remainingAmount / monthlyAmount)
      if (months < calculatedMonths) {
        return {
          valid: false,
          error: `عدد الأشهر المحدد (${months}) أقل من العدد المطلوب (${calculatedMonths} شهر على الأقل)`,
        }
      }
    }
  } else if (calcMode === 'months') {
    if (!months || months <= 0) {
      return { valid: false, error: 'عدد الأشهر مطلوب ويجب أن يكون أكبر من الصفر' }
    }

    if (months > 120) {
      return { valid: false, error: 'عدد الأشهر لا يمكن أن يتجاوز 120 شهراً (10 سنوات)' }
    }

    const calculatedMonthly = remainingAmount / months
    if (calculatedMonthly <= 0) {
      return {
        valid: false,
        error: 'المبلغ المتبقي غير كافٍ لإنشاء جدول الأقساط',
      }
    }
  }

  return { valid: true }
}

/**
 * Validate phone number
 */
export function validatePhone(phone: string): { valid: boolean; error?: string } {
  if (!phone || phone.trim() === '') {
    return { valid: false, error: 'رقم الهاتف مطلوب' }
  }

  // Tunisian phone numbers: 8 digits, can start with 2, 5, 9
  const phoneRegex = /^[259]\d{7}$/
  if (!phoneRegex.test(phone.trim())) {
    return { valid: false, error: 'رقم الهاتف يجب أن يكون 8 أرقام ويبدأ بـ 2 أو 5 أو 9' }
  }

  return { valid: true }
}

/**
 * Validate ID number
 */
export function validateIdNumber(idNumber: string): { valid: boolean; error?: string } {
  if (!idNumber || idNumber.trim() === '') {
    return { valid: false, error: 'رقم الهوية مطلوب' }
  }

  if (!/^\d{8}$/.test(idNumber.trim())) {
    return { valid: false, error: 'رقم الهوية يجب أن يكون 8 أرقام' }
  }

  return { valid: true }
}

