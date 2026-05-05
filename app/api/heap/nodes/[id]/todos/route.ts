import { NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { heapNodeTodos, heapNodes, todos } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string }> }

const LinkTodoSchema = z.object({ todoId: z.string().min(1) })

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const db = getDb()
    const [node] = await db.select().from(heapNodes)
      .where(and(eq(heapNodes.id, id), eq(heapNodes.userId, user.id)))
    if (!node) return NextResponse.json({ error: 'Node not found', code: 'NOT_FOUND' }, { status: 404 })

    const junctions = await db.select().from(heapNodeTodos).where(eq(heapNodeTodos.nodeId, id))
    if (junctions.length === 0) return NextResponse.json([])

    const todoIds = junctions.map((junction) => junction.todoId)
    const linkedTodos = await db.select().from(todos)
      .where(and(eq(todos.userId, user.id), inArray(todos.id, todoIds)))
    return NextResponse.json(linkedTodos)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const body = await request.json()
    const parsed = LinkTodoSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const db = getDb()
    const [node] = await db.select().from(heapNodes)
      .where(and(eq(heapNodes.id, id), eq(heapNodes.userId, user.id)))
    if (!node) return NextResponse.json({ error: 'Node not found', code: 'NOT_FOUND' }, { status: 404 })

    const [todo] = await db.select().from(todos)
      .where(and(eq(todos.id, parsed.data.todoId), eq(todos.userId, user.id)))
    if (!todo) return NextResponse.json({ error: 'Todo not found', code: 'NOT_FOUND' }, { status: 404 })

    try {
      const [junction] = await db.insert(heapNodeTodos)
        .values({ nodeId: id, todoId: parsed.data.todoId })
        .returning()
      return NextResponse.json(junction, { status: 201 })
    } catch (insertError) {
      if (String(insertError).includes('UNIQUE') || String(insertError).includes('PRIMARY KEY')) {
        return NextResponse.json({ error: 'Link already exists', code: 'CONFLICT' }, { status: 409 })
      }
      throw insertError
    }
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
