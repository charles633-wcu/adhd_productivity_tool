// Review clock utilities — pure timing functions, no DB access.
// Used by TriggerCard UI, ReviewBanner query, and tests.
// Also called before dispatchReviewNotification to determine if notification is warranted.

type ClockTrigger = {
  nextReviewAt: Date
  lastReviewedAt: Date | null
  createdAt: Date
  reviewIntervalDays: number
}

type ReviewAnchor = Pick<ClockTrigger, 'lastReviewedAt' | 'createdAt'>
type ReviewSchedule = ReviewAnchor & Pick<ClockTrigger, 'reviewIntervalDays'>

/**
 * Returns true when the trigger is due for review within the next 24 hours (or overdue).
 * Threshold: next_review_at <= now + 1 day
 * @param trigger - Trigger timing values, including its next scheduled review timestamp.
 * @returns `true` when `nextReviewAt` falls on or before the 24-hour boundary.
 */
export function isDueSoon(trigger: ClockTrigger): boolean {
  const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return trigger.nextReviewAt <= oneDayFromNow
}

/**
 * Selects the timestamp from which a review interval should be computed.
 * @param trigger - Creation timestamp and optional last-review timestamp.
 * @returns `lastReviewedAt` when present; otherwise `createdAt`.
 */
export function getReviewAnchor(trigger: ReviewAnchor): Date {
  return trigger.lastReviewedAt ?? trigger.createdAt
}

/**
 * Computes a trigger's next review time from its current anchor and interval.
 * @param trigger - Review anchor values and an interval expressed in days.
 * @returns A new date at the anchor plus `reviewIntervalDays`.
 */
export function deriveNextReviewAt(trigger: ReviewSchedule): Date {
  const anchor = getReviewAnchor(trigger)
  return new Date(anchor.getTime() + trigger.reviewIntervalDays * 24 * 60 * 60 * 1000)
}

/**
 * Returns the number of whole days elapsed since last review.
 * Falls back to created_at if the trigger has never been reviewed (last_reviewed_at is null).
 * @param trigger - Trigger timing values used to determine the review anchor.
 * @returns Whole elapsed days between the anchor and the current time.
 */
export function daysElapsed(trigger: ClockTrigger): number {
  const baseline = getReviewAnchor(trigger)
  const msElapsed = Date.now() - baseline.getTime()
  return Math.floor(msElapsed / (24 * 60 * 60 * 1000))
}

/**
 * Normalises a user-selected date to noon UTC to avoid timezone edge cases
 * where a day-boundary selection could land on the wrong calendar day.
 * This is a one-time override utility — it does not affect acknowledgeTrigger logic.
 * Returns a new Date; does not mutate the input.
 * @param date - User-selected timestamp to normalize.
 * @returns A copy set to 12:00:00.000 UTC on the selected UTC calendar date.
 */
export function snapToDate(date: Date): Date {
  const d = new Date(date)
  d.setUTCHours(12, 0, 0, 0)
  return d
}
