// DELETE /api/todos/[id]/labels/[labelId] — remove a label from a task.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { todos, todoTaskLabels } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { eq, and } from 'drizzle-orm'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; labelId: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id, labelId } = await params
    const db = getDb()
    const [task] = await db.select().from(todos).where(and(eq(todos.id, id), eq(todos.userId, user.id)))
    if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await db.delete(todoTaskLabels).where(and(eq(todoTaskLabels.todoId, id), eq(todoTaskLabels.labelId, labelId)))
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
