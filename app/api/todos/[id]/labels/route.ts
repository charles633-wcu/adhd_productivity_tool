// GET + POST /api/todos/[id]/labels — list and assign labels to a task.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import { todos, todoLabels, todoTaskLabels } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { eq, and } from 'drizzle-orm'

const AssignLabelSchema = z.object({ labelId: z.string().min(1) })

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const db = getDb()
    const [task] = await db.select().from(todos).where(and(eq(todos.id, id), eq(todos.userId, user.id)))
    if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const rows = await db
      .select({ id: todoLabels.id, name: todoLabels.name, color: todoLabels.color, userId: todoLabels.userId, createdAt: todoLabels.createdAt })
      .from(todoTaskLabels)
      .innerJoin(todoLabels, eq(todoTaskLabels.labelId, todoLabels.id))
      .where(eq(todoTaskLabels.todoId, id))
    return NextResponse.json(rows)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const body = await request.json()
    const parsed = AssignLabelSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })
    const db = getDb()
    // Verify task ownership
    const [task] = await db.select().from(todos).where(and(eq(todos.id, id), eq(todos.userId, user.id)))
    if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // Verify label ownership (cross-ownership check)
    const [label] = await db.select().from(todoLabels)
      .where(and(eq(todoLabels.id, parsed.data.labelId), eq(todoLabels.userId, user.id)))
    if (!label) return NextResponse.json({ error: 'Label not found' }, { status: 404 })
    // Upsert — composite PK prevents duplicates
    await db.insert(todoTaskLabels).values({ todoId: id, labelId: parsed.data.labelId }).onConflictDoNothing()
    return NextResponse.json({ todoId: id, labelId: parsed.data.labelId }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
