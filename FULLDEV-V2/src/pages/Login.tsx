import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { IconButton } from '@/components/ui/icon-button'
import { translateAuthError } from '@/utils/authErrors'

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent
  }
}
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const emailInputRef = useRef<HTMLInputElement>(null)
  const { signIn } = useAuth()

  // PWA: detect standalone (already installed) and install prompt (Android/Chrome)
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    setIsStandalone(standalone)

    const onBeforeInstall = (e: BeforeInstallPromptEvent) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  const handleInstallClick = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
  }

  // Auto-focus email input on mount
  useEffect(() => {
    emailInputRef.current?.focus()
  }, [])

  // Scroll to error when it appears
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (error && errorRef.current) {
      // Small delay to ensure the element is rendered
      setTimeout(() => {
        errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }, [error])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Client-side validation
    if (!email.trim()) {
      setError('البريد الإلكتروني إجباري')
      emailInputRef.current?.focus()
      return
    }

    // Auto-append @gmail.com if no @ is present
    let finalEmail = email.trim()
    if (!finalEmail.includes('@')) {
      finalEmail = finalEmail + '@gmail.com'
    }

    // Normalize email (lowercase)
    finalEmail = finalEmail.toLowerCase()

    if (!password.trim()) {
      setError('كلمة المرور إجبارية')
      return
    }

    if (password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
      return
    }

    setLoading(true)

    try {
      const { error: signInError } = await signIn(finalEmail, password)
      
      if (signInError) {
        // Log error for debugging
        console.error('Sign in error:', signInError)
        console.error('Error details:', {
          message: signInError.message,
          code: signInError.code,
          status: signInError.status
        })
        
        // Set loading to false FIRST so error can be displayed
        setLoading(false)
        
        // Special handling for auth_user_id mismatch
        if (signInError.code === 'AUTH_USER_ID_MISMATCH') {
          let errorMsg = signInError.message || 'معرف المصادقة غير متطابق.'
          if (signInError.authUserId) {
            errorMsg += '\n\nمعرف المستخدم: ' + signInError.authUserId
            errorMsg += '\n\nيرجى تحديث auth_user_id في جدول users.'
            errorMsg += '\n\nSQL: UPDATE users SET auth_user_id = \'' + signInError.authUserId + '\'::uuid WHERE email = \'test@gmail.com\';'
          }
          setError(errorMsg)
        } else if (signInError.code === 'USER_NOT_IN_SYSTEM') {
          // Special handling for user not in system
          let errorMsg = signInError.message || 'المستخدم غير مسجل في النظام.'
          if (signInError.authUserId) {
            errorMsg += '\n\nمعرف المستخدم: ' + signInError.authUserId
            errorMsg += '\n\nيرجى التحقق من إضافة المستخدم في جدول users في قاعدة البيانات.'
          } else {
            errorMsg += ' يرجى الاتصال بالمسؤول لإضافة حسابك.'
          }
          setError(errorMsg)
        } else if (signInError.code === 'USER_LOAD_FAILED') {
          setError(signInError.message || 'فشل تحميل بيانات المستخدم. يرجى المحاولة مرة أخرى.')
        } else {
          // Check for invalid credentials error
          const errorMessage = signInError.message || ''
          const errorCode = signInError.code || ''
          
          if (errorMessage.includes('Invalid login credentials') || 
              errorMessage.includes('invalid_credentials') ||
              errorCode === 'invalid_grant') {
            setError(`❌ فشل تسجيل الدخول\n\nالبريد الإلكتروني أو كلمة المرور غير صحيحة.\n\n📧 البريد المستخدم: ${finalEmail}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🔍 خطوات الحل:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n1️⃣ تحقق من وجود المستخدم في Supabase:\n   • اذهب إلى: Supabase Dashboard\n   • القائمة: Authentication → Users\n   • ابحث عن: ${finalEmail}\n   • إذا لم تجده، المستخدم غير موجود!\n\n2️⃣ إنشاء المستخدم (إذا لم يكن موجوداً):\n   • في Supabase Dashboard:\n     - Authentication → Users → Add User\n     - Email: ${finalEmail}\n     - Password: (أدخل كلمة مرور قوية)\n     - Auto Confirm User: ✓\n\n3️⃣ إضافة المستخدم إلى جدول users:\n   • بعد إنشاء المستخدم في Auth\n   • احصل على auth_user_id من Supabase\n   • استخدم SQL Editor في Supabase:\n\n   INSERT INTO users (email, role, auth_user_id, name)\n   VALUES (\n     '${finalEmail}',\n     'worker',\n     '(auth_user_id من Supabase)',\n     'اسم المستخدم'\n   );\n\n4️⃣ تحقق من كلمة المرور:\n   • تأكد من كتابة كلمة المرور بشكل صحيح\n   • كلمات المرور حساسة لحالة الأحرف (A ≠ a)\n   • تأكد من عدم وجود مسافات إضافية\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n💡 ملاحظة: إذا كنت المسؤول، تأكد من إنشاء\n   المستخدم في Supabase Auth أولاً قبل المحاولة.\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
        } else {
          const translatedError = translateAuthError(signInError)
          setError(translatedError)
          }
        }
        
        // Clear password on error for security
        setPassword('')
        
        // Focus back on email field after a delay to ensure error is visible
        setTimeout(() => {
          emailInputRef.current?.focus()
        }, 300)
      } else {
        // Success - in PWA/standalone (Android) force full navigation so app shell shows correctly
        const standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true
        if (standalone) {
          const base = window.location.origin + (window.location.pathname || '/')
          window.location.href = base + '#home'
          return
        }
        setEmail('')
        setPassword('')
      }
    } catch (err: any) {
      const translatedError = translateAuthError(err)
      setError(translatedError)
      setPassword('')
      setTimeout(() => {
        emailInputRef.current?.focus()
      }, 100)
    } finally {
      setLoading(false)
    }
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    // Allow Enter key to submit
    if (e.key === 'Enter' && !loading) {
      handleSubmit(e as any)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4 py-8">
      <Card className="w-full max-w-md shadow-xl border-0">
        <div className="p-6 sm:p-8">
          {/* Header */}
          <div className="text-center mb-6 sm:mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-blue-100 rounded-full mb-4">
              <span className="text-3xl sm:text-4xl">🏞️</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
              نظام إدارة الأراضي
            </h1>
            <p className="text-sm sm:text-base text-gray-600">
              تسجيل الدخول للوصول إلى النظام
            </p>
          </div>

          {/* Error Alert - More Prominent */}
          {error && (
            <div ref={errorRef}>
              <Alert variant="error" className="mb-4 animate-in slide-in-from-top-2 border-2 border-red-300 shadow-lg">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 flex-shrink-0 mt-0.5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                  <div className="flex-1 min-w-0">
                    <div className="whitespace-pre-line text-sm leading-relaxed font-medium max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-red-300 scrollbar-track-red-50">
                      {error}
                    </div>
                    <button
                      type="button"
                      onClick={() => setError(null)}
                      className="mt-2 text-xs text-red-700 hover:text-red-900 underline"
                    >
                      إغلاق
                    </button>
                  </div>
              </div>
            </Alert>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5" onKeyPress={handleKeyPress}>
            {/* Email Field */}
            <div>
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                البريد الإلكتروني <span className="text-xs text-gray-500">(أو اسم المستخدم)</span>
              </Label>
              <div className="mt-1 relative">
                <Input
                  ref={emailInputRef}
                  id="email"
                  type="text"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    // Don't clear error automatically - let user dismiss it manually
                  }}
                  required
                  autoComplete="email"
                  className="w-full pr-10"
                  placeholder="example@gmail.com أو example"
                  disabled={loading}
                  dir="ltr"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Password Field */}
            <div>
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                كلمة المرور
              </Label>
              <div className="mt-1 relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    // Don't clear error automatically - let user dismiss it manually
                  }}
                  required
                  autoComplete="current-password"
                  className="w-full pr-10"
                  placeholder="••••••••"
                  disabled={loading}
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center">
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-gray-400 hover:text-gray-600"
                    title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </IconButton>
                </div>
              </div>
            </div>

            {/* Remember Me (Optional - for future use) */}
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                disabled={loading}
              />
              <Label htmlFor="remember-me" className="mr-2 block text-sm text-gray-700 cursor-pointer">
                تذكرني
              </Label>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              className="w-full text-base font-medium py-3"
              disabled={loading || !email.trim() || !password.trim()}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  جاري تسجيل الدخول...
                </span>
              ) : (
                'تسجيل الدخول'
              )}
            </Button>
          </form>

          {/* PWA Install - show only in browser (not when already installed) and when prompt available or Android */}
          {!isStandalone && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-xs sm:text-sm text-gray-600 mb-3 text-center">
                تثبيت التطبيق على الهاتف (أندرويد)
              </p>
              {installPrompt ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full flex items-center justify-center gap-2"
                  onClick={handleInstallClick}
                >
                  <span>📲</span>
                  <span>تثبيت التطبيق</span>
                </Button>
              ) : (
                <div className="text-center text-xs text-gray-500 space-y-1">
                  <p>في متصفح Chrome: القائمة ⋮ → إضافة إلى الشاشة الرئيسية</p>
                  <p className="text-[11px]">أو: الإعدادات → تثبيت التطبيق</p>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

