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
    <main className="max-w-2xl mx-auto p-4 space-y-6">
      <div className="flex items-center gap-3">
        <a href="/" className="text-muted-foreground hover:text-foreground text-sm">← Back</a>
        <h1 className="text-xl font-bold"><span aria-hidden="true">⚠</span> Review Soon ({dueTriggers.length} items)</h1>
      </div>
      <ReviewQueueClient grouped={grouped} />
    </main>
  )
}
