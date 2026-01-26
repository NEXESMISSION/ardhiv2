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
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 lg:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in"
    >
      <div
        className={`
          bg-white rounded-lg sm:rounded-xl shadow-2xl w-full ${sizes[size]}
          h-[95vh] sm:h-[90vh] flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-4 lg:px-6 py-2 sm:py-3 lg:py-4 border-b border-gray-200">
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
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-6 py-2 sm:py-3 lg:py-4 scrollbar-thin">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 lg:py-4 border-t border-gray-200 bg-gray-50">{footer}</div>
        )}
      </div>
    </div>
  )
}

