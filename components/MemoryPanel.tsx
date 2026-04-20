'use client'

import { useEffect, useState } from 'react'
import type { Trigger } from '@/lib/db/schema'

interface MemoryPanelProps {
  trigger: Trigger
  onBack: () => void
  onUpdate: () => void
  startInAddNoteMode?: boolean
}

type Note = { id: string; date: string; text: string }

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function MemoryPanel({ trigger, onBack, onUpdate, startInAddNoteMode = false }: MemoryPanelProps) {
  const [localTrigger, setLocalTrigger] = useState(trigger)
  const meta = localTrigger.agentMetadata ?? {}
  const notes: Note[] = meta.notes ?? []
  const [error, setError] = useState<string | null>(null)
  const [addingNote, setAddingNote] = useState(startInAddNoteMode)
  const [newNoteText, setNewNoteText] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)

  const autoCompact = meta.autoCompact ?? false
  const lastRun = meta.lastAgentRun ? formatShortDate(meta.lastAgentRun) : null
  const sortedNotes = [...notes].reverse()

  useEffect(() => {
    setLocalTrigger(trigger)
  }, [trigger])

  useEffect(() => {
    setAddingNote(startInAddNoteMode)
  }, [startInAddNoteMode, trigger.id])

  async function request(url: string, method = 'POST', body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      let message = `Request failed: ${res.status}`
      try {
        const payload = await res.json() as { error?: string }
        if (payload.error) message = payload.error
      } catch {
        // Ignore invalid/non-JSON error bodies and keep the fallback message.
      }
      throw new Error(message)
    }
    return res.json() as Promise<Trigger>
  }

  async function handleAddNote() {
    const text = newNoteText.trim()
    if (!text) return
    setLoading('add')
    setError(null)
    try {
      const updated = await request(`/api/triggers/${localTrigger.id}/notes`, 'POST', { text })
      setLocalTrigger(updated)
      setNewNoteText('')
      setAddingNote(false)
      onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(null)
    }
  }

  function startEdit(note: Note) {
    setEditingNoteId(note.id)
    setEditingText(note.text)
  }

  async function saveEdit(noteId: string) {
    const text = editingText.trim()
    if (!text) return
    setLoading(`edit-${noteId}`)
    setError(null)
    try {
      const updated = await request(`/api/triggers/${localTrigger.id}/notes/${noteId}`, 'PATCH', { text })
      setLocalTrigger(updated)
      setEditingNoteId(null)
      setEditingText('')
      onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(null)
    }
  }

  async function handleDelete(noteId: string) {
    setLoading(`delete-${noteId}`)
    setError(null)
    try {
      const updated = await request(`/api/triggers/${localTrigger.id}/notes/${noteId}`, 'DELETE')
      setLocalTrigger(updated)
      setConfirmDeleteId(null)
      onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(null)
    }
  }

  async function handleResummarize() {
    setLoading('summarize')
    setError(null)
    try {
      const updated = await request(`/api/triggers/${localTrigger.id}/summarize`)
      setLocalTrigger(updated)
      onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(null)
    }
  }

  async function handleCompact() {
    setLoading('compact')
    setError(null)
    try {
      const updated = await request(`/api/triggers/${localTrigger.id}/compact`)
      setLocalTrigger(updated)
      onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(null)
    }
  }

  async function handleAutoCompactToggle() {
    setLoading('autoCompact')
    setError(null)
    try {
      const updated = await request(`/api/triggers/${localTrigger.id}`, 'PATCH', { autoCompact: !autoCompact })
      setLocalTrigger(updated)
      onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 pb-4 pt-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Details
          </button>
          <span className="text-border">|</span>
          <span className="text-sm font-semibold text-indigo-400">✦ Memory</span>
        </div>
        {lastRun && <span className="text-[10px] text-muted-foreground/60">last run: {lastRun}</span>}
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
        <section className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Review Notes</p>

          {sortedNotes.length === 0 && !addingNote && (
            <p className="text-xs italic text-muted-foreground/50">No notes yet.</p>
          )}

          {sortedNotes.map(note => (
            <div key={note.id} className="rounded-xl border border-border bg-muted/30 px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="mb-0.5 text-[10px] text-muted-foreground/60">{formatShortDate(note.date)}</p>
                  {editingNoteId === note.id ? (
                    <textarea
                      rows={2}
                      value={editingText}
                      onChange={e => setEditingText(e.target.value)}
                      className="w-full rounded-lg border border-input bg-background/70 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none"
                    />
                  ) : (
                    <p className="break-words text-xs leading-snug text-foreground">{note.text}</p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {editingNoteId === note.id ? (
                    <>
                      <button
                        type="button"
                        aria-label="save"
                        disabled={!editingText.trim() || loading === `edit-${note.id}`}
                        onClick={() => saveEdit(note.id)}
                        className="min-h-[44px] px-2 text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-40 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNoteId(null)
                          setEditingText('')
                        }}
                        className="min-h-[44px] px-2 text-xs text-muted-foreground"
                      >
                        Cancel
                      </button>
                    </>
                  ) : confirmDeleteId === note.id ? (
                    <>
                      <button
                        type="button"
                        aria-label="confirm"
                        disabled={loading === `delete-${note.id}`}
                        onClick={() => handleDelete(note.id)}
                        className="min-h-[44px] px-2 text-xs text-red-400 hover:text-red-300 disabled:opacity-40 transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="min-h-[44px] px-2 text-xs text-muted-foreground"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-label="edit"
                        onClick={() => startEdit(note)}
                        className="min-h-[44px] px-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        aria-label="delete"
                        onClick={() => setConfirmDeleteId(note.id)}
                        className="min-h-[44px] min-w-[44px] text-xs text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}

          {addingNote ? (
            <div className="space-y-2">
              <textarea
                autoFocus
                rows={2}
                value={newNoteText}
                onChange={e => setNewNoteText(e.target.value)}
                placeholder="New note..."
                className="w-full rounded-xl border border-input bg-muted/40 px-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAddingNote(false)
                    setNewNoteText('')
                  }}
                  className="min-h-[44px] flex-1 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  aria-label="save"
                  disabled={!newNoteText.trim() || loading === 'add'}
                  onClick={handleAddNote}
                  className="min-h-[44px] flex-[2] rounded-xl bg-indigo-500/15 text-sm font-semibold text-indigo-400 ring-1 ring-indigo-500/20 hover:bg-indigo-500/25 disabled:opacity-40 transition-colors"
                >
                  {loading === 'add' ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              aria-label="add note"
              onClick={() => setAddingNote(true)}
              className="min-h-[44px] w-full rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-indigo-400/40 hover:text-foreground transition-colors"
            >
              + Add note
            </button>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="auto-compact-toggle" className="cursor-pointer text-xs text-muted-foreground">
              Auto-compact after 8 notes
            </label>
            <input
              id="auto-compact-toggle"
              type="checkbox"
              role="checkbox"
              aria-label="auto-compact"
              checked={autoCompact}
              onChange={handleAutoCompactToggle}
              className="h-5 w-9 cursor-pointer accent-indigo-500"
            />
          </div>
          <button
            type="button"
            aria-label="compact now"
            disabled={notes.length < 2 || loading === 'compact'}
            onClick={handleCompact}
            className="min-h-[44px] w-full rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 transition-colors"
          >
            {loading === 'compact' ? 'Compacting...' : `Compact now${notes.length >= 2 ? ` (${notes.length} notes)` : ''}`}
          </button>
        </section>

        {meta.condensedHistory && (
          <section className="space-y-1.5">
            <button
              type="button"
              onClick={() => setHistoryOpen(open => !open)}
              className="flex min-h-[44px] w-full items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
            >
              <span>Condensed History</span>
              <span>{historyOpen ? '▲' : '▼'}</span>
            </button>
            {historyOpen && (
              <div className="space-y-1 rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                <p className="text-xs leading-relaxed text-muted-foreground">{meta.condensedHistory}</p>
                {lastRun && <p className="text-[10px] text-muted-foreground/40">compacted {lastRun}</p>}
              </div>
            )}
          </section>
        )}

        <section className="space-y-1.5">
          <div className="flex min-h-[44px] items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">AI Summary</p>
            <button
              type="button"
              aria-label="re-summarize"
              disabled={loading === 'summarize'}
              onClick={handleResummarize}
              className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-40 transition-colors"
            >
              {loading === 'summarize' ? 'Generating...' : '↻ Re-summarize'}
            </button>
          </div>
          {localTrigger.summary ? (
            <p className="text-xs leading-relaxed text-foreground">{localTrigger.summary}</p>
          ) : (
            <p className="text-xs italic text-muted-foreground/50">No summary yet.</p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {error}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
