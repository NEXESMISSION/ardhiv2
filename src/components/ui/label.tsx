import type { LabelHTMLAttributes, ReactNode } from 'react'

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: ReactNode
}

export function Label({ className = '', children, ...props }: LabelProps) {
  if (import.meta.env.DEV && !props.htmlFor) {
    // eslint-disable-next-line no-console
    console.warn(
      '[Label] Missing htmlFor — clicking the label won\'t focus the matching input and screen readers will announce nothing. Add htmlFor="<input-id>".'
    )
  }
  return (
    <label
      className={`block text-[12.5px] sm:text-[13px] font-bold text-gray-700 mb-1.5 tracking-tight ${className}`}
      {...props}
    >
      {children}
    </label>
  )
}
