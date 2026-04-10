'use client'

import { useState } from 'react'
import { CheckCircle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import type { Trigger } from '@/lib/db/schema'

// TriggerCard — displays a single trigger with priority badge, summary/title,
// Acknowledge button, and expandable Details section with full content.
// Shows a Retry button inside the expander when summaryStatus is 'pending'.

// Maps numeric priority to display label and Tailwind colour classes
const PRIORITY_BADGE: Record<number, { label: string; className: string }> = {
  0: { label: 'P0', className: 'bg-red-100 text-red-700' },
  1: { label: 'P1', className: 'bg-orange-100 text-orange-700' },
  2: { label: 'P2', className: 'bg-yellow-100 text-yellow-700' },
  3: { label: 'P3', className: 'bg-gray-100 text-gray-600' },
}

interface TriggerCardProps {
  trigger: Trigger
  categoryName: string
  onAcknowledge: (triggerId: string) => void
  // Optional: called when the user clicks Retry to re-trigger summarization
  onRetry?: (triggerId: string) => void
  // When true, disables action buttons to prevent double-submission
  isProcessing?: boolean
}

export function TriggerCard({ trigger, categoryName, onAcknowledge, onRetry, isProcessing = false }: TriggerCardProps) {
  const [expanded, setExpanded] = useState(false)

  // Show AI summary when available, fall back to raw title
  const displayText =
    trigger.summaryStatus === 'generated' && trigger.summary
      ? trigger.summary
      : trigger.title

  const badge = PRIORITY_BADGE[trigger.priority] ?? PRIORITY_BADGE[3]

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* Header row: priority badge + display text + category */}
      <div className="flex items-start gap-3">
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${badge.className}`}>
          {badge.label}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug">{displayText}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{categoryName}</p>
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Acknowledge"
          disabled={isProcessing}
          onClick={() => onAcknowledge(trigger.id)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 transition-colors"
        >
          <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Acknowledge
        </button>

        <button
          type="button"
          aria-label="Details"
          aria-expanded={expanded}
          onClick={() => setExpanded(prev => !prev)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Details
        </button>
      </div>

      {/* Expandable section — shows full content and optional Retry button */}
      {expanded && (
        <div className="pt-2 border-t border-border space-y-2">
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{trigger.fullContent}</p>
          {/* Retry button is shown when summary has not yet been generated */}
          {trigger.summaryStatus === 'pending' && (
            <button
              type="button"
              aria-label="Retry"
              disabled={isProcessing}
              onClick={() => onRetry?.(trigger.id)}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  )
}
