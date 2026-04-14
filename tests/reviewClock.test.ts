import { describe, it, expect } from 'vitest'
import { isDueSoon, daysElapsed, snapToDate } from '@/lib/services/reviewClock'

// Helper to build a minimal trigger-like object for testing
function makeTrigger(overrides: {
  nextReviewAt?: Date
  lastReviewedAt?: Date | null
  createdAt?: Date
  reviewIntervalDays?: number
}) {
  const now = new Date()
  return {
    nextReviewAt: overrides.nextReviewAt ?? new Date(now.getTime() + 2 * 86400000),
    lastReviewedAt: overrides.lastReviewedAt !== undefined ? overrides.lastReviewedAt : null,
    createdAt: overrides.createdAt ?? new Date(now.getTime() - 3 * 86400000),
    reviewIntervalDays: overrides.reviewIntervalDays ?? 7,
  }
}

describe('isDueSoon', () => {
  it('returns true when trigger is overdue (next_review_at is in the past)', () => {
    const trigger = makeTrigger({ nextReviewAt: new Date(Date.now() - 1000) })
    expect(isDueSoon(trigger)).toBe(true)
  })

  it('returns true when next_review_at is exactly 1 day from now (on threshold)', () => {
    const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const trigger = makeTrigger({ nextReviewAt: oneDayFromNow })
    expect(isDueSoon(trigger)).toBe(true)
  })

  it('returns false when next_review_at is more than 1 day away', () => {
    const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 60000)
    const trigger = makeTrigger({ nextReviewAt: twoDaysFromNow })
    expect(isDueSoon(trigger)).toBe(false)
  })
})

describe('daysElapsed', () => {
  it('returns days since last_reviewed_at when it is set', () => {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
    const trigger = makeTrigger({ lastReviewedAt: sixDaysAgo, reviewIntervalDays: 7 })
    expect(daysElapsed(trigger)).toBe(6)
  })

  it('falls back to created_at when last_reviewed_at is null', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    const trigger = makeTrigger({ lastReviewedAt: null, createdAt: threeDaysAgo })
    expect(daysElapsed(trigger)).toBe(3)
  })
})

describe('snapToDate', () => {
  it('sets the time to 12:00:00.000 UTC regardless of input time', () => {
    const input = new Date('2026-05-10T03:00:00.000Z')
    const result = snapToDate(input)
    expect(result.getUTCHours()).toBe(12)
    expect(result.getUTCMinutes()).toBe(0)
    expect(result.getUTCSeconds()).toBe(0)
    expect(result.getUTCMilliseconds()).toBe(0)
  })

  it('preserves the calendar date (UTC year/month/day) of the input', () => {
    const input = new Date('2026-05-10T23:59:00.000Z')
    const result = snapToDate(input)
    expect(result.getUTCFullYear()).toBe(2026)
    expect(result.getUTCMonth()).toBe(4)
    expect(result.getUTCDate()).toBe(10)
  })

  it('does not mutate the input date', () => {
    const input = new Date('2026-05-10T08:00:00.000Z')
    const original = input.getTime()
    snapToDate(input)
    expect(input.getTime()).toBe(original)
  })

  it('two dates on the same calendar day produce equal results', () => {
    const a = new Date('2026-06-15T01:00:00.000Z')
    const b = new Date('2026-06-15T23:00:00.000Z')
    expect(snapToDate(a).getTime()).toBe(snapToDate(b).getTime())
  })
})
