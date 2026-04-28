// Todo detail API — fetch, update, and delete individual tasks.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import { todos } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { eq, and } from 'drizzle-orm'

const UpdateTodoSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  priority: z.enum(['high', 'medium', 'low', 'none']).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  completed: z.boolean().optional(),
  listId: z.string().optional(),
  sortOrder: z.number().int().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'At least one field required' })

/**
 * GET /api/todos/[id] — fetch a single task (ownership verified) with its subtasks.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const db = getDb()
    const [todo] = await db
      .select()
      .from(todos)
      .where(and(eq(todos.id, id), eq(todos.userId, user.id)))
    if (!todo) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
    // Fetch subtasks for this task
    const subtasks = await db
      .select()
      .from(todos)
      .where(and(eq(todos.parentId, id), eq(todos.userId, user.id)))
    return NextResponse.json({ ...todo, subtasks })
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

/**
 * PATCH /api/todos/[id] — update any task field; sets completedAt when marking done.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const body = await request.json()
    const parsed = UpdateTodoSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }
    const db = getDb()
    const { completed, ...rest } = parsed.data
    const updatePayload: Record<string, unknown> = { ...rest }
    // Set completedAt timestamp when toggling completion state
    if (completed !== undefined) {
      updatePayload.completed = completed ? 1 : 0
      updatePayload.completedAt = completed ? new Date() : null
    }
    const [updated] = await db
      .update(todos)
      .set(updatePayload)
      .where(and(eq(todos.id, id), eq(todos.userId, user.id)))
      .returning()
    if (!updated) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

/**
 * DELETE /api/todos/[id] — delete task and all its subtasks (cascade).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const db = getDb()
    // Ownership check before deleting
    const [owned] = await db
      .select()
      .from(todos)
      .where(and(eq(todos.id, id), eq(todos.userId, user.id)))
    if (!owned) return new NextResponse(null, { status: 204 })
    // Cascade: delete subtasks first, then parent
    await db.delete(todos).where(and(eq(todos.parentId, id), eq(todos.userId, user.id)))
    await db.delete(todos).where(and(eq(todos.id, id), eq(todos.userId, user.id)))
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
