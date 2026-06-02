// GET + POST for /api/calendar/event-categories
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { listEventCategories, createEventCategory } from '@/lib/db/calendar'
import { createId } from '@paralleldrive/cuid2'

const CreateSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
})

/**
 * Lists calendar event categories for the authenticated user.
 * @returns A promise resolving to a JSON response containing category rows or an error.
 */
export async function GET() {
  try {
    const user = await getCurrentUser()
    const db = getDb()
    const rows = await listEventCategories(db, user.id)
    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

/**
 * Creates a calendar event category for the authenticated user.
 * @param request - Request with JSON `{ name: string, color?: "#RRGGBB" }`.
 * @returns A promise resolving to the created category response or a validation/server error.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    const parsed = CreateSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })
    const db = getDb()
    const [row] = await createEventCategory(db, { ...parsed.data, userId: user.id, id: createId() })
    return NextResponse.json(row, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
