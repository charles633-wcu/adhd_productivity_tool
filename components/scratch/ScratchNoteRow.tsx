'use client'

// ScratchNoteRow — a single Quick Notes line: checkbox, click-to-edit text,
// promote-to-/todos button, and delete. Fully controlled by ScratchPadSheet;
// keeps only transient inline-edit state locally.

import { useState } from 'react'
import { ArrowRight, Check, X } from 'lucide-react'
import type { ScratchNote } from '@/lib/db/schema'

interface Props {
  note: ScratchNote
  onToggle: (id: string, checked: boolean) => void
  onEdit: (id: string, content: string) => void
  onDelete: (id: string) => void
  onPromote: (id: string) => void
}

export function ScratchNoteRow({ note, onToggle, onEdit, onDelete, onPromote }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note.content)
  const checked = note.checked === 1

  function commit() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== note.content) onEdit(note.id, trimmed)
    else setDraft(note.content)
    setEditing(false)
  }

  return (
    <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onToggle(note.id, e.target.checked)}
        className="h-4 w-4 shrink-0 accent-primary"
      />

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') { setDraft(note.content); setEditing(false) }
          }}
          className="flex-1 rounded border border-input bg-background px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={[
            'flex-1 text-left text-sm break-words',
            checked ? 'line-through text-muted-foreground' : 'text-foreground',
          ].join(' ')}
        >
          {note.content}
        </button>
      )}

      {note.promotedTodoId ? (
        <span title="In your To-dos" className="shrink-0 text-xs text-primary/70 flex items-center gap-0.5">
          <Check className="h-3 w-3" /> To-do
        </span>
      ) : (
        <button
          type="button"
          aria-label="Promote to To-do"
          onClick={() => onPromote(note.id)}
          className="shrink-0 rounded px-1 py-0.5 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary transition-opacity flex items-center gap-0.5"
        >
          <ArrowRight className="h-3 w-3" /> To-do
        </button>
      )}

      <button
        type="button"
        aria-label="Delete note"
        onClick={() => onDelete(note.id)}
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
