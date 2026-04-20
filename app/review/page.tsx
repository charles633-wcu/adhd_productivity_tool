export const dynamic = 'force-dynamic'

import { getDb } from '@/lib/db/client'
import { categories, triggers } from '@/lib/db/schema'
import { eq, and, lte, asc } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth'
import { ReviewQueueClient } from '@/components/ReviewQueueClient'
import type { Category, Trigger } from '@/lib/db/schema'

// Review queue — all active triggers due within 1 day, grouped by category
export default async function ReviewPage() {
  const user = await getCurrentUser()
  const db = getDb()

  const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000)

  // Fetch all due triggers scoped to the current user
  const dueTriggers = await db
    .select()
    .from(triggers)
    .where(and(
      eq(triggers.userId, user.id),
      eq(triggers.status, 'active'),
      lte(triggers.nextReviewAt, oneDayFromNow)
    ))
    .orderBy(asc(triggers.priority), asc(triggers.nextReviewAt))

  // Fetch all categories for name lookup
  const categoryList = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, user.id))

  // Group triggers by category, drop categories with no due items
  const grouped: Array<{ category: Category; triggers: Trigger[] }> = categoryList
    .map(cat => ({
      category: cat,
      triggers: dueTriggers.filter(t => t.categoryId === cat.id),
    }))
    .filter(group => group.triggers.length > 0)

  return (
    <div className="min-h-screen flex flex-col">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <a
            href="/"
            className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            ← back
          </a>
          <span className="text-muted-foreground/30">/</span>
          <h1 className="text-lg font-bold leading-none">
            <span aria-hidden="true" className="text-amber-400">⚠</span>
            {' '}Review Queue
          </h1>
          <span className="ml-auto text-xs font-mono text-muted-foreground">
            {dueTriggers.length} {dueTriggers.length === 1 ? 'item' : 'items'}
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto w-full px-4 py-6">
        <ReviewQueueClient grouped={grouped} />
      </main>
    </div>
  )
}
