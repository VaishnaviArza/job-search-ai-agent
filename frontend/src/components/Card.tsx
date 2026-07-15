import type { HTMLAttributes } from 'react'

export default function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-white border border-gray-200 rounded-xl p-6 shadow-sm ${className}`}
      {...props}
    />
  )
}
