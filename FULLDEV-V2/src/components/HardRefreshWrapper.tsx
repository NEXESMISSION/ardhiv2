import { useRef, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useLanguage } from '@/i18n/context'

// Must pull down this far (after dead zone) to trigger refresh - avoids slightest touch
const PULL_DEAD_ZONE = 25 // ignore small movements
const PULL_THRESHOLD = 95 // effective pull needed = dead zone + threshold (~120px real pull)
const SCROLL_TOP_MAX = 2 // only when truly at top

const MODAL_SELECTOR = '[data-modal="true"], [role="dialog"], [aria-modal="true"]'

/** Return true if any dialog/modal is open - do not refresh when true */
function isDialogOpen(): boolean {
  if (document.querySelector(MODAL_SELECTOR)) return true
  return Array.from(document.querySelectorAll('div')).some(
    (el) => el.classList?.contains('fixed') && el.classList?.contains('inset-0')
  )
}

/** True if the given element is inside any modal (use for touch target) */
function isInsideModal(el: EventTarget | null): boolean {
  if (!el || !(el instanceof Element)) return false
  return !!el.closest(MODAL_SELECTOR)
}

interface HardRefreshWrapperProps {
  children: ReactNode
  className?: string
}

/**
 * Pull-down to refresh - very deliberate: must be at top and pull down ~120px+.
 * No long-press. Disabled when any dialog/modal is open.
 */
export function HardRefreshWrapper({ children, className = '' }: HardRefreshWrapperProps) {
  const { t } = useLanguage()
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const touchStartRef = useRef<{ y: number; scrollTop: number } | null>(null)
  const pullDistanceRef = useRef(0)
  /** Remember if a dialog was open when this gesture started - never refresh for that gesture */
  const dialogOpenAtStartRef = useRef(false)

  const doHardRefresh = useCallback(() => {
    if (isRefreshing) return
    if (isDialogOpen()) return
    setIsRefreshing(true)
    window.location.reload()
  }, [isRefreshing])

  useEffect(() => {
    const getScrollTop = () => window.scrollY ?? document.documentElement.scrollTop ?? 0

    const onTouchStart = (e: TouchEvent) => {
      const dialogOpen = isDialogOpen()
      const touchedModal = isInsideModal(e.target)
      dialogOpenAtStartRef.current = dialogOpen || touchedModal
      if (dialogOpen || touchedModal) {
        touchStartRef.current = null
        pullDistanceRef.current = 0
        setPullDistance(0)
        return
      }
      if (e.touches.length !== 1) return
      touchStartRef.current = { y: e.touches[0].clientY, scrollTop: getScrollTop() }
      pullDistanceRef.current = 0
      setPullDistance(0)
    }

    const onTouchMove = (e: TouchEvent) => {
      if (dialogOpenAtStartRef.current || isDialogOpen()) return
      const start = touchStartRef.current
      if (!start || e.touches.length !== 1) return
      // Only count when user is really at top - avoids accidental trigger while scrolling
      if (start.scrollTop > SCROLL_TOP_MAX) return
      const currentY = e.touches[0].clientY
      const deltaY = currentY - start.y
      if (deltaY > PULL_DEAD_ZONE) {
        // Count only pull beyond dead zone, with reduced sensitivity
        const effectivePull = (deltaY - PULL_DEAD_ZONE) * 0.5
        const distance = Math.min(effectivePull, 100)
        pullDistanceRef.current = distance
        setPullDistance(distance)
      } else {
        pullDistanceRef.current = 0
        setPullDistance(0)
      }
    }

    const onTouchEnd = () => {
      if (dialogOpenAtStartRef.current || isDialogOpen()) {
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
            <span className="text-sm font-bold">{t('shared.releaseToRefresh')}</span>
          ) : (
            <span className="text-sm font-medium">{t('shared.pullToRefresh')}</span>
          )}
        </div>
      )}

      {isRefreshing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center safe-area-padding pwa-popup-safe-top pwa-popup-safe-bottom bg-white/90">
          <div className="flex flex-col items-center gap-3">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm font-semibold text-gray-800">{t('shared.updating')}</p>
          </div>
        </div>
      )}

      {children}
    </div>
  )
}
