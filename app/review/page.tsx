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
    // h-screen + overflow-hidden bounds the column so the client's grid region
    // is the only thing that scrolls; the header stays pinned beneath AppHeader.
    <div className="h-screen flex flex-col pt-[60px] overflow-hidden">
      <AppHeader active="triggers" />
      <ReviewQueueClient grouped={grouped} nodeMap={nodeMap} />
    </div>
  )
}
