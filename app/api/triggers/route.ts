// Triggers API — list and create triggers for the current user.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import { triggers } from '@/lib/db/schema'
import { createTrigger } from '@/lib/db/triggers'
import { getCurrentUser } from '@/lib/auth'
import { eq, and } from 'drizzle-orm'

// Zod schema for creating a trigger
const CreateTriggerSchema = z.object({
  categoryId: z.string().min(1),
  title: z.string().min(1).max(200),
  fullContent: z.string().default(''),
  priority: z.number().int().min(0).max(3).default(2),
  reviewIntervalDays: z.number().int().min(1).max(365).default(7),
})

/**
 * GET /api/triggers?categoryId=xxx — list triggers (optionally filtered by category)
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser()
    const { searchParams } = new URL(request.url)
    const categoryId = searchParams.get('categoryId')
    const db = getDb()

    // Filter by categoryId if provided, otherwise return all user's triggers
    const rows = categoryId
      ? await db.select().from(triggers).where(and(eq(triggers.userId, user.id), eq(triggers.categoryId, categoryId)))
      : await db.select().from(triggers).where(eq(triggers.userId, user.id))

    return NextResponse.json(rows)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

/**
 * POST /api/triggers — create a new trigger, sets next_review_at = now + interval
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    const body = await request.json()
    const parsed = CreateTriggerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }
    const db = getDb()
    // Compute next_review_at at creation time
    const now = new Date()
    const nextReviewAt = new Date(now.getTime() + parsed.data.reviewIntervalDays * 24 * 60 * 60 * 1000)
    const trigger = await createTrigger(db, { ...parsed.data, userId: user.id, nextReviewAt })
    return NextResponse.json(trigger, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
