/**
 * CategoryPicker — shared category selector used wherever a calendar event's
 * category is chosen (add-event form, edit sheet). Renders a scrollable
 * black-background list where each option shows a colored dot + name for
 * visibility, plus an inline "Add new category" affordance with a color picker.
 *
 * It is intentionally NOT a <form> (it's embedded inside other forms), so the
 * create action is a button + Enter handler rather than a form submit.
 */
'use client'

import { useState } from 'react'
import { Check, Plus } from 'lucide-react'

export interface PickerCategory {
  id: string
  name: string
  color: string
}

interface CategoryPickerProps {
  categories: PickerCategory[]
  value: string // selected category id, '' = none
  onChange: (id: string) => void
  onCategoryCreated: (category: PickerCategory) => void
  allowNone?: boolean
}

// Quick-pick swatches for new categories (plus a custom color input).
const SWATCHES = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#3b82f6', '#ec4899', '#14b8a6', '#f97316', '#84cc16']

export function CategoryPicker({ categories, value, onChange, onCategoryCreated, allowNone = true }: CategoryPickerProps) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(SWATCHES[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function createCategory() {
    if (!newName.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/calendar/event-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      })
      if (!res.ok) throw new Error(await res.text())
      const created = (await res.json()) as PickerCategory
      onCategoryCreated(created)
      onChange(created.id)
      setAdding(false)
      setNewName('')
      setNewColor(SWATCHES[0])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create category')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Category</label>
      <div data-testid="category-picker" className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-black p-1">
        {allowNone && (
          <CategoryRow selected={value === ''} color="transparent" label="No category" muted onClick={() => onChange('')} />
        )}
        {categories.map(c => (
          <CategoryRow key={c.id} selected={value === c.id} color={c.color} label={c.name} onClick={() => onChange(c.id)} />
        ))}

        {!adding && (
          <button
            type="button"
            data-testid="category-add-toggle"
            onClick={() => setAdding(true)}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-white/5"
          >
            <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-white/40">
              <Plus className="h-2.5 w-2.5" />
            </span>
            Add new category
          </button>
        )}
      </div>

      {/* Inline create form — rendered below the scroller so the color picker
          and buttons are never clipped by the list's max-height. */}
      {adding && (
        <div data-testid="category-add-form" className="mt-1.5 space-y-2 rounded-lg border border-border bg-black p-2">
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void createCategory() } }}
            maxLength={50}
            placeholder="Category name"
            aria-label="New category name"
            className="w-full rounded-md border border-input bg-black/60 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {SWATCHES.map(s => (
              <button
                key={s}
                type="button"
                aria-label={`Pick color ${s}`}
                onClick={() => setNewColor(s)}
                style={{ backgroundColor: s }}
                className={`h-5 w-5 rounded-full transition-transform ${newColor === s ? 'scale-110 ring-2 ring-white ring-offset-1 ring-offset-black' : ''}`}
              />
            ))}
            <label className="relative h-5 w-5 cursor-pointer overflow-hidden rounded-full border border-white/30" aria-label="Custom color">
              <input
                type="color"
                value={newColor}
                onChange={e => setNewColor(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              <span className="block h-full w-full" style={{ background: 'conic-gradient(red,orange,yellow,lime,cyan,blue,magenta,red)' }} />
            </label>
          </div>
          {error && <p className="text-[11px] text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setAdding(false); setError(null) }}
              className="flex-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void createCategory()}
              disabled={saving || !newName.trim()}
              className="flex-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {saving ? '…' : 'Create'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// One selectable row: colored dot + name, with a check when selected.
function CategoryRow({ selected, color, label, muted, onClick }: {
  selected: boolean
  color: string
  label: string
  muted?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors ${selected ? 'bg-white/10' : 'hover:bg-white/5'}`}
    >
      <span
        className={`h-3.5 w-3.5 shrink-0 rounded-full ${muted ? 'ring-1 ring-inset ring-white/40' : ''}`}
        style={{ backgroundColor: color }}
      />
      <span className={`flex-1 truncate ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>{label}</span>
      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-foreground/70" aria-hidden="true" />}
    </button>
  )
}
