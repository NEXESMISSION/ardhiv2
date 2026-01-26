import type { SelectHTMLAttributes, ReactNode } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode
}

export function Select({ className = '', children, ...props }: SelectProps) {
  return (
    <select
      className={`w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-blue-500 ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}

