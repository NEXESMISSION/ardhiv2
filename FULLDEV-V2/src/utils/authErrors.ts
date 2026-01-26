/**
 * Authentication Error Translation Utility
 * Translates Supabase auth errors to user-friendly Arabic messages
 */

export function translateAuthError(error: any): string {
  if (!error) return 'حدث خطأ غير معروف'

  const errorMessage = error.message || error.toString() || ''
  const errorCode = error.code || error.status || ''

  // Map common Supabase auth error codes and messages
  const errorMap: Record<string, string> = {
    // Invalid credentials
    'invalid_credentials': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    'Invalid login credentials': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    'Invalid email or password': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    'invalid_grant': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    '400': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    
    // Email confirmation
    'Email not confirmed': 'يرجى تأكيد بريدك الإلكتروني قبل تسجيل الدخول',
    'email_not_confirmed': 'يرجى تأكيد بريدك الإلكتروني قبل تسجيل الدخول',
    
    // Rate limiting
    'Too many requests': 'تم تجاوز عدد المحاولات المسموح بها. يرجى المحاولة لاحقاً',
    'too_many_requests': 'تم تجاوز عدد المحاولات المسموح بها. يرجى المحاولة لاحقاً',
    'rate_limit_exceeded': 'تم تجاوز عدد المحاولات المسموح بها. يرجى المحاولة لاحقاً',
    
    // Network errors
    'network': 'فشل الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت',
    'fetch': 'فشل الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت',
    'connection': 'فشل الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت',
    'timeout': 'انتهت مهلة الاتصال. يرجى المحاولة مرة أخرى',
    
    // User not found
    'User not found': 'المستخدم غير موجود',
    'user_not_found': 'المستخدم غير موجود',
    
    // Email already exists
    'User already registered': 'البريد الإلكتروني مستخدم بالفعل',
    'email_already_exists': 'البريد الإلكتروني مستخدم بالفعل',
    
    // Session errors
    'Session expired': 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى',
    'session_expired': 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى',
    'invalid_token': 'رمز المصادقة غير صحيح. يرجى تسجيل الدخول مرة أخرى',
    
    // General auth errors
    'Auth session missing': 'لم يتم العثور على جلسة مصادقة. يرجى تسجيل الدخول',
    'auth_session_missing': 'لم يتم العثور على جلسة مصادقة. يرجى تسجيل الدخول',
  }

  // Check for exact matches first
  if (errorMap[errorMessage]) {
    return errorMap[errorMessage]
  }

  if (errorMap[errorCode]) {
    return errorMap[errorCode]
  }

  // Check for partial matches (case-insensitive)
  const lowerMessage = errorMessage.toLowerCase()
  for (const [key, value] of Object.entries(errorMap)) {
    if (lowerMessage.includes(key.toLowerCase())) {
      return value
    }
  }

  // Default fallback
  return errorMessage || 'فشل تسجيل الدخول. يرجى التحقق من البريد الإلكتروني وكلمة المرور.'
}

/**
 * Check if error is a network/connection error
 */
export function isNetworkError(error: any): boolean {
  if (!error) return false
  const message = (error.message || error.toString() || '').toLowerCase()
  return message.includes('network') || 
         message.includes('fetch') || 
         message.includes('connection') || 
         message.includes('timeout')
}

/**
 * Check if error is a rate limit error
 */
export function isRateLimitError(error: any): boolean {
  if (!error) return false
  const message = (error.message || error.toString() || '').toLowerCase()
  return message.includes('too many') || 
         message.includes('rate limit') || 
         error.code === 'too_many_requests'
}

