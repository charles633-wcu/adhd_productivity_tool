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

      {/* Main content */}
      <main className="max-w-2xl mx-auto w-full px-4 py-6 space-y-6 flex-1">
        {/* ReviewBanner — only shown when items are due */}
        <ReviewBanner count={Number(dueCount)} />

        {/* Categories grid */}
        <section>
          <h2 className="text-xs font-mono font-medium text-muted-foreground uppercase tracking-widest mb-3">
            Categories
          </h2>
          {categoriesWithCounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-xl">
              <p className="text-2xl mb-2">📡</p>
              <p className="text-sm font-medium text-foreground">No categories yet</p>
              <p className="text-xs text-muted-foreground mt-1">Click <span className="font-mono text-primary">+ Category</span> to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {categoriesWithCounts.map((cat, i) => (
                <div key={cat.id} className="animate-in" style={{ animationDelay: `${i * 40}ms` }}>
                  <CategoryBubble
                    id={cat.id}
                    name={cat.name}
                    icon={cat.icon}
                    color={cat.color}
                    count={cat.count}
                    href={`/category/${cat.id}`}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
