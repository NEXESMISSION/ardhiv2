// ============================================================================
// ERROR MESSAGE UTILITIES
// ============================================================================

/**
 * Formats error messages to be more user-friendly and actionable
 */
export function formatErrorMessage(error: any, context: string): string {
  const errorMessage = error?.message || error?.toString() || 'خطأ غير معروف'
  
  // Common error patterns and their user-friendly translations
  const errorPatterns: Array<{ pattern: RegExp; message: string; action?: string }> = [
    {
      pattern: /network|fetch|connection|timeout/i,
      message: 'فشل الاتصال بالخادم',
      action: 'يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى',
    },
    {
      pattern: /unauthorized|permission|access denied/i,
      message: 'ليس لديك صلاحية للقيام بهذه العملية',
      action: 'يرجى التحقق من صلاحياتك',
    },
    {
      pattern: /not found|غير موجود/i,
      message: 'العنصر المطلوب غير موجود',
      action: 'يرجى تحديث الصفحة والتحقق من البيانات',
    },
    {
      pattern: /duplicate|already exists|مكرر/i,
      message: 'هذا العنصر موجود بالفعل',
      action: 'يرجى التحقق من البيانات المدخلة',
    },
    {
      pattern: /constraint|violation|foreign key/i,
      message: 'لا يمكن تنفيذ العملية بسبب قيود قاعدة البيانات',
      action: 'يرجى التحقق من البيانات المرتبطة',
    },
    {
      pattern: /status.*changed|حالة.*تغيرت/i,
      message: 'تغيرت حالة العنصر أثناء العملية',
      action: 'يرجى تحديث الصفحة والمحاولة مرة أخرى',
    },
    {
      pattern: /reserved|محجوز/i,
      message: 'القطعة محجوزة حالياً',
      action: 'يرجى التحقق من صفحة التأكيد أو تحديث الصفحة',
    },
  ]

  // Check for matching patterns
  for (const { pattern, message, action } of errorPatterns) {
    if (pattern.test(errorMessage)) {
      return action ? `${message}. ${action}` : message
    }
  }

  // If no pattern matches, return formatted error with context
  return `${context}: ${errorMessage}`
}

/**
 * Determines if an error is retryable (transient errors)
 */
export function isRetryableError(error: any): boolean {
  const errorMessage = error?.message || error?.toString() || ''
  const retryablePatterns = [
    /network|fetch|connection|timeout/i,
    /status.*changed|حالة.*تغيرت/i,
    /temporary|temporarily/i,
  ]

  return retryablePatterns.some((pattern) => pattern.test(errorMessage))
}

/**
 * Gets actionable guidance for an error
 */
export function getErrorGuidance(error: any, operation: string): string {
  const errorMessage = error?.message || error?.toString() || ''
  
  if (/status.*changed|حالة.*تغيرت/i.test(errorMessage)) {
    return 'تحديث الصفحة والمحاولة مرة أخرى'
  }
  
  if (/network|connection|timeout/i.test(errorMessage)) {
    return 'التحقق من الاتصال والمحاولة مرة أخرى'
  }
  
  if (/reserved|محجوز/i.test(errorMessage)) {
    return 'التحقق من صفحة التأكيد أو الانتظار قليلاً'
  }
  
  return 'المحاولة مرة أخرى أو تحديث الصفحة'
}

