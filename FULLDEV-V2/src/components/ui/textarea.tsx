import type { TextareaHTMLAttributes } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: 'sm' | 'md'
}

const sizeClasses = {
  sm: 'px-2 py-1 sm:py-1.5 text-base sm:text-xs',
  md: 'px-2.5 sm:px-3 py-1.5 sm:py-2 text-base sm:text-sm',
}

export function Textarea({ className = '', size = 'md', rows = 3, ...props }: TextareaProps) {
  return (
    <textarea
      className={`w-full rounded-md border border-gray-300 ${sizeClasses[size]} shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-blue-500 ${className}`}
      rows={rows}
      {...props}
    />
  )
}


