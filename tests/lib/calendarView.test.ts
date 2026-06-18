import { describe, it, expect } from 'vitest'
import {
  truncateTitle, buildMonthRange, extendMonthRange,
  capDayEvents, accelerationMultiplier, monthAnchorKey,
  toLocalDateKey, buildMonthDays, monthLabel, dateFromKey, buildContiguousDays,
} from '@/lib/calendar/calendarView'

describe('truncateTitle', () => {
  it('leaves titles <= 13 chars untouched', () => {
    expect(truncateTitle('Coffee')).toBe('Coffee')
    expect(truncateTitle('1234567890123')).toBe('1234567890123') // exactly 13
  })
  it('truncates titles > 13 chars to 13 chars + ellipsis', () => {
    expect(truncateTitle('Quarterly business review')).toBe('Quarterly bus…')
    expect(truncateTitle('12345678901234')).toBe('1234567890123…') // 14 -> 13 + …
  })
  it('handles empty string', () => {
    expect(truncateTitle('')).toBe('')
  })
})

describe('monthAnchorKey', () => {
  it('formats a month Date as YYYY-MM', () => {
    expect(monthAnchorKey(new Date(2026, 5, 1))).toBe('2026-06')
    expect(monthAnchorKey(new Date(2026, 11, 31))).toBe('2026-12')
  })
})

describe('buildMonthRange', () => {
  it('returns monthsBack + 1 + monthsForward first-of-month anchors, ascending', () => {
    const anchor = new Date(2026, 5, 1) // Jun 2026
    const range = buildMonthRange(anchor, 12, 12)
    expect(range).toHaveLength(25)
    expect(monthAnchorKey(range[0])).toBe('2025-06')
    expect(monthAnchorKey(range[12])).toBe('2026-06')
    expect(monthAnchorKey(range[24])).toBe('2027-06')
    range.forEach(d => expect(d.getDate()).toBe(1))
  })
})

describe('extendMonthRange', () => {
  it('prepends N months before the earliest anchor', () => {
    const range = buildMonthRange(new Date(2026, 5, 1), 0, 0) // just Jun 2026
    const extended = extendMonthRange(range, 'past', 6)
    expect(monthAnchorKey(extended[0])).toBe('2025-12')
    expect(monthAnchorKey(extended[extended.length - 1])).toBe('2026-06')
  })
  it('appends N months after the latest anchor', () => {
    const range = buildMonthRange(new Date(2026, 5, 1), 0, 0)
    const extended = extendMonthRange(range, 'future', 6)
    expect(monthAnchorKey(extended[extended.length - 1])).toBe('2026-12')
  })
})

describe('capDayEvents', () => {
  it('returns all events and zero overflow when <= cap', () => {
    expect(capDayEvents([1, 2, 3], 8)).toEqual({ shown: [1, 2, 3], overflow: 0 })
  })
  it('caps shown to (cap - 1) and reports overflow when > cap', () => {
    const items = Array.from({ length: 11 }, (_, i) => i)
    const { shown, overflow } = capDayEvents(items, 8)
    expect(shown).toHaveLength(7) // 7 chips + 1 "+N more" line = 8 rows
    expect(overflow).toBe(4)
  })
})

describe('shared date helpers (extracted from CalendarClient)', () => {
  it('toLocalDateKey formats YYYY-MM-DD in local time', () => {
    expect(toLocalDateKey(new Date(2026, 5, 7))).toBe('2026-06-07')
  })
  it('buildMonthDays returns 42 days starting on a Sunday', () => {
    const days = buildMonthDays(new Date(2026, 5, 1))
    expect(days).toHaveLength(42)
    expect(days[0].getDay()).toBe(0) // Sunday-aligned start
  })
  it('monthLabel and dateFromKey round-trip', () => {
    expect(monthLabel(new Date(2026, 5, 1))).toBe('June 2026')
    expect(toLocalDateKey(dateFromKey('2026-06-17'))).toBe('2026-06-17')
  })
})

describe('buildContiguousDays', () => {
  it('returns a gapless week-aligned run with no duplicated month padding', () => {
    const days = buildContiguousDays([new Date(2026, 5, 1)]) // June 2026
    expect(days.length % 7).toBe(0)
    expect(days[0].getDay()).toBe(0) // starts Sunday
    expect(days[days.length - 1].getDay()).toBe(6) // ends Saturday
    // Consecutive days differ by exactly one calendar day (no gaps/dupes).
    for (let i = 1; i < days.length; i++) {
      const diff = (days[i].getTime() - days[i - 1].getTime()) / 86_400_000
      expect(Math.round(diff)).toBe(1)
    }
    // Spans June 1 and June 30.
    expect(days.some(d => d.getMonth() === 5 && d.getDate() === 1)).toBe(true)
    expect(days.some(d => d.getMonth() === 5 && d.getDate() === 30)).toBe(true)
  })

  it('flows across multiple months continuously', () => {
    const days = buildContiguousDays([new Date(2026, 5, 1), new Date(2026, 6, 1)])
    expect(days.some(d => d.getMonth() === 5 && d.getDate() === 30)).toBe(true)
    expect(days.some(d => d.getMonth() === 6 && d.getDate() === 1)).toBe(true)
  })
})

describe('accelerationMultiplier', () => {
  it('stays native (1) for casual scrolling up to the threshold', () => {
    expect(accelerationMultiplier(1)).toBe(1)
    expect(accelerationMultiplier(6)).toBe(1)
  })
  it('accelerates gently past the threshold, clamped to a low max', () => {
    expect(accelerationMultiplier(15)).toBeGreaterThan(1)
    expect(accelerationMultiplier(999)).toBeLessThanOrEqual(2.2)
  })
})
