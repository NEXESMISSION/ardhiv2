import { useState, useEffect } from 'react'
import { useLanguage } from '@/i18n/context'
import { replaceVars } from '@/utils/replaceVars'

export function DeadlineCountdown({ deadlineDate }: { deadlineDate: string | null }) {
  const { t } = useLanguage()
  const [timeLeft, setTimeLeft] = useState<{
    days: number
    hours: number
    minutes: number
    isOverdue: boolean
  } | null>(null)

  useEffect(() => {
    if (!deadlineDate) return

    const calculateTimeLeft = () => {
      // Parse "YYYY-MM-DD" as local end-of-day so a deadline picked for today
      // means "any time before midnight tonight (local time)", not 00:00 UTC.
      // Using `new Date(deadlineDate)` would treat the string as UTC midnight,
      // which makes a "today" deadline appear instantly overdue for any user
      // in a non-UTC timezone or any time after their local midnight.
      const ymd = deadlineDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
      const deadline = ymd
        ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 23, 59, 59, 999)
        : new Date(deadlineDate)
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
        {replaceVars(
          t(timeLeft.isOverdue ? 'deadline.overdue' : 'deadline.remaining'),
          { days: timeLeft.days, hours: timeLeft.hours, minutes: timeLeft.minutes }
        )}
      </span>
    </div>
  )
}

