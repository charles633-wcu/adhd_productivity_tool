import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const mockIcsContent = readFileSync(join(process.cwd(), 'tests/fixtures/sample.ics'), 'utf-8')

vi.stubGlobal('fetch', vi.fn())

import { fetchAndParseIcs } from '@/lib/services/icsParser'

describe('fetchAndParseIcs', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockResolvedValue(new Response(mockIcsContent, { status: 200 }))
  })

  it('returns parsed events from a valid ICS URL', async () => {
    const events = await fetchAndParseIcs('https://example.com/cal.ics')
    expect(events).toHaveLength(2)
    expect(events[0].title).toBe('Team meeting')
    expect(events[0].startAt).toBeInstanceOf(Date)
    expect(events[0].endAt).toBeInstanceOf(Date)
  })

  it('throws when fetch returns non-200', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Not found', { status: 404 }))
    await expect(fetchAndParseIcs('https://example.com/cal.ics')).rejects.toThrow('ICS fetch failed: 404')
  })
})
