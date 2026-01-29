import { useState, useEffect, useRef, type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { IconButton } from './ui/icon-button'
import { Button } from './ui/button'
import { HardRefreshWrapper } from './HardRefreshWrapper'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { getNotifications, getUnreadCount, markAsRead, markAllAsRead, deleteNotification, formatTimeAgo, type Notification } from '@/utils/notifications'
import { getPaymentTypeLabel } from '@/utils/paymentTerms'

interface LayoutProps {
  children: ReactNode
  currentPage: string
  onNavigate: (page: string) => void
}

const pageNames: Record<string, string> = {
  'home': 'الرئيسية',
  'land': 'الأراضي',
  'clients': 'العملاء',
  'confirmation': 'التأكيدات',
  'finance': 'المالية',
  'contract-writers': 'محررين العقد',
  'installments': 'الأقساط',
  'sales-records': 'سجل المبيعات',
  'appointments': 'موعد اتمام البيع',
  'phone-call-appointments': 'مواعيد المكالمات',
}

export function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const { systemUser, isOwner } = useAuth()
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
  const subscriptionRef = useRef<any>(null)
  const notificationIdsRef = useRef<Set<string>>(new Set())
  const INITIAL_LIMIT = 20
  const LOAD_MORE_LIMIT = 10
  
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
    let reconnectTimeout: NodeJS.Timeout | null = null
    const userId = systemUser.id

    // Load initial notifications with debouncing
    let loadTimeout: NodeJS.Timeout | null = null
    const loadNotifications = async (silent = false, reset = true) => {
      if (!userId || !mounted) return

      if (!silent) {
        setLoadingNotifications(true)
      }

      try {
        const offset = reset ? 0 : notifications.length
        const limit = reset ? INITIAL_LIMIT : LOAD_MORE_LIMIT
        
        const [notifs, count] = await Promise.all([
          getNotifications(userId, limit, offset),
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
          
          setUnreadCount(count)
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
            // Prevent duplicates
            if (notificationIdsRef.current.has(newNotification.id)) {
              return
            }

            notificationIdsRef.current.add(newNotification.id)
            
            setNotifications((prev) => {
              const exists = prev.some((n) => n.id === newNotification.id)
              if (exists) return prev
              return [newNotification, ...prev]
            })
            // New notifications are automatically added to the top of the list
            // displayedNotifications will show them if displayedCount allows
            setUnreadCount((prev) => prev + 1)
            
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
            setNotifications((prev) =>
              prev.map((n) => (n.id === updatedNotification.id ? updatedNotification : n))
            )
            // Optimistically update count
            if (updatedNotification.read) {
              setUnreadCount((prev) => Math.max(0, prev - 1))
            }
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
            console.log('Notification subscription active')
            // Clear any pending reconnection
            if (reconnectTimeout) {
              clearTimeout(reconnectTimeout)
              reconnectTimeout = null
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn('Notification subscription error:', status)
            // Attempt reconnection after delay
            if (mounted && !reconnectTimeout) {
              reconnectTimeout = setTimeout(() => {
                if (mounted) {
                  setupSubscription()
                }
              }, 5000)
            }
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

    // Optimistic update
    const notification = notifications.find((n) => n.id === notificationId)
    if (notification && !notification.read) {
            setNotifications((prev) =>
              prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
            )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    }

    // Perform actual update
    const success = await markAsRead(notificationId, systemUser.id)
    if (!success) {
      // Revert on failure
      if (notification) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? notification : n))
        )
        setUnreadCount((prev) => prev + 1)
      }
    }
  }

  const handleMarkAllAsRead = async () => {
    if (!systemUser?.id) return

    // Optimistic update
    const unreadNotifications = notifications.filter((n) => !n.read)
    if (unreadNotifications.length > 0) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setUnreadCount(0)
    }

    // Perform actual update
    const success = await markAllAsRead(systemUser.id)
    if (!success) {
      // Revert on failure - reload from server
      const [notifs, count] = await Promise.all([
        getNotifications(systemUser.id, INITIAL_LIMIT, 0),
        getUnreadCount(systemUser.id),
      ])
      setNotifications(notifs)
      setDisplayedCount(INITIAL_LIMIT)
      setUnreadCount(count)
      setHasMore(notifs.length === INITIAL_LIMIT)
    }
  }

  const handleDeleteNotification = async (notificationId: string) => {
    if (!systemUser?.id) return

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
    if (!success) {
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
      // Load next batch of notifications
      const offset = notifications.length
      const notifs = await getNotifications(systemUser.id, LOAD_MORE_LIMIT, offset)
      
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
    // Mark as read if unread
    if (!notification.read) {
      await handleMarkAsRead(notification.id)
    }

    // Navigate based on entity type
    if (notification.entity_type === 'sale') {
      onNavigate('confirmation')
    } else if (notification.entity_type === 'appointment') {
      onNavigate('appointments')
    }

    setNotificationsOpen(false)
  }

  // Reset displayed count when dialog opens - show only first 20
  useEffect(() => {
    if (notificationsOpen) {
      // Reset to show only first 20 when dialog opens
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

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* PWA update banner: new version available after deploy */}
      {pwaUpdateAvailable && (
        <div className="fixed top-0 left-0 right-0 z-[200] bg-blue-600 text-white px-3 py-2 flex items-center justify-center gap-3 shadow-lg">
          <span className="text-sm font-medium">يتوفر إصدار جديد. أعد التحميل لاستخدامه.</span>
          <button
            type="button"
            onClick={handlePwaRefresh}
            className="px-3 py-1.5 bg-white text-blue-600 rounded-md text-sm font-semibold hover:bg-blue-50"
          >
            أعد التحميل
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
      <HardRefreshWrapper className="flex-1 lg:mr-0 transition-all duration-300 min-w-0 flex flex-col min-h-screen">
      <div className="flex-1 flex flex-col min-h-0">
        {/* Top Bar with Menu Toggle and Back Button */}
        <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
          <div className="px-2 sm:px-3 lg:px-4 py-1.5 sm:py-2 lg:py-3 flex items-center justify-between gap-2 sm:gap-3 lg:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <IconButton
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-1.5 sm:p-2 flex-shrink-0"
                title="القائمة"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </IconButton>
              <div className="text-xs sm:text-sm font-semibold text-gray-700 truncate">
                {pageNames[currentPage] || currentPage}
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Notification Icon - Show for all authenticated users */}
              {systemUser && (
              <div className="relative" ref={notificationRef}>
                <IconButton
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNotificationsOpen(!notificationsOpen)
                    setNewNotificationReceived(false)
                  }}
                  className={`p-1.5 sm:p-2 flex-shrink-0 relative transition-all ${
                    newNotificationReceived ? 'animate-bounce' : ''
                  }`}
                  title="الإشعارات"
                >
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className={`absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ${
                      newNotificationReceived ? 'animate-pulse scale-125' : 'animate-pulse'
                    }`}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </IconButton>

                {/* Notifications Full-Screen Modal */}
                {notificationsOpen && (
                  <div data-modal="true" role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setNotificationsOpen(false)}>
                    <div className="w-full h-full max-w-7xl max-h-[95vh] bg-white rounded-lg shadow-2xl flex flex-col m-4" onClick={(e) => e.stopPropagation()}>
                      {/* Header */}
                      <div className="p-4 sm:p-6 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 flex-shrink-0">
                        <h3 className="text-lg sm:text-xl font-bold text-gray-900">الإشعارات</h3>
                        <div className="flex items-center gap-3">
                          {unreadCount > 0 && (
                            <button
                              onClick={handleMarkAllAsRead}
                              className="text-sm sm:text-base text-blue-600 hover:text-blue-700 font-medium px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors"
                              title="تم قراءة الكل"
                            >
                              تم قراءة الكل
                            </button>
                          )}
                          <button
                            onClick={() => setNotificationsOpen(false)}
                            className="text-gray-500 hover:text-gray-700 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                            title="إغلاق"
                          >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      
                      {/* Content */}
                      <div className="overflow-y-auto flex-1 p-4 sm:p-6">
                        {loadingNotifications ? (
                          <div className="flex flex-col items-center justify-center h-full">
                            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                            <p className="mt-4 text-sm text-gray-500">جاري التحميل...</p>
                          </div>
                        ) : displayedNotifications.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <svg className="w-20 h-20 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                            <p className="text-lg">لا توجد إشعارات</p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {displayedNotifications.map((notification) => (
                              <div
                                key={notification.id}
                                className={`p-4 sm:p-6 rounded-lg border-2 hover:shadow-md cursor-pointer transition-all ${
                                  !notification.read 
                                    ? 'bg-blue-50 border-blue-300 shadow-sm' 
                                    : 'bg-white border-gray-200'
                                }`}
                                onClick={() => handleNotificationClick(notification)}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-3">
                                      <p className="text-base sm:text-lg text-gray-900 font-bold">
                                        {notification.title}
                                      </p>
                                      {!notification.read && (
                                        <span className="flex-shrink-0 w-3 h-3 rounded-full bg-blue-500 animate-pulse"></span>
                                      )}
                                    </div>
                                    <div className="text-sm sm:text-base text-gray-700 leading-relaxed space-y-2">
                                      {notification.message.split(' • ').map((part, index) => {
                                        if (index === 0) {
                                          return <div key={index} className="mb-2 font-semibold text-gray-900">{part}</div>
                                        }
                                        return (
                                          <div key={index} className="text-gray-600 pl-2 border-r-2 border-gray-200">
                                            {part}
                                          </div>
                                        )
                                      })}
                                    </div>
                                    <p className="text-xs sm:text-sm text-gray-400 mt-4">{formatTimeAgo(notification.created_at)}</p>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleDeleteNotification(notification.id)
                                    }}
                                    className="flex-shrink-0 text-gray-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors"
                                    title="حذف"
                                  >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            ))}
                            
                            {/* Load More Button */}
                            {hasMore && (
                              <div className="flex justify-center pt-4">
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
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                      </svg>
                                      جاري التحميل...
                                    </>
                                  ) : (
                                    'عرض المزيد (10 إشعارات)'
                                  )}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                  </div>
                )}

              {/* Back Button */}
              {currentPage !== 'home' && (
                <IconButton
                  variant="ghost"
                  size="md"
                  onClick={handleGoBack}
                  className="p-2 sm:p-3 flex-shrink-0"
                  title={previousPage ? 'رجوع' : 'رجوع إلى الرئيسية'}
                >
                  <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                  </svg>
                </IconButton>
              )}
            </div>
          </div>
        </div>

        {/* Page Content */}
        <main className="w-full flex-1 min-h-0">{children}</main>
      </div>
      </HardRefreshWrapper>
    </div>
  )
}

