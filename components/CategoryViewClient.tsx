'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TriggerCard } from '@/components/TriggerCard'
import type { Trigger } from '@/lib/db/schema'

// CategoryViewClient — client-side trigger list with filter controls.
// Handles acknowledge (PATCH /api/triggers/[id]) and retry summarization (POST /api/summarize).
interface CategoryViewClientProps {
  categoryId: string
  currentSort: string
  currentFilter: string
  triggers: Trigger[]
  categoryName: string
}

export function CategoryViewClient({
  categoryId,
  currentFilter,
  triggers,
  categoryName,
}: CategoryViewClientProps) {
  const router = useRouter()
  const [processingId, setProcessingId] = useState<string | null>(null)

  // PATCH /api/triggers/[id] with { acknowledge: true } — resets review clock
  async function handleAcknowledge(triggerId: string) {
    setProcessingId(triggerId)
    try {
      const res = await fetch(`/api/triggers/${triggerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledge: true }),
      })
      if (res.ok) router.refresh()
    } finally {
      setProcessingId(null)
    }
  }

  // POST /api/summarize — re-queues summarization for a pending trigger
  async function handleRetry(triggerId: string) {
    const trigger = triggers.find(t => t.id === triggerId)
    if (!trigger) return
    setProcessingId(triggerId)
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerId, content: trigger.fullContent || trigger.title }),
      })
      if (res.ok) router.refresh()
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-mono text-muted-foreground mr-1">filter:</span>
        {[
          { value: 'all', label: 'All' },
          { value: 'due_soon', label: 'Due Soon' },
        ].map(f => (
          <a
            key={f.value}
            href={`/category/${categoryId}?filter=${f.value}`}
            className={[
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              currentFilter === f.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {f.label}
          </a>
        ))}
      </div>

      {/* Trigger list */}
      {triggers.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-border rounded-xl">
          <p className="text-sm text-muted-foreground">No triggers here.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {triggers.map((trigger, i) => (
            <li key={trigger.id} className="animate-in" style={{ animationDelay: `${i * 30}ms` }}>
              <TriggerCard
                trigger={trigger}
                categoryName={categoryName}
                onAcknowledge={handleAcknowledge}
                onRetry={handleRetry}
                isProcessing={processingId === trigger.id}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
