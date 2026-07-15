import type { HTMLAttributes } from 'react'

export default function Badge({ className = '', ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 ${className}`}
      {...props}
    />
  )
}
