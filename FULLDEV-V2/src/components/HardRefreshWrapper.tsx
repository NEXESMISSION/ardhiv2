import { useRef, useState, useCallback, type ReactNode } from 'react'

const PULL_THRESHOLD = 55
const LONG_PRESS_MS = 1200

interface HardRefreshWrapperProps {
  children: ReactNode
  className?: string
}

/**
 * Wraps app content to support:
 * - Pull-down to refresh (when at top of scroll): hard reload
 * - Long-press to refresh: hard reload (works in PWA and browser)
 */
export function HardRefreshWrapper({ children, className = '' }: HardRefreshWrapperProps) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStartRef = useRef<{ y: number; scrollTop: number; time: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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

  const startLongPress = useCallback(() => {
    clearLongPress()
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null
      doHardRefresh()
    }, LONG_PRESS_MS)
  }, [doHardRefresh, clearLongPress])

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const scrollTop = window.scrollY ?? document.documentElement.scrollTop
      touchStartRef.current = {
        y: e.touches[0].clientY,
        scrollTop,
        time: Date.now(),
      }
      setPullDistance(0)
      startLongPress()
    },
    [startLongPress]
  )

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const start = touchStartRef.current
    if (!start) return
    const currentY = e.touches[0].clientY
    const deltaY = currentY - start.y
    // Only allow pull-down when at top
    if (start.scrollTop <= 5 && deltaY > 0) {
      const distance = Math.min(deltaY * 0.5, 80)
      setPullDistance(distance)
      clearLongPress() // cancel long-press when user is pulling
    }
  }, [clearLongPress])

  const handleTouchEnd = useCallback(() => {
    clearLongPress()
    if (pullDistance >= PULL_THRESHOLD) {
      doHardRefresh()
    }
    setPullDistance(0)
    touchStartRef.current = null
  }, [pullDistance, doHardRefresh, clearLongPress])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') {
        startLongPress()
      }
    },
    [startLongPress]
  )

  const handlePointerUp = useCallback(() => {
    clearLongPress()
  }, [clearLongPress])

  const handlePointerLeave = useCallback(() => {
    clearLongPress()
  }, [clearLongPress])

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerUp}
    >
      {/* Pull-down indicator */}
      {pullDistance > 0 && (
        <div
          className="absolute left-0 right-0 top-0 z-30 flex items-center justify-center bg-blue-50/95 text-blue-700 transition-all duration-150"
          style={{
            height: Math.min(pullDistance + 20, 100),
            opacity: Math.min(pullDistance / PULL_THRESHOLD, 1),
          }}
        >
          {pullDistance >= PULL_THRESHOLD ? (
            <span className="text-sm font-medium">أفلت للتحديث</span>
          ) : (
            <span className="text-sm">اسحب للتحديث</span>
          )}
        </div>
      )}

      {/* Long-press hint (optional; could show after 0.5s) */}
      {isRefreshing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm font-medium text-gray-700">جاري التحديث...</p>
          </div>
        </div>
      )}

      {children}
    </div>
  )
}
