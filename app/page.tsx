// Force dynamic rendering so the home due-count badge is never served from cache.
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { eq, and, lte, count as drizzleCount, inArray } from 'drizzle-orm'
import { HomePill } from '@/components/HomePill'
import { CategoryCanvas } from '@/components/CategoryCanvas'
import { TriggerStatusSummary } from '@/components/TriggerStatusSummary'
import { ChatFab } from '@/components/ChatFab'
import { ScratchPadFab } from '@/components/scratch/ScratchPadFab'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { categories, triggers } from '@/lib/db/schema'

// Home page server component. Fetches counts and category state, then renders the
// canvas as the fixed app surface with overlay controls above it.
export default async function HomePage() {
  const user = await getCurrentUser()
  const db = getDb()

  const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const [{ value: dueCount }] = await db
    .select({ value: drizzleCount() })
    .from(triggers)
    .where(and(
      eq(triggers.userId, user.id),
      eq(triggers.status, 'active'),
      lte(triggers.nextReviewAt, oneDayFromNow)
    ))

  const statusRows = await db
    .select({
      status: triggers.status,
      value: drizzleCount(),
    })
    .from(triggers)
    .where(eq(triggers.userId, user.id))
    .groupBy(triggers.status)

  const statusCounts = {
    active: 0,
    snoozed: 0,
    archived: 0,
  }

  for (const row of statusRows) {
    statusCounts[row.status] = Number(row.value)
  }

  const allActiveTriggers = await db
    .select()
    .from(triggers)
    .where(and(eq(triggers.userId, user.id), eq(triggers.status, 'active')))

  const categoryList = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, user.id))

  // Single grouped query replaces the previous N per-category queries
  const countRows = categoryList.length > 0
    ? await db
        .select({ categoryId: triggers.categoryId, count: drizzleCount() })
        .from(triggers)
        .where(and(
          inArray(triggers.categoryId, categoryList.map(c => c.id)),
          eq(triggers.status, 'active'),
        ))
        .groupBy(triggers.categoryId)
    : []

  const countMap = Object.fromEntries(countRows.map(r => [r.categoryId, Number(r.count)]))
  const categoriesWithCounts = categoryList.map(cat => ({
    ...cat,
    count: countMap[cat.id] ?? 0,
  }))

  const serializedTriggers = allActiveTriggers.map(trigger => ({
    ...trigger,
    nextReviewAt: trigger.nextReviewAt.toISOString(),
    lastReviewedAt: trigger.lastReviewedAt?.toISOString() ?? null,
    createdAt: trigger.createdAt.toISOString(),
    updatedAt: trigger.updatedAt.toISOString(),
  }))

  // Fetch today's incomplete task count for the pill badge
  const todayTodoCount = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/todos?view=today`
  )
    .then(r => r.json())
    .then((tasks: unknown[]) => tasks.length)
    .catch(() => 0)

  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      {categoriesWithCounts.length > 0 && (
        <CategoryCanvas categories={categoriesWithCounts} />
      )}

      <HomePill categories={categoriesWithCounts} triggers={serializedTriggers} todayTodoCount={todayTodoCount} />

      {Number(dueCount) > 0 && (
        <Link
          href="/review"
          className="fixed left-4 top-[70px] z-40 flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/12 px-4 min-h-[40px] text-sm font-semibold text-amber-400 backdrop-blur-sm hover:bg-amber-500/20 transition-colors"
        >
          <span aria-hidden="true">⚠</span>
          {Number(dueCount)} due
          <span className="text-amber-400/60">→ Review</span>
        </Link>
      )}

      <div className="pointer-events-none absolute left-4 bottom-24 z-10">
        <TriggerStatusSummary
          active={statusCounts.active}
          snoozed={statusCounts.snoozed}
          archived={statusCounts.archived}
          className="w-24"
        />
      </div>

      <ChatFab />
      <ScratchPadFab />

      {categoriesWithCounts.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="w-full max-w-md rounded-[28px] border border-dashed border-border/70 bg-background/72 px-8 py-12 text-center shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl">
            <p className="text-4xl leading-none">📡</p>
            <p className="mt-4 text-base font-semibold text-foreground">No categories yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Tap <span className="font-mono text-primary">Category</span> to create your first cluster.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
