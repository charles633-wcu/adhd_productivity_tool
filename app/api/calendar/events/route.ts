// GET + POST for /api/calendar/events
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { listEventsInRange, createCalendarEvent } from '@/lib/db/calendar'
import { expandRepeatingEvent } from '@/lib/services/repeatExpander'
import { createId } from '@paralleldrive/cuid2'

const CreateSchema = z
  .object({
    title: z.string().min(1).max(100),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    notes: z.string().optional(),
    repeatIntervalDays: z.number().int().positive().optional().nullable(),
    repeatEndsAt: z.string().datetime().optional().nullable(),
    categoryId: z.string().optional().nullable(),
  })
  .refine(d => new Date(d.endAt) >= new Date(d.startAt), { message: 'endAt must be >= startAt' })

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser()
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    if (!from || !to) return NextResponse.json({ error: 'from and to are required' }, { status: 400 })

    const db = getDb()
    const rangeFrom = new Date(from)
    const rangeTo = new Date(to)
    const events = await listEventsInRange(db, user.id, rangeFrom, rangeTo)

    // Expand repeating events into individual occurrences within the range
    const occurrences = events.flatMap(ev =>
      expandRepeatingEvent(ev as Parameters<typeof expandRepeatingEvent>[0], rangeFrom, rangeTo),
    )
    return NextResponse.json(occurrences)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    const parsed = CreateSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })
    const db = getDb()
    const [row] = await createCalendarEvent(db, {
      ...parsed.data,
      id: createId(),
      userId: user.id,
      startAt: new Date(parsed.data.startAt),
      endAt: new Date(parsed.data.endAt),
      repeatEndsAt: parsed.data.repeatEndsAt ? new Date(parsed.data.repeatEndsAt) : null,
    })
    return NextResponse.json(row, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
