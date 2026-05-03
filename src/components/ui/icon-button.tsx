import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  // `secondary` kept as alias for `default` for backward-compat with call sites.
  variant?: 'default' | 'ghost' | 'danger' | 'secondary'
  size?: 'sm' | 'md'
}

const variants = {
  default: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  ghost: 'bg-transparent text-gray-600 hover:bg-gray-100',
  danger: 'bg-red-50 text-red-600 hover:bg-red-100',
}

const sizes = {
  sm: 'p-1.5',
  md: 'p-2',
}

export function IconButton({
  variant = 'default',
  size = 'md',
  className = '',
  children,
  ...props
}: IconButtonProps) {
  // If the caller passed a `title` but no explicit `aria-label`, reuse the
  // title as the screen-reader label. This silently upgrades hundreds of
  // existing call sites that only had hover-tooltips before.
  const ariaLabel = props['aria-label'] ?? (typeof props.title === 'string' ? props.title : undefined)

  // Dev-only nudge: warn when neither label nor title was supplied so new
  // buttons don't silently regress the a11y surface.
  if (import.meta.env.DEV) {
    const hasLabel = !!(ariaLabel || props['aria-labelledby'])
    if (!hasLabel) {
      // eslint-disable-next-line no-console
      console.warn(
        '[IconButton] Missing aria-label / title — screen readers will announce only "button". Add aria-label="..."'
      )
    }
  }
  return (
    <button
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

