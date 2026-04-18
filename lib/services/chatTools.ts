// chatTools — extensible registry of tools the chat model can invoke.
// Each entry: { definition (JSON Schema), handler(args, userId, db) }.
// To add a new tool: push one { definition, handler } object to CHAT_TOOLS.
// The API route iterates this array automatically — no other changes needed.

import { eq, and, lte, like, or, count as drizzleCount } from 'drizzle-orm'
import { triggers, categories } from '@/lib/db/schema'
import type { DrizzleDb } from '@/lib/db/client'
import type { ToolDefinition } from './chatProvider'

export interface ChatTool {
  definition: ToolDefinition
  handler(args: Record<string, unknown>, userId: string, db: DrizzleDb): Promise<unknown>
}

export const CHAT_TOOLS: ChatTool[] = [
  // ── search_triggers ──────────────────────────────────────────────────────────
  {
    definition: {
      name: 'search_triggers',
      description: "Search the user's triggers by keyword across title and content. Optionally filter by category.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Keyword to search in trigger title and full content' },
          categoryId: { type: 'string', description: 'Optional category UUID to restrict results' },
        },
        required: ['query'],
      },
    },
    async handler(args, userId, db) {
      const query = String(args.query ?? '').trim()
      const pattern = `%${query}%`

      const rows = await db
        .select({
          id: triggers.id,
          title: triggers.title,
          content: triggers.fullContent,
          nextReviewAt: triggers.nextReviewAt,
          categoryId: triggers.categoryId,
          status: triggers.status,
        })
        .from(triggers)
        .where(
          and(
            eq(triggers.userId, userId),
            args.categoryId ? eq(triggers.categoryId, String(args.categoryId)) : undefined,
            or(like(triggers.title, pattern), like(triggers.fullContent, pattern)),
          )
        )
        .limit(20)

      return rows.map(r => ({ ...r, nextReviewAt: r.nextReviewAt.toISOString() }))
    },
  },

  // ── search_categories ─────────────────────────────────────────────────────────
  {
    definition: {
      name: 'search_categories',
      description: 'Return all categories for the user including trigger counts.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    async handler(_args, userId, db) {
      const cats = await db
        .select({ id: categories.id, name: categories.name, icon: categories.icon, color: categories.color })
        .from(categories)
        .where(eq(categories.userId, userId))

      if (cats.length === 0) return []

      const countRows = await db
        .select({ categoryId: triggers.categoryId, count: drizzleCount() })
        .from(triggers)
        .where(and(eq(triggers.userId, userId), eq(triggers.status, 'active')))
        .groupBy(triggers.categoryId)

      const countMap = Object.fromEntries(countRows.map(r => [r.categoryId, Number(r.count)]))
      return cats.map(c => ({ ...c, triggerCount: countMap[c.id] ?? 0 }))
    },
  },

  // ── get_due_triggers ──────────────────────────────────────────────────────────
  {
    definition: {
      name: 'get_due_triggers',
      description: 'Return triggers due for review within the next N days (default 7, max 90).',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'How many days ahead to look (default 7, max 90)' },
        },
        required: [],
      },
    },
    async handler(args, userId, db) {
      const days = Math.min(Number(args.days ?? 7), 90)
      const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

      const rows = await db
        .select({
          id: triggers.id,
          title: triggers.title,
          nextReviewAt: triggers.nextReviewAt,
          categoryId: triggers.categoryId,
        })
        .from(triggers)
        .where(and(eq(triggers.userId, userId), eq(triggers.status, 'active'), lte(triggers.nextReviewAt, cutoff)))
        .limit(50)

      return rows.map(r => ({ ...r, nextReviewAt: r.nextReviewAt.toISOString() }))
    },
  },

  // ── get_trigger_detail ────────────────────────────────────────────────────────
  {
    definition: {
      name: 'get_trigger_detail',
      description: 'Return full details for a single trigger including notes, summary, and review history.',
      parameters: {
        type: 'object',
        properties: {
          triggerId: { type: 'string', description: 'UUID of the trigger' },
        },
        required: ['triggerId'],
      },
    },
    async handler(args, userId, db) {
      const [row] = await db
        .select()
        .from(triggers)
        .where(and(eq(triggers.id, String(args.triggerId)), eq(triggers.userId, userId)))
        .limit(1)

      if (!row) return { error: 'Trigger not found' }

      return {
        id: row.id,
        title: row.title,
        content: row.fullContent,
        summary: row.summary,
        summaryStatus: row.summaryStatus,
        nextReviewAt: row.nextReviewAt.toISOString(),
        lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null,
        reviewIntervalDays: row.reviewIntervalDays,
        notes: row.agentMetadata?.notes ?? [],
        condensedHistory: row.agentMetadata?.condensedHistory ?? null,
      }
    },
  },
]
