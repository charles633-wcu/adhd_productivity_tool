'use client'

import { useState, useEffect, FormEvent } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

// QuickAddForm — slide-over panel for adding a new trigger.
// Apple-like design: clean label hierarchy, segmented priority control, sticky footer.
// Fires POST /api/triggers, then POSTs /api/summarize async (fire-and-forget).
// Priority mapping: 3 = Low (green), 2 = Medium (yellow), 1 = High (rose), 0 = Very High (red glow)
interface QuickAddFormProps {
  categories: Array<{ id: string; name: string }>
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

// Priority options ordered Low → Very High (left to right)
const PRIORITY_OPTIONS = [
  {
    value: 3,
    label: 'Low',
    activeClass: 'bg-emerald-500/20 text-emerald-300',
    dotClass: 'bg-emerald-400',
  },
  {
    value: 2,
    label: 'Medium',
    activeClass: 'bg-yellow-500/20 text-yellow-300',
    dotClass: 'bg-yellow-400',
  },
  {
    value: 1,
    label: 'High',
    activeClass: 'bg-rose-500/20 text-rose-300',
    dotClass: 'bg-rose-400',
  },
  {
    value: 0,
    label: 'Very High',
    activeClass: 'bg-red-500/20 text-red-300',
    dotClass: 'bg-red-400',
    activeStyle: { boxShadow: '0 0 12px oklch(0.55 0.22 25 / 0.35)' },
  },
] as const


export function QuickAddForm({ categories, open, onOpenChange, onSuccess }: QuickAddFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [categoryName, setCategoryName] = useState(categories[0]?.name ?? '')
  const [pendingCategoryCreate, setPendingCategoryCreate] = useState<string | null>(null)
  const [priority, setPriority] = useState(2)
  const [intervalDays, setIntervalDays] = useState(7)
  // intervalTyping: true when the user has clicked the value label to type directly
  const [intervalTyping, setIntervalTyping] = useState(false)
  const [intervalInput,  setIntervalInput]  = useState('')
  const [fullContent, setFullContent] = useState('')

  // A-003: Reset all fields to defaults when the sheet closes so the next open is clean
  useEffect(() => {
    if (!open) {
      setTitle('')
      setCategoryName(categories[0]?.name ?? '')
      setPendingCategoryCreate(null)
      setPriority(2)
      setIntervalDays(7)
      setIntervalTyping(false)
      setIntervalInput('')
      setFullContent('')
      setError(null)
    }
  }, [open, categories])

  // Resolve a typed category name to an existing category using case-insensitive exact matching.
  function findExistingCategory(name: string) {
    const normalized = name.trim().toLowerCase()
    return categories.find(category => category.name.trim().toLowerCase() === normalized) ?? null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmedCategoryName = categoryName.trim()
    const existingCategory = findExistingCategory(trimmedCategoryName)

    if (!existingCategory && trimmedCategoryName) {
      if (pendingCategoryCreate !== trimmedCategoryName) {
        setPendingCategoryCreate(trimmedCategoryName)
        return
      }
    }

    setLoading(true)
    try {
      let resolvedCategoryId = existingCategory?.id ?? ''

      if (!resolvedCategoryId) {
        const categoryRes = await fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmedCategoryName }),
        })
        if (!categoryRes.ok) throw new Error('Failed to create category')
        const createdCategory = await categoryRes.json()
        resolvedCategoryId = createdCategory.id
      }

      const res = await fetch('/api/triggers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: resolvedCategoryId,
          title,
          fullContent,
          priority,
          reviewIntervalDays: intervalDays,
        }),
      })
      if (!res.ok) throw new Error('Failed to save trigger')
      const trigger = await res.json()

      // Await summarization if content is long enough — so the summary is in the DB
      // before router.refresh() runs and the card re-renders with the result.
      if (fullContent.trim().length > 100) {
        try {
          await fetch('/api/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ triggerId: trigger.id, content: fullContent }),
          })
        } catch {
          // Ignore — trigger stays in 'pending' state, user can retry from Details
        }
      }

      // Reset form and close
      setTitle('')
      setFullContent('')
      setPriority(2)
      setIntervalDays(7)
      setCategoryName(categories[0]?.name ?? '')
      setPendingCategoryCreate(null)
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* p-0 so we own all padding; flex flex-col for sticky footer */}
      <SheetContent side="right" className="w-full sm:max-w-[420px] p-0 flex flex-col gap-0">

        {/* ── Header ─────────────────────────────────────────── */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <SheetTitle className="text-base font-semibold tracking-tight">New Trigger</SheetTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add something to your intelligence layer
          </p>
        </SheetHeader>

        {/* ── Scrollable body ─────────────────────────────────── */}
        <form
          id="qaf-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-6 py-6 space-y-6"
        >
          {/* Title */}
          <fieldset className="space-y-1.5">
            <label
              htmlFor="qaf-title"
              className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
            >
              Title *
            </label>
            <input
              id="qaf-title"
              type="text"
              required
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What do you need to review?"
              className="w-full rounded-xl border border-input bg-muted/40 px-4 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"
            />
          </fieldset>

          {/* Category */}
          <fieldset className="space-y-1.5">
            <label
              htmlFor="qaf-category"
              className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
            >
              Category *
            </label>
            <input
              id="qaf-category"
              type="text"
              required
              list="qaf-category-options"
              value={categoryName}
              onChange={e => {
                setCategoryName(e.target.value)
                setPendingCategoryCreate(null)
              }}
              placeholder="Choose or type a category"
              className="w-full rounded-xl border border-input bg-muted/40 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"
            />
            <datalist id="qaf-category-options">
              {categories.map(cat => (
                <option key={cat.id} value={cat.name} />
              ))}
            </datalist>
            {pendingCategoryCreate && (
              <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 space-y-3">
                <p className="text-sm text-foreground">
                  Create new category "{pendingCategoryCreate}"?
                </p>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    form="qaf-form"
                    className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Create category and save
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingCategoryCreate(null)}
                    className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </fieldset>

          {/* Priority — segmented control */}
          <fieldset className="space-y-2">
            <legend className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Priority
            </legend>
            <div className="flex rounded-xl border border-border overflow-hidden">
              {PRIORITY_OPTIONS.map((p, i) => {
                const isActive = priority === p.value
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className={[
                      'flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-all',
                      i > 0 ? 'border-l border-border' : '',
                      isActive ? p.activeClass : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
                    ].join(' ')}
                    style={isActive && 'activeStyle' in p ? p.activeStyle : undefined}
                  >
                    {/* Color dot indicator */}
                    <span
                      className={`w-1.5 h-1.5 rounded-full transition-opacity ${p.dotClass} ${isActive ? 'opacity-100' : 'opacity-30'}`}
                    />
                    {p.label}
                  </button>
                )
              })}
            </div>
          </fieldset>

          {/* Review interval — slider with click-to-type value */}
          <fieldset className="space-y-2">
            <legend className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Review Interval
            </legend>
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={30}
                  value={intervalDays}
                  onChange={e => setIntervalDays(Number(e.target.value))}
                  className="flex-1 h-1.5 accent-primary cursor-pointer"
                />
                {intervalTyping ? (
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={intervalInput}
                    autoFocus
                    onChange={e => setIntervalInput(e.target.value)}
                    onBlur={() => {
                      const v = Math.max(0, Math.min(30, parseInt(intervalInput, 10) || 0))
                      setIntervalDays(v)
                      setIntervalTyping(false)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const v = Math.max(0, Math.min(30, parseInt(intervalInput, 10) || 0))
                        setIntervalDays(v)
                        setIntervalTyping(false)
                      }
                      if (e.key === 'Escape') setIntervalTyping(false)
                    }}
                    className="w-12 text-center rounded-lg border border-input bg-muted/40 px-1 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/50"
                  />
                ) : (
                  <button
                    type="button"
                    title="Click to type a value"
                    onClick={() => { setIntervalTyping(true); setIntervalInput(String(intervalDays)) }}
                    className="w-12 text-center rounded-lg border border-transparent hover:border-input hover:bg-muted/40 px-1 py-1 text-sm font-mono text-foreground transition-colors"
                  >
                    {intervalDays}
                  </button>
                )}
                <span className="text-xs text-muted-foreground shrink-0 w-7">
                  {intervalDays === 1 ? 'day' : 'days'}
                </span>
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground/40 px-0.5">
                <span>0</span>
                <span>15</span>
                <span>30</span>
              </div>
            </div>
          </fieldset>

          {/* Notes / full content */}
          <fieldset className="space-y-1.5">
            <label
              htmlFor="qaf-content"
              className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
            >
              Notes
            </label>
            <textarea
              id="qaf-content"
              value={fullContent}
              onChange={e => setFullContent(e.target.value)}
              rows={4}
              placeholder="Optional context — used by AI to generate a summary"
              className="w-full rounded-xl border border-input bg-muted/40 px-4 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow resize-none"
            />
          </fieldset>

          {/* Submission error */}
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </form>

        {/* ── Sticky footer ───────────────────────────────────── */}
        <div className="shrink-0 px-6 py-4 border-t border-border bg-background/60 backdrop-blur-sm">
          <button
            type="submit"
            form="qaf-form"
            disabled={loading}
            className="w-full rounded-xl bg-primary text-primary-foreground px-4 py-3 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.98]"
          >
            {loading ? 'Saving…' : 'Save Trigger'}
          </button>
        </div>

      </SheetContent>
    </Sheet>
  )
}
