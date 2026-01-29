import { useRef, useState, useEffect, useCallback, type ReactNode } from 'react'

const PULL_THRESHOLD = 50
const LONG_PRESS_MS = 1000

interface HardRefreshWrapperProps {
  children: ReactNode
  className?: string
}

/**
 * Pull-down and long-press to hard refresh. Uses document-level listeners
 * so it works on mobile/PWA even when touching buttons or scrollable content.
 */
export function HardRefreshWrapper({ children, className = '' }: HardRefreshWrapperProps) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStartRef = useRef<{ y: number; scrollTop: number } | null>(null)
  const pullDistanceRef = useRef(0)

  const doHardRefresh = useCallback(() => {
    if (isRefreshing) return
    setIsRefreshing(true)
    window.location.reload()
  }, [isRefreshing])

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  // Document-level listeners so we capture touch/pointer even on children (capture phase)
  useEffect(() => {
    const getScrollTop = () => {
      return window.scrollY ?? document.documentElement.scrollTop ?? 0
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      touchStartRef.current = { y: e.touches[0].clientY, scrollTop: getScrollTop() }
      pullDistanceRef.current = 0
      setPullDistance(0)
      clearLongPress()
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null
        doHardRefresh()
      }, LONG_PRESS_MS)
    }

    const onTouchMove = (e: TouchEvent) => {
      const start = touchStartRef.current
      if (!start || e.touches.length !== 1) return
      const currentY = e.touches[0].clientY
      const deltaY = currentY - start.y
      if (start.scrollTop <= 10 && deltaY > 0) {
        const distance = Math.min(deltaY * 0.6, 90)
        pullDistanceRef.current = distance
        setPullDistance(distance)
        clearLongPress()
      }
    }

    const onTouchEnd = () => {
      clearLongPress()
      if (pullDistanceRef.current >= PULL_THRESHOLD) {
        doHardRefresh()
      }
      touchStartRef.current = null
      pullDistanceRef.current = 0
      setPullDistance(0)
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        clearLongPress()
        longPressTimerRef.current = setTimeout(() => {
          longPressTimerRef.current = null
          doHardRefresh()
        }, LONG_PRESS_MS)
      }
    }

    const onPointerUp = () => clearLongPress()
    const onPointerCancel = () => clearLongPress()

    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: true })
    document.addEventListener('touchend', onTouchEnd, { capture: true })
    document.addEventListener('touchcancel', onTouchEnd, { capture: true })
    document.addEventListener('pointerdown', onPointerDown, { capture: true })
    document.addEventListener('pointerup', onPointerUp, { capture: true })
    document.addEventListener('pointercancel', onPointerCancel, { capture: true })

    return () => {
      document.removeEventListener('touchstart', onTouchStart, { capture: true })
      document.removeEventListener('touchmove', onTouchMove, { capture: true })
      document.removeEventListener('touchend', onTouchEnd, { capture: true })
      document.removeEventListener('touchcancel', onTouchEnd, { capture: true })
      document.removeEventListener('pointerdown', onPointerDown, { capture: true })
      document.removeEventListener('pointerup', onPointerUp, { capture: true })
      document.removeEventListener('pointercancel', onPointerCancel, { capture: true })
      clearLongPress()
    }
  }, [doHardRefresh, clearLongPress])

  return (
    <div className={`relative ${className}`}>
      {/* Pull-down indicator - fixed at top so visible when pulling */}
      {pullDistance > 0 && (
        <div
          className="fixed left-0 right-0 top-0 z-[100] flex items-center justify-center bg-blue-500/90 text-white shadow-lg transition-all duration-150"
          style={{
            height: Math.min(pullDistance + 24, 100),
            opacity: Math.min(pullDistance / PULL_THRESHOLD, 1),
          }}
        >
          {pullDistance >= PULL_THRESHOLD ? (
            <span className="text-sm font-bold">أفلت للتحديث</span>
          ) : (
            <span className="text-sm font-medium">اسحب للأسفل للتحديث</span>
          )}
        </div>
      )}

      {isRefreshing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/90">
          <div className="flex flex-col items-center gap-3">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm font-semibold text-gray-800">جاري التحديث...</p>
          </div>
        </div>
      )}

      {children}
    </div>
  )
}
