import { useState, useEffect } from 'react'

export function DeadlineCountdown({ deadlineDate }: { deadlineDate: string | null }) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number
    hours: number
    minutes: number
    isOverdue: boolean
  } | null>(null)

  useEffect(() => {
    if (!deadlineDate) return

    const calculateTimeLeft = () => {
      const deadline = new Date(deadlineDate)
      const now = new Date()
      const diffMs = deadline.getTime() - now.getTime()
      
      const days = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60 * 24))
      const hours = Math.floor((Math.abs(diffMs) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((Math.abs(diffMs) % (1000 * 60 * 60)) / (1000 * 60))
      const isOverdue = diffMs < 0

      setTimeLeft({ days, hours, minutes, isOverdue })
    }

    calculateTimeLeft()
    const interval = setInterval(calculateTimeLeft, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [deadlineDate])

  if (!deadlineDate || !timeLeft) return null

  return (
    <div className={`inline-flex items-center gap-1 text-xs sm:text-sm font-medium ${timeLeft.isOverdue ? 'text-red-600' : 'text-orange-600'}`}>
      <span>{timeLeft.isOverdue ? '⚠️' : '⏰'}</span>
      <span>
        {timeLeft.isOverdue ? (
          `تجاوز الموعد بـ ${timeLeft.days} يوم و ${timeLeft.hours} ساعة و ${timeLeft.minutes} دقيقة`
        ) : (
          `متبقي: ${timeLeft.days} يوم و ${timeLeft.hours} ساعة و ${timeLeft.minutes} دقيقة`
        )}
      </span>
    </div>
  )
}

