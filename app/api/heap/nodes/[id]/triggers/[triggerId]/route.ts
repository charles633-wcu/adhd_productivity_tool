/**
 * DELETE /api/heap/nodes/[id]/triggers/[triggerId]
 *
 * Removes the junction row linking a trigger to a heap node.
 * Ownership checks are performed on both the node and the trigger
 * before the junction row is looked up and deleted.
 *
 * Responses:
 *   204 — junction row deleted
 *   404 — node not found / not owned, trigger not found / not owned,
 *          or junction row does not exist
 *   500 — unexpected DB error
 */

import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { heapNodeTriggers, heapNodes, triggers } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string; triggerId: string }> }

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const user = await getCurrentUser()
    const { id, triggerId } = await params
    const db = getDb()

    // Verify the caller owns the node
    const [node] = await db.select().from(heapNodes)
      .where(and(eq(heapNodes.id, id), eq(heapNodes.userId, user.id)))
    if (!node) return NextResponse.json({ error: 'Node not found', code: 'NOT_FOUND' }, { status: 404 })

    // Verify the caller owns the trigger (IDOR guard)
    const [trigger] = await db.select().from(triggers)
      .where(and(eq(triggers.id, triggerId), eq(triggers.userId, user.id)))
    if (!trigger) return NextResponse.json({ error: 'Trigger not found', code: 'NOT_FOUND' }, { status: 404 })

    // Confirm the junction row exists before attempting deletion
    const [junction] = await db.select().from(heapNodeTriggers)
      .where(and(eq(heapNodeTriggers.nodeId, id), eq(heapNodeTriggers.triggerId, triggerId)))
    if (!junction) return NextResponse.json({ error: 'Link not found', code: 'NOT_FOUND' }, { status: 404 })

    // Delete the junction row
    await db.delete(heapNodeTriggers)
      .where(and(eq(heapNodeTriggers.nodeId, id), eq(heapNodeTriggers.triggerId, triggerId)))

    return new Response(null, { status: 204 })
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
