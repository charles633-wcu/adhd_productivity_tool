// Expands calendar events into EventOccurrence objects using RRULE.

import { RRule } from 'rrule'
import type { CalendarEventOverride } from '@/lib/db/schema'
import type { EventOccurrence } from '@/lib/types/calendar'

interface ExpandableEvent {
  id: string
  title: string
  startAt: Date
  endAt: Date
  notes: string | null
  color: string | null
  categoryId: string | null
  rrule: string | null
  exdates: string[] | null
}

export function toNormalizedIso(date: Date): string {
  return new Date(Math.floor(date.getTime() / 1000) * 1000).toISOString()
}

export function expandEvents(
  events: ExpandableEvent[],
  overridesByMasterId: Map<string, CalendarEventOverride[]>,
  rangeStart: Date,
  rangeEnd: Date,
): EventOccurrence[] {
  return events
    .flatMap(event => expandOne(event, overridesByMasterId, rangeStart, rangeEnd))
    .sort((a, b) =>
      a.startAt.getTime() - b.startAt.getTime() ||
      a.endAt.getTime() - b.endAt.getTime() ||
      a.occurrenceId.localeCompare(b.occurrenceId)
    )
}

function expandOne(
  event: ExpandableEvent,
  overridesByMasterId: Map<string, CalendarEventOverride[]>,
  rangeStart: Date,
  rangeEnd: Date,
): EventOccurrence[] {
  if (!event.rrule) {
    const occurrence = buildOccurrence(event, event.startAt, event.endAt, overridesByMasterId)
    return occurrence.endAt >= rangeStart && occurrence.startAt <= rangeEnd ? [occurrence] : []
  }

  const rule = new RRule({ ...RRule.parseString(event.rrule), dtstart: event.startAt })
  const durationMs = event.endAt.getTime() - event.startAt.getTime()
  const exdatesSet = new Set(event.exdates ?? [])
  const datesByKey = new Map<string, Date>()
  const recurrenceRangeStart = new Date(rangeStart.getTime() - Math.max(0, durationMs))

  for (const date of rule.between(recurrenceRangeStart, rangeEnd, true)) {
    datesByKey.set(toNormalizedIso(date), date)
  }

  for (const override of overridesByMasterId.get(event.id) ?? []) {
    if (overlapsRange(override.startAt, override.endAt, rangeStart, rangeEnd)) {
      datesByKey.set(override.originalDate, new Date(override.originalDate))
    }
  }

  return Array.from(datesByKey.values())
    .filter(date => !exdatesSet.has(toNormalizedIso(date)))
    .map(date => buildOccurrence(event, date, new Date(date.getTime() + durationMs), overridesByMasterId))
    .filter(occurrence => overlapsRange(occurrence.startAt, occurrence.endAt, rangeStart, rangeEnd))
}

function overlapsRange(startAt: Date, endAt: Date, rangeStart: Date, rangeEnd: Date) {
  return endAt >= rangeStart && startAt <= rangeEnd
}

function buildOccurrence(
  event: ExpandableEvent,
  startAt: Date,
  endAt: Date,
  overridesByMasterId: Map<string, CalendarEventOverride[]>,
): EventOccurrence {
  const originalDate = toNormalizedIso(startAt)
  const override = (overridesByMasterId.get(event.id) ?? [])
    .find(item => item.originalDate === originalDate)

  if (override) {
    return {
      occurrenceId: `${event.id}::${originalDate}`,
      sourceEventId: event.id,
      title: override.title,
      startAt: override.startAt,
      endAt: override.endAt,
      notes: override.notes,
      color: event.color,
      categoryId: event.categoryId,
      rrule: event.rrule,
      isOverride: true,
      originalDate,
    }
  }

  return {
    occurrenceId: `${event.id}::${originalDate}`,
    sourceEventId: event.id,
    title: event.title,
    startAt,
    endAt,
    notes: event.notes,
    color: event.color,
    categoryId: event.categoryId,
    rrule: event.rrule,
    isOverride: false,
    originalDate: null,
  }
}
