// lib/services/repeatExpander.ts
// Expands a repeating calendar event into occurrence objects within a date range.

import type { RepeatFrequency } from '@/lib/types/calendar'

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
  repeatFrequency: RepeatFrequency | null
  repeatInterval: number | null
  repeatEndsAt: Date | null
}

function lastLocalDayOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function buildLocalDateLike(source: Date, year: number, month: number, day: number) {
  const next = new Date(source)
  next.setDate(1)
  next.setFullYear(year, month, Math.min(day, lastLocalDayOfMonth(year, month)))
  return next
}

function advanceCursor(
  cursor: Date,
  frequency: RepeatFrequency,
  interval: number,
  anchor: { day: number; month: number },
) {
  if (frequency === 'day' || frequency === 'week') {
    const next = new Date(cursor)
    next.setDate(next.getDate() + interval * (frequency === 'week' ? 7 : 1))
    return next
  }

  if (frequency === 'month') {
    const monthIndex = cursor.getFullYear() * 12 + cursor.getMonth() + interval
    const year = Math.floor(monthIndex / 12)
    const month = monthIndex % 12
    return buildLocalDateLike(cursor, year, month, anchor.day)
  }

  return buildLocalDateLike(cursor, cursor.getFullYear() + interval, anchor.month, anchor.day)
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
  const isRepeating = repeatFrequency !== null && repeatInterval !== null && repeatInterval > 0
  const anchor = {
    day: event.startAt.getDate(),
    month: event.startAt.getMonth(),
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
        repeatFrequency: event.repeatFrequency,
        repeatInterval: event.repeatInterval,
        repeatEndsAt: event.repeatEndsAt,
      })
    }

    // Advance or stop for non-repeating
    if (!isRepeating) break
    cursor = advanceCursor(cursor, repeatFrequency, repeatInterval, anchor)
  }

  return occurrences
}
