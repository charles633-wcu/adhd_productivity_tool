// GET + POST for /api/calendar/events
import { NextResponse } from 'next/server'
import { createId } from '@paralleldrive/cuid2'
import { RRule } from 'rrule'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { createCalendarEvent, listEventOverridesForIds, listEventsInRange } from '@/lib/db/calendar'
import { expandEvents } from '@/lib/services/repeatExpander'
import type { CalendarEventOverride } from '@/lib/db/schema'

function isValidRRule(value: string) {
  try {
    return RRule.parseString(value).freq != null
  } catch {
    return false
  }
}

const CreateSchema = z
  .object({
    title: z.string().min(1).max(100),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
    notes: z.string().optional().nullable(),
    rrule: z.string().optional().nullable().refine(value => !value || isValidRRule(value), {
      message: 'Invalid rrule',
    }),
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
    const overrides = listEventOverridesForIds(db, events.map(event => event.id))
    const overridesByMasterId = new Map<string, CalendarEventOverride[]>()

    for (const override of overrides) {
      const group = overridesByMasterId.get(override.masterEventId) ?? []
      group.push(override)
      overridesByMasterId.set(override.masterEventId, group)
    }

    return NextResponse.json(expandEvents(events, overridesByMasterId, rangeFrom, rangeTo))
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
      id: createId(),
      userId: user.id,
      title: parsed.data.title,
      startAt: new Date(parsed.data.startAt),
      endAt: new Date(parsed.data.endAt),
      color: parsed.data.color ?? null,
      notes: parsed.data.notes ?? null,
      rrule: parsed.data.rrule ?? null,
      exdates: null,
      categoryId: parsed.data.categoryId ?? null,
    })
    return NextResponse.json(row, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
