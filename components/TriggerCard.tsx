'use client'

import { useState, type CSSProperties } from 'react'
import { CheckCircle, ChevronDown, ChevronUp, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { AcknowledgeSheet } from '@/components/AcknowledgeSheet'
import { TriggerMemorySheet } from '@/components/TriggerMemorySheet'
import type { Trigger } from '@/lib/db/schema'
const PRIORITY_CONFIG: Record<number, {
  label: string
  borderClass: string
  badgeClass: string
  glowStyle?: CSSProperties
}> = {
  0: {
    label: 'Very High',
    borderClass: 'border-l-red-500',
    badgeClass: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
    glowStyle: { boxShadow: '0 0 10px oklch(0.55 0.22 25 / 0.45), 0 0 3px oklch(0.55 0.22 25 / 0.6)' },
  },
  1: {
    label: 'High',
    borderClass: 'border-l-rose-400',
    badgeClass: 'bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20',
  },
  2: {
    label: 'Medium',
    borderClass: 'border-l-yellow-500',
    badgeClass: 'bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/20',
  },
  3: {
    label: 'Low',
    borderClass: 'border-l-emerald-500',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
  },
}

interface TriggerCardProps {
  trigger: Trigger
  categoryName: string
  onSuccess: () => void
  onEdit: (triggerId: string) => void
  onDelete: (triggerId: string) => void
  onRetry?: (triggerId: string) => Promise<string | null> | string | null
  isProcessing?: boolean
}

function formatCardDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function TriggerCard({
  trigger,
  categoryName,
  onSuccess,
  onEdit,
  onDelete,
  onRetry,
  isProcessing = false,
}: TriggerCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [acknowledgeOpen, setAcknowledgeOpen] = useState(false)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [retryFeedback, setRetryFeedback] = useState<string | null>(null)

  const displayText =
    trigger.summaryStatus === 'generated' && trigger.summary
      ? trigger.summary
      : trigger.title

  const config = PRIORITY_CONFIG[trigger.priority] ?? PRIORITY_CONFIG[3]

  async function handleRetryClick() {
    if (!onRetry) return
    setRetryFeedback(null)
    const message = await onRetry(trigger.id)
    if (message) setRetryFeedback(message)
  }

  return (
    <div
      className={`rounded-lg border-l-2 border border-border bg-card hover:bg-card/80 transition-colors ${config.borderClass} overflow-hidden`}
    >
      <div className="px-4 py-3 space-y-2.5">
        <div className="flex items-start gap-2.5">
          <span
            className={`shrink-0 mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold ${config.badgeClass}`}
            style={config.glowStyle}
          >
            {config.label}
          </span>
          <p className="flex-1 text-sm font-medium leading-snug text-foreground">
            {displayText}
          </p>
        </div>

        <div className="flex items-center gap-2 pl-0.5 flex-wrap">
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
          {trigger.summaryStatus === 'pending' && (
            <span className="text-[10px] font-mono text-amber-500/70">pending summary</span>
          )}
          {trigger.summaryStatus === 'generated' && (
            <span className="text-[10px] font-mono text-emerald-500/60">ai summary</span>
          )}
        </div>
      </div>

      <div className="px-4 pb-3 flex items-center gap-2">
        <button
          type="button"
          aria-label="Acknowledge"
          disabled={isProcessing}
          onClick={() => setAcknowledgeOpen(true)}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors"
        >
          <CheckCircle className="h-3 w-3" aria-hidden="true" />
          Acknowledge
        </button>

        <button
          type="button"
          aria-label="Memory"
          onClick={() => setMemoryOpen(true)}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
        >
          Memory
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

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Edit trigger"
            onClick={() => { setConfirmDelete(false); onEdit(trigger.id) }}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Pencil className="h-3 w-3" aria-hidden="true" />
            Edit
          </button>

          {confirmDelete ? (
            <button
              type="button"
              aria-label="Confirm delete"
              disabled={isProcessing}
              onClick={() => onDelete(trigger.id)}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium bg-red-500/15 text-red-400 ring-1 ring-red-500/30 hover:bg-red-500/25 disabled:opacity-40 transition-colors"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              Sure?
            </button>
          ) : (
            <button
              type="button"
              aria-label="Delete trigger"
              onClick={() => setConfirmDelete(true)}
              onBlur={() => setConfirmDelete(false)}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3 bg-background/40 animate-in">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">AI Summary</p>
            {trigger.summaryStatus === 'generated' && trigger.summary ? (
              <p className="text-xs text-foreground leading-relaxed">{trigger.summary}</p>
            ) : trigger.summaryStatus === 'pending' ? (
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground/50 italic">Not yet generated.</p>
                <button
                  type="button"
                  aria-label="Retry"
                  disabled={isProcessing}
                  onClick={handleRetryClick}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20 hover:bg-amber-500/20 disabled:opacity-40 transition-colors"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  Generate
                </button>
              </div>
            ) : null}
            {retryFeedback && (
              <p
                role="alert"
                className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-300"
              >
                {retryFeedback}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Notes</p>
            {trigger.fullContent ? (
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono">
                {trigger.fullContent}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground/50 italic">None.</p>
            )}
          </div>
        </div>
      )}

      <AcknowledgeSheet
        trigger={trigger}
        open={acknowledgeOpen}
        onOpenChange={setAcknowledgeOpen}
        onSuccess={onSuccess}
      />

      <TriggerMemorySheet
        trigger={trigger}
        open={memoryOpen}
        onOpenChange={setMemoryOpen}
      />
    </div>
  )
}
