import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function Card({ className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function CardHeader({ className = '', children, ...props }: CardHeaderProps) {
  return (
    <div className={`border-b border-gray-100 px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 lg:py-3 ${className}`} {...props}>
      {children}
    </div>
  )
}

interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  children: ReactNode
}

export function CardTitle({ className = '', children, ...props }: CardTitleProps) {
  return (
    <h2 className={`text-xs sm:text-sm lg:text-base font-semibold text-gray-900 ${className}`} {...props}>
      {children}
    </h2>
  )
}

interface CardContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function CardContent({ className = '', children, ...props }: CardContentProps) {
  return (
    <div className={`px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 lg:py-3 space-y-2 sm:space-y-2.5 lg:space-y-3 ${className}`} {...props}>
      {children}
    </div>
  )
}


