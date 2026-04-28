// Todo list detail API — update and delete individual lists.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import { todoLists, todos } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { eq, and } from 'drizzle-orm'

const UpdateListSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().optional(),
  emoji: z.string().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'At least one field required' })

/**
 * PATCH /api/todo-lists/[id] — rename, recolor, or re-emoji a list.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const body = await request.json()
    const parsed = UpdateListSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }
    const db = getDb()
    const [updated] = await db
      .update(todoLists)
      .set(parsed.data)
      .where(and(eq(todoLists.id, id), eq(todoLists.userId, user.id)))
      .returning()
    if (!updated) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

/**
 * DELETE /api/todo-lists/[id] — delete a list; moves its tasks to Inbox first.
 * Inbox (name === 'Inbox') cannot be deleted — returns 403.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const db = getDb()

    // Ownership + Inbox guard
    const [list] = await db
      .select()
      .from(todoLists)
      .where(and(eq(todoLists.id, id), eq(todoLists.userId, user.id)))
    if (!list) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
    if (list.name === 'Inbox') {
      return NextResponse.json({ error: 'Inbox cannot be deleted', code: 'FORBIDDEN' }, { status: 403 })
    }

    // Find user's Inbox to move tasks into
    const [inbox] = await db
      .select()
      .from(todoLists)
      .where(and(eq(todoLists.userId, user.id), eq(todoLists.name, 'Inbox')))
    if (inbox) {
      await db.update(todos).set({ listId: inbox.id }).where(eq(todos.listId, id))
    }

    await db.delete(todoLists).where(and(eq(todoLists.id, id), eq(todoLists.userId, user.id)))
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
