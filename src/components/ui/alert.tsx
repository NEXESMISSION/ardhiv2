import type { HTMLAttributes, ReactNode } from 'react'

type AlertVariant = 'success' | 'error' | 'warning' | 'info'

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant
  children: ReactNode
}

const variants: Record<AlertVariant, { container: string; tile: string; icon: ReactNode }> = {
  success: {
    container: 'bg-gradient-to-b from-emerald-50 to-white border-emerald-200/80 text-emerald-900',
    tile: 'bg-emerald-100 text-emerald-600',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <path d="m9 11 3 3L22 4" />
      </svg>
    ),
  },
  error: {
    container: 'bg-gradient-to-b from-red-50 to-white border-red-200/80 text-red-900',
    tile: 'bg-red-100 text-red-600',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
    ),
  },
  warning: {
    container: 'bg-gradient-to-b from-amber-50 to-white border-amber-200/80 text-amber-900',
    tile: 'bg-amber-100 text-amber-600',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      </svg>
    ),
  },
  info: {
    container: 'bg-gradient-to-b from-blue-50 to-white border-blue-200/80 text-blue-900',
    tile: 'bg-blue-100 text-blue-600',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
    ),
  },
}

export function Alert({ variant = 'info', className = '', children, ...props }: AlertProps) {
  const v = variants[variant]
  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border px-3.5 py-3 text-[13px] sm:text-sm font-medium ${v.container} ${className}`}
      role="alert"
      {...props}
    >
      <span className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${v.tile}`}>
        <span className="w-4 h-4 sm:w-[18px] sm:h-[18px]">{v.icon}</span>
      </span>
      <div className="flex-1 min-w-0 leading-relaxed pt-1">{children}</div>
    </div>
  )
}
