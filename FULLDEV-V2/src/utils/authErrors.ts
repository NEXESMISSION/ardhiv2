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

const errorMapFr: Record<string, string> = {
  'invalid_credentials': 'E-mail ou mot de passe incorrect',
  'Invalid login credentials': 'E-mail ou mot de passe incorrect',
  'Invalid email or password': 'E-mail ou mot de passe incorrect',
  'invalid_grant': 'E-mail ou mot de passe incorrect',
  '400': 'E-mail ou mot de passe incorrect',
  'Email not confirmed': 'Veuillez confirmer votre e-mail avant de vous connecter',
  'email_not_confirmed': 'Veuillez confirmer votre e-mail avant de vous connecter',
  'Too many requests': 'Trop de tentatives. Veuillez réessayer plus tard.',
  'too_many_requests': 'Trop de tentatives. Veuillez réessayer plus tard.',
  'rate_limit_exceeded': 'Trop de tentatives. Veuillez réessayer plus tard.',
  'network': 'Échec de la connexion au serveur. Vérifiez votre connexion Internet.',
  'fetch': 'Échec de la connexion au serveur. Vérifiez votre connexion Internet.',
  'connection': 'Échec de la connexion au serveur. Vérifiez votre connexion Internet.',
  'timeout': 'Délai dépassé. Veuillez réessayer.',
  'User not found': 'Utilisateur introuvable',
  'user_not_found': 'Utilisateur introuvable',
  'User already registered': 'Cet e-mail est déjà utilisé',
  'email_already_exists': 'Cet e-mail est déjà utilisé',
  'Session expired': 'Session expirée. Veuillez vous reconnecter.',
  'session_expired': 'Session expirée. Veuillez vous reconnecter.',
  'invalid_token': 'Jeton invalide. Veuillez vous reconnecter.',
  'Auth session missing': 'Aucune session. Veuillez vous connecter.',
  'auth_session_missing': 'Aucune session. Veuillez vous connecter.',
}

export function translateAuthErrorFr(error: any): string {
  if (!error) return 'Une erreur inconnue s\'est produite'
  const errorMessage = error.message || error.toString() || ''
  const errorCode = error.code || error.status || ''
  if (errorMapFr[errorMessage]) return errorMapFr[errorMessage]
  if (errorMapFr[errorCode]) return errorMapFr[errorCode]
  const lower = errorMessage.toLowerCase()
  for (const [key, value] of Object.entries(errorMapFr)) {
    if (lower.includes(key.toLowerCase())) return value
  }
  return errorMessage || 'Échec de connexion. Vérifiez votre e-mail et mot de passe.'
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

