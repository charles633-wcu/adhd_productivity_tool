// Todo Labels API — list and create labels for the current user.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import { todoLabels } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'

const CreateLabelSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().optional(),
})

/**
 * GET /api/todo-labels — returns all labels scoped to the current user.
 */
export async function GET(_request: Request) {
  try {
    const user = await getCurrentUser()
    const db = getDb()
    const labels = await db.select().from(todoLabels).where(eq(todoLabels.userId, user.id))
    return NextResponse.json(labels)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

/**
 * POST /api/todo-labels — create a new label.
 * Validates name (1–50 chars) and optional hex color.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    const body = await request.json()
    const parsed = CreateLabelSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }
    const db = getDb()
    const [label] = await db
      .insert(todoLabels)
      .values({ id: createId(), userId: user.id, ...parsed.data })
      .returning()
    return NextResponse.json(label, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
