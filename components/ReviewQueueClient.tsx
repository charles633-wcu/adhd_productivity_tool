'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TriggerCard } from '@/components/TriggerCard'
import { TriggerEditSheet } from '@/components/TriggerEditSheet'
import type { Category, Trigger } from '@/lib/db/schema'

interface ReviewQueueClientProps {
  grouped: Array<{ category: Category; triggers: Trigger[] }>
}

export function ReviewQueueClient({ grouped }: ReviewQueueClientProps) {
  const router = useRouter()
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null)

  const allTriggers = grouped.flatMap(group => group.triggers)
  const editingTrigger = allTriggers.find(trigger => trigger.id === editingTriggerId) ?? null

  async function handleDelete(triggerId: string) {
    setProcessingId(triggerId)
    try {
      await fetch(`/api/triggers/${triggerId}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setProcessingId(null)
    }
  }

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
      router.refresh()
      return null
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
    <>
      <TriggerEditSheet
        trigger={editingTrigger}
        open={editingTriggerId !== null}
        onOpenChange={nextOpen => { if (!nextOpen) setEditingTriggerId(null) }}
        onSuccess={() => { setEditingTriggerId(null); router.refresh() }}
      />

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
                    onSuccess={() => router.refresh()}
                    onEdit={setEditingTriggerId}
                    onDelete={handleDelete}
                    onRetry={id => handleRetry(id, triggers)}
                    isProcessing={processingId === trigger.id}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}
