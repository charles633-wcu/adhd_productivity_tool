export const dynamic = 'force-dynamic'

import { getDb } from '@/lib/db/client'
import { categories, triggers, heapNodeTriggers, heapNodes } from '@/lib/db/schema'
import { eq, and, lte, asc } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth'
import { ReviewQueueClient } from '@/components/ReviewQueueClient'
import { AppHeader } from '@/components/AppHeader'
import type { Category, Trigger } from '@/lib/db/schema'

// Review queue: all active triggers due within 1 day, grouped by category.
export default async function ReviewPage() {
  const user = await getCurrentUser()
  const db = getDb()

  const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000)

  const dueTriggers = await db
    .select()
    .from(triggers)
    .where(and(
      eq(triggers.userId, user.id),
      eq(triggers.status, 'active'),
      lte(triggers.nextReviewAt, oneDayFromNow)
    ))
    .orderBy(asc(triggers.priority), asc(triggers.nextReviewAt))

  const categoryList = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, user.id))

  const grouped: Array<{ category: Category; triggers: Trigger[] }> = categoryList
    .map(cat => ({
      category: cat,
      triggers: dueTriggers.filter(t => t.categoryId === cat.id),
    }))
    .filter(group => group.triggers.length > 0)

  // Build a map of triggerId → linked heap nodes for badge display on TriggerCard
  const nodeLinkRows = await db
    .select({
      triggerId: heapNodeTriggers.triggerId,
      nodeId: heapNodes.id,
      nodeTitle: heapNodes.title,
    })
    .from(heapNodeTriggers)
    .innerJoin(heapNodes, eq(heapNodeTriggers.nodeId, heapNodes.id))
    .where(eq(heapNodes.userId, user.id))

  const nodeMap: Record<string, { id: string; title: string }[]> = {}
  for (const row of nodeLinkRows) {
    nodeMap[row.triggerId] = [...(nodeMap[row.triggerId] ?? []), { id: row.nodeId, title: row.nodeTitle }]
  }

  return (
    <div className="min-h-screen flex flex-col pt-[60px]">
      <AppHeader active="triggers" />

      <div className="border-b border-border bg-background/55">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <h1 className="text-lg font-bold leading-none">Review Queue</h1>
          <span className="ml-auto text-xs font-mono text-muted-foreground">
            {dueTriggers.length} {dueTriggers.length === 1 ? 'item' : 'items'}
          </span>
        </div>
      </div>

      <main className="max-w-2xl mx-auto w-full px-4 py-6">
        <ReviewQueueClient grouped={grouped} nodeMap={nodeMap} />
      </main>
    </div>
  )
}
