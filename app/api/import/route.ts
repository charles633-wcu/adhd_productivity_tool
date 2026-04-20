// Import API — bulk-creates categories (if missing) then inserts all triggers.
// Skips duplicate titles (case-insensitive) that already exist for the user.
// Fires /api/summarize async for rows with fullContent > 100 chars.
// Called from the /import page after the user confirms their CSV preview.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import { categories, triggers } from '@/lib/db/schema'
import { createTrigger } from '@/lib/db/triggers'
import { summarizeTrigger } from '@/lib/services/summarizer'
import { getCurrentUser } from '@/lib/auth'
import { eq, and } from 'drizzle-orm'

const RowSchema = z.object({
  categoryName: z.string().min(1).max(50),
  title: z.string().min(1).max(500),
  priority: z.number().int().min(0).max(3),
  reviewIntervalDays: z.number().int().min(1).max(365),
  // fullContent holds overflow text from long Notion entries
  fullContent: z.string().max(10000).optional().default(''),
  // summary pre-filled from CSV export (AI summary column in Notion)
  summary: z.string().max(2000).optional().default(''),
})

const ImportSchema = z.object({
  rows: z.array(RowSchema).min(1).max(500),
})

// Color palette cycled for auto-created categories
const AUTO_COLORS = [
  '#FF6B6B', '#FF9500', '#F59E0B', '#10B981',
  '#14B8A6', '#3B82F6', '#8B5CF6', '#EC4899',
]

// Minimum content length to trigger AI summarization
const MIN_SUMMARY_LENGTH = 100

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    const body = await request.json()
    const parsed = ImportSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 })
    }

    const db = getDb()
    const { rows } = parsed.data

    // Fetch existing categories once to avoid N+1 lookups
    const existingCats = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, user.id))

    const existingByName = new Map(existingCats.map(c => [c.name.toLowerCase(), c]))
    const categoryMap = new Map<string, string>()
    let colorCursor = existingCats.length

    // Resolve every unique category name — create if it doesn't exist yet
    for (const name of [...new Set(rows.map(r => r.categoryName))]) {
      const existing = existingByName.get(name.toLowerCase())
      if (existing) {
        categoryMap.set(name, existing.id)
      } else {
        const [newCat] = await db.insert(categories).values({
          userId: user.id,
          name,
          color: AUTO_COLORS[colorCursor % AUTO_COLORS.length],
        }).returning()
        categoryMap.set(name, newCat.id)
        colorCursor++
      }
    }

    // Fetch existing trigger titles for this user (for duplicate check)
    const existingTriggers = await db
      .select({ title: triggers.title })
      .from(triggers)
      .where(eq(triggers.userId, user.id))

    const existingTitles = new Set(existingTriggers.map(t => t.title.toLowerCase().trim()))

    // Insert triggers, skipping duplicates
    const now = new Date()
    let inserted = 0
    let skipped = 0
    const toSummarize: Array<{ id: string; content: string }> = []

    for (const row of rows) {
      // Skip if a trigger with this title already exists for the user
      if (existingTitles.has(row.title.toLowerCase().trim())) {
        skipped++
        continue
      }

      const categoryId = categoryMap.get(row.categoryName)!
      const nextReviewAt = new Date(now.getTime() + row.reviewIntervalDays * 24 * 60 * 60 * 1000)

      // Use pre-existing CSV summary if present, otherwise mark pending
      const hasCsvSummary = row.summary.trim().length > 0
      const hasLongContent = row.fullContent.trim().length >= MIN_SUMMARY_LENGTH

      const trigger = await createTrigger(db, {
        userId: user.id,
        categoryId,
        title: row.title,
        fullContent: row.fullContent,
        summary: hasCsvSummary ? row.summary : null,
        summaryStatus: hasCsvSummary ? 'generated' : 'pending',
        priority: row.priority,
        reviewIntervalDays: row.reviewIntervalDays,
        nextReviewAt,
        status: 'active',
      })

      inserted++
      existingTitles.add(row.title.toLowerCase().trim()) // prevent intra-batch duplicates

      // Queue for AI summarization if content is long enough and no CSV summary exists
      if (!hasCsvSummary && hasLongContent) {
        toSummarize.push({ id: trigger.id, content: row.fullContent })
      }
    }

    // Fire summarization for queued triggers — errors are swallowed per contract
    // (trigger stays 'pending', user can retry from Details)
    await Promise.allSettled(
      toSummarize.map(async ({ id, content }) => {
        try {
          const summary = await summarizeTrigger(content)
          await db.update(triggers)
            .set({ summary, summaryStatus: 'generated' })
            .where(and(eq(triggers.id, id), eq(triggers.userId, user.id)))
        } catch {
          // Leave summaryStatus = 'pending' — user can retry from TriggerCard
        }
      })
    )

    return NextResponse.json({ inserted, skipped })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
