import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { heapNodeTodos, heapNodes, todos } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string; todoId: string }> }

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const user = await getCurrentUser()
    const { id, todoId } = await params
    const db = getDb()

    const [node] = await db.select().from(heapNodes)
      .where(and(eq(heapNodes.id, id), eq(heapNodes.userId, user.id)))
    if (!node) return NextResponse.json({ error: 'Node not found', code: 'NOT_FOUND' }, { status: 404 })

    const [todo] = await db.select().from(todos)
      .where(and(eq(todos.id, todoId), eq(todos.userId, user.id)))
    if (!todo) return NextResponse.json({ error: 'Todo not found', code: 'NOT_FOUND' }, { status: 404 })

    const [junction] = await db.select().from(heapNodeTodos)
      .where(and(eq(heapNodeTodos.nodeId, id), eq(heapNodeTodos.todoId, todoId)))
    if (!junction) return NextResponse.json({ error: 'Link not found', code: 'NOT_FOUND' }, { status: 404 })

    await db.delete(heapNodeTodos)
      .where(and(eq(heapNodeTodos.nodeId, id), eq(heapNodeTodos.todoId, todoId)))
    return new Response(null, { status: 204 })
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
