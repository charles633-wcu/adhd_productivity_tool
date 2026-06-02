'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Pencil, Check, X } from 'lucide-react'

interface ProjectCircleProps {
  id: string
  title: string
  color: string | null
  childCount: number
  onRename?: (newTitle: string) => void
}

/**
 * ProjectCircle — a large colored bubble representing one project in the overview.
 * Tapping navigates to /heap/[id]. The pencil icon (hover) opens inline rename.
 */
export function ProjectCircle({ id, title, color, childCount, onRename }: ProjectCircleProps) {
  const accentColor = color ?? '#64748b'
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)

  function openEdit(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDraft(title)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 30)
  }

  function commitRename() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== title) onRename?.(trimmed)
    setEditing(false)
  }

  function cancelEdit() {
    setDraft(title)
    setEditing(false)
  }

  if (editing) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-full aspect-square w-40 border-4"
        style={{ borderColor: accentColor, background: `${accentColor}18` }}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') cancelEdit()
          }}
          maxLength={200}
          className="w-28 rounded bg-background/80 px-2 py-1 text-center text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          aria-label="Rename project"
        />
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Save name"
            onClick={commitRename}
            className="rounded-full bg-primary/20 p-1 hover:bg-primary/40 transition-colors"
          >
            <Check className="w-3.5 h-3.5 text-primary" />
          </button>
          <button
            type="button"
            aria-label="Cancel"
            onClick={cancelEdit}
            className="rounded-full bg-muted/40 p-1 hover:bg-muted/70 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group relative">
      <Link
        href={`/heap/${id}`}
        className="flex flex-col items-center justify-center gap-2 rounded-full aspect-square w-40 border-4 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary"
        style={{
          borderColor: accentColor,
          background: `${accentColor}18`,
          viewTransitionName: `project-${id}`,
        } as React.CSSProperties}
        aria-label={`Open project ${title}`}
      >
        <span className="text-sm font-semibold text-center px-3 leading-tight line-clamp-3 text-foreground">
          {title}
        </span>
        {childCount > 0 && (
          <span className="text-xs text-muted-foreground">{childCount} nodes</span>
        )}
      </Link>

      {/* Rename button — appears on hover */}
      {onRename && (
        <button
          type="button"
          aria-label="Rename project"
          onClick={openEdit}
          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 rounded-full bg-card/90 border border-border p-1.5 transition-opacity hover:bg-card shadow-sm"
        >
          <Pencil className="w-3 h-3 text-muted-foreground" />
        </button>
      )}
    </div>
  )
}
