import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'sm' | 'md'
}

const sizeClasses = {
  sm: 'h-9 px-3 text-[13px]',
  md: 'h-11 px-3.5 text-[14px]',
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = '', size = 'md', ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={`w-full rounded-xl border border-gray-200 bg-white ${sizeClasses[size]} text-gray-900 placeholder:text-gray-400 font-medium shadow-[0_1px_2px_rgba(15,23,42,0.04)]
        focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15 focus-visible:border-blue-500
        hover:border-gray-300
        disabled:opacity-60 disabled:bg-gray-50 disabled:cursor-not-allowed
        transition-colors ${className}`}
      {...props}
    />
  )
})
