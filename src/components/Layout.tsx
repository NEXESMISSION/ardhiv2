import { useState, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Sidebar } from './Sidebar'
import { Button } from './ui/button'
import { HardRefreshWrapper } from './HardRefreshWrapper'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/i18n/context'
import { supabase } from '@/lib/supabase'
import { getNotifications, getUnreadCount, markAsRead, markAllAsRead, deleteNotification, formatTimeAgo, type Notification, type NotificationDateFilter } from '@/utils/notifications'
import { logger } from '@/utils/logger'

const log = logger('Notif')

interface LayoutProps {
  children: ReactNode
  currentPage: string
  onNavigate: (page: string) => void
}

export function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const { t, language, setLanguage } = useLanguage()
  const { systemUser, isOwner } = useAuth()
  const pageTitle = t(`pageNames.${currentPage}`) || currentPage
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [previousPage, setPreviousPage] = useState<string | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const notificationRef = useRef<HTMLDivElement>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [displayedCount, setDisplayedCount] = useState(20) // How many notifications to display
  const [unreadCount, setUnreadCount] = useState(0)
  const [loadingNotifications, setLoadingNotifications] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [newNotificationReceived, setNewNotificationReceived] = useState(false)
  const [pwaUpdateAvailable, setPwaUpdateAvailable] = useState(false)
  const [notificationDateFilter, setNotificationDateFilter] = useState<NotificationDateFilter>('all')
  const [notificationSpecificDate, setNotificationSpecificDate] = useState('') // YYYY-MM-DD for "specific day"
  const subscriptionRef = useRef<any>(null)
  const notificationIdsRef = useRef<Set<string>>(new Set())
  // After a mark-as-read / mark-all-as-read click, the user expects the badge
  // to drop and stay dropped. But the periodic refresh and modal-open refetch
  // both call getUnreadCount() and overwrite the badge — and a count query
  // that started *before* the mark UPDATE landed can return the stale higher
  // number, making the badge snap back to red. Track recent mark operations
  // so background refetches can suppress count regressions during the race
  // window. This is a UX guard, not a correctness guard — DB remains source
  // of truth, the guard just avoids visibly bouncing while writes settle.
  const lastMarkAtRef = useRef<number>(0)
  const MARK_GUARD_MS = 4000
  const INITIAL_LIMIT = 20
  const LOAD_MORE_LIMIT = 10

  const effectiveDateFilter: NotificationDateFilter =
    notificationDateFilter === 'date' && notificationSpecificDate
      ? notificationSpecificDate
      : notificationDateFilter

  // Computed: displayed notifications are a slice of all notifications
  const displayedNotifications = notifications.slice(0, displayedCount)

  // Track page history
  useEffect(() => {
    const stored = sessionStorage.getItem('previousPage')
    if (stored && stored !== currentPage) {
      setPreviousPage(stored)
    }
    sessionStorage.setItem('previousPage', currentPage)
  }, [currentPage])

  // PWA: show banner when new version is available (after deploy)
  useEffect(() => {
    const onUpdate = () => setPwaUpdateAvailable(true)
    window.addEventListener('pwa-update-available', onUpdate)
    return () => window.removeEventListener('pwa-update-available', onUpdate)
  }, [])

  // Load notifications and set up real-time subscription (for all users)
  useEffect(() => {
    if (!systemUser?.id) {
      return
    }

    let mounted = true
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    const userId = systemUser.id

    // Load initial notifications with debouncing
    let loadTimeout: ReturnType<typeof setTimeout> | null = null
    const loadNotifications = async (silent = false, reset = true) => {
      if (!userId || !mounted) return

      if (!silent) {
        setLoadingNotifications(true)
      }

      try {
        const offset = reset ? 0 : notifications.length
        const limit = reset ? INITIAL_LIMIT : LOAD_MORE_LIMIT
        
        const [notifs, count] = await Promise.all([
          getNotifications(userId, limit, offset, 'all'),
          getUnreadCount(userId),
        ])

        if (mounted) {
          // Track existing notification IDs
          notificationIdsRef.current = new Set(notifs.map((n) => n.id))

          if (reset) {
            // Reset: replace all notifications
            setNotifications(notifs)
            setDisplayedCount(INITIAL_LIMIT)
            setHasMore(notifs.length === INITIAL_LIMIT) // If we got full limit, there might be more
          } else {
            // Load more: append to existing (avoid duplicates)
            setNotifications(prev => {
              const existingIds = new Set(prev.map(n => n.id))
              const newNotifs = notifs.filter(n => !existingIds.has(n.id))
              return [...prev, ...newNotifs]
            })
            setDisplayedCount(prev => prev + notifs.length)
            setHasMore(notifs.length === LOAD_MORE_LIMIT) // If we got full limit, there might be more
          }

          // Suppress count regressions during the brief window after a mark
          // operation — see lastMarkAtRef. We still trust DB if it returns a
          // *higher* count (a real new notification arrived), just not a
          // regression to the pre-mark value.
          const withinMarkGuard = Date.now() - lastMarkAtRef.current < MARK_GUARD_MS
          setUnreadCount((prev) => (withinMarkGuard && count > prev ? prev : count))
        }
      } catch (error) {
        console.error('Error loading notifications:', error)
      } finally {
        if (mounted && !silent) {
          setLoadingNotifications(false)
          setLoadingMore(false)
        }
      }
    }

    // Initial load - only load first 20
    loadNotifications(false, true)

    // Set up real-time subscription with proper error handling and reconnection
    const setupSubscription = () => {
      // Remove existing channel if any
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current)
      }

      const channelName = `notifications-${userId}-${Date.now()}`
    const channel = supabase
        .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
            filter: `user_id=eq.${userId}`,
        },
          (payload) => {
            if (!mounted) return

          const newNotification = payload.new as Notification
            // Prevent duplicates — guard against both id-set and array, since the
            // modal-open refetch can repopulate the array without touching the ref.
            if (notificationIdsRef.current.has(newNotification.id)) {
              return
            }

            let actuallyAdded = false
            setNotifications((prev) => {
              if (prev.some((n) => n.id === newNotification.id)) return prev
              actuallyAdded = true
              return [newNotification, ...prev]
            })

            if (!actuallyAdded) {
              // Already present (likely from a refetch); just sync the ref so we
              // stop seeing this id as "new" and never double-count it.
              notificationIdsRef.current.add(newNotification.id)
              return
            }

            notificationIdsRef.current.add(newNotification.id)

            // Only count it as unread if the row actually is unread. A row that
            // arrives already-read (e.g. backfill, server-side mark) must not
            // bump the badge.
            if (!newNotification.read) {
              setUnreadCount((prev) => prev + 1)
            }

            // Show visual feedback
            setNewNotificationReceived(true)
            setTimeout(() => {
              if (mounted) {
                setNewNotificationReceived(false)
              }
            }, 2000)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
            filter: `user_id=eq.${userId}`,
        },
          (payload) => {
            if (!mounted) return

          const updatedNotification = payload.new as Notification
            // Only decrement the unread counter when the notification ACTUALLY
            // transitions from unread → read in our local state. The previous
            // implementation always decremented on UPDATE+read=true, which
            // double-counted whenever the optimistic update had already
            // decremented. That caused mark-as-read to look broken (counter
            // went lower than reality, then snapped back on next refetch).
            setNotifications((prev) => {
              const previous = prev.find((n) => n.id === updatedNotification.id)
              if (previous && !previous.read && updatedNotification.read) {
                setUnreadCount((c) => Math.max(0, c - 1))
              }
              return prev.map((n) => (n.id === updatedNotification.id ? updatedNotification : n))
            })
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (!mounted) return

            const deletedId = payload.old.id
            setNotifications((prev) => {
              const notification = prev.find((n) => n.id === deletedId)
              const newList = prev.filter((n) => n.id !== deletedId)
              // Update unread count if deleted notification was unread
              if (notification && !notification.read) {
                setUnreadCount((prev) => Math.max(0, prev - 1))
              }
              return newList
            })
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            // Subscription ready; no console log to avoid noise
            // Clear any pending reconnection
            if (reconnectTimeout) {
              clearTimeout(reconnectTimeout)
              reconnectTimeout = null
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('Notification subscription error:', status)
            if (mounted && !reconnectTimeout) {
              reconnectTimeout = setTimeout(() => {
                if (mounted) setupSubscription()
              }, 5000)
            }
          } else if (status === 'CLOSED' && mounted && !reconnectTimeout) {
            // Unexpected close while still mounted (e.g. server) — reconnect. Ignore when unmounting.
            reconnectTimeout = setTimeout(() => {
              if (mounted) setupSubscription()
            }, 5000)
          }
        })

    subscriptionRef.current = channel
    }

    setupSubscription()

    // Periodic refresh as backup (reduced frequency - every 60 seconds)
    const refreshInterval = setInterval(() => {
      if (mounted) {
        loadNotifications(true, true) // Silent refresh, reset to first 20
      }
    }, 60000)

    return () => {
      mounted = false
      if (loadTimeout) {
        clearTimeout(loadTimeout)
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current)
        subscriptionRef.current = null
      }
      clearInterval(refreshInterval)
    }
  }, [systemUser?.id])

  const handleGoBack = () => {
    if (previousPage) {
      onNavigate(previousPage)
    } else {
      // If no previous page, go to home page
      onNavigate('home')
    }
  }

  const handleMarkAsRead = async (notificationId: string) => {
    if (!systemUser?.id) return

    // Optimistic update — only count down if the notification is currently unread.
    let didOptimistic = false
    const notification = notifications.find((n) => n.id === notificationId)
    if (notification && !notification.read) {
      didOptimistic = true
      // Stamp BEFORE optimistic update so any in-flight refresh that lands
      // during the write window sees the guard is active.
      lastMarkAtRef.current = Date.now()
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    }

    // Always perform the DB update — local state may be stale.
    const success = await markAsRead(notificationId, systemUser.id)
    if (success && didOptimistic) {
      // Re-stamp on success so the guard window covers the post-write race
      // window where a refetch may still see the old count.
      lastMarkAtRef.current = Date.now()
    }
    if (!success && didOptimistic && notification) {
      // Revert on failure (and only if we did the optimistic flip).
      lastMarkAtRef.current = 0
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? notification : n))
      )
      setUnreadCount((prev) => prev + 1)
    }
  }

  const handleMarkAllAsRead = async () => {
    if (!systemUser?.id) return

    // Snapshot current state so we can revert atomically on failure.
    const previousNotifications = notifications
    const previousUnreadCount = unreadCount

    // Stamp BEFORE optimistic update — see handleMarkAsRead for rationale.
    lastMarkAtRef.current = Date.now()
    // Optimistic update — flip every notification to read=true and zero the badge.
    setNotifications((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })))
    setUnreadCount(0)

    // Perform actual update
    const success = await markAllAsRead(systemUser.id)
    if (success) {
      // Re-stamp on success to cover the post-write race window.
      lastMarkAtRef.current = Date.now()
    } else {
      // Revert on failure — restore prior local state instead of fetching
      // (avoids overwriting any newer realtime updates that may have arrived).
      lastMarkAtRef.current = 0
      setNotifications(previousNotifications)
      setUnreadCount(previousUnreadCount)
    }
  }

  const handleDeleteNotification = async (notificationId: string) => {
    if (!systemUser?.id) {
      log.warn('handleDeleteNotification skipped — no systemUser')
      return
    }

    log.info('delete notification', { id: notificationId })
    // Optimistic update
      const notification = notifications.find((n) => n.id === notificationId)
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId))
      // Adjust displayed count if needed
      if (displayedCount > notifications.length - 1) {
        setDisplayedCount(prev => Math.max(INITIAL_LIMIT, prev - 1))
      }
      if (notification && !notification.read) {
        setUnreadCount((prev) => Math.max(0, prev - 1))
    }

    // Perform actual delete
    const success = await deleteNotification(notificationId, systemUser.id)
    if (success) {
      log.info('delete notification ok', { id: notificationId })
    } else {
      log.error('delete notification failed', { id: notificationId })
      // Revert on failure
      if (notification) {
        const restored = [...notifications, notification].sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        setNotifications(restored)
        if (!notification.read) {
          setUnreadCount((prev) => prev + 1)
        }
      }
    }
  }

  const handleLoadMore = async () => {
    if (!systemUser?.id || loadingMore || !hasMore) return
    
    setLoadingMore(true)
    try {
      const offset = notifications.length
      const notifs = await getNotifications(systemUser.id, LOAD_MORE_LIMIT, offset, effectiveDateFilter)
      
      if (notifs.length > 0) {
        // Append new notifications (avoid duplicates)
        const existingIds = new Set(notifications.map(n => n.id))
        const newNotifs = notifs.filter(n => !existingIds.has(n.id))
        
        setNotifications(prev => [...prev, ...newNotifs])
        setDisplayedCount(prev => prev + newNotifs.length)
        setHasMore(notifs.length === LOAD_MORE_LIMIT) // If we got full limit, there might be more
      } else {
        setHasMore(false) // No more notifications
      }
    } catch (error) {
      console.error('Error loading more notifications:', error)
    } finally {
      setLoadingMore(false)
    }
  }

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read if unread (does NOT block navigation — we await for correctness
    // but the optimistic update is already visible).
    if (!notification.read) {
      await handleMarkAsRead(notification.id)
    }

    // Navigate based on entity type. Only close the panel if we actually navigate;
    // otherwise leave it open so the user can see the read state change.
    if (notification.entity_type === 'sale') {
      onNavigate('confirmation')
      setNotificationsOpen(false)
    } else if (notification.entity_type === 'appointment') {
      onNavigate('appointments')
      setNotificationsOpen(false)
    }
  }

  // When notifications modal is open, load (or reload) with current date filter
  useEffect(() => {
    if (!notificationsOpen || !systemUser?.id) return
    let mounted = true
    setLoadingNotifications(true)
    getNotifications(systemUser.id, INITIAL_LIMIT, 0, effectiveDateFilter)
      .then((notifs) => {
        if (!mounted) return
        // Keep the dedupe ref in sync — without this, an INSERT realtime event
        // for an item we already loaded via this fetch would slip past the
        // dedupe and double-count.
        notificationIdsRef.current = new Set(notifs.map((n) => n.id))
        setNotifications(notifs)
        setDisplayedCount(INITIAL_LIMIT)
        setHasMore(notifs.length >= INITIAL_LIMIT)
        return getUnreadCount(systemUser.id)
      })
      .then((count) => {
        if (!mounted || count === undefined) return
        const withinMarkGuard = Date.now() - lastMarkAtRef.current < MARK_GUARD_MS
        setUnreadCount((prev) => (withinMarkGuard && count > prev ? prev : count))
      })
      .catch((err) => mounted && console.error('Error loading notifications by filter:', err))
      .finally(() => mounted && setLoadingNotifications(false))
    return () => { mounted = false }
  }, [notificationsOpen, effectiveDateFilter, systemUser?.id])

  // Reset displayed count when dialog opens - show only first 20
  useEffect(() => {
    if (notificationsOpen) {
      setDisplayedCount(INITIAL_LIMIT)
      setHasMore(notifications.length > INITIAL_LIMIT)
    }
  }, [notificationsOpen, notifications.length])

  // Close notifications when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false)
      }
    }

    if (notificationsOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [notificationsOpen])

  const handlePwaRefresh = () => {
    const updateSW = (window as any).__pwa_updateSW
    if (typeof updateSW === 'function') updateSW(true)
    else window.location.reload()
  }

  const isRTL = language === 'ar'

  // Notification panel content (shared between desktop dropdown and mobile modal)
  const notificationFilterButtons = (['all', 'today', 'yesterday', 'this_week'] as const)

  const renderNotificationContent = (showGrabber: boolean = false) => (
    <>
      {/* Mobile grabber for bottom sheet */}
      {showGrabber && (
        <div className="flex justify-center pt-2 pb-1 lg:hidden flex-shrink-0">
          <span className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
      )}

      {/* Header */}
      <div className="px-4 sm:px-5 py-3 border-b border-gray-200/80 flex items-center justify-between bg-gradient-to-l from-blue-50/70 via-indigo-50/30 to-white flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
              <path d="M10 18a2 2 0 0 0 4 0" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] sm:text-base font-bold text-gray-900 leading-tight truncate">{t('header.notifications')}</h3>
            {unreadCount > 0 && (
              <span className="text-[11px] text-blue-600 font-semibold">
                {unreadCount} {t(unreadCount === 1 ? 'header.unreadCountOne' : 'header.unreadCountMany')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="text-[11.5px] text-blue-700 hover:text-blue-900 font-semibold px-2 py-1.5 rounded-lg hover:bg-blue-100/70 transition-colors whitespace-nowrap"
              title={t('notifications.markAllRead')}
            >
              {t('notifications.markAllRead')}
            </button>
          )}
          <button
            onClick={() => setNotificationsOpen(false)}
            className="w-9 h-9 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 flex items-center justify-center transition-colors"
            title={t('common.close')}
            aria-label={t('common.close')}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Date filter */}
      <div className="px-3 sm:px-4 py-2 border-b border-gray-200/80 bg-gray-50/70 flex-shrink-0 overflow-x-auto scrollbar-thin">
        <div className="flex items-center gap-1.5 min-w-max">
          <span className="text-[11px] text-gray-500 font-semibold ms-1 flex-shrink-0">{t('notifications.filterLabel')}</span>
          {notificationFilterButtons.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setNotificationDateFilter(key)
                setNotificationSpecificDate('')
              }}
              className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold transition-colors border whitespace-nowrap flex-shrink-0 ${
                effectiveDateFilter === key
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/20'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {key === 'all' ? t('notifications.filterAll') : key === 'today' ? t('notifications.filterToday') : key === 'yesterday' ? t('notifications.filterYesterday') : t('notifications.filterThisWeek')}
            </button>
          ))}
          <input
            type="date"
            value={notificationSpecificDate}
            onChange={(e) => {
              const v = e.target.value
              setNotificationSpecificDate(v)
              if (v) setNotificationDateFilter('date')
            }}
            className={`rounded-full border px-2.5 py-1 text-[11.5px] text-gray-800 bg-white font-medium flex-shrink-0 ${
              notificationDateFilter === 'date' && notificationSpecificDate
                ? 'border-blue-600 ring-1 ring-blue-600/30'
                : 'border-gray-200'
            }`}
            title={t('notifications.filterSpecificDay')}
          />
        </div>
      </div>

      {/* Content */}
      <div className="overflow-y-auto overflow-x-hidden flex-1 min-h-0 p-3 sm:p-4 scrollbar-thin">
        {loadingNotifications ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-blue-600"></div>
            <p className="mt-3 text-[13px] text-gray-500 font-medium">{t('notifications.loading')}</p>
          </div>
        ) : displayedNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
              <svg className="w-8 h-8 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
                <path d="M10 18a2 2 0 0 0 4 0" />
              </svg>
            </div>
            <p className="text-[13.5px] font-semibold text-gray-600">{t('notifications.noNotifications')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayedNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`group relative p-3 rounded-xl border cursor-pointer transition-all
                  ${!notification.read
                    ? 'bg-gradient-to-l from-blue-50 to-white border-blue-200 shadow-sm hover:shadow-md hover:border-blue-300'
                    : 'bg-white border-gray-200/80 hover:border-gray-300 hover:shadow-sm'
                  }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start gap-2.5">
                  {/* Unread dot / icon tile */}
                  <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
                    !notification.read ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
                      <path d="M10 18a2 2 0 0 0 4 0" />
                    </svg>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className={`text-[13px] truncate ${!notification.read ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}`}>
                        {notification.title}
                      </p>
                      {!notification.read && (
                        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                      )}
                    </div>
                    <div className="text-[12px] text-gray-600 leading-relaxed space-y-1">
                      {notification.message.split(' • ').map((part, index) => {
                        if (index === 0) {
                          return <div key={index} className="font-semibold text-gray-800 line-clamp-2">{part}</div>
                        }
                        return (
                          <div key={index} className={`text-gray-500 ${isRTL ? 'pr-2 border-r-2' : 'pl-2 border-l-2'} border-gray-200/80 line-clamp-2`}>
                            {part}
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-[10.5px] text-gray-400 mt-2 font-semibold">{formatTimeAgo(notification.created_at, language)}</p>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteNotification(notification.id)
                    }}
                    onTouchEnd={(e) => {
                      // On touch devices there's no hover, so the previous
                      // `opacity-0 group-hover:opacity-100` styling left this
                      // button invisible and untappable. Now it's always
                      // tappable; touchend ensures the tap registers even if
                      // the underlying card's onClick would otherwise win.
                      e.stopPropagation()
                      e.preventDefault()
                      handleDeleteNotification(notification.id)
                    }}
                    aria-label={t('notifications.delete')}
                    title={t('notifications.delete')}
                    className="flex-shrink-0 w-8 h-8 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 active:bg-red-100 flex items-center justify-center transition-colors touch-manipulation"
                    style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}

            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  variant="secondary"
                  className="w-full"
                >
                  {loadingMore ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {t('notifications.loading')}
                    </>
                  ) : (
                    `${t('notifications.loadMore')} (10)`
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )

  return (
    <div className="min-h-screen pwa-layout-min-height bg-gray-50 flex w-full safe-area-padding">
      {/* PWA update banner: new version available after deploy */}
      {pwaUpdateAvailable && (
        <div className="fixed top-0 left-0 right-0 z-[200] bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-3 py-2 flex items-center justify-center gap-3 shadow-lg safe-area-top">
          <span className="text-sm font-semibold">{t('header.newVersion')}</span>
          <button
            type="button"
            onClick={handlePwaRefresh}
            className="px-3 py-1.5 bg-white text-blue-600 rounded-md text-sm font-bold hover:bg-blue-50"
          >
            {t('header.refresh')}
          </button>
        </div>
      )}

      <Sidebar
        currentPage={currentPage}
        onNavigate={onNavigate}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* Main Content - pull-down or long-press to hard refresh (PWA & browser) */}
      <HardRefreshWrapper className="flex-1 lg:mr-0 transition-all duration-300 min-w-0 flex flex-col min-h-screen min-h-0 pwa-layout-min-height">
      <div className="flex-1 flex flex-col min-h-0">
        {/* Top Bar — symmetric 3-zone layout (leading nav · centered title · trailing actions).
            Force LTR on the bar so the visual position of buttons does NOT flip when the
            user switches FR ↔ AR — the title still renders in its own language direction. */}
        <div className="sticky top-0 z-20 bg-gray-50/90 backdrop-blur-md border-b border-gray-200/60">
          <div
            dir="ltr"
            className="px-3 sm:px-4 lg:px-5 py-2 sm:py-2.5 flex items-center gap-2"
          >
            {/* LEADING — navigation cluster (always at the left) */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden w-10 h-10 rounded-xl bg-white hover:bg-gray-100 border border-gray-200/70 text-gray-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex items-center justify-center flex-shrink-0 transition-colors"
                title={t('header.menu')}
                aria-label={t('header.menu')}
                aria-expanded={sidebarOpen}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {currentPage !== 'home' && (
                <button
                  onClick={handleGoBack}
                  className="w-10 h-10 rounded-xl bg-white hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 border border-gray-200/70 text-gray-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex items-center justify-center flex-shrink-0 transition-colors"
                  title={previousPage ? t('common.back') : t('common.backToHome')}
                  aria-label={previousPage ? t('common.back') : t('common.backToHome')}
                >
                  {/* Chevron always points LEFT — matches the leading-edge position */}
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
              )}
            </div>

            {/* CENTER — page title (always centered, reads in its own language direction) */}
            <h1
              dir={isRTL ? 'rtl' : 'ltr'}
              className="flex-1 min-w-0 text-center text-[14px] sm:text-[15px] font-bold text-gray-900 truncate tracking-tight px-1"
            >
              {pageTitle}
            </h1>

            {/* TRAILING — action cluster (always at the right) */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Language switcher — height matches the 40×40 buttons in this cluster */}
              <div
                className="inline-flex items-center h-10 p-0.5 rounded-xl bg-white border border-gray-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                role="group"
                aria-label="Language"
              >
                <button
                  type="button"
                  onClick={() => setLanguage('fr')}
                  className={`h-full min-w-[34px] px-2.5 rounded-lg text-[12px] font-bold tracking-wide transition-all flex items-center justify-center ${
                    language === 'fr'
                      ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-500/30'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  aria-label={t('header.frenchLabel')}
                  aria-pressed={language === 'fr'}
                >
                  FR
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('ar')}
                  className={`h-full min-w-[34px] px-2.5 rounded-lg text-[14px] font-bold transition-all flex items-center justify-center ${
                    language === 'ar'
                      ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-500/30'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  aria-label={t('header.arabicLabel')}
                  aria-pressed={language === 'ar'}
                >
                  ع
                </button>
              </div>

              {/* Notifications - owners only */}
              {systemUser && isOwner && (
                <div className="relative" ref={notificationRef}>
                  <button
                    onClick={() => {
                      setNotificationsOpen(!notificationsOpen)
                      setNewNotificationReceived(false)
                    }}
                    aria-label={t('header.notifications') || 'Notifications'}
                    aria-expanded={notificationsOpen}
                    aria-haspopup="true"
                    className={`relative w-10 h-10 rounded-xl bg-white hover:bg-gray-100 border border-gray-200/70 text-gray-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex items-center justify-center flex-shrink-0 transition-all ${
                      newNotificationReceived ? 'animate-bounce' : ''
                    } ${notificationsOpen ? 'bg-blue-50 border-blue-200 text-blue-700' : ''}`}
                    title={t('header.notifications')}
                  >
                    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
                      <path d="M10 18a2 2 0 0 0 4 0" />
                    </svg>
                    {unreadCount > 0 && (
                      <span className={`absolute -top-1 -right-1 flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full bg-gradient-to-b from-red-500 to-red-600 font-bold text-white ring-2 ring-white shadow-sm ${
                        unreadCount >= 10 ? 'text-[9px]' : 'text-[10px]'
                      } ${newNotificationReceived ? 'scale-110' : ''} transition-transform`}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </button>

                  {/* Notification panel — rendered in a portal to escape the header's
                      backdrop-blur containing block (which was clipping `position: fixed`). */}
                  {notificationsOpen && createPortal(
                    <>
                      {/* Mobile: full-screen */}
                      <div
                        data-modal="true"
                        role="dialog"
                        aria-modal="true"
                        className="lg:hidden fixed inset-0 z-[100] flex flex-col bg-white animate-fade-in"
                        style={{
                          paddingTop: 'var(--pwa-padding-top)',
                          paddingBottom: 'var(--pwa-padding-bottom)',
                        }}
                      >
                        {renderNotificationContent()}
                      </div>

                      {/* Desktop: centered backdrop + anchored-feel dropdown card */}
                      <div
                        className="hidden lg:flex fixed inset-0 z-[100] items-start justify-end p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
                        onClick={() => setNotificationsOpen(false)}
                      >
                        <div
                          className={`mt-14 w-[440px] max-h-[min(660px,calc(100vh-120px))] bg-white rounded-2xl shadow-[0_8px_16px_rgba(15,23,42,0.08),0_32px_64px_-16px_rgba(15,23,42,0.30)] border border-gray-200/80 flex flex-col overflow-hidden animate-lift-in ${isRTL ? 'me-2' : 'ms-2'}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {renderNotificationContent()}
                        </div>
                      </div>
                    </>,
                    document.body
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Page Content */}
        <main className="w-full flex-1 min-h-0 min-h-[180px]">{children}</main>
      </div>
      </HardRefreshWrapper>
    </div>
  )
}

