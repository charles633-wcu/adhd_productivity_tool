'use client'

// ScratchPadSheet — compact, resizable floating panel for the Quick Notes pad.
// Loads notes from /api/scratch-notes on open and owns the list; each row is a
// controlled ScratchNoteRow. All mutations are optimistic and revert on failure.
// Mirrors ChatSheet's construction (fixed position, resize:both, does not fill window).

import { useEffect, useState, FormEvent } from 'react'
import { X } from 'lucide-react'
import { ScratchNoteRow } from '@/components/scratch/ScratchNoteRow'
import type { ScratchNote } from '@/lib/db/schema'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ScratchPadSheet({ open, onOpenChange }: Props) {
  const [notes, setNotes] = useState<ScratchNote[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Load notes whenever the panel opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch('/api/scratch-notes')
      .then(r => r.json())
      .then((data: ScratchNote[]) => { if (!cancelled) setNotes(data) })
      .catch(() => { if (!cancelled) setError('Could not load notes.') })
    return () => { cancelled = true }
  }, [open])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const content = input.trim()
    if (!content) return
    setInput('')
    setError(null)
    try {
      const res = await fetch('/api/scratch-notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error()
      const created = await res.json() as ScratchNote
      setNotes(prev => [...prev, created])
    } catch {
      setError('Could not add note.')
    }
  }

  async function patch(id: string, body: object) {
    const res = await fetch(`/api/scratch-notes/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error()
    return res.json() as Promise<ScratchNote>
  }

  function handleToggle(id: string, checked: boolean) {
    const prev = notes
    setNotes(notes.map(n => n.id === id ? { ...n, checked: checked ? 1 : 0 } : n))
    patch(id, { checked }).catch(() => { setNotes(prev); setError('Update failed.') })
  }

  function handleEdit(id: string, content: string) {
    const prev = notes
    setNotes(notes.map(n => n.id === id ? { ...n, content } : n))
    patch(id, { content }).catch(() => { setNotes(prev); setError('Update failed.') })
  }

  function handleDelete(id: string) {
    const prev = notes
    setNotes(notes.filter(n => n.id !== id))
    fetch(`/api/scratch-notes/${id}`, { method: 'DELETE' })
      .then(r => { if (!r.ok) throw new Error() })
      .catch(() => { setNotes(prev); setError('Delete failed.') })
  }

  function handlePromote(id: string) {
    const prev = notes
    setNotes(notes.map(n => n.id === id ? { ...n, promotedTodoId: 'pending' } : n))
    fetch(`/api/scratch-notes/${id}/promote`, { method: 'POST' })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((updated: ScratchNote) => setNotes(cur => cur.map(n => n.id === id ? updated : n)))
      .catch(() => { setNotes(prev); setError('Could not promote.') })
  }

  if (!open) return null

  return (
    <div
      style={{ width: 360, height: 460, minWidth: 300, minHeight: 360, maxWidth: 640, maxHeight: '80vh', resize: 'both', overflow: 'hidden' }}
      className="fixed bottom-24 right-4 z-[60] flex flex-col rounded-2xl border border-border bg-background shadow-[0_8px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <span className="text-sm font-semibold tracking-tight">Quick Notes</span>
        <button type="button" onClick={() => onOpenChange(false)} aria-label="Close notes" className="rounded-lg p-1.5 hover:bg-muted transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 min-h-0">
        {notes.length === 0 && (
          <p className="text-sm text-muted-foreground text-center mt-6 px-3">Jot anything — it stays here until you clear it.</p>
        )}
        {notes.map(n => (
          <ScratchNoteRow key={n.id} note={n} onToggle={handleToggle} onEdit={handleEdit} onDelete={handleDelete} onPromote={handlePromote} />
        ))}
      </div>

      <div className="shrink-0 border-t border-border px-3 pt-2.5 pb-3 space-y-2 bg-background/80">
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text" value={input} onChange={e => setInput(e.target.value)}
            placeholder="Add a note…"
            className="flex-1 rounded-xl border border-input bg-muted/40 px-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
          <button type="submit" disabled={!input.trim()} className="rounded-xl bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors">Add</button>
        </form>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  )
}
