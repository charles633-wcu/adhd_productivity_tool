/**
 * GET + POST /api/heap/nodes/[id]/triggers
 *
 * GET  — Returns the lean trigger subset for all triggers linked to a heap node.
 *         Ownership is checked on both the node (heapNodes.userId) and each trigger
 *         (triggers.userId) to prevent IDOR.
 *
 * POST — Links an existing trigger to a heap node.
 *         Body: { triggerId: string }
 *         Returns 201 with a lean trigger payload (id, title, status, nextReviewAt, categoryId).
 *         Returns 404 if the node or trigger is not owned by the caller.
 *         Returns 409 if the link already exists (UNIQUE constraint).
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { heapNodeTriggers, heapNodes, triggers } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string }> }

const LinkTriggerSchema = z.object({ triggerId: z.string().min(1) })

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const db = getDb()

    // Ownership check — node must belong to caller
    const [node] = await db.select().from(heapNodes)
      .where(and(eq(heapNodes.id, id), eq(heapNodes.userId, user.id)))
    if (!node) return NextResponse.json({ error: 'Node not found', code: 'NOT_FOUND' }, { status: 404 })

    // Fetch junction rows
    const junctions = await db.select().from(heapNodeTriggers).where(eq(heapNodeTriggers.nodeId, id))
    if (junctions.length === 0) return NextResponse.json([])

    // Fetch lean trigger data — userId/fullContent intentionally excluded
    const triggerIds = junctions.map((j) => j.triggerId)
    const linkedTriggers = await db
      .select({
        id: triggers.id,
        title: triggers.title,
        status: triggers.status,
        nextReviewAt: triggers.nextReviewAt,
        categoryId: triggers.categoryId,
      })
      .from(triggers)
      .where(and(eq(triggers.userId, user.id), inArray(triggers.id, triggerIds)))
    return NextResponse.json(linkedTriggers)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const body = await request.json()

    // Validate request body
    const parsed = LinkTriggerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const db = getDb()

    // Ownership check — node must belong to caller
    const [node] = await db.select().from(heapNodes)
      .where(and(eq(heapNodes.id, id), eq(heapNodes.userId, user.id)))
    if (!node) return NextResponse.json({ error: 'Node not found', code: 'NOT_FOUND' }, { status: 404 })

    // IDOR guard — trigger must also belong to caller; return lean subset
    const [trigger] = await db
      .select({
        id: triggers.id,
        title: triggers.title,
        status: triggers.status,
        nextReviewAt: triggers.nextReviewAt,
        categoryId: triggers.categoryId,
      })
      .from(triggers)
      .where(and(eq(triggers.id, parsed.data.triggerId), eq(triggers.userId, user.id)))
    if (!trigger) return NextResponse.json({ error: 'Trigger not found', code: 'NOT_FOUND' }, { status: 404 })

    // Insert junction row; handle duplicate gracefully
    try {
      await db.insert(heapNodeTriggers).values({ nodeId: id, triggerId: parsed.data.triggerId })
      // Return only the lean subset regardless of what the DB layer returns
      const leanTrigger = {
        id: trigger.id,
        title: trigger.title,
        status: trigger.status,
        nextReviewAt: trigger.nextReviewAt,
        categoryId: trigger.categoryId,
      }
      return NextResponse.json(leanTrigger, { status: 201 })
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
