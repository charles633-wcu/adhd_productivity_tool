'use client'

/**
 * Compact card for the Review Queue 3-column grid.
 * Supports multi-select (onSelect on card body), animate-out, and Mind node badges.
 * Actions: Acknowledge, Memory (internal sheet), Edit.
 * Delete is intentionally absent — use the drawer TriggerCard for that.
 */

import { useState } from 'react'
import { CheckCircle, Pencil } from 'lucide-react'
import { TriggerMemorySheet } from '@/components/TriggerMemorySheet'
import type { Trigger } from '@/lib/db/schema'

// Priority display config — identical to TriggerCard's config (not exported from there)
const PRIORITY_CONFIG: Record<number, { label: string; borderClass: string; badgeClass: string }> = {
  0: { label: 'Very High', borderClass: 'border-l-red-500',     badgeClass: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30' },
  1: { label: 'High',      borderClass: 'border-l-rose-400',    badgeClass: 'bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20' },
  2: { label: 'Medium',    borderClass: 'border-l-yellow-500',  badgeClass: 'bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/20' },
  3: { label: 'Low',       borderClass: 'border-l-emerald-500', badgeClass: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20' },
}

interface TriggerGridCardProps {
  trigger: Trigger
  categoryName: string
  /** Whether this card is currently selected in a multi-select context */
  selected: boolean
  /** Called when the card body is clicked (outside action buttons) */
  onSelect: () => void
  onAcknowledge: () => Promise<void>
  onEdit: (triggerId: string) => void
  /** Disables all action buttons while a parent-managed async operation is in flight */
  isProcessing: boolean
  /** When true, fades/scales the card out and disables onSelect */
  isAnimatingOut: boolean
  /** Mind canvas nodes linked to this trigger — renders badge(s) below body */
  linkedNodes: { id: string; title: string }[]
}

export function TriggerGridCard({
  trigger,
  categoryName,
  selected,
  onSelect,
  onAcknowledge,
  onEdit,
  isProcessing,
  isAnimatingOut,
  linkedNodes,
}: TriggerGridCardProps) {
  // Local acknowledging state for the button label change
  const [acknowledging, setAcknowledging] = useState(false)
  // Internal memory sheet open state — not exposed as a prop
  const [memoryOpen, setMemoryOpen] = useState(false)

  const config = PRIORITY_CONFIG[trigger.priority] ?? PRIORITY_CONFIG[3]

  // Show AI summary when available; fall back to title
  const displayText =
    trigger.summaryStatus === 'generated' && trigger.summary ? trigger.summary : trigger.title

  async function handleAcknowledge(e: React.MouseEvent) {
    e.stopPropagation()
    setAcknowledging(true)
    try {
      await onAcknowledge()
    } finally {
      setAcknowledging(false)
    }
  }

  return (
    <div
      data-testid="trigger-grid-card"
      className={[
        'rounded-lg border-l-2 border transition-all overflow-hidden',
        config.borderClass,
        // Selection ring overrides default border when selected
        selected ? 'border-indigo-500 bg-indigo-500/5' : 'border-border bg-card hover:bg-card/80',
        // Animate-out: fade + scale down; pointer-events off to prevent race clicks
        isAnimatingOut ? 'opacity-0 scale-95 pointer-events-none duration-[250ms]' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Selectable body — clicking anywhere here calls onSelect; disabled while animating out */}
      <div
        className="px-3 py-3 cursor-pointer space-y-2"
        onClick={isAnimatingOut ? undefined : onSelect}
      >
        {/* Priority badge row with optional selected checkmark */}
        <div className="flex items-start gap-2">
          <span
            className={`shrink-0 mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold ${config.badgeClass}`}
          >
            {config.label}
          </span>
          {selected && (
            <span className="ml-auto shrink-0 w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center text-[9px] text-white font-bold">
              ✓
            </span>
          )}
        </div>

        {/* Main text: AI summary or title */}
        <p className="text-sm font-medium leading-snug text-foreground">{displayText}</p>

        {/* Category label */}
        <p className="text-xs text-muted-foreground">{categoryName}</p>
      </div>

      {/* Mind canvas node badges — only rendered when linkedNodes is non-empty */}
      {linkedNodes.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {linkedNodes.map(node => (
            <span
              key={node.id}
              className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-primary/70 ring-1 ring-primary/20"
            >
              Mind: {node.title}
            </span>
          ))}
        </div>
      )}

      {/* Action button row — stopPropagation wrapper prevents bubbling to onSelect */}
      <div className="px-3 pb-3 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
        {/* Acknowledge — triggers onAcknowledge and shows transient "Saving…" label */}
        <button
          type="button"
          aria-label="Acknowledge"
          disabled={isProcessing || acknowledging}
          onClick={handleAcknowledge}
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors"
        >
          <CheckCircle className="h-3 w-3" />
          {acknowledging ? 'Saving…' : 'Acknowledge'}
        </button>

        {/* Edit — calls onEdit with the trigger id */}
        <button
          type="button"
          aria-label="Edit"
          disabled={isProcessing}
          onClick={e => {
            e.stopPropagation()
            onEdit(trigger.id)
          }}
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>

        {/* Memory — opens the TriggerMemorySheet managed internally */}
        <button
          type="button"
          aria-label="Memory"
          disabled={isProcessing}
          onClick={e => {
            e.stopPropagation()
            setMemoryOpen(true)
          }}
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20 hover:bg-indigo-500/20 disabled:opacity-40 transition-colors"
        >
          Memory
        </button>
      </div>

      {/* TriggerMemorySheet — state is fully internal; not exposed as a prop */}
      <TriggerMemorySheet
        trigger={trigger}
        open={memoryOpen}
        onOpenChange={setMemoryOpen}
        startInAddNoteMode={false}
      />
    </div>
  )
}
