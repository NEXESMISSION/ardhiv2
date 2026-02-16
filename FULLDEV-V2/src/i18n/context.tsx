import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { translations, t as tRaw } from './translations'
import { LANGUAGE_STORAGE_KEY, DEFAULT_LANGUAGE, type Language } from './types'

type LanguageContextType = {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language | null
      if (stored === 'fr' || stored === 'ar') return stored
    } catch {}
    return DEFAULT_LANGUAGE
  })

  useEffect(() => {
    document.documentElement.lang = language === 'ar' ? 'ar' : 'fr'
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
  }, [language])

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang)
    } catch {}
    document.documentElement.lang = lang === 'ar' ? 'ar' : 'fr'
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    const updateUserPref = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('users').update({ preferred_language: lang, updated_at: new Date().toISOString() }).eq('auth_user_id', user.id)
    }
    updateUserPref().catch(() => {})
  }, [])

  const t = useCallback((key: string) => tRaw(language, key), [language])

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (ctx === undefined) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}

/** Apply saved user language when systemUser loads (sync across devices) */
export function useApplyUserLanguage(preferredLanguage: string | null | undefined) {
  const { setLanguage } = useLanguage()
  useEffect(() => {
    if (preferredLanguage === 'fr' || preferredLanguage === 'ar') {
      setLanguage(preferredLanguage)
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, preferredLanguage)
      } catch {}
    }
  }, [preferredLanguage, setLanguage])
}
