import { NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { heapEdges, heapNodes } from '@/lib/db/schema'

const CreateEdgeSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
})

function toReactFlowEdge(edge: { id: string; userId: string; sourceId: string; targetId: string; label: string | null; priority: string; createdAt: Date }) {
  const { sourceId, targetId, userId: _userId, ...rest } = edge
  return { ...rest, source: sourceId, target: targetId }
}

export async function GET() {
  try {
    const user = await getCurrentUser()
    const db = getDb()
    const edges = await db.select().from(heapEdges).where(eq(heapEdges.userId, user.id))
    return NextResponse.json(edges.map(toReactFlowEdge))
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    const body = await request.json()
    const parsed = CreateEdgeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const { sourceId, targetId } = parsed.data
    const db = getDb()

    const [sourceNode] = await db.select().from(heapNodes)
      .where(and(eq(heapNodes.id, sourceId), eq(heapNodes.userId, user.id)))
    if (!sourceNode) return NextResponse.json({ error: 'Source node not found', code: 'NOT_FOUND' }, { status: 404 })

    const [targetNode] = await db.select().from(heapNodes)
      .where(and(eq(heapNodes.id, targetId), eq(heapNodes.userId, user.id)))
    if (!targetNode) return NextResponse.json({ error: 'Target node not found', code: 'NOT_FOUND' }, { status: 404 })

    // Self-loop check after ownership verification to avoid leaking node existence
    if (sourceId === targetId) {
      return NextResponse.json({ error: 'Source and target must differ', code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    try {
      const [edge] = await db.insert(heapEdges).values({
        id: createId(),
        userId: user.id,
        sourceId,
        targetId,
      }).returning()
      return NextResponse.json(toReactFlowEdge(edge), { status: 201 })
    } catch (insertError) {
      if (String(insertError).includes('UNIQUE')) {
        return NextResponse.json({ error: 'Edge already exists', code: 'CONFLICT' }, { status: 409 })
      }
      throw insertError
    }
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
