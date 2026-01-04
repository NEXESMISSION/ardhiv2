import { useEffect, useRef } from 'react'

interface UseSwipeGestureOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number
  minSwipeDistance?: number
  disabled?: boolean
}

export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
  minSwipeDistance = 50,
  disabled = false,
}: UseSwipeGestureOptions) {
  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const touchEndX = useRef<number>(0)
  const touchEndY = useRef<number>(0)

  useEffect(() => {
    if (disabled) return

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX
      touchStartY.current = e.touches[0].clientY
    }

    const handleTouchMove = (e: TouchEvent) => {
      touchEndX.current = e.touches[0].clientX
      touchEndY.current = e.touches[0].clientY
    }

    const handleTouchEnd = () => {
      if (!touchStartX.current || !touchEndX.current) return

      const deltaX = touchStartX.current - touchEndX.current
      const deltaY = touchStartY.current - touchEndY.current
      const absDeltaX = Math.abs(deltaX)
      const absDeltaY = Math.abs(deltaY)

      // Only trigger if horizontal swipe is more dominant than vertical
      if (absDeltaX > absDeltaY && absDeltaX > minSwipeDistance) {
        // Swipe left (start is more right than end) - swipe from right edge to left
        if (deltaX > 0 && onSwipeLeft) {
          // Check if swipe started near the right edge (within threshold)
          // This allows opening sidebar by swiping from right edge toward left
          if (touchStartX.current > window.innerWidth - threshold) {
            onSwipeLeft()
          }
        }
        // Swipe right (start is more left than end) - swipe from left to right
        else if (deltaX < 0 && onSwipeRight) {
          // Can be triggered anywhere, typically used to close sidebar
          onSwipeRight()
        }
      }

      // Reset
      touchStartX.current = 0
      touchStartY.current = 0
      touchEndX.current = 0
      touchEndY.current = 0
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [onSwipeLeft, onSwipeRight, threshold, minSwipeDistance, disabled])
}

