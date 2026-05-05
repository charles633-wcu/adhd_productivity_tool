import { getTableColumns } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DELETE, PATCH } from '@/app/api/calendar/events/[id]/route'
import { GET, POST } from '@/app/api/calendar/events/route'
import { listEventOverridesForIds } from '@/lib/db/calendar'
import { calendarEvents } from '@/lib/db/schema'

const { getCurrentUser, getDb } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))

function mockEvent(overrides = {}) {
  return {
    id: 'ev-1',
    userId: 'u1',
    title: 'Standup',
    startAt: new Date('2026-05-04T09:00:00.000Z'),
    endAt: new Date('2026-05-04T09:30:00.000Z'),
    notes: null,
    color: null,
    categoryId: null,
    rrule: null,
    exdates: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('calendar event recurrence schema', () => {
  it('uses rrule and exdates instead of repeat triplet columns', () => {
    const columns = getTableColumns(calendarEvents) as Record<string, { name: string }>
    expect(columns.rrule.name).toBe('rrule')
    expect(columns.exdates.name).toBe('exdates')
    expect('repeatFrequency' in columns).toBe(false)
    expect('repeatInterval' in columns).toBe(false)
    expect('repeatEndsAt' in columns).toBe(false)
  })
})

describe('listEventOverridesForIds', () => {
  it('returns empty array without querying when ids is empty', () => {
    const db = { select: vi.fn() }
    expect(listEventOverridesForIds(db as never, [])).toEqual([])
    expect(db.select).not.toHaveBeenCalled()
  })
})

describe('GET /api/calendar/events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'u1' })
  })

  it('returns 400 when from/to are missing', async () => {
    const res = await GET(new Request('http://localhost/api/calendar/events'))
    expect(res.status).toBe(400)
  })

  it('expands events with override map', async () => {
    const event = mockEvent({ rrule: 'FREQ=DAILY;INTERVAL=1' })
    let selectCall = 0
    getDb.mockReturnValue({
      select: vi.fn(() => {
        selectCall += 1
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => selectCall === 1 ? Promise.resolve([event]) : { all: () => [] }),
          })),
        }
      }),
    })

    const res = await GET(new Request('http://localhost/api/calendar/events?from=2026-05-04T00:00:00.000Z&to=2026-05-06T23:59:59.000Z'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(3)
    expect(body[0]).toEqual(expect.objectContaining({ sourceEventId: 'ev-1', rrule: 'FREQ=DAILY;INTERVAL=1' }))
  })
})

describe('POST /api/calendar/events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'u1' })
  })

  it('creates events with rrule', async () => {
    const values = vi.fn(data => ({ returning: vi.fn().mockResolvedValue([data]) }))
    getDb.mockReturnValue({ insert: vi.fn(() => ({ values })) })

    const res = await POST(new Request('http://localhost/api/calendar/events', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Weekly standup',
        startAt: '2026-05-04T09:00:00.000Z',
        endAt: '2026-05-04T09:30:00.000Z',
        rrule: 'FREQ=WEEKLY;INTERVAL=1',
      }),
    }))

    expect(res.status).toBe(201)
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ rrule: 'FREQ=WEEKLY;INTERVAL=1', exdates: null }))
  })

  it('rejects invalid rrule strings', async () => {
    const res = await POST(new Request('http://localhost/api/calendar/events', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Bad',
        startAt: '2026-05-04T09:00:00.000Z',
        endAt: '2026-05-04T09:30:00.000Z',
        rrule: 'NOT_VALID',
      }),
    }))
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/calendar/events/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'u1' })
  })

  it('requires occurrenceDate for this-scope recurring patches', async () => {
    getDb.mockReturnValue({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(() => [mockEvent({ rrule: 'FREQ=WEEKLY;INTERVAL=1' })]) })) })) })),
    })

    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ title: 'X', scope: 'this' }) }),
      { params: Promise.resolve({ id: 'ev-1' }) },
    )
    expect(res.status).toBe(400)
  })

  it('upserts an override for this-scope recurring patches', async () => {
    const values = vi.fn(() => ({
      onConflictDoUpdate: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 1 }]) })),
    }))
    getDb.mockReturnValue({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(() => [mockEvent({ rrule: 'FREQ=WEEKLY;INTERVAL=1' })]) })) })) })),
      insert: vi.fn(() => ({ values })),
    })

    const res = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({
          title: 'Moved',
          startAt: '2026-05-04T14:00:00.000Z',
          endAt: '2026-05-04T14:30:00.000Z',
          scope: 'this',
          occurrenceDate: '2026-05-04T09:00:00.000Z',
        }),
      }),
      { params: Promise.resolve({ id: 'ev-1' }) },
    )

    expect(res.status).toBe(200)
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      masterEventId: 'ev-1',
      originalDate: '2026-05-04T09:00:00.000Z',
      title: 'Moved',
    }))
  })
})

describe('DELETE /api/calendar/events/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'u1' })
  })

  it('adds an exdate for this-scope recurring deletes', async () => {
    const set = vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([mockEvent()]) })) }))
    getDb.mockReturnValue({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(() => [mockEvent({ rrule: 'FREQ=WEEKLY;INTERVAL=1' })]) })) })) })),
      update: vi.fn(() => ({ set })),
    })

    const res = await DELETE(
      new Request('http://localhost/api/calendar/events/ev-1?scope=this&occurrenceDate=2026-05-04T09:00:00.000Z'),
      { params: Promise.resolve({ id: 'ev-1' }) },
    )

    expect(res.status).toBe(204)
    expect(set).toHaveBeenCalledWith({ exdates: ['2026-05-04T09:00:00.000Z'] })
  })
})
