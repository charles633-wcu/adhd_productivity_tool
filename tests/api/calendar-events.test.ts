import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCurrentUser, getDb } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))
vi.mock('@/lib/services/repeatExpander', () => ({
  expandRepeatingEvent: vi.fn((ev: unknown) => [ev]),
}))

import { GET, POST } from '@/app/api/calendar/events/route'
import { PATCH, DELETE } from '@/app/api/calendar/events/[id]/route'
import { calendarEvents } from '@/lib/db/schema'
import { getTableColumns } from 'drizzle-orm'

// listEventsInRange: select().from().where() terminal
// createCalendarEvent: insert().values().returning() terminal
// updateCalendarEvent: update().set().where().returning() terminal
// deleteCalendarEvent: delete().where().returning() terminal

describe('calendar event recurrence persistence fields', () => {
  it('stores recurrence frequency and interval as explicit columns', () => {
    const columns = getTableColumns(calendarEvents) as Record<string, { name: string }>

    expect(columns.repeatFrequency.name).toBe('repeat_frequency')
    expect(columns.repeatInterval.name).toBe('repeat_interval')
    expect('repeatIntervalDays' in columns).toBe(false)
  })
})

describe('GET /api/calendar/events', () => {
  beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1' }) })

  it('returns 400 when from/to are missing', async () => {
    const res = await GET(new Request('http://localhost/api/calendar/events'))
    expect(res.status).toBe(400)
  })

  it('returns 200 with event list', async () => {
    const event = {
      id: 'ev-1', title: 'Test',
      startAt: new Date('2026-04-15T09:00:00Z'),
      endAt: new Date('2026-04-15T10:00:00Z'),
      repeatFrequency: null, repeatInterval: null, repeatEndsAt: null,
    }
    getDb.mockReturnValue({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([event]) })) })),
    })
    const res = await GET(new Request('http://localhost/api/calendar/events?from=2026-04-01&to=2026-04-30'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
  })
})

describe('POST /api/calendar/events', () => {
  beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1' }) })

  it('returns 201 on valid create', async () => {
    getDb.mockReturnValue({
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 'ev-1', title: 'Stand-up' }]) })) })),
    })
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Stand-up',
        startAt: '2026-04-15T09:00:00Z',
        endAt: '2026-04-15T09:30:00Z',
      }),
    }))
    expect(res.status).toBe(201)
  })

  it('returns 400 when endAt < startAt', async () => {
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Bad event',
        startAt: '2026-04-15T10:00:00Z',
        endAt: '2026-04-15T09:00:00Z',
      }),
    }))
    expect(res.status).toBe(400)
  })

  it('accepts blank notes in create-event payloads', async () => {
    getDb.mockReturnValue({
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: 'ev-2', title: 'Planning' }]),
        })),
      })),
    })

    const request = new Request('http://localhost/api/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Planning',
        startAt: '2026-04-15T09:00:00.000Z',
        endAt: '2026-04-15T10:00:00.000Z',
        notes: null,
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(201)
  })

  it('creates recurring events with explicit frequency and interval fields', async () => {
    const values = vi.fn(data => ({
      returning: vi.fn().mockResolvedValue([{
        ...data,
        repeatFrequency: data.repeatFrequency,
        repeatInterval: data.repeatInterval,
      }]),
    }))
    getDb.mockReturnValue({
      insert: vi.fn(() => ({ values })),
    })

    const response = await POST(new Request('http://localhost/api/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Monthly planning',
        startAt: '2026-04-15T09:00:00.000Z',
        endAt: '2026-04-15T10:00:00.000Z',
        repeatFrequency: 'month',
        repeatInterval: 1,
      }),
    }))

    expect(response.status).toBe(201)
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      repeatFrequency: 'month',
      repeatInterval: 1,
    }))
    const body = await response.json()
    expect(body).toEqual(expect.objectContaining({
      repeatFrequency: 'month',
      repeatInterval: 1,
    }))
  })

  it('rejects repeatFrequency without repeatInterval', async () => {
    const response = await POST(new Request('http://localhost/api/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Monthly planning',
        startAt: '2026-04-15T09:00:00.000Z',
        endAt: '2026-04-15T10:00:00.000Z',
        repeatFrequency: 'month',
      }),
    }))

    expect(response.status).toBe(400)
  })

  it('rejects repeatInterval without repeatFrequency', async () => {
    const response = await POST(new Request('http://localhost/api/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Monthly planning',
        startAt: '2026-04-15T09:00:00.000Z',
        endAt: '2026-04-15T10:00:00.000Z',
        repeatInterval: 1,
      }),
    }))

    expect(response.status).toBe(400)
  })
})

describe('PATCH /api/calendar/events/[id]', () => {
  beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1' }) })

  it('returns 200 on success', async () => {
    getDb.mockReturnValue({
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 'ev-1', title: 'Updated' }]) })),
        })),
      })),
    })
    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ title: 'Updated' }) }),
      { params: Promise.resolve({ id: 'ev-1' }) },
    )
    expect(res.status).toBe(200)
  })

  it('returns 404 when not owned', async () => {
    getDb.mockReturnValue({
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })),
        })),
      })),
    })
    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ title: 'X' }) }),
      { params: Promise.resolve({ id: 'missing' }) },
    )
    expect(res.status).toBe(404)
  })

  it('updates recurring events with explicit frequency and interval fields', async () => {
    const set = vi.fn(() => ({
      where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 'ev-1', repeatFrequency: 'week', repeatInterval: 2 }]) })),
    }))
    getDb.mockReturnValue({
      update: vi.fn(() => ({ set })),
    })

    const res = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ repeatFrequency: 'week', repeatInterval: 2 }),
      }),
      { params: Promise.resolve({ id: 'ev-1' }) },
    )

    expect(res.status).toBe(200)
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      repeatFrequency: 'week',
      repeatInterval: 2,
    }))
  })

  it('clears repeatEndsAt when null is sent', async () => {
    const updatedRow = {
      id: 'ev-1',
      title: 'Test',
      startAt: new Date('2026-04-15T09:00:00Z'),
      endAt: new Date('2026-04-15T10:00:00Z'),
      repeatFrequency: 'week',
      repeatInterval: 1,
      repeatEndsAt: null,
    }
    getDb.mockReturnValue({
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([updatedRow]),
          })),
        })),
      })),
    })

    const res = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ repeatFrequency: 'week', repeatInterval: 1, repeatEndsAt: null }),
      }),
      { params: Promise.resolve({ id: 'ev-1' }) },
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.repeatEndsAt).toBeNull()
  })

  it('rejects patches that clear only one recurrence field', async () => {
    const res = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ repeatFrequency: null }),
      }),
      { params: Promise.resolve({ id: 'ev-1' }) },
    )

    expect(res.status).toBe(400)
  })

  it('rejects patches that mix null and non-null recurrence fields', async () => {
    const res = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ repeatFrequency: null, repeatInterval: 2 }),
      }),
      { params: Promise.resolve({ id: 'ev-1' }) },
    )

    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/calendar/events/[id]', () => {
  beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1' }) })

  it('returns 204 on success', async () => {
    getDb.mockReturnValue({
      delete: vi.fn(() => ({
        where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 'ev-1' }]) })),
      })),
    })
    const res = await DELETE(new Request('http://localhost'), { params: Promise.resolve({ id: 'ev-1' }) })
    expect(res.status).toBe(204)
  })
})
