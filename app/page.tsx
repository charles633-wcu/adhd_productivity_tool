import { getDb } from '@/lib/db/client'
import { categories, triggers } from '@/lib/db/schema'
import { eq, and, lte, count as drizzleCount } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth'
import { ReviewBanner } from '@/components/ReviewBanner'
import { CategoryBubble } from '@/components/CategoryBubble'
import { HomeClient } from '@/components/HomeClient'

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

  // Fetch categories with trigger counts
  const categoryList = await db.select().from(categories).where(eq(categories.userId, user.id))
  const triggerCounts = await Promise.all(
    categoryList.map(async (cat) => {
      const [{ value }] = await db
        .select({ value: drizzleCount() })
        .from(triggers)
        .where(eq(triggers.categoryId, cat.id))
      return { categoryId: cat.id, count: Number(value) }
    })
  )

  const categoriesWithCounts = categoryList.map(cat => ({
    ...cat,
    count: triggerCounts.find(t => t.categoryId === cat.id)?.count ?? 0,
  }))

  return (
    <main className="max-w-2xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sentinel</h1>
        <HomeClient categories={categoriesWithCounts} />
      </div>
      <ReviewBanner count={Number(dueCount)} />
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Categories
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {categoriesWithCounts.map(cat => (
            <a key={cat.id} href={`/category/${cat.id}`}>
              <CategoryBubble
                id={cat.id}
                name={cat.name}
                icon={cat.icon}
                color={cat.color}
                count={cat.count}
                onClick={() => {}}
              />
            </a>
          ))}
        </div>
      </section>
    </main>
  )
}
