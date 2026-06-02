import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { heapEdges } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string }> }

const PatchEdgeSchema = z.object({
  priority: z.enum(['normal', 'high']),
})

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const body = await request.json()
    const parsed = PatchEdgeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }
    const db = getDb()
    const [existing] = await db.select().from(heapEdges)
      .where(and(eq(heapEdges.id, id), eq(heapEdges.userId, user.id)))
    if (!existing) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })

    const [updated] = await db.update(heapEdges)
      .set({ priority: parsed.data.priority })
      .where(and(eq(heapEdges.id, id), eq(heapEdges.userId, user.id)))
      .returning()
    const { sourceId, targetId, userId: _userId, ...rest } = updated
    return NextResponse.json({ ...rest, source: sourceId, target: targetId })
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

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
