'use client'

import { useState, FormEvent } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

// QuickAddForm — slide-over panel for adding a new trigger.
// Fires POST /api/triggers, then POSTs /api/summarize async (fire-and-forget).
// Calls onSuccess() so the parent can refetch category counts.
interface QuickAddFormProps {
  categories: Array<{ id: string; name: string }>
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function QuickAddForm({ categories, open, onOpenChange, onSuccess }: QuickAddFormProps) {
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [priority, setPriority] = useState(2)
  const [intervalDays, setIntervalDays] = useState(7)
  const [fullContent, setFullContent] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/triggers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId,
          title,
          fullContent,
          priority,
          reviewIntervalDays: intervalDays,
        }),
      })
      if (!res.ok) throw new Error('Failed to save trigger')
      const trigger = await res.json()

      // Fire summarization async — don't block the UI
      if (fullContent.trim()) {
        fetch('/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ triggerId: trigger.id, content: fullContent }),
        }).catch(() => {
          // Ignore summarization errors — trigger stays in 'pending' state
        })
      }

      // Reset form and close
      setTitle('')
      setFullContent('')
      setPriority(2)
      setIntervalDays(7)
      onOpenChange(false)
      onSuccess()
    } catch {
      // Keep form open on error so user can retry
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add Trigger</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Title */}
          <div className="space-y-1">
            <label htmlFor="qaf-title" className="text-sm font-medium">Title *</label>
            <input
              id="qaf-title"
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="What do you need to review?"
            />
          </div>

          {/* Category */}
          <div className="space-y-1">
            <label htmlFor="qaf-category" className="text-sm font-medium">Category *</label>
            <select
              id="qaf-category"
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div className="space-y-1">
            <span className="text-sm font-medium">Priority</span>
            <div className="flex gap-2">
              {[
                { value: 0, label: 'P0', className: 'bg-red-100 text-red-700 border-red-200' },
                { value: 1, label: 'P1', className: 'bg-orange-100 text-orange-700 border-orange-200' },
                { value: 2, label: 'P2', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
                { value: 3, label: 'P3', className: 'bg-gray-100 text-gray-600 border-gray-200' },
              ].map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold transition-opacity ${p.className} ${priority === p.value ? 'opacity-100 ring-2 ring-offset-1 ring-current' : 'opacity-50'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Review interval */}
          <div className="space-y-1">
            <span className="text-sm font-medium">Review every</span>
            <div className="flex gap-2">
              {[7, 14, 30].map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setIntervalDays(d)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-opacity ${intervalDays === d ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border opacity-60'}`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {/* Full content */}
          <div className="space-y-1">
            <label htmlFor="qaf-content" className="text-sm font-medium">Full content</label>
            <textarea
              id="qaf-content"
              value={fullContent}
              onChange={e => setFullContent(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              placeholder="Optional — detailed notes for this trigger"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Saving…' : 'Save Trigger'}
          </button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
