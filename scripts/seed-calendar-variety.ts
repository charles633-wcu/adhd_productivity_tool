/**
 * seed-calendar-variety.ts — populates the worktree's calendar with a varied
 * set of events for exercising the vertical-scroll view and RRULE expansion:
 *   - one-off (non-repeating) events
 *   - open-ended repeating events (daily / weekly / biweekly / monthly)
 *   - repeating events that stop (COUNT=… or UNTIL=…)
 *
 * After inserting, it expands every event with the SAME expander the calendar
 * page uses (expandEvents) over a 3-month window and prints the resulting
 * occurrence dates, so we can confirm each RRULE behaves as intended.
 *
 * Run from the worktree root with: npx tsx scripts/seed-calendar-variety.ts
 */
import { createId } from '@paralleldrive/cuid2'
import { eq } from 'drizzle-orm'
import { getDb } from '../lib/db/client'
import { calendarEvents, users } from '../lib/db/schema'
import { expandEvents } from '../lib/services/repeatExpander'

// A seed event plus a human-readable note describing its repeat cadence.
interface SeedEvent {
  title: string
  start: string // ISO (UTC) — anchored at noon UTC where date-only matters
  durationMin: number
  color: string
  rrule: string | null
  cadence: string // plain-English description printed for the user
}

const SEED_EVENTS: SeedEvent[] = [
  // ── One-off (no rrule) ──────────────────────────────────────────────
  { title: 'Dentist appointment', start: '2026-06-19T15:30:00.000Z', durationMin: 60, color: '#f59e0b', rrule: null, cadence: 'One-off (does not repeat)' },
  { title: 'Flight to NYC',       start: '2026-06-24T22:00:00.000Z', durationMin: 180, color: '#ef4444', rrule: null, cadence: 'One-off (does not repeat)' },
  { title: 'Team offsite',        start: '2026-08-05T16:00:00.000Z', durationMin: 480, color: '#14b8a6', rrule: null, cadence: 'One-off (does not repeat)' },

  // ── Open-ended repeating ────────────────────────────────────────────
  { title: 'Morning run',         start: '2026-06-15T12:00:00.000Z', durationMin: 45, color: '#22c55e', rrule: 'FREQ=DAILY',                                  cadence: 'Every day (open-ended)' },
  { title: '1:1 with manager',    start: '2026-06-17T17:00:00.000Z', durationMin: 30, color: '#6366f1', rrule: 'FREQ=WEEKLY;BYDAY=WE',                        cadence: 'Weekly, every Wednesday (open-ended)' },
  { title: 'Design review',       start: '2026-06-18T18:00:00.000Z', durationMin: 60, color: '#a855f7', rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TH',             cadence: 'Every 2 weeks, on Thursdays (open-ended)' },
  { title: 'Rent due',            start: '2026-07-01T12:00:00.000Z', durationMin: 30, color: '#eab308', rrule: 'FREQ=MONTHLY;BYMONTHDAY=1',                   cadence: 'Monthly, on the 1st (open-ended)' },
  { title: 'Payday',              start: '2026-06-15T12:00:00.000Z', durationMin: 30, color: '#10b981', rrule: 'FREQ=MONTHLY;BYMONTHDAY=15',                  cadence: 'Monthly, on the 15th (open-ended)' },

  // ── Repeating but bounded (COUNT / UNTIL) ───────────────────────────
  { title: 'Spanish class',       start: '2026-06-16T23:00:00.000Z', durationMin: 60, color: '#3b82f6', rrule: 'FREQ=WEEKLY;BYDAY=TU;COUNT=10',               cadence: 'Weekly on Tuesdays, 10 sessions then STOPS (COUNT=10)' },
  { title: 'Summer bootcamp',     start: '2026-06-22T16:00:00.000Z', durationMin: 120, color: '#f97316', rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20260731T235959Z', cadence: 'Mon/Wed/Fri UNTIL Jul 31 2026, then STOPS (UNTIL)' },
  { title: 'Antibiotics course',  start: '2026-06-17T13:00:00.000Z', durationMin: 15, color: '#ec4899', rrule: 'FREQ=DAILY;UNTIL=20260701T120000Z',           cadence: 'Daily UNTIL Jul 1 2026, then STOPS (UNTIL)' },

  // ── Deliberately busy days (stress-test the 8-event cell cap + 13-char
  //    title truncation + "+N more" overflow). Long titles are intentional. ──
  // Jun 18 also already carries: Morning run, Antibiotics course, Design review (3 recurring).
  { title: 'Quarterly business review meeting', start: '2026-06-18T08:00:00.000Z', durationMin: 60, color: '#0ea5e9', rrule: null, cadence: 'One-off (busy-day stress test, long title)' },
  { title: 'Coffee',                            start: '2026-06-18T10:00:00.000Z', durationMin: 15, color: '#84cc16', rrule: null, cadence: 'One-off (busy-day stress test, short title)' },
  { title: 'Submit expense reports by EOD',     start: '2026-06-18T11:00:00.000Z', durationMin: 30, color: '#f43f5e', rrule: null, cadence: 'One-off (busy-day stress test, long title)' },
  { title: 'Lunch w/ Priya',                    start: '2026-06-18T12:00:00.000Z', durationMin: 60, color: '#fb923c', rrule: null, cadence: 'One-off (busy-day stress test)' },
  { title: 'Project Phoenix kickoff sync',      start: '2026-06-18T14:00:00.000Z', durationMin: 45, color: '#8b5cf6', rrule: null, cadence: 'One-off (busy-day stress test, long title)' },
  { title: 'Doctor',                            start: '2026-06-18T15:30:00.000Z', durationMin: 30, color: '#06b6d4', rrule: null, cadence: 'One-off (busy-day stress test, short title)' },
  { title: 'Pick up dry cleaning downtown',     start: '2026-06-18T17:00:00.000Z', durationMin: 20, color: '#facc15', rrule: null, cadence: 'One-off (busy-day stress test, long title)' },
  { title: 'Call mom',                          start: '2026-06-18T19:00:00.000Z', durationMin: 30, color: '#22d3ee', rrule: null, cadence: 'One-off (busy-day stress test)' },

  // Jun 25 also already carries: Morning run, Antibiotics course (2 recurring).
  { title: 'Performance self-review draft',     start: '2026-06-25T09:00:00.000Z', durationMin: 90, color: '#ef4444', rrule: null, cadence: 'One-off (busy-day stress test, long title)' },
  { title: 'Standup',                           start: '2026-06-25T10:30:00.000Z', durationMin: 15, color: '#6366f1', rrule: null, cadence: 'One-off (busy-day stress test, short title)' },
  { title: 'Vendor contract negotiation call',  start: '2026-06-25T11:30:00.000Z', durationMin: 60, color: '#10b981', rrule: null, cadence: 'One-off (busy-day stress test, long title)' },
  { title: 'Gym',                               start: '2026-06-25T13:00:00.000Z', durationMin: 60, color: '#84cc16', rrule: null, cadence: 'One-off (busy-day stress test, short title)' },
  { title: 'Review PRs and merge release',      start: '2026-06-25T15:00:00.000Z', durationMin: 45, color: '#a855f7', rrule: null, cadence: 'One-off (busy-day stress test, long title)' },
  { title: 'Parent-teacher conference night',   start: '2026-06-25T18:00:00.000Z', durationMin: 60, color: '#f97316', rrule: null, cadence: 'One-off (busy-day stress test, long title)' },
  { title: 'Grocery run',                       start: '2026-06-25T20:00:00.000Z', durationMin: 30, color: '#eab308', rrule: null, cadence: 'One-off (busy-day stress test)' },
]

async function main() {
  const db = getDb()

  // Ensure the single MVP user exists (matches lib/db/seed.ts behaviour).
  const existing = await db.select().from(users).limit(1)
  let user = existing[0]
  if (!user) {
    const [created] = await db.insert(users).values({ email: 'local@sentinel.app', name: 'Local User' }).returning()
    user = created
    console.log('Seeded default user: local@sentinel.app')
  }

  // Clean slate for this worktree's calendar (isolated test DB — not your real data).
  const removed = db.delete(calendarEvents).where(eq(calendarEvents.userId, user.id)).returning().all()
  if (removed.length) console.log(`Cleared ${removed.length} pre-existing calendar event(s).`)

  // Insert the varied set.
  for (const ev of SEED_EVENTS) {
    const start = new Date(ev.start)
    const end = new Date(start.getTime() + ev.durationMin * 60_000)
    db.insert(calendarEvents).values({
      id: createId(),
      userId: user.id,
      title: ev.title,
      startAt: start,
      endAt: end,
      color: ev.color,
      rrule: ev.rrule,
    }).run()
  }
  console.log(`\nInserted ${SEED_EVENTS.length} calendar events.\n`)

  // ── Verification: expand each event over a 3-month window ───────────
  const rangeStart = new Date('2026-06-01T00:00:00.000Z')
  const rangeEnd = new Date('2026-09-01T00:00:00.000Z')

  const rows = db.select().from(calendarEvents).where(eq(calendarEvents.userId, user.id)).all()
  const fmt = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ')

  console.log('RRULE expansion check (window: 2026-06-01 → 2026-09-01 UTC)')
  console.log('='.repeat(70))
  for (const seed of SEED_EVENTS) {
    const row = rows.find(r => r.title === seed.title)!
    const occ = expandEvents(
      [{ id: row.id, title: row.title, startAt: row.startAt, endAt: row.endAt, notes: row.notes, color: row.color, categoryId: row.categoryId, rrule: row.rrule, exdates: row.exdates }],
      new Map(),
      rangeStart,
      rangeEnd,
    )
    console.log(`\n• ${seed.title}`)
    console.log(`    cadence : ${seed.cadence}`)
    console.log(`    rrule   : ${seed.rrule ?? '(none)'}`)
    console.log(`    in-window occurrences (${occ.length}): ${occ.map(o => fmt(o.startAt)).join(', ') || '(none)'}`)
  }
  console.log('\n' + '='.repeat(70))

  // ── Busy-day tally: count ALL occurrences (recurring + one-off) per UTC
  //    date so we can confirm days that exceed the 8-event cell cap. ──
  const allOcc = expandEvents(
    rows.map(r => ({ id: r.id, title: r.title, startAt: r.startAt, endAt: r.endAt, notes: r.notes, color: r.color, categoryId: r.categoryId, rrule: r.rrule, exdates: r.exdates })),
    new Map(),
    rangeStart,
    rangeEnd,
  )
  const perDay = new Map<string, number>()
  for (const o of allOcc) {
    const key = o.startAt.toISOString().slice(0, 10)
    perDay.set(key, (perDay.get(key) ?? 0) + 1)
  }
  const busy = [...perDay.entries()].filter(([, n]) => n >= 8).sort()
  console.log('\nBusy days (>= 8 events — exercise the cap + "+N more" overflow):')
  for (const [day, n] of busy) console.log(`    ${day}: ${n} events`)
}

main().catch(err => { console.error(err); process.exit(1) })
