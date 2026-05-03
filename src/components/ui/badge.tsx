import type { HTMLAttributes, ReactNode } from 'react'

// `secondary` and `danger` are kept as aliases for backward-compat with the
// many existing call sites that use those names. They map to `default` and
// `error` respectively. Same for the `lg` size alias.
type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'secondary' | 'danger'
type BadgeSize = 'sm' | 'md' | 'lg'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  size?: BadgeSize
  children: ReactNode
}

const variants: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-800',
  secondary: 'bg-gray-100 text-gray-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
}

const sizes: Record<BadgeSize, string> = {
  sm: 'px-1.5 sm:px-2 py-0.5 text-xs',
  md: 'px-2 sm:px-2.5 py-0.5 sm:py-1 text-xs sm:text-sm',
  lg: 'px-2.5 sm:px-3 py-1 text-sm sm:text-base',
}

export function Badge({
  variant = 'default',
  size = 'md',
  className = '',
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}

