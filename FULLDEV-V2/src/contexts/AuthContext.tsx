import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

interface SystemUser {
  id: string
  email: string
  name: string | null
  phone: string | null
  place: string | null
  title: string | null
  notes: string | null
  role: 'owner' | 'worker'
  image_url: string | null
  allowed_pages: string[] | null
  allowed_batches: string[] | null
  allowed_pieces: string[] | null
  display_order: number | null
  preferred_language: string | null
  created_at: string
  updated_at: string
}

interface AuthContextType {
  user: User | null
  systemUser: SystemUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signOut: () => Promise<void>
  isOwner: boolean
  refreshSystemUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/** Set to true to log auth/system-user flow to console (default: quiet) */
const DEBUG_AUTH = false

// Constants for retry logic
const MAX_RETRIES = 1 // Reduced to 1 for faster failure
const INITIAL_TIMEOUT = 3000 // 3 seconds - faster timeout
const QUERY_TIMEOUT = 2000 // 2 seconds - faster timeout
const RETRY_DELAYS = [300] // Faster retry delays

const SYSTEM_USER_CACHE_KEY = 'app_system_user'

function getCachedSystemUser(authUserId: string): SystemUser | null {
  try {
    const raw = localStorage.getItem(SYSTEM_USER_CACHE_KEY)
    if (!raw) return null
    const { authUserId: cachedId, user } = JSON.parse(raw) as { authUserId: string; user: SystemUser }
    if (cachedId !== authUserId) return null
    return user
  } catch {
    return null
  }
}

function setCachedSystemUser(authUserId: string, user: SystemUser): void {
  try {
    localStorage.setItem(SYSTEM_USER_CACHE_KEY, JSON.stringify({ authUserId, user }))
  } catch {
    // ignore
  }
}

function clearCachedSystemUser(): void {
  try {
    localStorage.removeItem(SYSTEM_USER_CACHE_KEY)
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [systemUser, setSystemUser] = useState<SystemUser | null>(null)
  const [loading, setLoading] = useState(true)
  const loadingSystemUserRef = useRef(false) // Use ref to track loading state synchronously
  const currentLoadPromiseRef = useRef<Promise<any> | null>(null) // Track the current promise
  const systemUserRef = useRef<SystemUser | null>(null) // Keep ref of systemUser to avoid stale closures
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null) // Timeout to prevent infinite loading
  const abortControllerRef = useRef<AbortController | null>(null) // For canceling queries
  const initialSessionLoadedRef = useRef(false) // Track if initial session has been processed

  useEffect(() => {
    let mounted = true
    let sessionResolved = false

    // Cap initial auth wait so UI shows in ~1.2s even on slow network (PWA: open fast)
    const maxWait = setTimeout(() => {
      if (!mounted || sessionResolved) return
      sessionResolved = true
      setLoading(false)
    }, 1200)

    // Get initial session (often fast from localStorage)
    supabase.auth.getSession().then(async ({ data: { session } }: { data: { session: any } }) => {
      if (!mounted) return
      sessionResolved = true
      clearTimeout(maxWait)
      initialSessionLoadedRef.current = true
      setUser(session?.user ?? null)

      if (session?.user) {
        setLoading(false)
        // Restore from cache so nav/permissions work immediately while we revalidate
        const cached = getCachedSystemUser(session.user.id)
        if (cached) {
          setSystemUser(cached)
          systemUserRef.current = cached
        }
        if (!loadingSystemUserRef.current) {
          loadSystemUser(session.user.id).catch((e) => { if (DEBUG_AUTH) console.error(e) })
        }
      } else {
        setLoading(false)
      }
    }).catch((error: any) => {
      console.error('Error getting initial session:', error)
      sessionResolved = true
      clearTimeout(maxWait)
      if (mounted) setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: string, session: any) => {
      if (!mounted) return
      
      if (DEBUG_AUTH) console.log('Auth state changed:', event, session?.user?.email)
      
      // Handle sign out
      if (event === 'SIGNED_OUT') {
        // Cancel any ongoing queries
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
          abortControllerRef.current = null
        }
        setUser(null)
        setSystemUser(null)
        systemUserRef.current = null
        initialSessionLoadedRef.current = false
        setLoading(false)
        // Clear any timeouts
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current)
          loadTimeoutRef.current = null
        }
        return
      }

      // Ignore INITIAL_SESSION if we already processed it
      // This prevents duplicate loads when INITIAL_SESSION fires after getSession
      if (event === 'INITIAL_SESSION') {
        if (initialSessionLoadedRef.current) {
          if (DEBUG_AUTH) console.log('INITIAL_SESSION: Already processed, skipping')
          return
        }
        // If we haven't processed initial session yet, treat it like SIGNED_IN
        initialSessionLoadedRef.current = true
        setUser(session?.user ?? null)
        if (session?.user && !loadingSystemUserRef.current) {
          await loadSystemUser(session.user.id)
        } else if (!session?.user) {
          setLoading(false)
        }
        return
      }

      // Handle sign in or user update
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setUser(session?.user ?? null)
        if (session?.user) {
          // Skip if we already have systemUser or are already loading
          // This prevents multiple loads from multiple SIGNED_IN events
          if (systemUserRef.current) {
            if (DEBUG_AUTH) console.log(`${event}: System user already loaded, skipping`)
            // CRITICAL: Always set loading to false if we have systemUser
            setLoading(false)
            loadingSystemUserRef.current = false
            return
          }
          if (loadingSystemUserRef.current) {
            if (DEBUG_AUTH) console.log(`${event}: Already loading system user, skipping`)
            // Don't change loading state - let the existing load handle it
            return
          }
          // loadSystemUser will handle duplicate prevention internally
          // Don't await - load in background to not block UI
          // This prevents the "Query was aborted" error when multiple auth events fire
          loadSystemUser(session.user.id).catch((err) => {
            // Only log if it's not an expected abort
            if (!err?.aborted && !err?.message?.includes('aborted')) {
              if (DEBUG_AUTH) console.error('Error loading system user:', err)
            }
          })
        } else {
          setLoading(false)
          loadingSystemUserRef.current = false
        }
        return
      }

      // Handle token refresh - IGNORE completely if we have systemUser
      // Token refresh just updates the auth token, doesn't change user data
      // Use ref to check systemUser to avoid stale closure
      if (event === 'TOKEN_REFRESHED' && session?.user) {
        setUser(session.user)
        // Completely ignore TOKEN_REFRESHED if we already have systemUser
        // This prevents unnecessary reloads that cause hanging
        if (systemUserRef.current) {
          if (DEBUG_AUTH) console.log('TOKEN_REFRESHED: System user already loaded, skipping reload')
          setLoading(false)
          return
        }
        // Only load if we don't have system user and not already loading
        if (!loadingSystemUserRef.current) {
          if (DEBUG_AUTH) console.log('TOKEN_REFRESHED: No system user, loading...')
          await loadSystemUser(session.user.id)
        }
        return
      }

      // If no session and not signed out, set loading to false
      if (!session && event !== 'SIGNED_OUT') {
        setLoading(false)
      }
    })

    return () => {
      mounted = false
      clearTimeout(maxWait)
      subscription.unsubscribe()
      // Cleanup on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current)
      }
    }
  }, [])

  // Helper function to check network connectivity
  async function checkNetworkConnection(): Promise<boolean> {
    try {
      await fetch('https://www.google.com/favicon.ico', {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache',
        signal: AbortSignal.timeout(3000)
      })
      return true
    } catch {
      // Try to ping Supabase directly
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        if (supabaseUrl) {
          await fetch(`${supabaseUrl}/rest/v1/`, {
            method: 'HEAD',
            mode: 'no-cors',
            cache: 'no-cache',
            signal: AbortSignal.timeout(3000)
          })
          return true
        }
      } catch {
        return false
      }
      return false
    }
  }

  // Helper function to detect network errors
  function isNetworkError(error: any): boolean {
    if (!error) return false
    const errorMessage = error.message?.toLowerCase() || ''
    const errorCode = error.code?.toLowerCase() || ''
    return (
      errorMessage.includes('network') ||
      errorMessage.includes('fetch') ||
      errorMessage.includes('name_not_resolved') ||
      errorMessage.includes('failed to fetch') ||
      errorCode === 'network_error' ||
      errorCode === 'name_not_resolved' ||
      error?.status === undefined // Network errors often don't have status codes
    )
  }

  async function loadSystemUser(authUserId: string, retryCount = 0): Promise<any> {
    // Prevent multiple simultaneous calls using ref (synchronous check)
    if (loadingSystemUserRef.current) {
      if (DEBUG_AUTH) console.log('Already loading system user, waiting for existing call...')
      // Wait for the existing promise to complete
      if (currentLoadPromiseRef.current) {
        try {
        return await currentLoadPromiseRef.current
        } catch {
          return { success: false, skipped: true }
        }
      }
      return { success: false, skipped: true }
    }

    // Check retry limit
    if (retryCount >= MAX_RETRIES) {
      if (DEBUG_AUTH) console.error(`Max retries (${MAX_RETRIES}) reached for loading system user`)
      setLoading(false)
      loadingSystemUserRef.current = false
      return { error: new Error('Max retries reached'), maxRetriesReached: true }
    }

    // Create abort controller for this request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    // Create the promise and store it
    const loadPromise = (async () => {
      // Track query completion status (needs to be accessible in catch block)
      const queryCompletedRef = { value: false }
      let queryTimeoutId: ReturnType<typeof setTimeout> | null = null
      
      try {
        loadingSystemUserRef.current = true
        setLoading(true)
        if (DEBUG_AUTH) console.log('Loading system user for auth_user_id:', authUserId, retryCount > 0 ? `(retry ${retryCount}/${MAX_RETRIES})` : '')
      
        // Query immediately - select all required columns including allowed_pages
        // FIXED: Removed status, page_order, sidebar_order - they don't exist in the database
        // FIXED: Using auth_user_id=eq. instead of id=eq.
        // CRITICAL: Must include allowed_pages, allowed_batches, allowed_pieces, image_url, name, display_order
        // Note: preferred_language may not exist in all databases, so we handle it gracefully
        const queryPromise = supabase
          .from('users')
          .select('id, email, name, phone, place, title, notes, role, image_url, allowed_pages, allowed_batches, allowed_pieces, display_order, created_at, updated_at')
          .eq('auth_user_id', authUserId) // CRITICAL: Use auth_user_id, not id
          .maybeSingle()
        
        // Log the query for debugging
        if (DEBUG_AUTH) console.log('Querying users table with auth_user_id:', authUserId)

        // Add query timeout with abort tracking
        // Only set timeout if query takes longer than expected
        const queryTimeout = new Promise((_, reject) => {
          queryTimeoutId = setTimeout(() => {
            // Only abort if we're still the current request AND query hasn't completed
            if (abortControllerRef.current === abortController && loadingSystemUserRef.current && !queryCompletedRef.value) {
              abortController.abort()
              reject(new Error(`Query timeout after ${QUERY_TIMEOUT}ms`))
            }
          }, QUERY_TIMEOUT)
        })

        // Set a fallback timeout to prevent infinite loading (only if query takes too long)
        const timeoutDuration = INITIAL_TIMEOUT
        if (!loadTimeoutRef.current) {
          loadTimeoutRef.current = setTimeout(() => {
            // Only act if we're still the current request and still loading
            if (abortControllerRef.current === abortController && loadingSystemUserRef.current) {
              if (DEBUG_AUTH) console.error(`Load system user timeout after ${timeoutDuration}ms`)
              abortController.abort()
              loadingSystemUserRef.current = false
              // Retry if we haven't exceeded max retries
              if (retryCount < MAX_RETRIES - 1) {
                const delay = RETRY_DELAYS[retryCount] || 500
                if (DEBUG_AUTH) console.log(`Retrying loadSystemUser after ${delay}ms...`)
                setTimeout(() => {
                  loadSystemUser(authUserId, retryCount + 1).catch((e) => { if (DEBUG_AUTH) console.error(e) })
                }, delay)
              } else {
                setLoading(false)
                if (DEBUG_AUTH) console.error('Max retries reached, giving up')
              }
            }
            loadTimeoutRef.current = null
          }, timeoutDuration)
        }

        const startTime = Date.now()
        let result: any
        try {
          // Race between query and timeout - query happens immediately
          result = await Promise.race([
            queryPromise.then((res: any) => {
              queryCompletedRef.value = true
              // Clear both timeouts immediately when query completes
              if (queryTimeoutId) {
                clearTimeout(queryTimeoutId)
                queryTimeoutId = null
              }
              if (loadTimeoutRef.current) {
                clearTimeout(loadTimeoutRef.current)
                loadTimeoutRef.current = null
              }
              // Don't throw if aborted after completion - query succeeded
              return res
            }),
            queryTimeout
          ])
        } catch (raceError: any) {
          // Clear timeout on error
          if (queryTimeoutId) {
            clearTimeout(queryTimeoutId)
            queryTimeoutId = null
          }
          // Only throw abort error if query didn't complete
          if (!queryCompletedRef.value && (abortController.signal.aborted || raceError?.message?.includes('aborted'))) {
            throw new Error('Query was aborted')
          }
          // If query completed but we got an error, it's a real error
          if (!queryCompletedRef.value) {
            throw raceError
          }
        }
        
        // If query was aborted but completed, we still got the result
        if (abortController.signal.aborted && queryCompletedRef.value) {
          if (DEBUG_AUTH) console.log('Query completed but was marked as aborted - using result anyway')
        }
        
        const { data, error } = result as any
        const queryTime = Date.now() - startTime
        if (DEBUG_AUTH) console.log(`Query completed in ${queryTime}ms`)

        // Clear the fallback timeout (in case it wasn't cleared above)
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current)
          loadTimeoutRef.current = null
        }

        // Clear abort controller
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null
        }

        // Ensure loadingSystemUserRef is reset before processing result
        // This prevents race conditions where another call might start
        loadingSystemUserRef.current = false

      if (error) {
        if (DEBUG_AUTH) {
          console.error('Error loading system user:', error)
          console.error('Auth User ID:', authUserId)
          console.error('Error details:', { code: error.code, message: error.message, status: error.status, hint: error.hint })
        }

          // Handle missing column (42703) or 400 Bad Request — run fallback before network-error check
          const isMissingColumnOrBadRequest = error.code === '42703' || error.status === 400
          if (isMissingColumnOrBadRequest) {
            if (DEBUG_AUTH) {
              console.error('Bad Request - likely column doesn\'t exist or query syntax error')
              console.error('Attempting fallback query with minimal columns...')
            }
            
            // Try a minimal query with only essential columns
            try {
              const fallbackQuery = supabase
                .from('users')
                .select('id, email, role, auth_user_id')
                .eq('auth_user_id', authUserId)
                .maybeSingle()
              
              const fallbackResult = await fallbackQuery
              
              if (fallbackResult.error) {
                if (DEBUG_AUTH) console.error('Fallback query also failed:', fallbackResult.error)
                // If fallback also fails, treat as user not found
                clearCachedSystemUser()
                setSystemUser(null)
                systemUserRef.current = null
                setLoading(false)
                loadingSystemUserRef.current = false
                return { userNotFound: true, error: fallbackResult.error }
              }
              
              if (fallbackResult.data) {
                // Use minimal data - set defaults for missing fields
                const minimalUser: SystemUser = {
                  id: fallbackResult.data.id,
                  email: fallbackResult.data.email,
                  name: null,
                  phone: null,
                  place: null,
                  title: null,
                  notes: null,
                  role: fallbackResult.data.role,
                  image_url: null,
                  allowed_pages: null,
                  allowed_batches: null,
                  allowed_pieces: null,
                  display_order: null,
                  preferred_language: null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                }
                if (DEBUG_AUTH) console.log('Fallback query succeeded with minimal data')
                setSystemUser(minimalUser)
                systemUserRef.current = minimalUser
                setCachedSystemUser(authUserId, minimalUser)
                setLoading(false)
                loadingSystemUserRef.current = false
                return { success: true, usedFallback: true }
              }
            } catch (fallbackError: any) {
              if (DEBUG_AUTH) console.error('Fallback query exception:', fallbackError)
            }
            
            // If fallback also failed, continue with normal error handling
            clearCachedSystemUser()
            setSystemUser(null)
            systemUserRef.current = null
            setLoading(false)
            loadingSystemUserRef.current = false
            return { userNotFound: true, error }
          }
          
          // Check if it's a network error
          if (isNetworkError(error)) {
            if (DEBUG_AUTH) console.error('Network error detected')
            if (retryCount < MAX_RETRIES - 1) {
              const delay = RETRY_DELAYS[retryCount] || 3000
              if (DEBUG_AUTH) console.log(`Retrying after network error in ${delay}ms...`)
              loadingSystemUserRef.current = false
              setTimeout(() => {
                loadSystemUser(authUserId, retryCount + 1).catch((e) => { if (DEBUG_AUTH) console.error(e) })
              }, delay)
              return { error, willRetry: true }
            } else {
              if (DEBUG_AUTH) console.error('Max retries reached after network errors')
              clearCachedSystemUser()
              setSystemUser(null)
              systemUserRef.current = null
              setLoading(false)
              loadingSystemUserRef.current = false
              if (loadTimeoutRef.current) {
                clearTimeout(loadTimeoutRef.current)
                loadTimeoutRef.current = null
              }
              return { error: new Error('Network error: Unable to connect to server'), networkError: true }
            }
          }
        
        if (error.status === 406 && DEBUG_AUTH) {
          console.error('RLS policy blocked the query. Check: fix_rls_recursion.sql, user in users table, auth_user_id match.')
        }
        if (error.status === 404 && DEBUG_AUTH) {
          console.error('404 Not Found - table or RPC function may not exist')
        }
        
        clearCachedSystemUser()
        setSystemUser(null)
        systemUserRef.current = null
        setLoading(false)
        loadingSystemUserRef.current = false
        // Clear timeout
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current)
          loadTimeoutRef.current = null
        }
          // Clear abort controller
          if (abortControllerRef.current === abortController) {
            abortControllerRef.current = null
          }
        return { userNotFound: true, error }
      }

      if (!data) {
        if (DEBUG_AUTH) {
          console.warn('No system user data returned. Auth User ID:', authUserId, '- See docs/sql/fix_auth_user_id.sql')
        }
        clearCachedSystemUser()
        setSystemUser(null)
        systemUserRef.current = null
        setLoading(false)
        loadingSystemUserRef.current = false
        // Clear timeout
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current)
          loadTimeoutRef.current = null
        }
          // Clear abort controller
          if (abortControllerRef.current === abortController) {
            abortControllerRef.current = null
          }
        return { userNotFound: true, authUserIdMismatch: true }
      }

        if (DEBUG_AUTH) console.log('System user loaded successfully:', data.email, data.role)
        // Helper to ensure array fields are arrays (handle JSON strings or null)
        const ensureArray = (value: any): string[] | null => {
          if (value === null || value === undefined) return null
          if (Array.isArray(value)) return value
          if (typeof value === 'string') {
            try {
              const parsed = JSON.parse(value)
              return Array.isArray(parsed) ? parsed : null
            } catch {
              return null
            }
          }
          return null
        }
        
        // Ensure all fields are set (main query uses minimal columns; missing ones are null)
        const formattedUser: SystemUser = {
          id: data.id,
          email: data.email,
          name: data.name ?? null,
          phone: data.phone ?? null,
          place: data.place ?? null,
          title: data.title ?? null,
          notes: data.notes ?? null,
          role: data.role,
          image_url: data.image_url ?? null,
          allowed_pages: ensureArray(data.allowed_pages),
          allowed_batches: ensureArray(data.allowed_batches),
          allowed_pieces: ensureArray(data.allowed_pieces),
          display_order: data.display_order ?? null,
          preferred_language: (data as any).preferred_language ?? null, // May not exist in DB
          created_at: data.created_at,
          updated_at: data.updated_at,
        }
        
        if (DEBUG_AUTH) {
          console.log('Formatted user allowed_pages:', formattedUser.allowed_pages)
          console.log('Raw data allowed_pages:', data.allowed_pages)
        }
        setSystemUser(formattedUser)
        systemUserRef.current = formattedUser // Update ref
        setCachedSystemUser(authUserId, formattedUser)

        // CRITICAL: Always set loading to false when we have system user
        // Do this synchronously to prevent race conditions
        loadingSystemUserRef.current = false
        setLoading(false)
        
        // Clear any timeout
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current)
          loadTimeoutRef.current = null
        }
        // Clear abort controller
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null
        }
        if (DEBUG_AUTH) console.log('Loading set to false, systemUser set to:', data)
        return { success: true }
      } catch (error: any) {
        // Clear timeout on error
        if (queryTimeoutId) {
          clearTimeout(queryTimeoutId)
          queryTimeoutId = null
        }
        
        // Check if it was aborted (expected behavior, don't log as error)
        // But only if query didn't complete - if it completed, we should process the result
        const wasAborted = error?.message?.includes('aborted') || abortController.signal.aborted
        if (wasAborted) {
          // If query completed before abort, don't treat as error
          if (queryCompletedRef?.value === true) {
            // Query completed successfully, ignore the abort
            // This happens when a new query starts and aborts the old one, but old one already completed
            return { success: false, aborted: true, completed: true }
          }
          // Query was aborted before completion (expected when new query starts)
          // Don't log as error - this is normal when multiple auth events fire
          // Silent return - no error logging
          return { success: false, aborted: true }
        }
        
        // Only log real errors (not aborts)
        if (DEBUG_AUTH) console.error('Error loading system user:', error)
        
        // Check if it's a network error
        if (isNetworkError(error)) {
          if (DEBUG_AUTH) console.error('Network error in catch block')
          // Retry with exponential backoff if we haven't exceeded max retries
          if (retryCount < MAX_RETRIES - 1) {
            const delay = RETRY_DELAYS[retryCount] || 3000
            if (DEBUG_AUTH) console.log(`Retrying after network error in ${delay}ms...`)
            loadingSystemUserRef.current = false
            setTimeout(() => {
              loadSystemUser(authUserId, retryCount + 1).catch((e) => { if (DEBUG_AUTH) console.error(e) })
            }, delay)
            return { error, willRetry: true }
          }
        }
        
        clearCachedSystemUser()
        setSystemUser(null)
        systemUserRef.current = null
        setLoading(false)
        loadingSystemUserRef.current = false
        // Clear timeout
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current)
          loadTimeoutRef.current = null
        }
        // Clear abort controller
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null
        }
        
        // Retry once if we haven't retried yet and it's not a timeout/abort error
        const isTimeoutError = error?.message?.includes('timeout')
        if (retryCount < MAX_RETRIES - 1 && !isTimeoutError && !abortController.signal.aborted) {
          const delay = RETRY_DELAYS[retryCount] || 1000
          if (DEBUG_AUTH) console.log(`Retrying loadSystemUser after error in ${delay}ms...`)
          setTimeout(() => {
            loadSystemUser(authUserId, retryCount + 1).catch((e) => { if (DEBUG_AUTH) console.error(e) })
          }, delay)
          return { error, willRetry: true }
        }
        
        return { error }
      } finally {
        // Reset loading state - the promise reference check happens outside
        loadingSystemUserRef.current = false
      }
    })()

    // Store the promise so other calls can wait for it
    currentLoadPromiseRef.current = loadPromise
    
    // Add a cleanup handler to clear the ref when promise completes
    loadPromise.finally(() => {
      if (currentLoadPromiseRef.current === loadPromise) {
        currentLoadPromiseRef.current = null
      }
    })
    
    return await loadPromise
  }

  async function signIn(email: string, password: string) {
    try {
      // Clear any previous errors
      setLoading(true)

      // Normalize email: trim, lowercase, and ensure proper format
      let normalizedEmail = email.trim().toLowerCase()
      
      // If email doesn't contain @, append @gmail.com
      if (!normalizedEmail.includes('@')) {
        normalizedEmail = normalizedEmail + '@gmail.com'
      }

      if (DEBUG_AUTH) console.log('Attempting to sign in with email:', normalizedEmail)

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

      if (error) {
        setLoading(false)
        return { error }
      }

      if (data.user) {
        // Load system user data
        const result = await loadSystemUser(data.user.id)
        
        // Check if user was found in system
        if (result?.userNotFound) {
          // Check if it's a database schema error (400 Bad Request)
          if (result?.error?.status === 400) {
            if (DEBUG_AUTH) console.error('DATABASE SCHEMA ERROR:', result.error?.message)
            await supabase.auth.signOut()
            setLoading(false)
            return { 
              error: { 
                message: `خطأ في قاعدة البيانات: ${result.error.message || 'خطأ غير معروف'}\n\nيرجى التحقق من أن جميع الجداول والأعمدة موجودة في قاعدة البيانات.`,
                code: 'DATABASE_SCHEMA_ERROR',
                originalError: result.error
              } 
            }
          }
          
          // User authenticated but not in system users table OR auth_user_id mismatch
          if (result?.authUserIdMismatch) {
            if (DEBUG_AUTH) console.error('AUTH_USER_ID MISMATCH:', data.user.email, '- See docs/sql/fix_auth_user_id.sql')
            await supabase.auth.signOut()
            setLoading(false)
            return { 
              error: { 
                message: `المستخدم موجود ولكن معرف المصادقة غير متطابق.\n\nمعرف المستخدم: ${data.user.id}\n\nيرجى تحديث auth_user_id في جدول users.`,
                code: 'AUTH_USER_ID_MISMATCH',
                authUserId: data.user.id
              } 
            }
          } else {
            if (DEBUG_AUTH) console.error('USER NOT FOUND IN SYSTEM:', data.user.email, '- Add user to users table')
            await supabase.auth.signOut()
            setLoading(false)
            return { 
              error: { 
                message: `المستخدم غير مسجل في النظام.\n\nمعرف المستخدم: ${data.user.id}\n\nيرجى إضافة المستخدم في جدول users.`,
                code: 'USER_NOT_IN_SYSTEM',
                authUserId: data.user.id
              } 
            }
          }
        }
        
        // State will be updated by loadSystemUser, no need to check systemUser here
        // The state update happens asynchronously, so we just return success
        // The component will re-render when systemUser state updates
      }

      setLoading(false)
      return { error: null }
    } catch (error: any) {
      setLoading(false)
      return { error }
    }
  }

  async function signOut() {
    try {
      setLoading(true)
      
      // Check if there's an active session before attempting to sign out
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session) {
        // Only attempt sign out if there's an active session
        // Use local scope to avoid 403 errors with global scope
        const { error } = await supabase.auth.signOut({ scope: 'local' })
        if (error) {
          // Log error but don't throw - we'll clear state anyway
          if (DEBUG_AUTH) console.warn('Error signing out (non-critical):', error.message)
        }
      }
      
      // Always clear local state regardless of signOut result
      setUser(null)
      setSystemUser(null)
      systemUserRef.current = null
      initialSessionLoadedRef.current = false
      
      // Clear any cached data
      clearCachedSystemUser()
      window.location.hash = ''
    } catch (error: any) {
      // Handle errors gracefully - clear state even if signOut fails
      if (DEBUG_AUTH) console.warn('Error during sign out (non-critical):', error?.message || error)
      setUser(null)
      setSystemUser(null)
      systemUserRef.current = null
      initialSessionLoadedRef.current = false
    } finally {
      setLoading(false)
    }
  }

  const isOwner = systemUser?.role === 'owner'

  // Function to refresh system user data
  async function refreshSystemUser() {
    if (user?.id) {
      await loadSystemUser(user.id)
    }
  }

  // CRITICAL: Ensure loading is false if we have both user and systemUser
  // This prevents the app from being stuck in loading state
  useEffect(() => {
    if (user && systemUser) {
      // Always ensure loading is false when we have both user and systemUser
      if (loading) {
        if (DEBUG_AUTH) console.log('Force setting loading to false - user and systemUser both exist')
        setLoading(false)
      }
      // Also ensure loadingSystemUserRef is false
      if (loadingSystemUserRef.current) {
        loadingSystemUserRef.current = false
      }
    }
  }, [user, systemUser, loading])

  // Safety mechanism: Force loading to false after maximum timeout
  // This prevents infinite loading state even if all other mechanisms fail
  useEffect(() => {
    const MAX_LOADING_TIME = 10000 // 10 seconds maximum
    const safetyTimeout = setTimeout(() => {
      if (loading && user) {
        if (DEBUG_AUTH) console.warn('Safety timeout: Force setting loading to false after 10 seconds')
        setLoading(false)
        loadingSystemUserRef.current = false
        if (user && !systemUser) {
          if (DEBUG_AUTH) console.warn('Attempting emergency fallback query...')
          loadSystemUser(user.id).catch((e) => { if (DEBUG_AUTH) console.error('Emergency fallback query failed:', e) })
        }
      }
    }, MAX_LOADING_TIME)

    return () => {
      clearTimeout(safetyTimeout)
    }
  }, [loading, user, systemUser])

  return (
    <AuthContext.Provider
      value={{
        user,
        systemUser,
        loading,
        signIn,
        signOut,
        isOwner,
        refreshSystemUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

