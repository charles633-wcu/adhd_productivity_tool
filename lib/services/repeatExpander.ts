// lib/services/repeatExpander.ts
// Expands a repeating calendar event into occurrence objects within a date range.
// Repeat is fixed-day interval only (no weekly/monthly calendar patterns).

interface RepeatableEvent {
  id: string
  title: string
  startAt: Date
  endAt: Date
  repeatIntervalDays: number | null
  repeatEndsAt: Date | null
  [key: string]: unknown
}

export interface EventOccurrence {
  occurrenceId: string  // `${event.id}::${startAt.toISOString()}`
  sourceEventId: string
  title: string
  startAt: Date
  endAt: Date
}

export function expandRepeatingEvent(
  event: RepeatableEvent,
  rangeFrom: Date,
  rangeTo: Date,
): EventOccurrence[] {
  const occurrences: EventOccurrence[] = []
  const durationMs = event.endAt.getTime() - event.startAt.getTime()

  let cursor = new Date(event.startAt)

  // Jump cursor forward to near rangeFrom to avoid O(n) iteration from far past
  if (event.repeatIntervalDays && cursor < rangeFrom) {
    const intervalMs = event.repeatIntervalDays * 24 * 60 * 60 * 1000
    const stepsNeeded = Math.floor((rangeFrom.getTime() - cursor.getTime()) / intervalMs)
    cursor = new Date(cursor.getTime() + stepsNeeded * intervalMs)
  }

  while (cursor <= rangeTo) {
    const occurrenceEnd = new Date(cursor.getTime() + durationMs)

    // Respect repeat end boundary
    if (event.repeatEndsAt && cursor > event.repeatEndsAt) break

    // Only include if occurrence overlaps with range
    if (cursor >= rangeFrom || occurrenceEnd >= rangeFrom) {
      occurrences.push({
        occurrenceId: `${event.id}::${cursor.toISOString()}`,
        sourceEventId: event.id,
        title: event.title,
        startAt: new Date(cursor),
        endAt: occurrenceEnd,
      })
    }

    // Advance or stop for non-repeating
    if (!event.repeatIntervalDays) break
    cursor = new Date(cursor.getTime() + event.repeatIntervalDays * 24 * 60 * 60 * 1000)
  }

  return occurrences
}
