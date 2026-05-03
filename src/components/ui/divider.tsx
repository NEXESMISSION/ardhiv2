import type { HTMLAttributes } from 'react'

interface DividerProps extends HTMLAttributes<HTMLDivElement> {
  label?: string
}

export function Divider({ label, className = '', ...props }: DividerProps) {
  if (label) {
    return (
      <div className={`flex items-center gap-3 ${className}`} {...props}>
        <div className="flex-1 border-t border-gray-200"></div>
        <span className="text-sm text-gray-500">{label}</span>
        <div className="flex-1 border-t border-gray-200"></div>
      </div>
    )
  }

  return <div className={`border-t border-gray-200 ${className}`} {...props} />
}

