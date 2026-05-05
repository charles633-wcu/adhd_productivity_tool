import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { heapEdges } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string }> }

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const db = getDb()
    const [existing] = await db.select().from(heapEdges)
      .where(and(eq(heapEdges.id, id), eq(heapEdges.userId, user.id)))
    if (!existing) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })

    await db.delete(heapEdges).where(and(eq(heapEdges.id, id), eq(heapEdges.userId, user.id)))
    return new Response(null, { status: 204 })
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
