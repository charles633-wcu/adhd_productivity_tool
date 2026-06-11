// chatTools — extensible registry of tools the chat model can invoke.
// Each entry: { definition (JSON Schema), handler(args, userId, db) }.
// To add a new tool: push one { definition, handler } object to CHAT_TOOLS.
// The API route iterates this array automatically — no other changes needed.

import { eq, and, lte, like, or, isNotNull, asc, desc, sql, count as drizzleCount } from 'drizzle-orm'
import { triggers, categories, todos, heapNodes } from '@/lib/db/schema'
import type { DrizzleDb } from '@/lib/db/client'
import type { ToolDefinition } from './chatProvider'
import { CHAT_TOOL_DESCS } from './chatToolDefs'
import { listEventsInRange, listEventOverridesForIds } from '@/lib/db/calendar'
import { expandEvents } from '@/lib/services/repeatExpander'
import type { CalendarEventOverride } from '@/lib/db/schema'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface ChatTool {
  definition: ToolDefinition
  /**
   * Executes the tool for the authenticated user's data.
   * @param args - JSON-compatible model arguments validated by the tool's schema contract.
   * @param userId - Authenticated owner identifier used to restrict queries.
   * @param db - Database client used for tool queries.
   * @returns A promise resolving to JSON-serializable tool output.
   */
  handler(args: Record<string, unknown>, userId: string, db: DrizzleDb): Promise<unknown>
}

/**
 * Tool registry exposed to the chat orchestration route.
 *
 * Each handler accepts schema-shaped arguments, an authenticated user ID, and a database
 * client, then returns JSON-serializable results suitable for a tool response.
 */
export const CHAT_TOOLS: ChatTool[] = [
  // ── search_triggers ──────────────────────────────────────────────────────────
  {
    definition: {
      name: 'search_triggers',
      description: CHAT_TOOL_DESCS.search_triggers,
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
      description: CHAT_TOOL_DESCS.search_categories,
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
      description: CHAT_TOOL_DESCS.get_due_triggers,
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
      description: CHAT_TOOL_DESCS.get_trigger_detail,
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

  // ── get_due_todos ─────────────────────────────────────────────────────────────
  // Incomplete tasks with a due date on or before today+N days (overdue tasks included
  // because their dueDate is < today). Undated and completed tasks are excluded — this
  // tool is about time-bound, actionable work for a briefing.
  {
    definition: {
      name: 'get_due_todos',
      description: CHAT_TOOL_DESCS.get_due_todos,
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'How many days ahead to look (default 7, max 365)' },
        },
        required: [],
      },
    },
    async handler(args, userId, db) {
      const days = Math.min(Number(args.days ?? 7), 365)
      // dueDate is stored as a 'YYYY-MM-DD' string; ISO date prefixes compare lexicographically
      const cutoff = new Date(Date.now() + days * MS_PER_DAY).toISOString().slice(0, 10)

      const rows = await db
        .select({
          id: todos.id,
          title: todos.title,
          priority: todos.priority,
          dueDate: todos.dueDate,
          dueTime: todos.dueTime,
          listId: todos.listId,
        })
        .from(todos)
        .where(
          and(
            eq(todos.userId, userId),
            eq(todos.completed, 0),
            isNotNull(todos.dueDate),
            lte(todos.dueDate, cutoff),
          )
        )
        .orderBy(asc(todos.dueDate))
        .limit(50)

      return rows
    },
  },

  // ── get_calendar ──────────────────────────────────────────────────────────────
  // Reuses the calendar GET route's logic: load base events, attach overrides, expand
  // recurring rules into concrete occurrences within [now, now+N days].
  {
    definition: {
      name: 'get_calendar',
      description: CHAT_TOOL_DESCS.get_calendar,
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
      const rangeFrom = new Date()
      const rangeTo = new Date(Date.now() + days * MS_PER_DAY)

      const events = await listEventsInRange(db, userId, rangeFrom, rangeTo)
      const overrides = listEventOverridesForIds(db, events.map(e => e.id))
      const overridesByMasterId = new Map<string, CalendarEventOverride[]>()
      for (const override of overrides) {
        const group = overridesByMasterId.get(override.masterEventId) ?? []
        group.push(override)
        overridesByMasterId.set(override.masterEventId, group)
      }

      const occurrences = expandEvents(events, overridesByMasterId, rangeFrom, rangeTo)
      // Serialize Date fields to ISO strings for the model
      return occurrences.map(o => ({
        title: o.title,
        startAt: o.startAt.toISOString(),
        endAt: o.endAt.toISOString(),
        categoryId: o.categoryId,
      }))
    },
  },

  // ── get_heap_nodes ────────────────────────────────────────────────────────────
  // Mind/heap knowledge-graph nodes. Optional exact priority filter. Ordered by priority
  // (critical → high → normal → low) via a CASE expression, then most-recently-updated.
  {
    definition: {
      name: 'get_heap_nodes',
      description: CHAT_TOOL_DESCS.get_heap_nodes,
      parameters: {
        type: 'object',
        properties: {
          priority: {
            type: 'string',
            enum: ['low', 'normal', 'high', 'critical'],
            description: 'Optional exact priority filter',
          },
        },
        required: [],
      },
    },
    async handler(args, userId, db) {
      const priority = args.priority ? String(args.priority) : null
      const priorityRank = sql`CASE ${heapNodes.priority} WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`

      const rows = await db
        .select({
          id: heapNodes.id,
          title: heapNodes.title,
          type: heapNodes.type,
          priority: heapNodes.priority,
          body: heapNodes.body,
        })
        .from(heapNodes)
        .where(
          and(
            eq(heapNodes.userId, userId),
            priority ? eq(heapNodes.priority, priority as typeof heapNodes.priority._.data) : undefined,
          )
        )
        .orderBy(priorityRank, desc(heapNodes.updatedAt))
        .limit(50)

      // Truncate long bodies so the model context stays lean
      return rows.map(r => ({
        ...r,
        body: r.body && r.body.length > 200 ? `${r.body.slice(0, 200)}…` : r.body,
      }))
    },
  },
]
