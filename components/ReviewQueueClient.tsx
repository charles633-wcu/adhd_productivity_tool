'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TriggerCard } from '@/components/TriggerCard'
import type { Category, Trigger } from '@/lib/db/schema'

// ReviewQueueClient — renders due triggers grouped by category.
// Same acknowledge/retry handlers as CategoryViewClient.
interface ReviewQueueClientProps {
  grouped: Array<{ category: Category; triggers: Trigger[] }>
}

export function ReviewQueueClient({ grouped }: ReviewQueueClientProps) {
  const router = useRouter()
  const [processingId, setProcessingId] = useState<string | null>(null)

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

  async function handleRetry(triggerId: string, allTriggers: Trigger[]) {
    const trigger = allTriggers.find(t => t.id === triggerId)
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

  if (grouped.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">
        Nothing due for review right now.
      </p>
    )
  }

  return (
    <div className="space-y-6">
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
                  onAcknowledge={handleAcknowledge}
                  onRetry={(id) => handleRetry(id, triggers)}
                  isProcessing={processingId === trigger.id}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
