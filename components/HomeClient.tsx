'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, FolderPlus } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { QuickAddForm } from '@/components/QuickAddForm'

// HomeClient — client-side header actions for the Home page.
// Manages open state for QuickAddForm and New Category Sheet.
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
        body: JSON.stringify({
          name: catName,
          color: catColor,
          // Only include icon if the user entered one — avoids sending null to Zod
          ...(catIcon ? { icon: catIcon } : {}),
        }),
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
      {/* New Category button */}
      <button
        type="button"
        onClick={() => setNewCatOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
      >
        <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
        Category
      </button>

      {/* Add Trigger button */}
      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Add
      </button>

      {/* New Category — Sheet (same pattern as QuickAddForm, no absolute positioning) */}
      <Sheet open={newCatOpen} onOpenChange={(open) => { setNewCatOpen(open); if (!open) setCatError(null) }}>
        <SheetContent side="right" className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>New Category</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleNewCategory} className="mt-6 space-y-5">
            {/* Name */}
            <div className="space-y-1.5">
              <label htmlFor="cat-name" className="text-sm font-medium">Name <span className="text-muted-foreground">*</span></label>
              <input
                id="cat-name"
                type="text"
                required
                maxLength={50}
                placeholder="e.g. CS Projects"
                value={catName}
                onChange={e => setCatName(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Color + Icon row */}
            <div className="flex items-end gap-4">
              <div className="space-y-1.5">
                <label htmlFor="cat-color" className="text-sm font-medium">Color</label>
                <div className="flex items-center gap-2">
                  <input
                    id="cat-color"
                    type="color"
                    value={catColor}
                    onChange={e => setCatColor(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background p-0.5"
                  />
                  <span className="text-xs font-mono text-muted-foreground">{catColor}</span>
                </div>
              </div>

              <div className="flex-1 space-y-1.5">
                <label htmlFor="cat-icon" className="text-sm font-medium">Icon <span className="text-muted-foreground text-xs">(emoji)</span></label>
                <input
                  id="cat-icon"
                  type="text"
                  maxLength={4}
                  placeholder="📌"
                  value={catIcon}
                  onChange={e => setCatIcon(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {/* Preview */}
            {catName && (
              <div className="rounded-lg p-3 flex items-center gap-3" style={{ backgroundColor: catColor }}>
                <span className="text-xl">{catIcon || '📌'}</span>
                <span className="text-sm font-semibold text-white">{catName}</span>
              </div>
            )}

            {catError && <p className="text-xs text-red-400" role="alert">{catError}</p>}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setNewCatOpen(false); setCatError(null) }}
                className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={newCatLoading}
                className="flex-1 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {newCatLoading ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Add Trigger — QuickAddForm Sheet */}
      <QuickAddForm
        categories={categories}
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => router.refresh()}
      />
    </div>
  )
}
