'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TriggerCard } from '@/components/TriggerCard'
import { TriggerEditSheet } from '@/components/TriggerEditSheet'
import type { Trigger } from '@/lib/db/schema'

interface CategoryViewClientProps {
  categoryId: string
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
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null)

  const editingTrigger = triggers.find(t => t.id === editingTriggerId) ?? null

  async function handleDelete(triggerId: string) {
    setProcessingId(triggerId)
    try {
      await fetch(`/api/triggers/${triggerId}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setProcessingId(null)
    }
  }

  async function handleRetry(triggerId: string) {
    const trigger = triggers.find(t => t.id === triggerId)
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

  return (
    <>
      <TriggerEditSheet
        trigger={editingTrigger}
        open={editingTriggerId !== null}
        onOpenChange={nextOpen => { if (!nextOpen) setEditingTriggerId(null) }}
        onSuccess={() => { setEditingTriggerId(null); router.refresh() }}
      />

      <div className="space-y-4">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-muted-foreground mr-1">filter:</span>
          {[
            { value: 'all', label: 'All' },
            { value: 'due_soon', label: 'Due Soon' },
          ].map(filter => (
            <a
              key={filter.value}
              href={`/category/${categoryId}?filter=${filter.value}`}
              className={[
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                currentFilter === filter.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {filter.label}
            </a>
          ))}
        </div>

        {triggers.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-border rounded-xl">
            <p className="text-sm text-muted-foreground">No triggers here.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {triggers.map((trigger, index) => (
              <li key={trigger.id} className="animate-in" style={{ animationDelay: `${index * 30}ms` }}>
                <TriggerCard
                  trigger={trigger}
                  categoryName={categoryName}
                  onSuccess={() => router.refresh()}
                  onEdit={setEditingTriggerId}
                  onDelete={handleDelete}
                  onRetry={handleRetry}
                  isProcessing={processingId === trigger.id}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
