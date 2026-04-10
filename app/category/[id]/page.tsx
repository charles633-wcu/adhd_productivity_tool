import { notFound } from 'next/navigation'
import { getDb } from '@/lib/db/client'
import { categories, triggers } from '@/lib/db/schema'
import { eq, and, asc, lte } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth'
import { CategoryViewClient } from '@/components/CategoryViewClient'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ sort?: string; filter?: string }>
}

// Category view — server component, fetches triggers for the given category
export default async function CategoryPage({ params, searchParams }: PageProps) {
  const user = await getCurrentUser()
  const db = getDb()
  const { id } = await params
  const { sort, filter } = await searchParams

  // Fetch the category — 404 if not found or doesn't belong to user
  const [category] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, user.id)))
    .limit(1)

  if (!category) notFound()

  // Apply filter from searchParams
  const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const filterDueSoon = filter === 'due_soon'

  const rows = await db
    .select()
    .from(triggers)
    .where(and(
      eq(triggers.categoryId, id),
      eq(triggers.status, 'active'),
      ...(filterDueSoon ? [lte(triggers.nextReviewAt, oneDayFromNow)] : [])
    ))
    .orderBy(asc(triggers.priority), asc(triggers.nextReviewAt))

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
          <span className="text-xl" aria-hidden="true">{category.icon ?? '📌'}</span>
          <h1 className="text-lg font-bold leading-none">{category.name}</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto w-full px-4 py-6">
        <CategoryViewClient
          categoryId={id}
          currentSort={sort ?? 'priority'}
          currentFilter={filter ?? 'all'}
          triggers={rows}
          categoryName={category.name}
        />
      </main>
    </div>
  )
}
