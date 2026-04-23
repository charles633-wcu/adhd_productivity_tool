// tests/services/repeatExpander.test.ts
import { describe, it, expect } from 'vitest'
import { expandRepeatingEvent } from '@/lib/services/repeatExpander'

const event = (overrides: Partial<Parameters<typeof expandRepeatingEvent>[0]> = {}) => ({
  id: 'ev-1',
  title: 'Stand-up',
  startAt: new Date('2026-04-01T09:00:00Z'),
  endAt: new Date('2026-04-01T09:30:00Z'),
  repeatFrequency: null,
  repeatInterval: null,
  repeatEndsAt: null,
  ...overrides,
})

const starts = (result: ReturnType<typeof expandRepeatingEvent>) =>
  result.map(occ => occ.startAt.toISOString())

describe('expandRepeatingEvent', () => {
  it('expands daily recurrences by repeatInterval days', () => {
    const result = expandRepeatingEvent(
      event({ repeatFrequency: 'day', repeatInterval: 2 }),
      new Date('2026-04-01T00:00:00Z'),
      new Date('2026-04-07T23:59:59Z'),
    )

    expect(starts(result)).toEqual([
      '2026-04-01T09:00:00.000Z',
      '2026-04-03T09:00:00.000Z',
      '2026-04-05T09:00:00.000Z',
      '2026-04-07T09:00:00.000Z',
    ])
  })

  it('expands weekly recurrences on the original weekday', () => {
    const result = expandRepeatingEvent(
      event({ repeatFrequency: 'week', repeatInterval: 2 }),
      new Date('2026-04-01T00:00:00Z'),
      new Date('2026-04-30T23:59:59Z'),
    )

    expect(starts(result)).toEqual([
      '2026-04-01T09:00:00.000Z',
      '2026-04-15T09:00:00.000Z',
      '2026-04-29T09:00:00.000Z',
    ])
  })

  it('expands monthly recurrences by calendar month', () => {
    const result = expandRepeatingEvent(
      event({
        startAt: new Date('2026-01-31T09:00:00Z'),
        endAt: new Date('2026-01-31T09:30:00Z'),
        repeatFrequency: 'month',
        repeatInterval: 1,
      }),
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-05-31T23:59:59Z'),
    )

    expect(starts(result)).toEqual([
      '2026-01-31T09:00:00.000Z',
      '2026-02-28T09:00:00.000Z',
      '2026-03-31T09:00:00.000Z',
      '2026-04-30T09:00:00.000Z',
      '2026-05-31T09:00:00.000Z',
    ])
  })

  it('expands yearly recurrences on the original month and day', () => {
    const result = expandRepeatingEvent(
      event({
        startAt: new Date('2024-02-29T09:00:00Z'),
        endAt: new Date('2024-02-29T09:30:00Z'),
        repeatFrequency: 'year',
        repeatInterval: 1,
      }),
      new Date('2024-01-01T00:00:00Z'),
      new Date('2028-12-31T23:59:59Z'),
    )

    expect(starts(result)).toEqual([
      '2024-02-29T09:00:00.000Z',
      '2025-02-28T09:00:00.000Z',
      '2026-02-28T09:00:00.000Z',
      '2027-02-28T09:00:00.000Z',
      '2028-02-29T09:00:00.000Z',
    ])
  })

  it('stops recurring occurrences after repeatEndsAt', () => {
    const result = expandRepeatingEvent(
      event({
        repeatFrequency: 'week',
        repeatInterval: 1,
        repeatEndsAt: new Date('2026-04-15T09:00:00Z'),
      }),
      new Date('2026-04-01T00:00:00Z'),
      new Date('2026-04-30T23:59:59Z'),
    )

    expect(starts(result)).toEqual([
      '2026-04-01T09:00:00.000Z',
      '2026-04-08T09:00:00.000Z',
      '2026-04-15T09:00:00.000Z',
    ])
  })

  it('returns single occurrence for non-repeating event within range', () => {
    const result = expandRepeatingEvent(
      event(),
      new Date('2026-04-01T00:00:00Z'),
      new Date('2026-04-30T23:59:59Z'),
    )

    expect(result).toEqual([{
      occurrenceId: 'ev-1::2026-04-01T09:00:00.000Z',
      sourceEventId: 'ev-1',
      title: 'Stand-up',
      startAt: new Date('2026-04-01T09:00:00Z'),
      endAt: new Date('2026-04-01T09:30:00Z'),
    }])
  })

  it('returns empty for non-repeating event outside range', () => {
    const result = expandRepeatingEvent(
      event(),
      new Date('2026-05-01T00:00:00Z'),
      new Date('2026-05-31T23:59:59Z'),
    )

    expect(result).toHaveLength(0)
  })

  it('includes occurrences that overlap the range start', () => {
    const result = expandRepeatingEvent(
      event({
        startAt: new Date('2026-04-01T23:00:00Z'),
        endAt: new Date('2026-04-02T01:00:00Z'),
        repeatFrequency: 'day',
        repeatInterval: 1,
      }),
      new Date('2026-04-02T00:00:00Z'),
      new Date('2026-04-02T23:59:59Z'),
    )

    expect(starts(result)).toEqual([
      '2026-04-01T23:00:00.000Z',
      '2026-04-02T23:00:00.000Z',
    ])
  })
})
