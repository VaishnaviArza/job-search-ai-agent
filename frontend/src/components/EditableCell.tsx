import { useEffect, useRef, useState } from 'react'

interface EditableCellProps {
  value: string
  placeholder?: string
  disabled?: boolean
  onSave: (value: string) => void | Promise<void>
}

export default function EditableCell({ value, placeholder = 'Unknown', disabled, onSave }: EditableCellProps) {
  const isUnknown = value.trim().toLowerCase() === 'unknown' || !value.trim()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(isUnknown ? '' : value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => setDraft(isUnknown ? '' : value), [value]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  async function commit() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) await onSave(trimmed)
  }

  function cancel() {
    setDraft(isUnknown ? '' : value)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') cancel()
        }}
        className="border border-indigo-300 rounded px-1.5 py-0.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-200"
      />
    )
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setEditing(true)}
      className={`text-left w-full rounded px-1.5 py-0.5 -mx-1.5 hover:bg-gray-100 disabled:hover:bg-transparent disabled:cursor-default ${
        isUnknown ? 'text-gray-400 italic' : ''
      }`}
    >
      {isUnknown ? placeholder : value}
    </button>
  )
}
