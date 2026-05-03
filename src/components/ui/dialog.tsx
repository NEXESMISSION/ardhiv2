import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage } from '@/i18n/context'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  footer?: ReactNode
  /** If true, clicking the backdrop or pressing Escape will not close the dialog (use for destructive flows). */
  disableDismiss?: boolean
}

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-7xl',
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function Dialog({
  open,
  onClose,
  title,
  children,
  size = 'lg',
  footer,
  disableDismiss = false,
}: DialogProps) {
  const { t } = useLanguage()
  const containerRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

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

  useEffect(() => {
    if (!open) return
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) ?? null
    const node = containerRef.current
    if (!node) return
    const first = node.querySelector<HTMLElement>(FOCUSABLE)
    if (first) {
      first.focus()
    } else {
      node.focus()
    }
    return () => {
      previouslyFocusedRef.current?.focus?.()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !disableDismiss) {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const node = containerRef.current
      if (!node) return
      const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)
      if (focusables.length === 0) {
        e.preventDefault()
        node.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey) {
        if (active === first || !node.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, disableDismiss])

  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disableDismiss) return
    if (e.target === e.currentTarget) onClose()
  }

  // Render via portal so the dialog escapes any backdrop-filter / transform / overflow
  // ancestor that would otherwise create a containing block and clip `position: fixed`.
  return createPortal(
    <div
      data-modal="true"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[100] flex items-center justify-center safe-area-padding pwa-popup-safe-top pwa-popup-safe-bottom bg-slate-900/55 backdrop-blur-sm animate-fade-in"
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className={`
          bg-white rounded-2xl sm:rounded-3xl shadow-[0_24px_48px_-12px_rgba(15,23,42,0.30)] w-full ${sizes[size]}
          max-h-[88vh] sm:max-h-[85vh] flex flex-col animate-lift-in
          mx-3 my-4 sm:my-8 outline-none border border-gray-200/60 overflow-hidden
        `}
      >
        {/* Top accent strip */}
        <span className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 flex-shrink-0" />

        <div className="flex items-center justify-between px-4 sm:px-5 lg:px-6 py-3 sm:py-3.5 border-b border-gray-200/80 flex-shrink-0">
          <h2 className="text-[15px] sm:text-base lg:text-[17px] font-bold text-gray-900 truncate flex-1 pe-2 tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex-shrink-0 w-9 h-9 rounded-xl text-gray-500 hover:text-gray-800 hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-5 lg:px-6 py-3 sm:py-4 scrollbar-thin"
          style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
        >
          {children}
        </div>

        {footer && (
          <div className="px-4 sm:px-5 lg:px-6 py-3 sm:py-3.5 border-t border-gray-200/80 bg-gray-50/70 flex-shrink-0 flex justify-end items-center gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
