// Trigger detail API — update and delete individual triggers.
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import { triggers } from '@/lib/db/schema'
import { acknowledgeTrigger, rescheduleTrigger } from '@/lib/db/triggers'
import { snapToDate } from '@/lib/services/reviewClock'
import { getCurrentUser } from '@/lib/auth'
import { eq, and } from 'drizzle-orm'

// Zod schema for partial trigger updates
const UpdateTriggerSchema = z.object({
  title: z.string().min(1).optional(),
  fullContent: z.string().optional(),
  summary: z.string().optional(),
  summaryStatus: z.enum(['pending', 'generated', 'manual']).optional(),
  priority: z.number().int().min(0).max(3).optional(),
  reviewIntervalDays: z.number().int().min(0).optional(),
  // Special field: when true, calls acknowledgeTrigger() to reset the review clock
  acknowledge: z.boolean().optional(),
  // Special field: when provided (ISO datetime), directly overrides nextReviewAt
  rescheduleDate: z.string().datetime().optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'At least one field required' })

function revalidateTriggerViews(categoryId: string) {
  revalidatePath('/')
  revalidatePath('/review')
  revalidatePath(`/category/${categoryId}`)
}

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
    // Ownership check: verify the trigger belongs to the current user before acknowledging
    if (parsed.data.acknowledge) {
      const [owned] = await db.select().from(triggers).where(and(eq(triggers.id, id), eq(triggers.userId, user.id))).limit(1)
      if (!owned) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
      const trigger = await acknowledgeTrigger(db, id)
      revalidateTriggerViews(trigger.categoryId)
      return NextResponse.json(trigger)
    }

    // Reschedule branch — ownership check, past-date validation, then override nextReviewAt
    // Note: rescheduleTrigger itself does not validate past dates — that is the API layer's job
    if (parsed.data.rescheduleDate) {
      const [owned] = await db
        .select()
        .from(triggers)
        .where(and(eq(triggers.id, id), eq(triggers.userId, user.id)))
        .limit(1)
      if (!owned) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })

      const requestedDate = new Date(parsed.data.rescheduleDate)
      const snapped = snapToDate(requestedDate)
      // Reject past dates: compare noon UTC of requested day vs noon UTC of today
      if (snapped.getTime() < snapToDate(new Date()).getTime()) {
        return NextResponse.json(
          { error: 'rescheduleDate must be today or a future date', code: 'VALIDATION_ERROR' },
          { status: 400 }
        )
      }

      const trigger = await rescheduleTrigger(db, id, snapped)
      revalidateTriggerViews(trigger.categoryId)
      return NextResponse.json(trigger)
    }

    // General field update — remove the acknowledge and rescheduleDate keys before passing to DB
    const { acknowledge: _, rescheduleDate: __, ...fields } = parsed.data
    const [updated] = await db
      .update(triggers)
      .set(fields)
      .where(and(eq(triggers.id, id), eq(triggers.userId, user.id)))
      .returning()

    if (!updated) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
    revalidateTriggerViews(updated.categoryId)
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
    const [owned] = await db.select().from(triggers).where(and(eq(triggers.id, id), eq(triggers.userId, user.id))).limit(1)
    if (!owned) return new NextResponse(null, { status: 204 })
    await db.delete(triggers).where(and(eq(triggers.id, id), eq(triggers.userId, user.id)))
    revalidateTriggerViews(owned.categoryId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
