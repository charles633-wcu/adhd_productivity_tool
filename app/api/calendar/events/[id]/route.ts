// PATCH + DELETE for /api/calendar/events/[id]
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { updateCalendarEvent, deleteCalendarEvent } from '@/lib/db/calendar'

const PatchSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  notes: z.string().optional().nullable(),
  repeatFrequency: z.enum(['day', 'week', 'month', 'year']).optional().nullable(),
  repeatInterval: z.number().int().min(1).max(120).optional().nullable(),
  repeatEndsAt: z.string().datetime().optional().nullable(),
  categoryId: z.string().optional().nullable(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const parsed = PatchSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })
    const db = getDb()
    const patch: Record<string, unknown> = { ...parsed.data }
    if (parsed.data.startAt) patch.startAt = new Date(parsed.data.startAt)
    if (parsed.data.endAt) patch.endAt = new Date(parsed.data.endAt)
    if (parsed.data.repeatEndsAt) patch.repeatEndsAt = new Date(parsed.data.repeatEndsAt)
    const [row] = await updateCalendarEvent(
      db,
      id,
      user.id,
      patch as Parameters<typeof updateCalendarEvent>[3],
    )
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const db = getDb()
    await deleteCalendarEvent(db, id, user.id)
    return new Response(null, { status: 204 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
