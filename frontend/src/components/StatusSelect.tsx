import { STATUS_OPTIONS } from '../types'

interface StatusSelectProps {
  value: string
  onChange: (status: string) => void
  disabled?: boolean
}

export default function StatusSelect({ value, onChange, disabled }: StatusSelectProps) {
  const options = STATUS_OPTIONS.includes(value) ? STATUS_OPTIONS : [...STATUS_OPTIONS, value]
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  )
}
