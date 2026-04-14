// Force dynamic rendering so the ReviewBanner count is never served from cache
export const dynamic = 'force-dynamic'

import { getDb } from '@/lib/db/client'
import { categories, triggers } from '@/lib/db/schema'
import { eq, and, lte, count as drizzleCount } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth'
import { ReviewBanner } from '@/components/ReviewBanner'
import { CategoryCanvas } from '@/components/CategoryCanvas'
import { HomeClient } from '@/components/HomeClient'
import { TriggerStatusSummary } from '@/components/TriggerStatusSummary'
import { ScheduleCalendar } from '@/components/ScheduleCalendar'

// Home page — server component that fetches category list and due-count, then passes to client
export default async function HomePage() {
  const user = await getCurrentUser()
  const db = getDb()

  // Count triggers due within 1 day
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

  // Fetch all active triggers for the home-page scheduling calendar
  const allActiveTriggers = await db
    .select()
    .from(triggers)
    .where(and(eq(triggers.userId, user.id), eq(triggers.status, 'active')))

  // Fetch categories with active trigger counts
  const categoryList = await db.select().from(categories).where(eq(categories.userId, user.id))
  const triggerCounts = await Promise.all(
    categoryList.map(async (cat) => {
      const [{ value }] = await db
        .select({ value: drizzleCount() })
        .from(triggers)
        .where(and(eq(triggers.categoryId, cat.id), eq(triggers.status, 'active')))
      return { categoryId: cat.id, count: Number(value) }
    })
  )

  const categoriesWithCounts = categoryList.map(cat => ({
    ...cat,
    count: triggerCounts.find(t => t.categoryId === cat.id)?.count ?? 0,
  }))

  // Serialize Date fields so they survive the server→client boundary as strings
  const serializedTriggers = allActiveTriggers.map(t => ({
    ...t,
    nextReviewAt: t.nextReviewAt.toISOString(),
    lastReviewedAt: t.lastReviewedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }))

  return (
    <div className="min-h-screen flex flex-col">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight leading-none">Sentinel</h1>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">Intelligence Layer</p>
          </div>
          <HomeClient categories={categoriesWithCounts} />
        </div>
      </header>

      {/* Main content — narrow for banner, full-width for canvas */}
      <main className="flex-1 flex flex-col">
        <div className="max-w-2xl mx-auto w-full px-4 pt-6">
          {/* ReviewBanner — only shown when items are due */}
          <ReviewBanner count={Number(dueCount)} />

          {/* Scheduling calendar — spread triggers across the next 6 weeks */}
          <ScheduleCalendar triggers={serializedTriggers} />
        </div>

        {/* Categories — full-width hex canvas */}
        <section className="relative flex-1 px-4 pt-4 pb-6">
          <h2 className="max-w-2xl mx-auto text-xs font-mono font-medium text-muted-foreground uppercase tracking-widest mb-4">
            Categories
          </h2>
          <div className="pointer-events-none absolute inset-x-4 top-11 z-10">
            <TriggerStatusSummary
              active={statusCounts.active}
              snoozed={statusCounts.snoozed}
              archived={statusCounts.archived}
              className="mx-auto max-w-2xl"
            />
          </div>
          {categoriesWithCounts.length === 0 ? (
            <div className="max-w-2xl mx-auto flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-xl">
              <p className="text-2xl mb-2">📡</p>
              <p className="text-sm font-medium text-foreground">No categories yet</p>
              <p className="text-xs text-muted-foreground mt-1">Click <span className="font-mono text-primary">+ Category</span> to get started</p>
            </div>
          ) : (
            <CategoryCanvas categories={categoriesWithCounts} />
          )}
        </section>
      </main>
    </div>
  )
}
