import { describe, it, expect } from 'vitest'
import {
  truncateTitle, buildMonthRange, extendMonthRange,
  capDayEvents, accelerationMultiplier, monthAnchorKey,
  toLocalDateKey, buildMonthDays, monthLabel, dateFromKey,
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

describe('accelerationMultiplier', () => {
  it('is 1 at streak 1 and grows, clamped to a max', () => {
    expect(accelerationMultiplier(1)).toBe(1)
    expect(accelerationMultiplier(5)).toBeGreaterThan(1)
    expect(accelerationMultiplier(999)).toBeLessThanOrEqual(6)
  })
})
