import { useEffect, useState } from 'react'
import { Progress } from '@/components/ui/progress'
import { Loader2 } from 'lucide-react'

interface LoadingProgressProps {
  message?: string
  progress?: number
  showSpinner?: boolean
}

export function LoadingProgress({
  message = 'جاري التحميل...',
  progress,
  showSpinner = true,
}: LoadingProgressProps) {
  const [displayProgress, setDisplayProgress] = useState(0)

  useEffect(() => {
    if (progress !== undefined) {
      setDisplayProgress(progress)
    } else {
      // Simulate progress if not provided
      const interval = setInterval(() => {
        setDisplayProgress((prev) => {
          if (prev >= 90) return prev
          return prev + Math.random() * 10
        })
      }, 200)
      return () => clearInterval(interval)
    }
  }, [progress])

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      {showSpinner && (
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      )}
      <div className="text-center space-y-2">
        <p className="text-sm font-medium">{message}</p>
        {progress !== undefined && (
          <p className="text-xs text-muted-foreground">
            {Math.round(displayProgress)}%
          </p>
        )}
      </div>
      {progress !== undefined && (
        <div className="w-full max-w-xs">
          <Progress value={displayProgress} className="h-2" />
        </div>
      )}
    </div>
  )
}

interface LoadingStateProps {
  loading: boolean
  error: string | null
  onRetry?: () => void
  children: React.ReactNode
  loadingMessage?: string
  errorTitle?: string
}

export function LoadingState({
  loading,
  error,
  onRetry,
  children,
  loadingMessage,
  errorTitle = 'خطأ في التحميل',
}: LoadingStateProps) {
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingProgress message={loadingMessage} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-destructive font-medium">{errorTitle}</div>
          <p className="text-sm text-muted-foreground">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              إعادة المحاولة
            </button>
          )}
        </div>
      </div>
    )
  }

  return <>{children}</>
}

