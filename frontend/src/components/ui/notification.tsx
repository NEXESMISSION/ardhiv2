import { useEffect, useState } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type NotificationType = 'success' | 'error' | 'warning' | 'info' | 'loading' | 'neutral'

interface Notification {
  id: string
  message: string
  type: NotificationType
  duration?: number
  title?: string
}

// Global notification state
let notificationState: Notification[] = []
let listeners: Array<(notifications: Notification[]) => void> = []

const notify = (notifications: Notification[]) => {
  notificationState = notifications
  listeners.forEach(listener => listener(notifications))
}

export const showNotification = (
  message: string, 
  type: NotificationType = 'info', 
  duration?: number,
  title?: string
) => {
  const id = Math.random().toString(36).substring(7)
  
  // Set default duration based on type
  // Errors stay longer, success/info disappear faster
  const defaultDuration = type === 'error' ? 8000 : type === 'loading' ? 0 : 3000
  const finalDuration = duration !== undefined ? duration : defaultDuration
  
  const notification: Notification = { id, message, type, duration: finalDuration, title }
  
  notify([...notificationState, notification])
  
  if (finalDuration > 0) {
    setTimeout(() => {
      notify(notificationState.filter(n => n.id !== id))
    }, finalDuration)
  }
  
  return id
}

export const removeNotification = (id: string) => {
  notify(notificationState.filter(n => n.id !== id))
}

// Update a notification (useful for loading -> success/error transitions)
export const updateNotification = (
  id: string, 
  message: string, 
  type: NotificationType,
  duration?: number,
  title?: string
) => {
  const existingIndex = notificationState.findIndex(n => n.id === id)
  if (existingIndex === -1) return
  
  const finalDuration = duration !== undefined ? duration : (type === 'error' ? 8000 : 3000)
  
  const updated = [...notificationState]
  updated[existingIndex] = { 
    ...updated[existingIndex], 
    message, 
    type, 
    duration: finalDuration,
    title: title || updated[existingIndex].title
  }
  notify(updated)
  
  if (finalDuration > 0) {
    setTimeout(() => {
      notify(notificationState.filter(n => n.id !== id))
    }, finalDuration)
  }
}

export function NotificationContainer() {
  const [notifications, setNotifications] = useState<Notification[]>([])

  useEffect(() => {
    const listener = (newNotifications: Notification[]) => {
      setNotifications(newNotifications)
    }
    listeners.push(listener)
    setNotifications(notificationState)
    
    return () => {
      listeners = listeners.filter(l => l !== listener)
    }
  }, [])

  if (notifications.length === 0) return null

  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
    loading: Loader2,
    neutral: Info,
  }

  const getAlertStyles = (type: NotificationType) => {
    switch (type) {
      case 'success':
        return {
          container: 'bg-[#ecfdf5] border-l-[5px] border-l-[#10b981]',
          text: 'text-[#065f46]',
          icon: 'text-[#10b981]',
        }
      case 'error':
        return {
          container: 'bg-[#fef2f2] border-l-[5px] border-l-[#ef4444]',
          text: 'text-[#7f1d1d]',
          icon: 'text-[#ef4444]',
        }
      case 'warning':
        return {
          container: 'bg-[#fffbeb] border-l-[5px] border-l-[#f59e0b]',
          text: 'text-[#78350f]',
          icon: 'text-[#f59e0b]',
        }
      case 'info':
        return {
          container: 'bg-gradient-to-r from-[#2563eb] to-[#1e40af] border-l-[6px] border-l-[#60a5fa]',
          text: 'text-[#eff6ff]',
          icon: 'text-[#60a5fa]',
        }
      case 'loading':
        return {
          container: 'bg-gradient-to-r from-[#2563eb] to-[#1e40af] border-l-[6px] border-l-[#60a5fa]',
          text: 'text-[#eff6ff]',
          icon: 'text-[#60a5fa]',
        }
      case 'neutral':
        return {
          container: 'bg-white border-l-[6px] border-l-[#94a3b8]',
          text: 'text-[#020617]',
          icon: 'text-[#64748b]',
        }
      default:
        return {
          container: 'bg-white border-l-[6px] border-l-[#94a3b8]',
          text: 'text-[#020617]',
          icon: 'text-[#64748b]',
        }
    }
  }

  return (
    <div 
      className="fixed top-4 left-4 right-4 flex flex-col items-center gap-3 pointer-events-none"
      style={{ zIndex: 99999 }}
    >
      {notifications.map((notification) => {
        const Icon = icons[notification.type]
        const styles = getAlertStyles(notification.type)
        const isLoading = notification.type === 'loading'
        
        return (
          <div
            key={notification.id}
            className={cn(
              'pointer-events-auto w-full max-w-[440px] rounded-[14px] p-[18px_22px] flex items-start gap-[14px]',
              'shadow-[0_10px_30px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(255,255,255,0.08)]',
              'animate-in slide-in-from-top-2 duration-300',
              styles.container
            )}
          >
            <Icon 
              className={cn(
                'h-5 w-5 flex-shrink-0 mt-0.5',
                styles.icon,
                isLoading && 'animate-spin'
              )} 
            />
            <div className={cn('flex-1 min-w-0 leading-[1.5]', styles.text)}>
              {notification.title && (
                <strong className="font-semibold mr-2">{notification.title}</strong>
              )}
              <span className="text-[15px] font-medium break-words">{notification.message}</span>
            </div>
            <button
              onClick={() => removeNotification(notification.id)}
              className={cn(
                'flex-shrink-0 text-[18px] opacity-60 hover:opacity-100 transition-opacity bg-transparent border-none cursor-pointer ml-auto',
                styles.text
              )}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
