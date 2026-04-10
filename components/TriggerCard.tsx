'use client'

import { useState } from 'react'
import { CheckCircle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import type { Trigger } from '@/lib/db/schema'

// TriggerCard — displays a single trigger with a priority-colored left border,
// summary/title display, Acknowledge button, and expandable Details section.
// Shows a Retry button inside the expander when summaryStatus is 'pending'.

const PRIORITY_CONFIG: Record<number, {
  label: string
  borderClass: string
  badgeClass: string
}> = {
  0: {
    label: 'P0',
    borderClass: 'border-l-red-500',
    badgeClass: 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20',
  },
  1: {
    label: 'P1',
    borderClass: 'border-l-orange-500',
    badgeClass: 'bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20',
  },
  2: {
    label: 'P2',
    borderClass: 'border-l-yellow-500',
    badgeClass: 'bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/20',
  },
  3: {
    label: 'P3',
    borderClass: 'border-l-zinc-600',
    badgeClass: 'bg-zinc-800 text-zinc-500 ring-1 ring-zinc-700/50',
  },
}

interface TriggerCardProps {
  trigger: Trigger
  categoryName: string
  onAcknowledge: (triggerId: string) => void
  onRetry?: (triggerId: string) => void
  isProcessing?: boolean
}

export function TriggerCard({
  trigger,
  categoryName,
  onAcknowledge,
  onRetry,
  isProcessing = false,
}: TriggerCardProps) {
  const [expanded, setExpanded] = useState(false)

  // Show AI summary when available, fall back to raw title
  const displayText =
    trigger.summaryStatus === 'generated' && trigger.summary
      ? trigger.summary
      : trigger.title

  const config = PRIORITY_CONFIG[trigger.priority] ?? PRIORITY_CONFIG[3]

  return (
    <div
      className={`rounded-lg border-l-2 border border-border bg-card hover:bg-card/80 transition-colors ${config.borderClass} overflow-hidden`}
    >
      {/* Main row */}
      <div className="px-4 py-3 space-y-2.5">
        {/* Header: badge + text */}
        <div className="flex items-start gap-2.5">
          <span
            className={`shrink-0 mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold ${config.badgeClass}`}
          >
            {config.label}
          </span>
          <p className="flex-1 text-sm font-medium leading-snug text-foreground">
            {displayText}
          </p>
        </div>

        {/* Meta: category + summary status */}
        <div className="flex items-center gap-2 pl-0.5">
          <span className="text-xs text-muted-foreground">{categoryName}</span>
          {trigger.summaryStatus === 'pending' && (
            <span className="text-[10px] font-mono text-amber-500/70">· pending summary</span>
          )}
          {trigger.summaryStatus === 'generated' && (
            <span className="text-[10px] font-mono text-emerald-500/60">· ai summary</span>
          )}
        </div>
      </div>

      {/* Action row */}
      <div className="px-4 pb-3 flex items-center gap-2">
        <button
          type="button"
          aria-label="Acknowledge"
          disabled={isProcessing}
          onClick={() => onAcknowledge(trigger.id)}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors"
        >
          <CheckCircle className="h-3 w-3" aria-hidden="true" />
          Acknowledge
        </button>

        <button
          type="button"
          aria-label="Details"
          aria-expanded={expanded}
          onClick={() => setExpanded(prev => !prev)}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {expanded
            ? <ChevronUp className="h-3 w-3" aria-hidden="true" />
            : <ChevronDown className="h-3 w-3" aria-hidden="true" />
          }
          Details
        </button>
      </div>

      {/* Expandable section */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3 bg-background/40 animate-in">
          {trigger.fullContent ? (
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono">
              {trigger.fullContent}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground/50 italic">No additional content.</p>
          )}

          {trigger.summaryStatus === 'pending' && (
            <button
              type="button"
              aria-label="Retry"
              disabled={isProcessing}
              onClick={() => onRetry?.(trigger.id)}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20 hover:bg-amber-500/20 disabled:opacity-40 transition-colors"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Retry summary
            </button>
          )}
        </div>
      )}
    </div>
  )
}
