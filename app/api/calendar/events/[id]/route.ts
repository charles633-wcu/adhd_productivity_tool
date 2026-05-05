// PATCH + DELETE for /api/calendar/events/[id]
import { NextResponse } from 'next/server'
import { createId } from '@paralleldrive/cuid2'
import { and, eq, gte } from 'drizzle-orm'
import { RRule, type Options } from 'rrule'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { deleteCalendarEvent, getCalendarEvent, updateCalendarEvent } from '@/lib/db/calendar'
import { calendarEventOverrides, calendarEvents, type CalendarEvent, type NewCalendarEvent } from '@/lib/db/schema'
import { toNormalizedIso } from '@/lib/services/repeatExpander'

type RecurScope = 'this' | 'thisAndFollowing' | 'all'

const OCCURRENCE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/

function isValidRRule(value: string) {
  try {
    return RRule.parseString(value).freq != null
  } catch {
    return false
  }
}

const PatchSchema = z
  .object({
    title: z.string().min(1).max(100).optional(),
    startAt: z.string().datetime().optional(),
    endAt: z.string().datetime().optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
    notes: z.string().optional().nullable(),
    rrule: z.string().optional().nullable().refine(value => !value || isValidRRule(value), {
      message: 'Invalid rrule',
    }),
    categoryId: z.string().optional().nullable(),
    scope: z.enum(['this', 'thisAndFollowing', 'all']).optional(),
    occurrenceDate: z.string().regex(OCCURRENCE_RE).optional(),
  })
  .refine(d => !d.startAt || !d.endAt || new Date(d.endAt) >= new Date(d.startAt), {
    message: 'endAt must be >= startAt',
  })

const DeleteSchema = z.object({
  scope: z.enum(['this', 'thisAndFollowing', 'all']).optional(),
  occurrenceDate: z.string().regex(OCCURRENCE_RE).optional(),
})

function eventPatchFromInput(data: z.infer<typeof PatchSchema>): Partial<NewCalendarEvent> {
  const patch: Partial<NewCalendarEvent> = {}
  if ('title' in data) patch.title = data.title
  if ('startAt' in data) patch.startAt = data.startAt ? new Date(data.startAt) : undefined
  if ('endAt' in data) patch.endAt = data.endAt ? new Date(data.endAt) : undefined
  if ('color' in data) patch.color = data.color ?? null
  if ('notes' in data) patch.notes = data.notes ?? null
  if ('rrule' in data) patch.rrule = data.rrule ?? null
  if ('categoryId' in data) patch.categoryId = data.categoryId ?? null
  return patch
}

function stripRRulePrefix(value: string) {
  return value.replace(/^DTSTART[^\n]*\n/, '').replace(/^RRULE:/, '')
}

function serializeOptions(options: Partial<Options>) {
  return stripRRulePrefix(new RRule(options).toString())
}

function splitOptions(event: CalendarEvent, occurrenceDate: string) {
  const opts = RRule.parseString(event.rrule!)
  const occurrenceStart = new Date(occurrenceDate)
  const beforeUntil = new Date(occurrenceStart.getTime() - 1000)

  if (opts.count != null) {
    const rule = new RRule({ ...opts, dtstart: event.startAt })
    const remaining = rule.all().filter(date => date >= occurrenceStart).length
    if (remaining <= 0) return { mode: 'all' as const }

    const before = opts.count - remaining
    if (before <= 0) return { mode: 'deleteMaster' as const, remaining }

    return {
      mode: 'split' as const,
      masterRrule: serializeOptions({ ...opts, dtstart: undefined, count: before }),
      newRrule: serializeOptions({ ...opts, dtstart: undefined, count: remaining }),
    }
  }

  const currentUntil = opts.until
  const masterUntil = currentUntil && currentUntil <= occurrenceStart
    ? currentUntil
    : beforeUntil

  return {
    mode: 'split' as const,
    masterRrule: serializeOptions({ ...opts, dtstart: undefined, until: masterUntil }),
    newRrule: serializeOptions({ ...opts, dtstart: undefined, until: null }),
  }
}

async function purgeForwardData(
  db: ReturnType<typeof getDb>,
  event: CalendarEvent,
  occurrenceDate: string,
  extraPatch: Partial<NewCalendarEvent> = {},
) {
  await db
    .delete(calendarEventOverrides)
    .where(and(
      eq(calendarEventOverrides.masterEventId, event.id),
      gte(calendarEventOverrides.originalDate, occurrenceDate),
    ))

  const exdates = (event.exdates ?? []).filter(date => date < occurrenceDate)
  // Merge exdates + any caller-supplied fields (e.g. rrule) into a single UPDATE
  await db
    .update(calendarEvents)
    .set({ exdates: exdates.length > 0 ? exdates : null, ...extraPatch })
    .where(eq(calendarEvents.id, event.id))
}

function buildSplitRow(event: CalendarEvent, occurrenceDate: string, patch: Partial<NewCalendarEvent>, rrule: string): NewCalendarEvent {
  const startAt = patch.startAt ?? new Date(occurrenceDate)
  const endAt = patch.endAt ?? new Date(startAt.getTime() + event.endAt.getTime() - event.startAt.getTime())

  return {
    id: createId(),
    userId: event.userId,
    title: patch.title ?? event.title,
    startAt,
    endAt,
    notes: patch.notes ?? event.notes,
    color: patch.color ?? event.color,
    categoryId: patch.categoryId ?? event.categoryId,
    rrule,
    exdates: null,
  }
}

async function applyThisAndFollowingPatch(
  db: ReturnType<typeof getDb>,
  event: CalendarEvent,
  occurrenceDate: string,
  patch: Partial<NewCalendarEvent>,
) {
  const split = splitOptions(event, occurrenceDate)

  if (split.mode === 'all') {
    const [row] = await updateCalendarEvent(db, event.id, event.userId, patch)
    return row
  }

  if (split.mode === 'deleteMaster') {
    await purgeForwardData(db, event, occurrenceDate)
    await deleteCalendarEvent(db, event.id, event.userId)
    const [row] = await db.insert(calendarEvents).values(buildSplitRow(event, occurrenceDate, patch, serializeOptions(RRule.parseString(event.rrule!)))).returning()
    return row
  }

  // Single UPDATE: exdates trim + new master rrule in one round-trip
  await purgeForwardData(db, event, occurrenceDate, { rrule: split.masterRrule })
  const [row] = await db.insert(calendarEvents).values(buildSplitRow(event, occurrenceDate, patch, split.newRrule)).returning()
  return row
}

async function truncateThisAndFollowing(db: ReturnType<typeof getDb>, event: CalendarEvent, occurrenceDate: string) {
  const split = splitOptions(event, occurrenceDate)

  if (split.mode === 'all') {
    await deleteCalendarEvent(db, event.id, event.userId)
    return
  }

  if (split.mode === 'deleteMaster') {
    await purgeForwardData(db, event, occurrenceDate)
    await deleteCalendarEvent(db, event.id, event.userId)
    return
  }

  // Single UPDATE: exdates trim + truncated rrule in one round-trip
  await purgeForwardData(db, event, occurrenceDate, { rrule: split.masterRrule })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const parsed = PatchSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })

    const db = getDb()
    const [event] = await getCalendarEvent(db, id, user.id)
    if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const patch = eventPatchFromInput(parsed.data)
    const scope: RecurScope = event.rrule ? (parsed.data.scope ?? 'all') : 'all'

    if (event.rrule && scope !== 'all' && !parsed.data.occurrenceDate) {
      return NextResponse.json({ error: 'occurrenceDate is required for recurring event scope' }, { status: 400 })
    }

    if (scope === 'this') {
      const occurrenceDate = parsed.data.occurrenceDate!
      const startAt = patch.startAt ?? new Date(occurrenceDate)
      const endAt = patch.endAt ?? new Date(startAt.getTime() + event.endAt.getTime() - event.startAt.getTime())
      const [row] = await db
        .insert(calendarEventOverrides)
        .values({
          masterEventId: event.id,
          originalDate: occurrenceDate,
          title: patch.title ?? event.title,
          startAt,
          endAt,
          notes: patch.notes ?? event.notes,
        })
        .onConflictDoUpdate({
          target: [calendarEventOverrides.masterEventId, calendarEventOverrides.originalDate],
          set: {
            title: patch.title ?? event.title,
            startAt,
            endAt,
            notes: patch.notes ?? event.notes,
          },
        })
        .returning()
      return NextResponse.json(row)
    }

    if (scope === 'thisAndFollowing') {
      const row = await applyThisAndFollowingPatch(db, event, parsed.data.occurrenceDate!, patch)
      return NextResponse.json(row)
    }

    const [row] = await updateCalendarEvent(db, id, user.id, patch)
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const parsed = DeleteSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })

    const db = getDb()
    const [event] = await getCalendarEvent(db, id, user.id)
    if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const scope: RecurScope = event.rrule ? (parsed.data.scope ?? 'all') : 'all'
    if (event.rrule && scope !== 'all' && !parsed.data.occurrenceDate) {
      return NextResponse.json({ error: 'occurrenceDate is required for recurring event scope' }, { status: 400 })
    }

    if (scope === 'this') {
      const exdates = Array.from(new Set([...(event.exdates ?? []), parsed.data.occurrenceDate!])).sort()
      await updateCalendarEvent(db, id, user.id, { exdates })
      return new Response(null, { status: 204 })
    }

    if (scope === 'thisAndFollowing') {
      await truncateThisAndFollowing(db, event, parsed.data.occurrenceDate!)
      return new Response(null, { status: 204 })
    }

    await deleteCalendarEvent(db, id, user.id)
    return new Response(null, { status: 204 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
