/**
 * EventCategoryModal — manage calendar event categories (create, edit, delete).
 * Completely isolated from Sentinel categories.
 */
'use client'

import { useState, FormEvent } from 'react'

interface EventCategory { id: string; name: string; color: string }

interface EventCategoryModalProps {
  categories: EventCategory[]
  onClose: () => void
  onChange: (updated: EventCategory[]) => void
}

export function EventCategoryModal({ categories, onClose, onChange }: EventCategoryModalProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/calendar/event-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      })
      if (!res.ok) throw new Error(await res.text())
      const created = await res.json()
      onChange([...categories, created])
      setName(''); setColor('#6366f1')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/calendar/event-categories/${id}`, { method: 'DELETE' })
      onChange(categories.filter(c => c.id !== id))
    } catch { /* silent */ }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-background border border-border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold">Calendar Categories</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
        </div>
        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {categories.length === 0 && <p className="text-sm text-muted-foreground">No categories yet.</p>}
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center gap-3">
              <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
              <span className="flex-1 text-sm font-medium">{cat.name}</span>
              <button onClick={() => handleDelete(cat.id)} className="text-xs text-destructive hover:underline">Delete</button>
            </div>
          ))}
          <form onSubmit={handleCreate} className="flex gap-2 pt-2 border-t border-border">
            <input
              required placeholder="New category name" value={name} onChange={e => setName(e.target.value)} maxLength={50}
              className="flex-1 rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm"
            />
            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-10 w-10 cursor-pointer rounded-lg border border-input p-0.5" />
            <button type="submit" disabled={saving} className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold disabled:opacity-50">
              {saving ? '…' : 'Add'}
            </button>
          </form>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  )
}
