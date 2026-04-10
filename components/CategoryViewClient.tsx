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
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Filter:</span>
        <a
          href={`/category/${categoryId}?filter=all`}
          className={`rounded-md px-2 py-1 transition-colors ${currentFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
        >
          All
        </a>
        <a
          href={`/category/${categoryId}?filter=due_soon`}
          className={`rounded-md px-2 py-1 transition-colors ${currentFilter === 'due_soon' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
        >
          Due Soon
        </a>
      </div>

      {/* Trigger list */}
      {triggers.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No triggers found.</p>
      ) : (
        <ul className="space-y-3">
          {triggers.map(trigger => (
            <li key={trigger.id}>
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
