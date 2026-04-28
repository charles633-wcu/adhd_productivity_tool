// Todos API — list tasks by view/filter and create tasks or subtasks.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import { todos, todoLists, todoTaskLabels } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { eq, and, isNull, gt, lte, inArray, asc, sql } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'

// Zod schema for task creation — dueTime requires dueDate via refine
const CreateTodoSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  listId: z.string().optional(),
  parentId: z.string().optional(),
  priority: z.enum(['high', 'medium', 'low', 'none']).default('none'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
}).refine(d => !(d.dueTime && !d.dueDate), {
  message: 'dueTime requires dueDate',
  path: ['dueTime'],
})

// Return today's date as YYYY-MM-DD in local time (server time)
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// Add N days to a YYYY-MM-DD string and return the result as YYYY-MM-DD
function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Priority sort order: high=0, medium=1, low=2, none=3 — used in ORDER BY clauses
const PRIORITY_ORDER = sql`CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END`

type TodoRow = typeof todos.$inferSelect

/**
 * Fetch subtasks for a list of root task IDs and nest them under each root task.
 * Short-circuits and returns `{ ...row, subtasks: [] }` when rootRows is empty.
 */
async function nestSubtasks(db: ReturnType<typeof getDb>, rootRows: TodoRow[], userId: string) {
  // Short-circuit: no root rows means no subtask query needed
  if (rootRows.length === 0) return rootRows.map(r => ({ ...r, subtasks: [] }))

  const rootIds = rootRows.map(r => r.id)

  // Single query for all subtasks belonging to these root tasks
  const subtasks = await db.select().from(todos).where(
    and(eq(todos.userId, userId), inArray(todos.parentId, rootIds))
  )

  // Group subtasks by parentId for O(1) lookup
  const subtaskMap = new Map<string, TodoRow[]>()
  for (const sub of subtasks) {
    const key = sub.parentId!
    if (!subtaskMap.has(key)) subtaskMap.set(key, [])
    subtaskMap.get(key)!.push(sub)
  }

  return rootRows.map(r => ({ ...r, subtasks: subtaskMap.get(r.id) ?? [] }))
}

/**
 * GET /api/todos — list root tasks by view or filter; returns subtasks nested.
 *
 * Query params:
 *   view       inbox | today | upcoming | all (default)
 *   listId     filter by specific list (takes precedence when view="all")
 *   labelId    filter by label via junction table
 *   completed  0 | 1 — only applied when listId is provided
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser()
    const db = getDb()
    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view') ?? 'all'
    const listId = searchParams.get('listId')
    const labelId = searchParams.get('labelId')
    const completedParam = searchParams.get('completed')

    let rows: TodoRow[]

    if (labelId) {
      // Label filter: join through junction table to get matching todo IDs
      const junctionRows = await db
        .select({ todoId: todoTaskLabels.todoId })
        .from(todoTaskLabels)
        .where(eq(todoTaskLabels.labelId, labelId))
      const todoIds = junctionRows.map(r => r.todoId)
      rows = todoIds.length > 0
        ? await db.select().from(todos).where(
            and(eq(todos.userId, user.id), isNull(todos.parentId), eq(todos.completed, 0), inArray(todos.id, todoIds))
          ).orderBy(PRIORITY_ORDER, asc(todos.dueDate), asc(todos.sortOrder))
        : []
    } else if (view === 'inbox') {
      // Inbox view: tasks in the "Inbox" list that are incomplete
      const [inbox] = await db.select().from(todoLists)
        .where(and(eq(todoLists.userId, user.id), eq(todoLists.name, 'Inbox')))
      const inboxId = inbox?.id
      rows = inboxId
        ? await db.select().from(todos).where(and(
            eq(todos.userId, user.id),
            eq(todos.listId, inboxId),
            eq(todos.completed, 0),
            isNull(todos.parentId),
          )).orderBy(PRIORITY_ORDER, asc(todos.dueDate), asc(todos.sortOrder))
        : []
    } else if (view === 'today') {
      // Today view: incomplete tasks due exactly today
      const today = todayStr()
      rows = await db.select().from(todos).where(and(
        eq(todos.userId, user.id),
        eq(todos.dueDate, today),
        eq(todos.completed, 0),
        isNull(todos.parentId),
      )).orderBy(PRIORITY_ORDER, asc(todos.sortOrder))
    } else if (view === 'upcoming') {
      // Upcoming view: incomplete tasks due in the next 7 days (excludes today)
      const today = todayStr()
      const cutoff = addDays(today, 7)
      rows = await db.select().from(todos).where(and(
        eq(todos.userId, user.id),
        gt(todos.dueDate, today),       // strictly after today
        lte(todos.dueDate, cutoff),     // within 7 days
        eq(todos.completed, 0),
        isNull(todos.parentId),
      )).orderBy(asc(todos.dueDate), PRIORITY_ORDER, asc(todos.sortOrder))
    } else if (listId) {
      // List filter with optional completed=0|1
      const completedFilter = completedParam === '1' ? eq(todos.completed, 1)
        : completedParam === '0' ? eq(todos.completed, 0)
        : undefined
      rows = await db.select().from(todos).where(and(
        eq(todos.userId, user.id),
        eq(todos.listId, listId),
        isNull(todos.parentId),
        completedFilter,
      )).orderBy(PRIORITY_ORDER, asc(todos.dueDate), asc(todos.sortOrder))
    } else {
      // Default (view=all): all incomplete root tasks across all lists
      rows = await db.select().from(todos).where(and(
        eq(todos.userId, user.id),
        eq(todos.completed, 0),
        isNull(todos.parentId),
      )).orderBy(PRIORITY_ORDER, asc(todos.dueDate), asc(todos.sortOrder))
    }

    const nested = await nestSubtasks(db, rows, user.id)
    return NextResponse.json(nested)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

/**
 * POST /api/todos — create a task or subtask.
 *
 * Subtask rules:
 *   - parentId must point to an existing root task (parentId === null)
 *   - Subtask inherits the parent's listId
 *   - Cannot nest more than one level deep (parent must be a root task)
 *
 * If no listId and no parentId, task is placed in the user's Inbox list.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    const body = await request.json()
    const parsed = CreateTodoSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }
    const db = getDb()
    const { parentId, listId: rawListId, ...rest } = parsed.data

    let resolvedListId = rawListId

    // Subtask validation: parent must exist and be a root-level task
    if (parentId) {
      const [parent] = await db
        .select()
        .from(todos)
        .where(and(eq(todos.id, parentId), eq(todos.userId, user.id)))

      if (!parent) {
        return NextResponse.json({ error: 'Parent task not found', code: 'NOT_FOUND' }, { status: 404 })
      }
      if (parent.parentId !== null) {
        return NextResponse.json(
          { error: 'Cannot nest subtasks more than one level', code: 'VALIDATION_ERROR' },
          { status: 400 }
        )
      }
      // Inherit parent's list so subtask stays in the same list
      resolvedListId = parent.listId
    }

    // If no listId provided and no parentId, fall back to the user's Inbox
    if (!resolvedListId) {
      const [inbox] = await db
        .select()
        .from(todoLists)
        .where(and(eq(todoLists.userId, user.id), eq(todoLists.name, 'Inbox')))
      resolvedListId = inbox?.id
    }

    if (!resolvedListId) {
      return NextResponse.json(
        { error: 'No list found — run db:seed first', code: 'NOT_FOUND' },
        { status: 400 }
      )
    }

    const [todo] = await db
      .insert(todos)
      .values({
        id: createId(),
        userId: user.id,
        listId: resolvedListId,
        parentId: parentId ?? null,
        ...rest,
      })
      .returning()

    return NextResponse.json(todo, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
