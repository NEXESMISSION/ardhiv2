import type { LabelHTMLAttributes, ReactNode } from 'react'

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: ReactNode
}

export function Label({ className = '', children, ...props }: LabelProps) {
  return (
    <label
      className={`block text-xs sm:text-sm font-medium text-gray-700 mb-0.5 sm:mb-1 ${className}`}
      {...props}
    >
      {children}
    </label>
  )
}


