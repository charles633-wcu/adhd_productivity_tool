'use client'

/**
 * Compact card for the Review Queue 3-column grid.
 * Supports multi-select (onSelect on card body), animate-out, and Mind node badges.
 * Actions: Acknowledge, Memory (internal sheet), Edit.
 * Delete is intentionally absent — use the drawer TriggerCard for that.
 */

import { useState } from 'react'
import { Check, CheckCircle, Pencil } from 'lucide-react'
import { TriggerMemorySheet } from '@/components/TriggerMemorySheet'
import type { Trigger } from '@/lib/db/schema'

// Short "Mon D" date format — identical to TriggerCard's formatCardDate (locale-pinned for stable output)
function formatCardDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

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
        'relative group rounded-lg border-l-2 border transition-all overflow-hidden',
        config.borderClass,
        // Selection ring overrides default border when selected; hover lifts the card
        // with an indigo ring + soft outer glow (no layout shift).
        selected
          ? 'border-indigo-500 bg-indigo-500/5 shadow-[0_0_0_1px_rgba(99,102,241,0.35)]'
          : 'border-border bg-card hover:bg-card/80 hover:-translate-y-0.5 hover:ring-1 hover:ring-indigo-400/40 hover:shadow-[0_0_22px_-6px_rgba(99,102,241,0.55)]',
        // Animate-out: fade + scale down; pointer-events off to prevent race clicks
        isAnimatingOut ? 'opacity-0 scale-95 pointer-events-none duration-[250ms]' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Corner select checkbox — a recessed "hole" that fills with an indigo glow
          when checked, like selecting an email. Stops propagation so it toggles once. */}
      <button
        type="button"
        aria-label="Select"
        aria-pressed={selected}
        disabled={isAnimatingOut}
        onClick={e => {
          e.stopPropagation()
          onSelect()
        }}
        className={[
          'absolute top-2.5 right-2.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all',
          selected
            ? 'border-indigo-400 bg-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.7)]'
            : 'border-muted-foreground/30 bg-background/50 text-transparent shadow-[inset_0_1px_3px_rgba(0,0,0,0.55)] group-hover:border-indigo-400/70 hover:!border-indigo-400 hover:bg-indigo-500/10',
        ].join(' ')}
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </button>

      {/* Selectable body — clicking anywhere here calls onSelect; disabled while animating out.
          Right padding leaves room for the corner checkbox. */}
      <div
        className="px-3 py-3 pr-9 cursor-pointer space-y-2"
        onClick={isAnimatingOut ? undefined : onSelect}
      >
        {/* Priority badge row */}
        <div className="flex items-start gap-2">
          <span
            className={`shrink-0 mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold ${config.badgeClass}`}
          >
            {config.label}
          </span>
        </div>

        {/* Main text: AI summary or title */}
        <p className="text-sm font-medium leading-snug text-foreground">{displayText}</p>

        {/* Metadata row — mirrors TriggerCard's list view: category + review-clock pills */}
        <div className="flex items-center gap-1.5 pl-0.5 flex-wrap">
          <span className="text-xs text-muted-foreground">{categoryName}</span>
          <span className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground ring-1 ring-border">
            Created {formatCardDate(trigger.createdAt)}
          </span>
          <span className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground ring-1 ring-border">
            {trigger.lastReviewedAt ? `Reviewed ${formatCardDate(trigger.lastReviewedAt)}` : 'Not yet reviewed'}
          </span>
          <span className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground ring-1 ring-border">
            Next {formatCardDate(trigger.nextReviewAt)}
          </span>
          <span className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground ring-1 ring-border">
            Every {trigger.reviewIntervalDays}d
          </span>
        </div>
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
