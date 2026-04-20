export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getDb } from '@/lib/db/client'
import { categories, triggers } from '@/lib/db/schema'
import { eq, and, asc, lte } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth'
import { CategoryViewClient } from '@/components/CategoryViewClient'
import { CategoryHeader } from '@/components/CategoryHeader'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ filter?: string }>
}

// Category view — server component, fetches triggers for the given category
export default async function CategoryPage({ params, searchParams }: PageProps) {
  const user = await getCurrentUser()
  const db = getDb()
  const { id } = await params
  const { filter } = await searchParams

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
      {/* Sticky header — CategoryHeader is a client component for the edit sheet */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
        <CategoryHeader
          id={id}
          name={category.name}
          icon={category.icon}
          color={category.color}
        />
      </header>

      <main className="max-w-2xl mx-auto w-full px-4 py-6">
        <CategoryViewClient
          categoryId={id}
          currentFilter={filter ?? 'all'}
          triggers={rows}
          categoryName={category.name}
        />
      </main>
    </div>
  )
}
