// Trigger detail API — update and delete individual triggers.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import { triggers } from '@/lib/db/schema'
import { acknowledgeTrigger } from '@/lib/db/triggers'
import { getCurrentUser } from '@/lib/auth'
import { eq, and } from 'drizzle-orm'

// Zod schema for partial trigger updates
const UpdateTriggerSchema = z.object({
  summary: z.string().optional(),
  summaryStatus: z.enum(['pending', 'generated', 'manual']).optional(),
  priority: z.number().int().min(0).max(3).optional(),
  // Special field: when true, calls acknowledgeTrigger() to reset the review clock
  acknowledge: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'At least one field required' })

/**
 * PATCH /api/triggers/[id] — update summary, priority, or acknowledge the trigger
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const body = await request.json()
    const parsed = UpdateTriggerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }
    const db = getDb()

    // Acknowledge is a special action — delegates to acknowledgeTrigger() for clock reset
    if (parsed.data.acknowledge) {
      const trigger = await acknowledgeTrigger(db, id)
      return NextResponse.json(trigger)
    }

    // General field update — remove the acknowledge key before passing to DB
    const { acknowledge: _, ...fields } = parsed.data
    const [updated] = await db
      .update(triggers)
      .set(fields)
      .where(and(eq(triggers.id, id), eq(triggers.userId, user.id)))
      .returning()

    if (!updated) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

/**
 * DELETE /api/triggers/[id] — permanently remove a trigger
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const db = getDb()
    await db.delete(triggers).where(and(eq(triggers.id, id), eq(triggers.userId, user.id)))
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
