import { describe, it, expect } from 'vitest'
import { isDueSoon, daysElapsed } from '@/lib/services/reviewClock'

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
