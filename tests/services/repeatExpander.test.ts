// tests/services/repeatExpander.test.ts
import { describe, it, expect } from 'vitest'
import { expandRepeatingEvent } from '@/lib/services/repeatExpander'

const base = {
  id: 'ev-1',
  title: 'Stand-up',
  startAt: new Date('2026-04-01T09:00:00Z'),
  endAt: new Date('2026-04-01T09:30:00Z'),
  repeatIntervalDays: 7,
  repeatEndsAt: null,
}

describe('expandRepeatingEvent', () => {
  it('returns the base occurrence when it falls within range', () => {
    const from = new Date('2026-04-01T00:00:00Z')
    const to = new Date('2026-04-07T23:59:59Z')
    const result = expandRepeatingEvent(base, from, to)
    expect(result).toHaveLength(1)
    expect(result[0].startAt).toEqual(base.startAt)
  })

  it('generates multiple occurrences across weeks', () => {
    const from = new Date('2026-04-01T00:00:00Z')
    const to = new Date('2026-04-22T23:59:59Z')
    const result = expandRepeatingEvent(base, from, to)
    expect(result).toHaveLength(4)
  })

  it('stops at repeatEndsAt', () => {
    const from = new Date('2026-04-01T00:00:00Z')
    const to = new Date('2026-04-30T23:59:59Z')
    const result = expandRepeatingEvent({ ...base, repeatEndsAt: new Date('2026-04-08T23:59:59Z') }, from, to)
    expect(result).toHaveLength(2)
  })

  it('returns empty array when event is outside range', () => {
    const from = new Date('2026-05-01T00:00:00Z')
    const to = new Date('2026-05-31T23:59:59Z')
    const result = expandRepeatingEvent({ ...base, repeatEndsAt: new Date('2026-04-30T00:00:00Z') }, from, to)
    expect(result).toHaveLength(0)
  })

  it('returns single occurrence for non-repeating event within range', () => {
    const from = new Date('2026-04-01T00:00:00Z')
    const to = new Date('2026-04-30T23:59:59Z')
    const result = expandRepeatingEvent({ ...base, repeatIntervalDays: null, repeatEndsAt: null }, from, to)
    expect(result).toHaveLength(1)
  })

  it('returns empty for non-repeating event outside range', () => {
    const from = new Date('2026-05-01T00:00:00Z')
    const to = new Date('2026-05-31T23:59:59Z')
    const result = expandRepeatingEvent({ ...base, repeatIntervalDays: null, repeatEndsAt: null }, from, to)
    expect(result).toHaveLength(0)
  })
})
