import { describe, expect, it } from 'vitest'
import { expandEvents, toNormalizedIso } from '@/lib/services/repeatExpander'
import type { CalendarEventOverride } from '@/lib/db/schema'

function makeEvent(overrides: Partial<{
  id: string
  title: string
  startAt: Date
  endAt: Date
  rrule: string | null
  exdates: string[] | null
  color: string | null
  categoryId: string | null
  notes: string | null
  userId: string
}> = {}) {
  return {
    id: 'ev1',
    userId: 'u1',
    title: 'Test Event',
    startAt: new Date('2026-05-04T09:00:00.000Z'),
    endAt: new Date('2026-05-04T10:00:00.000Z'),
    rrule: null,
    exdates: null,
    color: null,
    categoryId: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

const NO_OVERRIDES = new Map<string, CalendarEventOverride[]>()

describe('toNormalizedIso', () => {
  it('floors sub-second precision to zero milliseconds', () => {
    expect(toNormalizedIso(new Date('2026-06-02T09:00:00.750Z'))).toBe('2026-06-02T09:00:00.000Z')
  })

  it('leaves already-zero millisecond dates unchanged', () => {
    expect(toNormalizedIso(new Date('2026-06-02T09:00:00.000Z'))).toBe('2026-06-02T09:00:00.000Z')
  })
})

describe('expandEvents', () => {
  it('returns a single non-recurring occurrence within range', () => {
    const ev = makeEvent()
    const result = expandEvents([ev], NO_OVERRIDES, new Date('2026-05-01T00:00:00.000Z'), new Date('2026-05-31T23:59:59.000Z'))
    expect(result).toHaveLength(1)
    expect(result[0].occurrenceId).toBe(`ev1::${toNormalizedIso(ev.startAt)}`)
    expect(result[0].rrule).toBeNull()
    expect(result[0].isOverride).toBe(false)
  })

  it('expands daily events across a window', () => {
    const result = expandEvents([makeEvent({
      rrule: 'FREQ=DAILY;INTERVAL=1',
      startAt: new Date('2026-05-01T09:00:00.000Z'),
      endAt: new Date('2026-05-01T10:00:00.000Z'),
    })], NO_OVERRIDES, new Date('2026-05-01T00:00:00.000Z'), new Date('2026-05-07T23:59:59.000Z'))
    expect(result).toHaveLength(7)
  })

  it('respects UNTIL cutoff', () => {
    const result = expandEvents([makeEvent({
      rrule: 'FREQ=WEEKLY;INTERVAL=1;UNTIL=20260515T000000Z',
    })], NO_OVERRIDES, new Date('2026-05-01T00:00:00.000Z'), new Date('2026-05-31T23:59:59.000Z'))
    expect(result).toHaveLength(2)
  })

  it('filters exdates', () => {
    const startAt = new Date('2026-05-04T09:00:00.000Z')
    const exdate = toNormalizedIso(startAt)
    const result = expandEvents([makeEvent({
      rrule: 'FREQ=WEEKLY;INTERVAL=1',
      startAt,
      exdates: [exdate],
    })], NO_OVERRIDES, new Date('2026-05-01T00:00:00.000Z'), new Date('2026-05-14T23:59:59.000Z'))
    expect(result).toHaveLength(1)
    expect(toNormalizedIso(result[0].startAt)).not.toBe(exdate)
  })

  it('replaces occurrence fields with override values', () => {
    const originalStart = new Date('2026-05-04T09:00:00.000Z')
    const originalDate = toNormalizedIso(originalStart)
    const override: CalendarEventOverride = {
      id: 1,
      masterEventId: 'ev1',
      originalDate,
      title: 'Rescheduled standup',
      startAt: new Date('2026-05-04T14:00:00.000Z'),
      endAt: new Date('2026-05-04T14:30:00.000Z'),
      notes: 'moved to afternoon',
    }

    const result = expandEvents([makeEvent({
      rrule: 'FREQ=WEEKLY;INTERVAL=1',
      startAt: originalStart,
    })], new Map([['ev1', [override]]]), new Date('2026-05-01T00:00:00.000Z'), new Date('2026-05-07T23:59:59.000Z'))

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Rescheduled standup')
    expect(result[0].isOverride).toBe(true)
    expect(result[0].originalDate).toBe(originalDate)
  })

  it('includes an override moved into the requested range even when its original date is outside', () => {
    const originalStart = new Date('2026-05-04T09:00:00.000Z')
    const originalDate = toNormalizedIso(originalStart)
    const override: CalendarEventOverride = {
      id: 1,
      masterEventId: 'ev1',
      originalDate,
      title: 'Moved into range',
      startAt: new Date('2026-05-06T14:00:00.000Z'),
      endAt: new Date('2026-05-06T14:30:00.000Z'),
      notes: null,
    }

    const result = expandEvents([makeEvent({
      rrule: 'FREQ=WEEKLY;INTERVAL=1',
      startAt: originalStart,
      endAt: new Date('2026-05-04T10:00:00.000Z'),
    })], new Map([['ev1', [override]]]), new Date('2026-05-06T00:00:00.000Z'), new Date('2026-05-06T23:59:59.000Z'))

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Moved into range')
    expect(toNormalizedIso(result[0].startAt)).toBe('2026-05-06T14:00:00.000Z')
  })

  it('excludes an override moved out of the requested range', () => {
    const originalStart = new Date('2026-05-04T09:00:00.000Z')
    const override: CalendarEventOverride = {
      id: 1,
      masterEventId: 'ev1',
      originalDate: toNormalizedIso(originalStart),
      title: 'Moved out of range',
      startAt: new Date('2026-05-06T14:00:00.000Z'),
      endAt: new Date('2026-05-06T14:30:00.000Z'),
      notes: null,
    }

    const result = expandEvents([makeEvent({
      rrule: 'FREQ=WEEKLY;INTERVAL=1',
      startAt: originalStart,
      endAt: new Date('2026-05-04T10:00:00.000Z'),
    })], new Map([['ev1', [override]]]), new Date('2026-05-04T00:00:00.000Z'), new Date('2026-05-04T23:59:59.000Z'))

    expect(result).toHaveLength(0)
  })

  it('includes recurring occurrences that start before the range but overlap into it', () => {
    const result = expandEvents([makeEvent({
      rrule: 'FREQ=DAILY;INTERVAL=1',
      startAt: new Date('2026-05-04T22:00:00.000Z'),
      endAt: new Date('2026-05-05T02:00:00.000Z'),
    })], NO_OVERRIDES, new Date('2026-05-05T00:00:00.000Z'), new Date('2026-05-05T01:00:00.000Z'))

    expect(result).toHaveLength(1)
    expect(toNormalizedIso(result[0].startAt)).toBe('2026-05-04T22:00:00.000Z')
  })

  it('sorts expanded results by visible start time after overrides are applied', () => {
    const originalDate = '2026-05-11T09:00:00.000Z'
    const override: CalendarEventOverride = {
      id: 1,
      masterEventId: 'ev1',
      originalDate,
      title: 'Moved earlier',
      startAt: new Date('2026-05-04T08:00:00.000Z'),
      endAt: new Date('2026-05-04T08:30:00.000Z'),
      notes: null,
    }

    const result = expandEvents([makeEvent({
      rrule: 'FREQ=WEEKLY;INTERVAL=1',
      startAt: new Date('2026-05-04T09:00:00.000Z'),
      endAt: new Date('2026-05-04T09:30:00.000Z'),
    })], new Map([['ev1', [override]]]), new Date('2026-05-04T00:00:00.000Z'), new Date('2026-05-11T23:59:59.000Z'))

    expect(result.map(item => item.title)).toEqual(['Moved earlier', 'Test Event'])
  })
})
