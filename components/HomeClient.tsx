'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { QuickAddForm } from '@/components/QuickAddForm'

// HomeClient — client-side header actions for the Home page.
// Manages open state for QuickAddForm and New Category inline form.
// Calls router.refresh() after mutations so the server component re-fetches data.
interface HomeClientProps {
  categories: Array<{ id: string; name: string; color: string | null; icon: string | null }>
}

export function HomeClient({ categories }: HomeClientProps) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [newCatOpen, setNewCatOpen] = useState(false)
  const [newCatLoading, setNewCatLoading] = useState(false)
  const [catName, setCatName] = useState('')
  const [catColor, setCatColor] = useState('#6366f1')
  const [catIcon, setCatIcon] = useState('')
  const [catError, setCatError] = useState<string | null>(null)

  async function handleNewCategory(e: FormEvent) {
    e.preventDefault()
    setNewCatLoading(true)
    setCatError(null)
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: catName, color: catColor, icon: catIcon || null }),
      })
      if (!res.ok) throw new Error('Failed to create category')
      setCatName('')
      setCatColor('#6366f1')
      setCatIcon('')
      setNewCatOpen(false)
      router.refresh()
    } catch (err) {
      setCatError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setNewCatLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* New Category inline form trigger */}
      <button
        type="button"
        onClick={() => setNewCatOpen(prev => !prev)}
        className="rounded-md border border-dashed border-muted-foreground/40 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-muted-foreground/70 transition-colors"
      >
        + Category
      </button>

      {/* Add Trigger button */}
      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors"
      >
        + Add
      </button>

      {/* New Category inline form */}
      {newCatOpen && (
        <div className="absolute top-16 right-4 z-10 w-72 rounded-lg border border-border bg-card p-4 shadow-lg space-y-3">
          <h3 className="text-sm font-semibold">New Category</h3>
          <form onSubmit={handleNewCategory} className="space-y-3">
            <input
              type="text"
              required
              maxLength={50}
              placeholder="Name"
              value={catName}
              onChange={e => setCatName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Color</label>
              <input
                type="color"
                value={catColor}
                onChange={e => setCatColor(e.target.value)}
                className="h-7 w-10 cursor-pointer rounded border border-input bg-background"
              />
              <label className="text-xs text-muted-foreground">Icon</label>
              <input
                type="text"
                maxLength={4}
                placeholder="📌"
                value={catIcon}
                onChange={e => setCatIcon(e.target.value)}
                className="w-14 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-center"
              />
            </div>
            {catError && <p className="text-xs text-red-600" role="alert">{catError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setNewCatOpen(false); setCatError(null) }}
                className="flex-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={newCatLoading}
                className="flex-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {newCatLoading ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      <QuickAddForm
        categories={categories}
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => router.refresh()}
      />
    </div>
  )
}
