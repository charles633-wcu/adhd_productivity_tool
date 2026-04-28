'use client'
// AddTodoInput — quick-add bar at the top of the task list.
// Submits on Enter; clears after submit; ignores empty input.
import { useState, KeyboardEvent } from 'react'
import { Plus } from 'lucide-react'

interface AddTodoInputProps {
  onAdd: (title: string) => void
}

export function AddTodoInput({ onAdd }: AddTodoInputProps) {
  const [value, setValue] = useState('')

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && value.trim()) {
      onAdd(value.trim())
      setValue('')
    }
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
      <Plus className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a task..."
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}
