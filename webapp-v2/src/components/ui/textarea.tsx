import type { TextareaHTMLAttributes } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: 'sm' | 'md'
}

const sizeClasses = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-2 text-sm',
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

