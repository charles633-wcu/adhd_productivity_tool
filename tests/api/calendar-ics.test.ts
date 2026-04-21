import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCurrentUser, getDb, fetchAndParseIcs } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
  fetchAndParseIcs: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))
vi.mock('@/lib/services/icsParser', () => ({ fetchAndParseIcs }))

import { GET, POST, DELETE } from '@/app/api/calendar/ics/route'

// getIcsSubscription: select().from().where().limit() terminal
// upsertIcsSubscription: insert().values().onConflictDoUpdate().returning() terminal
// deleteIcsSubscription: delete().where().returning() terminal

describe('GET /api/calendar/ics', () => {
  beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1' }) })

  it('returns null when no subscription', async () => {
    getDb.mockReturnValue({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })) })),
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toBeNull()
  })
})

describe('POST /api/calendar/ics', () => {
  beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1' }) })

  it('returns 400 for invalid URL', async () => {
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ url: 'not-a-url' }),
    }))
    expect(res.status).toBe(400)
  })

  it('fetches, caches, and returns 200', async () => {
    fetchAndParseIcs.mockResolvedValue([{ uid: 'u1', title: 'Evt', startAt: new Date(), endAt: new Date() }])
    getDb.mockReturnValue({
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 'sub-1', url: 'https://example.com/cal.ics' }]),
          })),
        })),
      })),
    })
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/cal.ics' }),
    }))
    expect(res.status).toBe(200)
    expect(fetchAndParseIcs).toHaveBeenCalledWith('https://example.com/cal.ics')
  })
})

describe('DELETE /api/calendar/ics', () => {
  beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1' }) })

  it('returns 204', async () => {
    getDb.mockReturnValue({
      delete: vi.fn(() => ({
        where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })),
      })),
    })
    const res = await DELETE()
    expect(res.status).toBe(204)
  })
})
