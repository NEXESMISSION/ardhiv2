// ============================================================================
// PRICE CALCULATION UTILITIES
// ============================================================================

interface PriceCalculationInputs {
  surfaceM2: number
  batchPricePerM2: number | null
  pieceDirectPrice: number | null
  installmentPricePerM2?: number | null
  depositAmount?: number
}

interface PriceCalculationResult {
  basePrice: number
  totalPrice: number
  deposit: number
  totalDue: number
  priceSource: 'batch' | 'piece' | 'installment'
}

/**
 * Calculate piece price - prefers batch pricing over piece direct price
 */
export function calculatePiecePrice(inputs: PriceCalculationInputs): PriceCalculationResult {
  const { surfaceM2, batchPricePerM2, pieceDirectPrice, installmentPricePerM2, depositAmount = 0 } = inputs

  let basePrice = 0
  let priceSource: 'batch' | 'piece' | 'installment' = 'batch'

  // Priority: Installment > Piece Direct > Batch
  // Piece direct price takes priority over batch price
  if (installmentPricePerM2 && installmentPricePerM2 > 0) {
    basePrice = installmentPricePerM2 * surfaceM2
    priceSource = 'installment'
  } else if (pieceDirectPrice && pieceDirectPrice > 0) {
    basePrice = pieceDirectPrice
    priceSource = 'piece'
  } else if (batchPricePerM2 && batchPricePerM2 > 0) {
    basePrice = batchPricePerM2 * surfaceM2
    priceSource = 'batch'
  }

  const deposit = Number(depositAmount) || 0
  const totalPrice = basePrice
  const totalDue = Math.max(0, totalPrice - deposit)

  return {
    basePrice,
    totalPrice,
    deposit,
    totalDue,
    priceSource,
  }
}

/**
 * Format number with 2 decimal places (Tunisian Dinar format)
 * Uses English numerals for readability
 */
export function formatPrice(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '0.00'
  }
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Format date with Arabic month names but English numerals
 */
export function formatDate(date: Date | string, options?: {
  year?: 'numeric' | '2-digit'
  month?: 'numeric' | '2-digit' | 'long' | 'short' | 'narrow'
  day?: 'numeric' | '2-digit'
  hour?: 'numeric' | '2-digit'
  minute?: 'numeric' | '2-digit'
}): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  if (isNaN(dateObj.getTime())) {
    return '-'
  }

  const defaultOptions = {
    year: 'numeric' as const,
    month: 'long' as const,
    day: 'numeric' as const,
    ...options,
  }

  // Format with English locale to get English numerals
  const formatted = dateObj.toLocaleDateString('en-US', defaultOptions)
  
  // If we want Arabic month names, we need to replace them manually
  if (defaultOptions.month === 'long') {
    const monthNames = {
      'January': 'يناير',
      'February': 'فبراير',
      'March': 'مارس',
      'April': 'أبريل',
      'May': 'مايو',
      'June': 'يونيو',
      'July': 'يوليو',
      'August': 'أغسطس',
      'September': 'سبتمبر',
      'October': 'أكتوبر',
      'November': 'نوفمبر',
      'December': 'ديسمبر',
    }
    
    let result = formatted
    for (const [en, ar] of Object.entries(monthNames)) {
      result = result.replace(en, ar)
    }
    return result
  }
  
  return formatted
}

/**
 * Format date in short format (DD/MM/YYYY) with English numerals
 */
export function formatDateShort(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  if (isNaN(dateObj.getTime())) {
    return '-'
  }

  const day = dateObj.getDate().toString().padStart(2, '0')
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0')
  const year = dateObj.getFullYear()
  
  return `${day}/${month}/${year}`
}

