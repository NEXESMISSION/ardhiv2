import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void
  disabled?: boolean
  threshold?: number
}

export function PullToRefresh({ 
  onRefresh, 
  disabled = false,
  threshold = 80 
}: PullToRefreshProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const startY = useRef<number>(0)
  const currentY = useRef<number>(0)
  const pulling = useRef<boolean>(false)

  useEffect(() => {
    if (disabled) return

    const handleTouchStart = (e: TouchEvent) => {
      // Only trigger if at the top of the page
      if (window.scrollY > 10 || document.documentElement.scrollTop > 10) return

      const touch = e.touches[0]
      startY.current = touch.clientY
      currentY.current = touch.clientY
      pulling.current = true
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!pulling.current) return

      currentY.current = e.touches[0].clientY
      const deltaY = currentY.current - startY.current

      // Only allow pulling down
      if (deltaY > 0 && (window.scrollY === 0 || document.documentElement.scrollTop === 0)) {
        const distance = Math.min(deltaY / 2.5, threshold * 1.5)
        setPullDistance(distance)
      } else {
        setPullDistance(0)
        pulling.current = false
      }
    }

    const handleTouchEnd = async () => {
      if (!pulling.current) return

      pulling.current = false

      if (pullDistance >= threshold && !isRefreshing) {
        setIsRefreshing(true)
        setPullDistance(threshold)

        try {
          await onRefresh()
        } catch (error) {
          console.error('Pull to refresh error:', error)
        } finally {
          setIsRefreshing(false)
          // Animate back to 0
          setTimeout(() => setPullDistance(0), 300)
        }
      } else {
        setPullDistance(0)
      }
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [onRefresh, disabled, threshold, pullDistance, isRefreshing])

  if (pullDistance === 0 && !isRefreshing) return null

  const progress = Math.min((pullDistance / threshold) * 100, 100)
  const opacity = Math.min(pullDistance / threshold, 1)

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center pointer-events-none"
      style={{
        transform: `translateY(${Math.min(pullDistance - 40, threshold)}px)`,
        opacity,
        transition: pullDistance === 0 ? 'opacity 0.3s, transform 0.3s' : 'none',
      }}
    >
      <div className="flex flex-col items-center gap-2 bg-background/95 backdrop-blur-sm rounded-full px-4 py-3 shadow-lg">
        {isRefreshing ? (
          <RefreshCw className="h-5 w-5 text-primary animate-spin" />
        ) : (
          <RefreshCw 
            className="h-5 w-5 text-primary" 
            style={{ transform: `rotate(${progress * 2}deg)` }}
          />
        )}
        <div className="text-xs text-muted-foreground">
          {isRefreshing ? 'جاري التحديث...' : pullDistance >= threshold ? 'أفلت للتحديث' : 'اسحب للتحديث'}
        </div>
      </div>
    </div>
  )
}

