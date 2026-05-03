import type { ButtonHTMLAttributes, ReactNode } from 'react'

// `danger` kept as alias for `primary` styled red (used by destructive actions
// in SalesRecords). Prevents call sites from breaking when migrating styling.
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

const base =
  'inline-flex items-center justify-center rounded-xl font-bold transition-all focus-visible:outline-none focus-visible:ring-4 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none whitespace-nowrap'

const variants: Record<Variant, string> = {
  primary:
    'text-white bg-gradient-to-b from-blue-500 to-blue-600 border border-blue-700/60 shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_1px_2px_rgba(15,23,42,0.12),0_4px_12px_-2px_rgba(59,130,246,0.38)] hover:from-blue-500 hover:to-blue-700 hover:-translate-y-px hover:shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_2px_4px_rgba(15,23,42,0.14),0_8px_18px_-2px_rgba(59,130,246,0.5)] active:translate-y-0 active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] focus-visible:ring-blue-500/30',
  secondary:
    'bg-white text-gray-800 border border-gray-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-gray-50 hover:border-gray-300 focus-visible:ring-gray-400/30',
  ghost:
    'bg-transparent text-gray-700 border border-transparent hover:bg-gray-100 active:bg-gray-200 focus-visible:ring-gray-400/30',
  danger:
    'text-white bg-gradient-to-b from-red-500 to-red-600 border border-red-700/60 shadow-[0_1px_2px_rgba(15,23,42,0.12)] hover:from-red-500 hover:to-red-700 focus-visible:ring-red-500/30',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[13px]',
  md: 'h-11 px-5 text-[14px]',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
