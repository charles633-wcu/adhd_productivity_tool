// Pure, framework-free helpers shared by VerticalCalendar and CalendarClient.
// Kept side-effect free so they can be unit-tested without React/jsdom.

export const MAX_TITLE_CHARS = 13
export const DAY_EVENT_CAP = 8

// Day-of-week (Sun-indexed) and month labels — shared by both calendar views.
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Local-time "YYYY-MM-DD" key for a Date (used to bucket events by day). */
export function toLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Start of today at local midnight. */
export function startOfLocalToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** "June 2026" style month + year label. */
export function monthLabel(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** "June 17, 2026" — used for accessible day labels. */
export function formatAccessibleDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

/** "Wed, Jun 17" — short weekday/month/day label. */
export function dateLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Locale time label, e.g. "9:00 AM". */
export function timeLabel(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** Compact time label from an ISO string, e.g. "9am", "10:30pm". */
export function compactTimeLabel(value: string): string {
  const d = new Date(value)
  const [time, period] = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }).split(' ')
  return `${time}${period?.toLowerCase() ?? ''}`
}

/** Parse a "YYYY-MM-DD" key back into a local Date. */
export function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * One continuous, gapless run of real Dates spanning the given month anchors,
 * aligned to whole weeks (Sunday start → Saturday end). Unlike buildMonthDays,
 * months flow into each other with no duplicated/padded "other-month" cells —
 * the only filler is at the very top/bottom edges to complete the first/last week.
 */
export function buildContiguousDays(months: Date[]): Date[] {
  if (months.length === 0) return []
  const firstMonth = months[0]
  const lastMonth = months[months.length - 1]
  const start = new Date(firstMonth.getFullYear(), firstMonth.getMonth(), 1)
  start.setDate(start.getDate() - start.getDay()) // back to Sunday
  const end = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0) // last day of last month
  end.setDate(end.getDate() + (6 - end.getDay())) // forward to Saturday

  const days: Date[] = []
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d))
  }
  return days
}

/** Flat array of 42 Dates (6×7) for a month grid, padded to a Sunday start. */
export function buildMonthDays(month: Date): Date[] {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
  const startDow = firstDay.getDay()
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(firstDay)
    d.setDate(1 - startDow + i)
    return d
  })
}

/** Hard-truncate a title to `max` chars, appending an ellipsis when cut. */
export function truncateTitle(title: string, max = MAX_TITLE_CHARS): string {
  return title.length > max ? title.slice(0, max) + '…' : title
}

/** "YYYY-MM" anchor key for a month Date. */
export function monthAnchorKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * First-of-month anchors from `monthsBack` months before to `monthsForward`
 * months after the anchor month (inclusive), ascending.
 */
export function buildMonthRange(anchor: Date, monthsBack: number, monthsForward: number): Date[] {
  const base = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const out: Date[] = []
  for (let i = -monthsBack; i <= monthsForward; i++) {
    out.push(new Date(base.getFullYear(), base.getMonth() + i, 1))
  }
  return out
}

/** Prepend ('past') or append ('future') `count` month anchors to an ascending range. */
export function extendMonthRange(range: Date[], side: 'past' | 'future', count: number): Date[] {
  if (range.length === 0 || count <= 0) return range
  if (side === 'past') {
    const first = range[0]
    const add = Array.from({ length: count }, (_, i) =>
      new Date(first.getFullYear(), first.getMonth() - (count - i), 1))
    return [...add, ...range]
  }
  const last = range[range.length - 1]
  const add = Array.from({ length: count }, (_, i) =>
    new Date(last.getFullYear(), last.getMonth() + i + 1, 1))
  return [...range, ...add]
}

/**
 * Cap a day's events for display. When overflowing, show only (cap - 1) items
 * so a single "+N more" row fits within the `cap`-row budget.
 */
export function capDayEvents<T>(items: T[], cap = DAY_EVENT_CAP): { shown: T[]; overflow: number } {
  if (items.length <= cap) return { shown: items, overflow: 0 }
  return { shown: items.slice(0, cap - 1), overflow: items.length - (cap - 1) }
}

// Casual scrolling (streak <= threshold) stays fully native (multiplier 1).
// Only a sustained fast flick gently accelerates, capped well below the old 6x.
const ACCEL_THRESHOLD = 6
const ACCEL_BASE = 1
const ACCEL_STEP = 0.12
const ACCEL_MAX = 2.2
/**
 * Wheel-velocity multiplier. Returns 1 (native scroll) until a same-direction
 * streak exceeds ACCEL_THRESHOLD, then grows gently, clamped to ACCEL_MAX.
 */
export function accelerationMultiplier(streak: number): number {
  if (streak <= ACCEL_THRESHOLD) return ACCEL_BASE
  return Math.min(ACCEL_MAX, ACCEL_BASE + (streak - ACCEL_THRESHOLD) * ACCEL_STEP)
}
