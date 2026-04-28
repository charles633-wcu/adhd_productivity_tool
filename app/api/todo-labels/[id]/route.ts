// Todo label detail API — update and delete individual labels.
// DELETE cleans up all junction rows (todo_task_labels) before removing the label.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import { todoLabels, todoTaskLabels } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { eq, and } from 'drizzle-orm'

const UpdateLabelSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'At least one field required' })

/**
 * PATCH /api/todo-labels/[id] — rename or recolor a label.
 * Ownership-scoped: only the label's owner can update it.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const body = await request.json()
    const parsed = UpdateLabelSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }
    const db = getDb()
    const [updated] = await db
      .update(todoLabels)
      .set(parsed.data)
      .where(and(eq(todoLabels.id, id), eq(todoLabels.userId, user.id)))
      .returning()
    if (!updated) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

/**
 * DELETE /api/todo-labels/[id] — remove a label and all its junction rows.
 * Ownership check: fetch the label first; 404 if not found or not owned by user.
 * Junction rows (todo_task_labels) are deleted before the label to avoid FK violations.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const db = getDb()

    // Ownership check — must find label owned by this user
    const [label] = await db
      .select()
      .from(todoLabels)
      .where(and(eq(todoLabels.id, id), eq(todoLabels.userId, user.id)))
    if (!label) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })

    // Remove all junction rows first to avoid FK constraint issues
    await db.delete(todoTaskLabels).where(eq(todoTaskLabels.labelId, id))
    await db.delete(todoLabels).where(and(eq(todoLabels.id, id), eq(todoLabels.userId, user.id)))
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
