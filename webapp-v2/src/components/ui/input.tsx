import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  size?: 'sm' | 'md'
}

const sizeClasses = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-2 text-sm',
}

export function Input({ className = '', size = 'md', ...props }: InputProps) {
  return (
    <input
      className={`w-full rounded-md border border-gray-300 ${sizeClasses[size]} shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-blue-500 ${className}`}
      {...props}
    />
  )
}

