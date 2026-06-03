'use client'

/**
 * ReviewQueueClient — main client component for the /review-queue page.
 *
 * Layout:
 *   - Sticky header with item count and category filter (combobox)
 *   - 3-column responsive grid of TriggerGridCards (filtered by category)
 *   - Fixed hamburger tab on the right edge opens a full-height drawer
 *   - Drawer lists all triggers grouped by category (unaffected by category filter)
 *   - Multi-select works across both grid and drawer; IDs are deduplicated
 *   - Bulk acknowledge bar appears at the bottom when any items are selected
 *   - TriggerEditSheet is wired through editingTriggerId state
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Check, PanelRightOpen } from 'lucide-react'
import { TriggerCard } from '@/components/TriggerCard'
import { TriggerGridCard } from '@/components/TriggerGridCard'
import { TriggerEditSheet } from '@/components/TriggerEditSheet'
import type { Category, Trigger } from '@/lib/db/schema'

interface ReviewQueueClientProps {
  grouped: Array<{ category: Category; triggers: Trigger[] }>
  nodeMap: Record<string, { id: string; title: string }[]>
}

export function ReviewQueueClient({ grouped, nodeMap }: ReviewQueueClientProps) {
  const router = useRouter()

  // ── State ──────────────────────────────────────────────────────────────────
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [gridSelected, setGridSelected] = useState<Set<string>>(new Set())
  const [drawerSelected, setDrawerSelected] = useState<Set<string>>(new Set())
  const [animatingOut, setAnimatingOut] = useState<Set<string>>(new Set())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [bulkError, setBulkError] = useState<string | null>(null)

  // ── Effects ────────────────────────────────────────────────────────────────

  // Reset isRefreshing when new props arrive after a server refresh
  useEffect(() => { setIsRefreshing(false) }, [grouped])

  // Auto-reset category filter when the selected category becomes empty after refresh
  useEffect(() => {
    if (categoryFilter !== 'all' && !grouped.find(g => g.category.id === categoryFilter && g.triggers.length > 0)) {
      setCategoryFilter('all')
    }
  }, [grouped, categoryFilter])

  // ── Refresh helper ─────────────────────────────────────────────────────────
  function doRefresh() {
    setIsRefreshing(true)
    setGridSelected(new Set())
    setDrawerSelected(new Set())
    setAnimatingOut(new Set())
    setBulkError(null)
    router.refresh()
  }

  // ── Action handlers ────────────────────────────────────────────────────────

  /** Bulk-acknowledge all selected IDs (deduplicated union of grid + drawer selections) */
  async function handleBulkAcknowledge() {
    const toAck = [...new Set([...gridSelected, ...drawerSelected])]
    setAnimatingOut(new Set(toAck))
    setGridSelected(new Set())
    setDrawerSelected(new Set())
    setIsRefreshing(true)
    const results = await Promise.allSettled(
      toAck.map(id =>
        fetch(`/api/triggers/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ acknowledge: true }),
        })
      )
    )
    const anyFailed = results.some(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok))
    if (anyFailed) setBulkError('Some items could not be acknowledged. Refresh to try again.')
    doRefresh()
  }

  /** Delete a single trigger then refresh */
  async function handleDelete(triggerId: string) {
    setProcessingId(triggerId)
    try {
      await fetch(`/api/triggers/${triggerId}`, { method: 'DELETE' })
      doRefresh()
    } finally {
      setProcessingId(null)
    }
  }

  /** Retry AI summary generation for a trigger */
  async function handleRetry(triggerId: string, triggers: Trigger[]) {
    const trigger = triggers.find(item => item.id === triggerId)
    if (!trigger) return null
    setProcessingId(triggerId)
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerId, content: trigger.fullContent || trigger.title }),
      })
      const payload = await res.json().catch(() => null) as { skipped?: boolean; reason?: string; error?: string } | null
      if (!res.ok) return payload?.error ?? 'Failed to generate summary'
      if (payload?.skipped) return payload.reason ?? 'Summary not available yet.'
      doRefresh()
      return null
    } finally {
      setProcessingId(null)
    }
  }

  // ── Selection helpers ──────────────────────────────────────────────────────

  function toggleGridSelect(id: string) {
    if (isRefreshing) return
    setGridSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleDrawerSelect(id: string) {
    if (isRefreshing) return
    setDrawerSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  /** Select-all toggle for the grid — operates only on currently-visible (filtered) cards */
  function toggleSelectAll() {
    if (isRefreshing) return
    setGridSelected(prev => {
      if (allVisibleSelected) {
        // Deselect: remove only the visible IDs, leaving any off-screen selections intact
        const next = new Set(prev)
        visibleIds.forEach(id => next.delete(id))
        return next
      }
      // Select: union existing selection with all visible IDs
      return new Set([...prev, ...visibleIds])
    })
  }

  // ── Computed values ────────────────────────────────────────────────────────

  const allTriggers = grouped.flatMap(g => g.triggers)
  const editingTrigger = allTriggers.find(t => t.id === editingTriggerId) ?? null
  const filteredGrouped = categoryFilter === 'all'
    ? grouped
    : grouped.filter(g => g.category.id === categoryFilter)
  const bulkCount = new Set([...gridSelected, ...drawerSelected]).size
  // IDs currently shown in the grid (after the category filter) — drives Select all
  const visibleIds = filteredGrouped.flatMap(g => g.triggers.map(t => t.id))
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => gridSelected.has(id))

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Edit sheet — controlled by editingTriggerId */}
      <TriggerEditSheet
        trigger={editingTrigger}
        open={editingTriggerId !== null}
        onOpenChange={open => { if (!open) setEditingTriggerId(null) }}
        onSuccess={() => { setEditingTriggerId(null); doRefresh() }}
      />

      {/* Header — title, item count, and the Select all + filter toolbar.
          Contained to the content column so it reads as a header, not a
          full-width bar. Lives above the scroll region so it never moves. */}
      <div className="max-w-5xl mx-auto w-full px-4 pt-5 pb-3 flex items-center gap-3">
        <h1 className="text-lg font-bold leading-none">Review Queue</h1>
        <span className="text-xs font-mono text-muted-foreground">
          {allTriggers.length} {allTriggers.length === 1 ? 'item' : 'items'}
        </span>

        {/* Right-aligned toolbar: Select all toggle + category filter */}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            aria-label={allVisibleSelected ? 'Deselect all' : 'Select all'}
            onClick={toggleSelectAll}
            disabled={isRefreshing || visibleIds.length === 0}
            className={[
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-mono ring-1 transition-colors disabled:opacity-40',
              allVisibleSelected
                ? 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/40 hover:bg-indigo-500/25'
                : 'text-muted-foreground ring-border hover:text-foreground hover:bg-muted',
            ].join(' ')}
          >
            {/* Mirror the card checkbox so the affordance reads as the same control */}
            <span
              className={[
                'flex h-3.5 w-3.5 items-center justify-center rounded-full border transition-colors',
                allVisibleSelected ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-muted-foreground/40 text-transparent',
              ].join(' ')}
            >
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            {allVisibleSelected ? 'Deselect all' : 'Select all'}
          </button>

          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="bg-background border border-border rounded px-2 py-1 text-xs text-muted-foreground font-mono"
            aria-label="Filter by category"
          >
            <option value="all">All Categories</option>
            {grouped.map(({ category }) => (
              <option key={category.id} value={category.id}>{category.icon ?? '📌'} {category.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Scrollable content region — the cards scroll inside here so the header
          above stays fixed and never overlaps or blocks anything. */}
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto w-full px-4 pb-6">
          {grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">Nothing due for review right now.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGrouped.flatMap(({ category, triggers }) =>
              triggers.map(trigger => (
                <TriggerGridCard
                  key={trigger.id}
                  trigger={trigger}
                  categoryName={category.name}
                  selected={gridSelected.has(trigger.id)}
                  onSelect={() => toggleGridSelect(trigger.id)}
                  onAcknowledge={async () => {
                    setAnimatingOut(prev => new Set([...prev, trigger.id]))
                    await fetch(`/api/triggers/${trigger.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ acknowledge: true }),
                    })
                    doRefresh()
                  }}
                  onEdit={setEditingTriggerId}
                  isProcessing={isRefreshing || processingId === trigger.id}
                  isAnimatingOut={animatingOut.has(trigger.id)}
                  linkedNodes={nodeMap[trigger.id] ?? []}
                />
              ))
            )}
            </div>
          )}
        </div>
      </main>

      {/* Drawer tab — pulled in from the edge and accented so it's clearly a button */}
      <button
        type="button"
        aria-label="Open list"
        onClick={() => setDrawerOpen(true)}
        className="fixed right-4 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-1 rounded-xl bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-500/40 px-3 py-3.5 shadow-lg shadow-indigo-500/20 backdrop-blur-sm hover:bg-indigo-500/25 hover:ring-indigo-400/60 hover:text-indigo-100 transition-colors"
      >
        <PanelRightOpen className="h-5 w-5" />
        <span className="text-[10px] font-mono font-semibold tracking-wide">List</span>
      </button>

      {/* Backdrop — clicking it closes the drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Right-side drawer — lists all triggers grouped by category (unfiltered).
          Contents are only mounted when open so the Close button leaves the DOM on close. */}
      {drawerOpen && (
        <div
          className="fixed top-0 right-0 bottom-0 w-[68%] z-50 bg-background border-l border-border shadow-2xl overflow-y-auto"
        >
          {/* Drawer header */}
          <div className="sticky top-0 bg-background/90 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
            <span className="font-bold text-sm">All Triggers</span>
            <span className="text-xs font-mono text-muted-foreground">{allTriggers.length} items</span>
            <button
              type="button"
              aria-label="Close list"
              onClick={() => setDrawerOpen(false)}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
            >✕ Close</button>
          </div>

          {/* Drawer body — all triggers grouped by category */}
          <div className="px-4 py-4 space-y-6">
            {grouped.map(({ category, triggers }) => (
              <section key={category.id}>
                <h2 className="flex items-center gap-2 text-sm font-semibold mb-3">
                  <span aria-hidden="true">{category.icon ?? '📌'}</span>
                  {category.name}
                  <span className="text-xs text-muted-foreground font-normal">({triggers.length})</span>
                </h2>
                <ul className="space-y-3">
                  {triggers.map(trigger => (
                    <li key={trigger.id}>
                      <TriggerCard
                        trigger={trigger}
                        categoryName={category.name}
                        selected={drawerSelected.has(trigger.id)}
                        onSelect={() => toggleDrawerSelect(trigger.id)}
                        isAnimatingOut={animatingOut.has(trigger.id)}
                        onAnimatingOut={() => {
                          setAnimatingOut(prev => new Set([...prev, trigger.id]))
                          doRefresh()
                        }}
                        onSuccess={() => doRefresh()}
                        onEdit={setEditingTriggerId}
                        onDelete={handleDelete}
                        onRetry={id => handleRetry(id, triggers)}
                        isProcessing={isRefreshing || processingId === trigger.id}
                        linkedNodes={nodeMap[trigger.id] ?? []}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}

      {/* Bulk acknowledge floating bar — only visible when items are selected */}
      {bulkCount > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl bg-background border border-border shadow-xl px-4 py-2.5 text-sm">
          <span className="font-mono text-xs text-muted-foreground">{bulkCount} selected</span>
          <button
            type="button"
            aria-label="Acknowledge Selected"
            onClick={handleBulkAcknowledge}
            className="rounded-md px-3 py-1.5 text-xs font-medium bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
          >
            ✓ Acknowledge Selected
          </button>
          <button
            type="button"
            aria-label="clear"
            onClick={() => { setGridSelected(new Set()); setDrawerSelected(new Set()) }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            clear
          </button>
        </div>
      )}

      {/* Bulk error toast — shown when one or more PATCH calls failed */}
      {bulkError && (
        <div role="alert" className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-400">
          {bulkError}
        </div>
      )}
    </>
  )
}
