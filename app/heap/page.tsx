// HeapPage — server component that computes orphan node count and renders
// the HeapOverview overview panel (project cards + orphan canvas link).
// Orphan count is computed server-side so HeapOverview can display it
// without an extra client-side fetch on mount.
export const dynamic = 'force-dynamic'

import { and, count, eq, isNull, ne } from 'drizzle-orm'
import { AppHeader } from '@/components/AppHeader'
import { HeapOverview } from '@/components/heap/HeapOverview'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { heapNodes } from '@/lib/db/schema'
import { ensureTodoListsForUser } from '@/lib/db/todoLists'

export default async function HeapPage() {
  const user = await getCurrentUser()
  await ensureTodoListsForUser(user.id)

  const db = getDb()

  // Count nodes that belong to no project and are not project nodes themselves
  const [orphanResult] = await db
    .select({ orphanCount: count() })
    .from(heapNodes)
    .where(and(eq(heapNodes.userId, user.id), isNull(heapNodes.projectId), ne(heapNodes.type, 'project')))

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <AppHeader active="heap" />
      <HeapOverview orphanCount={orphanResult?.orphanCount ?? 0} />
    </div>
  )
}
