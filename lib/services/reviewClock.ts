// Review clock utilities — pure timing functions, no DB access.
// Used by TriggerCard UI, ReviewBanner query, and tests.
// Also called before dispatchReviewNotification to determine if notification is warranted.

type ClockTrigger = {
  nextReviewAt: Date
  lastReviewedAt: Date | null
  createdAt: Date
  reviewIntervalDays: number
}

/**
 * Returns true when the trigger is due for review within the next 24 hours (or overdue).
 * Threshold: next_review_at <= now + 1 day
 */
export function isDueSoon(trigger: ClockTrigger): boolean {
  const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return trigger.nextReviewAt <= oneDayFromNow
}

/**
 * Returns the number of whole days elapsed since last review.
 * Falls back to created_at if the trigger has never been reviewed (last_reviewed_at is null).
 */
export function daysElapsed(trigger: ClockTrigger): number {
  const baseline = trigger.lastReviewedAt ?? trigger.createdAt
  const msElapsed = Date.now() - baseline.getTime()
  return Math.floor(msElapsed / (24 * 60 * 60 * 1000))
}
