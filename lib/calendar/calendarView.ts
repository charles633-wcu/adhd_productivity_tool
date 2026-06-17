// Pure, framework-free helpers shared by VerticalCalendar and CalendarClient.
// Kept side-effect free so they can be unit-tested without React/jsdom.

export const MAX_TITLE_CHARS = 13
export const DAY_EVENT_CAP = 8

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

const ACCEL_BASE = 1
const ACCEL_STEP = 0.5
const ACCEL_MAX = 6
/**
 * Wheel-velocity multiplier that grows with a consecutive same-direction
 * scroll streak, clamped to ACCEL_MAX. Streak 1 → 1 (no amplification).
 */
export function accelerationMultiplier(streak: number): number {
  return Math.min(ACCEL_MAX, ACCEL_BASE + (Math.max(1, streak) - 1) * ACCEL_STEP)
}
