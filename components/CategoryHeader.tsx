'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

// CategoryHeader — sticky header for the category page.
// Shows icon + name, and a pencil button that opens an edit sheet to change color/icon.
// Calls PATCH /api/categories/[id] on save, then router.refresh() to update the UI.

interface CategoryHeaderProps {
  id: string
  name: string
  icon: string | null
  color: string | null
}

const COLOR_SWATCHES = [
  '#FF6B6B', '#FF9500', '#F59E0B', '#84CC16',
  '#10B981', '#14B8A6', '#3B82F6', '#8B5CF6',
  '#EC4899', '#F43F5E', '#A78BFA', '#6366F1',
]

export function CategoryHeader({ id, name, icon, color }: CategoryHeaderProps) {
  const router = useRouter()
  const [editOpen,       setEditOpen]       = useState(false)
  const [editColor,      setEditColor]      = useState(color ?? '#6366f1')
  const [editIcon,       setEditIcon]       = useState(icon  ?? '')
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [confirmDelete,  setConfirmDelete]  = useState(false)
  const [deleteLoading,  setDeleteLoading]  = useState(false)

  // Re-sync local state when props change (e.g. after a refresh)
  function openEdit() {
    setEditColor(color ?? '#6366f1')
    setEditIcon(icon  ?? '')
    setError(null)
    setConfirmDelete(false)
    setEditOpen(true)
  }

  async function handleDelete() {
    setDeleteLoading(true)
    try {
      await fetch(`/api/categories/${id}`, { method: 'DELETE' })
      router.push('/')
    } finally {
      setDeleteLoading(false)
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color: editColor, icon: editIcon || undefined }),
      })
      if (!res.ok) throw new Error('Failed to update category')
      setEditOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const displayIcon  = editOpen ? (editIcon  || '📌') : (icon  || '📌')
  const displayColor = editOpen ? editColor            : (color ?? '#6366f1')

  return (
    <>
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
        <a
          href="/"
          className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          ← back
        </a>
        <span className="text-muted-foreground/30">/</span>

        {/* Coloured circle mini-preview */}
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-sm"
          style={{ backgroundColor: displayColor, boxShadow: `0 2px 8px ${displayColor}60` }}
        >
          {displayIcon}
        </div>

        <h1 className="text-lg font-bold leading-none flex-1 min-w-0 truncate">{name}</h1>

        {/* Edit button */}
        <button
          type="button"
          onClick={openEdit}
          aria-label="Edit category"
          className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
        >
          <Pencil className="h-3 w-3" aria-hidden="true" />
          Edit
        </button>
      </div>

      {/* ── Edit sheet ──────────────────────────────────────────────────────── */}
      <Sheet open={editOpen} onOpenChange={open => { setEditOpen(open); if (!open) setError(null) }}>
        <SheetContent side="right" className="w-full sm:max-w-sm p-0 flex flex-col gap-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
            <SheetTitle className="text-base font-semibold tracking-tight">Edit Category</SheetTitle>
          </SheetHeader>

          <form id="cat-edit-form" onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-6 space-y-6">

            {/* Color swatches */}
            <div className="space-y-2">
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Color
              </label>
              <div className="grid grid-cols-6 gap-2">
                {COLOR_SWATCHES.map(swatch => (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => setEditColor(swatch)}
                    className="relative h-8 w-full rounded-full transition-transform hover:scale-110 active:scale-95 focus:outline-none"
                    style={{ backgroundColor: swatch }}
                    aria-label={swatch}
                  >
                    {editColor === swatch && (
                      <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold drop-shadow-sm">✓</span>
                    )}
                  </button>
                ))}
              </div>
              {/* Custom hex fallback */}
              <div className="flex items-center gap-2 pt-0.5">
                <input
                  type="color"
                  value={editColor}
                  onChange={e => setEditColor(e.target.value)}
                  className="h-7 w-10 cursor-pointer rounded-md border border-input bg-transparent p-0.5 shrink-0"
                />
                <span className="text-xs font-mono text-muted-foreground">{editColor}</span>
              </div>
            </div>

            {/* Icon */}
            <div className="space-y-1.5">
              <label htmlFor="cat-edit-icon" className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Icon <span className="normal-case tracking-normal font-normal text-muted-foreground/70">(emoji)</span>
              </label>
              <input
                id="cat-edit-icon"
                type="text"
                maxLength={4}
                placeholder="📌"
                value={editIcon}
                onChange={e => setEditIcon(e.target.value)}
                className="w-full rounded-xl border border-input bg-muted/40 px-4 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"
              />
            </div>

            {/* Live preview */}
            <div className="flex flex-col items-center gap-2 py-2">
              <div
                className="w-20 h-20 rounded-full flex flex-col items-center justify-center relative overflow-hidden"
                style={{
                  backgroundColor: editColor,
                  boxShadow: `0 4px 20px ${editColor}55`,
                }}
              >
                <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.22) 0%, transparent 60%)' }} />
                <span className="text-2xl relative z-10">{editIcon || '📌'}</span>
                <span className="relative z-10 text-[9px] font-semibold text-white/90 px-1 text-center leading-tight">
                  {name.length > 10 ? `${name.slice(0, 9)}…` : name}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">preview</span>
            </div>

            {error && (
              <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </form>

          {/* Sticky footer */}
          <div className="shrink-0 px-6 py-4 border-t border-border bg-background/60 backdrop-blur-sm space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="flex-1 rounded-xl border border-border px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="cat-edit-form"
                disabled={loading}
                className="flex-1 rounded-xl bg-primary text-primary-foreground px-3 py-3 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.98]"
              >
                {loading ? 'Saving…' : 'Save'}
              </button>
            </div>

            {/* Delete category — two-step confirm */}
            {confirmDelete ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  className="flex-1 rounded-xl bg-destructive/90 text-white px-3 py-2.5 text-sm font-semibold hover:bg-destructive disabled:opacity-50 transition-all"
                >
                  {deleteLoading ? 'Deleting…' : 'Delete everything'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-destructive/20 px-3 py-2.5 text-sm font-medium text-destructive/70 hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Delete category
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
