// lib/services/repeatExpander.ts
// Expands a repeating calendar event into occurrence objects within a date range.

type RepeatFrequency = 'day' | 'week' | 'month' | 'year'

interface RepeatableEvent {
  id: string
  title: string
  startAt: Date
  endAt: Date
  repeatFrequency: RepeatFrequency | null
  repeatInterval: number | null
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

function lastUtcDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

function buildUtcDateLike(source: Date, year: number, month: number, day: number) {
  const safeDay = Math.min(day, lastUtcDayOfMonth(year, month))
  return new Date(Date.UTC(
    year,
    month,
    safeDay,
    source.getUTCHours(),
    source.getUTCMinutes(),
    source.getUTCSeconds(),
    source.getUTCMilliseconds(),
  ))
}

function advanceCursor(
  cursor: Date,
  frequency: RepeatFrequency,
  interval: number,
  anchor: { day: number; month: number },
) {
  if (frequency === 'day' || frequency === 'week') {
    const next = new Date(cursor)
    next.setUTCDate(next.getUTCDate() + interval * (frequency === 'week' ? 7 : 1))
    return next
  }

  if (frequency === 'month') {
    const monthIndex = cursor.getUTCFullYear() * 12 + cursor.getUTCMonth() + interval
    const year = Math.floor(monthIndex / 12)
    const month = monthIndex % 12
    return buildUtcDateLike(cursor, year, month, anchor.day)
  }

  return buildUtcDateLike(cursor, cursor.getUTCFullYear() + interval, anchor.month, anchor.day)
}

export function expandRepeatingEvent(
  event: RepeatableEvent,
  rangeFrom: Date,
  rangeTo: Date,
): EventOccurrence[] {
  const occurrences: EventOccurrence[] = []
  const durationMs = event.endAt.getTime() - event.startAt.getTime()
  const repeatFrequency = event.repeatFrequency
  const repeatInterval = event.repeatInterval
  const isRepeating = repeatFrequency !== null && repeatInterval !== null
  const anchor = {
    day: event.startAt.getUTCDate(),
    month: event.startAt.getUTCMonth(),
  }

  let cursor = new Date(event.startAt)

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
    if (!isRepeating) break
    cursor = advanceCursor(cursor, repeatFrequency, repeatInterval, anchor)
  }

  return occurrences
}
