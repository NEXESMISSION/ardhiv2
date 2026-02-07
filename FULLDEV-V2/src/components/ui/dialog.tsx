import { useEffect, type ReactNode } from 'react'
import { IconButton } from './icon-button'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  footer?: ReactNode
}

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-7xl',
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  size = 'lg',
  footer,
}: DialogProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null

  return (
    <div
      data-modal="true"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center safe-area-padding pwa-popup-safe-top pwa-popup-safe-bottom bg-black/50 backdrop-blur-sm animate-in fade-in"
    >
      <div
        className={`
          bg-white rounded-lg sm:rounded-xl shadow-2xl w-full ${sizes[size]}
          max-h-[85vh] sm:max-h-[82vh] flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4
          my-6 sm:my-8
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-4 lg:px-6 py-2 sm:py-3 lg:py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-sm sm:text-base lg:text-xl font-semibold text-gray-900 truncate flex-1 pr-2">{title}</h2>
          <IconButton variant="ghost" size="sm" onClick={onClose} aria-label="إغلاق" className="flex-shrink-0 p-1.5 sm:p-2">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </IconButton>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-6 py-2 sm:py-3 lg:py-4 scrollbar-thin" style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}>{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 lg:py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0 flex justify-center items-center gap-2">{footer}</div>
        )}
      </div>
    </div>
  )
}

