import { useRef, useState, useCallback, type ReactNode } from 'react'

const PULL_THRESHOLD = 55

/** Return true if any dialog/modal is open - do not refresh when true */
function isDialogOpen(): boolean {
  if (document.querySelector('[data-modal="true"]')) return true
  return Array.from(document.querySelectorAll('div')).some(
    (el) => el.classList?.contains('fixed') && el.classList?.contains('inset-0')
  )
}

interface HardRefreshWrapperProps {
  children: ReactNode
  className?: string
}

/**
 * Pull-down to refresh only. No long-press - avoids accidental refresh
 * and dialog close. Refresh is disabled when any dialog/modal is open.
 */
export function HardRefreshWrapper({ children, className = '' }: HardRefreshWrapperProps) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const touchStartRef = useRef<{ y: number; scrollTop: number } | null>(null)
  const pullDistanceRef = useRef(0)

  const doHardRefresh = useCallback(() => {
    if (isRefreshing) return
    if (isDialogOpen()) return
    setIsRefreshing(true)
    window.location.reload()
  }, [isRefreshing])

  useEffect(() => {
    const getScrollTop = () => window.scrollY ?? document.documentElement.scrollTop ?? 0

    const onTouchStart = (e: TouchEvent) => {
      if (isDialogOpen()) return
      if (e.touches.length !== 1) return
      touchStartRef.current = { y: e.touches[0].clientY, scrollTop: getScrollTop() }
      pullDistanceRef.current = 0
      setPullDistance(0)
    }

    const onTouchMove = (e: TouchEvent) => {
      if (isDialogOpen()) return
      const start = touchStartRef.current
      if (!start || e.touches.length !== 1) return
      const currentY = e.touches[0].clientY
      const deltaY = currentY - start.y
      if (start.scrollTop <= 10 && deltaY > 0) {
        const distance = Math.min(deltaY * 0.6, 90)
        pullDistanceRef.current = distance
        setPullDistance(distance)
      }
    }

    const onTouchEnd = () => {
      if (isDialogOpen()) {
        touchStartRef.current = null
        pullDistanceRef.current = 0
        setPullDistance(0)
        return
      }
      if (pullDistanceRef.current >= PULL_THRESHOLD) {
        doHardRefresh()
      }
      touchStartRef.current = null
      pullDistanceRef.current = 0
      setPullDistance(0)
    }

    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: true })
    document.addEventListener('touchend', onTouchEnd, { capture: true })
    document.addEventListener('touchcancel', onTouchEnd, { capture: true })

    return () => {
      document.removeEventListener('touchstart', onTouchStart, { capture: true })
      document.removeEventListener('touchmove', onTouchMove, { capture: true })
      document.removeEventListener('touchend', onTouchEnd, { capture: true })
      document.removeEventListener('touchcancel', onTouchEnd, { capture: true })
    }
  }, [doHardRefresh])

  return (
    <div className={`relative ${className}`}>
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
