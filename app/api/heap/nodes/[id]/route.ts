import { NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { heapNodes } from '@/lib/db/schema'

const PatchNodeSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  type: z.enum(['task_cluster', 'note', 'goal', 'reference', 'brain_dump']).optional(),
  body: z.string().max(10000).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  posX: z.number().finite().optional(),
  posY: z.number().finite().optional(),
})

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const db = getDb()
    const [node] = await db.select().from(heapNodes)
      .where(and(eq(heapNodes.id, id), eq(heapNodes.userId, user.id)))
    if (!node) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json(node)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const body = await request.json()
    const parsed = PatchNodeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const db = getDb()
    const [existing] = await db.select().from(heapNodes)
      .where(and(eq(heapNodes.id, id), eq(heapNodes.userId, user.id)))
    if (!existing) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })

    const [updated] = await db.update(heapNodes).set(parsed.data)
      .where(and(eq(heapNodes.id, id), eq(heapNodes.userId, user.id)))
      .returning()
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const db = getDb()
    const [existing] = await db.select().from(heapNodes)
      .where(and(eq(heapNodes.id, id), eq(heapNodes.userId, user.id)))
    if (!existing) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })

    await db.delete(heapNodes).where(and(eq(heapNodes.id, id), eq(heapNodes.userId, user.id)))
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
