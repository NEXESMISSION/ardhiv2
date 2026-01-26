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

// Constants for retry logic
const MAX_RETRIES = 1 // Reduced to 1 for faster failure
const INITIAL_TIMEOUT = 3000 // 3 seconds - faster timeout
const QUERY_TIMEOUT = 2000 // 2 seconds - faster timeout
const RETRY_DELAYS = [300] // Faster retry delays

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

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }: { data: { session: any } }) => {
      if (!mounted) return
      
      initialSessionLoadedRef.current = true
      setUser(session?.user ?? null)
      
      if (session?.user) {
        // Set loading to false immediately - we have a user, show the app
        // The systemUser will load in the background and update when ready
        setLoading(false)
        // Only load if not already loading (prevent duplicate calls)
        if (!loadingSystemUserRef.current) {
          // Load in background - don't await, don't block UI
          loadSystemUser(session.user.id).catch(console.error)
        }
      } else {
        setLoading(false)
      }
    }).catch((error: any) => {
      console.error('Error getting initial session:', error)
      if (mounted) {
      setLoading(false)
      }
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: string, session: any) => {
      if (!mounted) return
      
      console.log('Auth state changed:', event, session?.user?.email)
      
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
          console.log('INITIAL_SESSION: Already processed, skipping')
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
            console.log(`${event}: System user already loaded, skipping`)
            // CRITICAL: Always set loading to false if we have systemUser
            setLoading(false)
            loadingSystemUserRef.current = false
            return
          }
          if (loadingSystemUserRef.current) {
            console.log(`${event}: Already loading system user, skipping`)
            // Don't change loading state - let the existing load handle it
            return
          }
          // loadSystemUser will handle duplicate prevention internally
          // Don't await - load in background to not block UI
          // This prevents the "Query was aborted" error when multiple auth events fire
          loadSystemUser(session.user.id).catch((err) => {
            // Only log if it's not an expected abort
            if (!err?.aborted && !err?.message?.includes('aborted')) {
              console.error('Error loading system user:', err)
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
          console.log('TOKEN_REFRESHED: System user already loaded, skipping reload')
          setLoading(false)
          return
        }
        // Only load if we don't have system user and not already loading
        if (!loadingSystemUserRef.current) {
          console.log('TOKEN_REFRESHED: No system user, loading...')
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
      console.log('Already loading system user, waiting for existing call...')
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
      console.error(`Max retries (${MAX_RETRIES}) reached for loading system user`)
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
        console.log('Loading system user for auth_user_id:', authUserId, retryCount > 0 ? `(retry ${retryCount}/${MAX_RETRIES})` : '')
      
        // Query immediately - only select columns that exist
        // FIXED: Removed status, page_order, sidebar_order - they don't exist in the database
        // FIXED: Using auth_user_id=eq. instead of id=eq.
        const queryPromise = supabase
          .from('users')
          .select('id, name, email, phone, place, title, notes, role, image_url, allowed_pages, allowed_batches, allowed_pieces, display_order, created_at, updated_at, auth_user_id')
          .eq('auth_user_id', authUserId)
          .maybeSingle()

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
              console.error(`Load system user timeout after ${timeoutDuration}ms`)
              abortController.abort()
              loadingSystemUserRef.current = false
              // Retry if we haven't exceeded max retries
              if (retryCount < MAX_RETRIES - 1) {
                const delay = RETRY_DELAYS[retryCount] || 500
                console.log(`Retrying loadSystemUser after ${delay}ms...`)
                setTimeout(() => {
                  loadSystemUser(authUserId, retryCount + 1).catch(console.error)
                }, delay)
              } else {
                setLoading(false)
                console.error('Max retries reached, giving up')
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
          console.log('Query completed but was marked as aborted - using result anyway')
        }
        
        const { data, error } = result as any
        const queryTime = Date.now() - startTime
        console.log(`Query completed in ${queryTime}ms`)

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
        console.error('Error loading system user:', error)
        console.error('Auth User ID:', authUserId)
        console.error('Error details:', {
          code: error.code,
          message: error.message,
          status: error.status,
          hint: error.hint
        })
          
          // Check if it's a network error
          if (isNetworkError(error)) {
            console.error('Network error detected')
            // Retry with exponential backoff if we haven't exceeded max retries
            if (retryCount < MAX_RETRIES - 1) {
              const delay = RETRY_DELAYS[retryCount] || 3000
              console.log(`Retrying after network error in ${delay}ms...`)
              loadingSystemUserRef.current = false
              setTimeout(() => {
                loadSystemUser(authUserId, retryCount + 1).catch(console.error)
              }, delay)
              return { error, willRetry: true }
            } else {
              console.error('Max retries reached after network errors')
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
        
        // 406 error usually means RLS policy blocked
        if (error.status === 406) {
          console.error('RLS policy blocked the query. Check:')
          console.error('1. Did you run fix_rls_recursion.sql?')
          console.error('2. Does the user exist in users table?')
          console.error('3. Does auth_user_id match?')
        }
        
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
        console.warn('No system user data returned - user not in system users table')
        console.warn('Auth User ID searched:', authUserId)
        console.warn('')
        console.warn('The user exists in users table but auth_user_id does not match!')
        console.warn('')
        console.warn('To fix, run this SQL in Supabase SQL Editor:')
        console.warn('UPDATE users')
        console.warn('SET auth_user_id = \'' + authUserId + '\'::uuid, updated_at = NOW()')
        console.warn('WHERE email = \'test@gmail.com\';')
        console.warn('')
        console.warn('Or see: docs/sql/fix_auth_user_id.sql')
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

        console.log('System user loaded successfully:', data.email, data.role)
        // Ensure all fields are properly set, even if null
        const formattedUser: SystemUser = {
          id: data.id,
          email: data.email,
          name: data.name || null,
          phone: data.phone || null,
          place: data.place || null,
          title: data.title || null,
          notes: data.notes || null,
          role: data.role,
          image_url: data.image_url || null,
          allowed_pages: data.allowed_pages || null,
          allowed_batches: data.allowed_batches || null,
          allowed_pieces: data.allowed_pieces || null,
          display_order: data.display_order || null,
          created_at: data.created_at,
          updated_at: data.updated_at,
        }
        setSystemUser(formattedUser)
        systemUserRef.current = formattedUser // Update ref
        
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
        console.log('Loading set to false, systemUser set to:', data)
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
        console.error('Error loading system user:', error)
        
        // Check if it's a network error
        if (isNetworkError(error)) {
          console.error('Network error in catch block')
          // Retry with exponential backoff if we haven't exceeded max retries
          if (retryCount < MAX_RETRIES - 1) {
            const delay = RETRY_DELAYS[retryCount] || 3000
            console.log(`Retrying after network error in ${delay}ms...`)
            loadingSystemUserRef.current = false
            setTimeout(() => {
              loadSystemUser(authUserId, retryCount + 1).catch(console.error)
            }, delay)
            return { error, willRetry: true }
          }
        }
        
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
          console.log(`Retrying loadSystemUser after error in ${delay}ms...`)
          setTimeout(() => {
            loadSystemUser(authUserId, retryCount + 1).catch(console.error)
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

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
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
          // User authenticated but not in system users table OR auth_user_id mismatch
          if (result?.authUserIdMismatch) {
            // User exists but auth_user_id doesn't match
            console.error('=== AUTH_USER_ID MISMATCH ===')
            console.error('Auth User ID:', data.user.id)
            console.error('Email:', data.user.email)
            console.error('')
            console.error('The user exists in users table but auth_user_id is wrong!')
            console.error('')
            console.error('SQL to fix (run in Supabase SQL Editor):')
            console.error(`UPDATE users`)
            console.error(`SET auth_user_id = '${data.user.id}'::uuid, updated_at = NOW()`)
            console.error(`WHERE email = '${data.user.email}';`)
            
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
            // User doesn't exist at all
            console.error('=== USER NOT FOUND IN SYSTEM ===')
            console.error('Auth User ID:', data.user.id)
            console.error('Email:', data.user.email)
            console.error('')
            console.error('SQL to fix (run in Supabase SQL Editor):')
            console.error(`INSERT INTO users (email, role, auth_user_id)`)
            console.error(`VALUES ('${data.user.email}', 'owner', '${data.user.id}'::uuid)`)
            console.error(`ON CONFLICT (auth_user_id) DO UPDATE`)
            console.error(`SET email = EXCLUDED.email, role = EXCLUDED.role;`)
            
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
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('Error signing out:', error)
      }
      setUser(null)
      setSystemUser(null)
      // Clear any cached data
      window.location.hash = ''
    } catch (error) {
      console.error('Error during sign out:', error)
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
        console.log('Force setting loading to false - user and systemUser both exist')
        setLoading(false)
      }
      // Also ensure loadingSystemUserRef is false
      if (loadingSystemUserRef.current) {
        loadingSystemUserRef.current = false
      }
    }
  }, [user, systemUser, loading])

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

