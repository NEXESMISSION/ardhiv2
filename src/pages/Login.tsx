import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/i18n/context'
import { translateAuthError, translateAuthErrorFr } from '@/utils/authErrors'

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
  const { t, language, setLanguage } = useLanguage()
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
      setTimeout(() => {
        errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }, [error])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email.trim()) {
      setError(t('login.errorEmailRequired'))
      emailInputRef.current?.focus()
      return
    }

    let finalEmail = email.trim()
    if (!finalEmail.includes('@')) {
      finalEmail = finalEmail + '@gmail.com'
    }
    finalEmail = finalEmail.toLowerCase()

    if (!password.trim()) {
      setError(t('login.errorPasswordRequired'))
      return
    }

    if (password.length < 8) {
      setError(t('login.errorPasswordMin'))
      return
    }

    setLoading(true)

    try {
      const { error: signInError } = await signIn(finalEmail, password)

      if (signInError) {
        if (import.meta.env.DEV) {
          console.error('Sign in error:', signInError)
        }

        setLoading(false)

        const errorMessage = signInError.message || ''
        const errorCode = signInError.code || ''

        if (
          errorCode === 'AUTH_USER_ID_MISMATCH' ||
          errorCode === 'USER_NOT_IN_SYSTEM' ||
          errorCode === 'USER_LOAD_FAILED'
        ) {
          setError(language === 'fr'
            ? 'Connexion impossible. Contactez l\'administrateur.'
            : 'تعذّر تسجيل الدخول. يرجى الاتصال بالمسؤول.')
        } else if (
          errorMessage.includes('Invalid login credentials') ||
          errorMessage.includes('invalid_credentials') ||
          errorCode === 'invalid_grant'
        ) {
          setError(language === 'fr'
            ? 'E-mail ou mot de passe incorrect.'
            : 'البريد الإلكتروني أو كلمة المرور غير صحيحة.')
        } else {
          const translatedError = language === 'fr' ? translateAuthErrorFr(signInError) : translateAuthError(signInError)
          setError(translatedError)
        }

        setPassword('')

        setTimeout(() => {
          emailInputRef.current?.focus()
        }, 300)
      } else {
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
      const translatedError = language === 'fr' ? translateAuthErrorFr(err) : translateAuthError(err)
      setError(translatedError)
      setPassword('')
      setTimeout(() => {
        emailInputRef.current?.focus()
      }, 100)
    } finally {
      setLoading(false)
    }
  }

  const isRTL = language === 'ar'

  return (
    <div className="min-h-screen flex items-center justify-center ardhi-mesh-bg px-4 py-6 sm:py-10">
      {/* Decorative orbs */}
      <div className="pointer-events-none absolute top-[-120px] right-[-80px] w-[320px] h-[320px] rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.45), transparent 70%)' }} />
      <div className="pointer-events-none absolute bottom-[-120px] left-[-80px] w-[360px] h-[360px] rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.35), transparent 70%)' }} />

      <div className="relative w-full max-w-md animate-lift-in">
        {/* Language switcher (floating, top-aligned) */}
        <div className={`flex justify-center mb-5 sm:mb-6`}>
          <div className="inline-flex items-center p-1 rounded-full bg-white/70 backdrop-blur border border-gray-200/80 shadow-sm">
            <button
              type="button"
              onClick={() => setLanguage('fr')}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all ${
                language === 'fr'
                  ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/25'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              aria-pressed={language === 'fr'}
            >
              FR
            </button>
            <button
              type="button"
              onClick={() => setLanguage('ar')}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all ${
                language === 'ar'
                  ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/25'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              aria-pressed={language === 'ar'}
            >
              ع
            </button>
          </div>
        </div>

        {/* Main card */}
        <div className="relative rounded-3xl ardhi-glass border border-white/60 shadow-[0_8px_16px_rgba(15,23,42,0.06),0_32px_64px_-16px_rgba(15,23,42,0.18)] overflow-hidden">
          {/* Top accent gradient strip */}
          <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500" />

          <div className="p-6 sm:p-8">
            {/* Header / Logo */}
            <div className="text-center mb-6 sm:mb-7">
              <div className="inline-flex items-center justify-center w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-2xl mb-4 relative"
                style={{
                  background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 60%, #8B5CF6 100%)',
                  boxShadow: '0 10px 24px -8px rgba(59,130,246,0.55), inset 0 1px 0 rgba(255,255,255,0.3)',
                }}
              >
                <svg className="w-9 h-9 sm:w-10 sm:h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 21h18" />
                  <path d="M5 21V8l7-5 7 5v13" />
                  <path d="M9 21v-6h6v6" />
                  <circle cx="12" cy="11" r="1.2" fill="currentColor" />
                </svg>
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-white shadow-md" />
              </div>
              <h1 className="text-[22px] sm:text-2xl font-bold text-gray-900 tracking-tight mb-1.5">
                {t('login.title')}
              </h1>
              <p className="text-sm text-gray-500">
                {t('login.subtitle')}
              </p>
            </div>

            {/* Error Alert */}
            {error && (
              <div ref={errorRef}>
                <div className="mb-5 rounded-2xl border border-red-200 bg-gradient-to-b from-red-50 to-white p-4 shadow-sm animate-in slide-in-from-top-2">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="whitespace-pre-line text-[13px] leading-relaxed font-medium text-red-800 max-h-[50vh] overflow-y-auto pr-1 scrollbar-thin">
                        {error}
                      </div>
                      <button
                        type="button"
                        onClick={() => setError(null)}
                        className="mt-2 text-[11px] font-semibold text-red-700 hover:text-red-900 underline underline-offset-2"
                      >
                        {t('common.close')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email Field */}
              <div>
                <label htmlFor="email" className="block text-[13px] font-semibold text-gray-700 mb-1.5">
                  {t('login.emailLabel')}
                  <span className="ms-2 text-[11px] font-normal text-gray-400">{t('login.emailOrUser')}</span>
                </label>
                <div className="relative group">
                  <div className={`absolute inset-y-0 ${isRTL ? 'right-3' : 'left-3'} flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors`}>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="3" />
                      <path d="m2 7 10 6 10-6" />
                    </svg>
                  </div>
                  <input
                    ref={emailInputRef}
                    id="email"
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder={t('login.emailPlaceholder')}
                    disabled={loading}
                    dir="ltr"
                    className={`w-full h-12 ${isRTL ? 'pr-11 pl-4 text-right' : 'pl-11 pr-4 text-left'} bg-white/80 border border-gray-200 rounded-xl text-[15px] text-gray-900 placeholder:text-gray-400 shadow-sm transition-all
                      focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15
                      hover:border-gray-300 disabled:opacity-60 disabled:bg-gray-50`}
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label htmlFor="password" className="block text-[13px] font-semibold text-gray-700 mb-1.5">
                  {t('login.passwordLabel')}
                </label>
                <div className="relative group">
                  <div className={`absolute inset-y-0 ${isRTL ? 'right-3' : 'left-3'} flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors`}>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder={t('login.passwordPlaceholder')}
                    disabled={loading}
                    className={`w-full h-12 ${isRTL ? 'pr-11 pl-12 text-right' : 'pl-11 pr-12 text-left'} bg-white/80 border border-gray-200 rounded-xl text-[15px] text-gray-900 placeholder:text-gray-400 shadow-sm transition-all
                      focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15
                      hover:border-gray-300 disabled:opacity-60 disabled:bg-gray-50`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                    className={`absolute inset-y-0 ${isRTL ? 'left-2' : 'right-2'} flex items-center justify-center w-9 h-full rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100/70 transition-colors`}
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c4.61 0 8.49 3.05 9.86 7-.32.93-.78 1.79-1.36 2.55" />
                        <path d="M6.61 6.61A13.93 13.93 0 0 0 2.14 12c1.37 3.95 5.25 7 9.86 7 1.84 0 3.55-.49 5.04-1.34" />
                        <path d="m2 2 20 20" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
                <span className="relative inline-flex items-center justify-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="peer h-[18px] w-[18px] cursor-pointer rounded-md border border-gray-300 bg-white shadow-sm appearance-none checked:bg-blue-600 checked:border-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 transition-colors"
                    disabled={loading}
                  />
                  <svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                <span className="text-[13px] text-gray-700 font-medium">
                  {t('login.rememberMe')}
                </span>
              </label>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !email.trim() || !password.trim()}
                className="ardhi-btn-primary w-full h-12 rounded-xl text-[15px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none mt-2"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {t('login.submitting')}
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <span>{t('login.submit')}</span>
                    <svg className={`w-4 h-4 ${isRTL ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </span>
                )}
              </button>
            </form>

            {/* PWA Install */}
            {!isStandalone && (
              <div className="mt-6 pt-5 border-t border-gray-200/80">
                {installPrompt ? (
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    className="w-full h-11 rounded-xl bg-white border border-gray-200 text-gray-800 font-semibold text-[14px] shadow-sm hover:bg-gray-50 hover:border-gray-300 transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <path d="M7 10l5 5 5-5" />
                      <path d="M12 15V3" />
                    </svg>
                    <span>{t('login.installButton')}</span>
                  </button>
                ) : (
                  <div className="text-center text-[11px] text-gray-500 space-y-1">
                    <p className="font-medium text-gray-600">{t('login.installTitle')}</p>
                    <p>{t('login.installChrome')}</p>
                    <p className="text-[10px] text-gray-400">{t('login.installSettings')}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tiny brand footer */}
        <p className="mt-5 text-center text-[11px] text-gray-400 font-medium tracking-wide">
          Ardhi · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
