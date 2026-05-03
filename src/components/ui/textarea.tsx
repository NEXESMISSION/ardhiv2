import type { TextareaHTMLAttributes } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: 'sm' | 'md'
}

const sizeClasses = {
  sm: 'px-3 py-2 text-[13px]',
  md: 'px-3.5 py-2.5 text-[14px]',
}

export function Textarea({ className = '', size = 'md', rows = 3, ...props }: TextareaProps) {
  return (
    <textarea
      className={`w-full rounded-xl border border-gray-200 bg-white ${sizeClasses[size]} text-gray-900 placeholder:text-gray-400 font-medium shadow-[0_1px_2px_rgba(15,23,42,0.04)]
        focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15 focus-visible:border-blue-500
        hover:border-gray-300
        disabled:opacity-60 disabled:bg-gray-50 disabled:cursor-not-allowed
        transition-colors resize-none ${className}`}
      rows={rows}
      {...props}
    />
  )
}
