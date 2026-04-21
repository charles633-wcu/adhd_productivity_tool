import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCurrentUser, getDb } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))

import { GET, POST } from '@/app/api/calendar/event-categories/route'
import { PATCH, DELETE } from '@/app/api/calendar/event-categories/[id]/route'

// select().from().where() is the terminal chain for listEventCategories
// update().set().where().returning() for update
// delete().where().returning() for delete
// insert().values().returning() for insert

function makeSelectWhere(rows: unknown[]) {
  return { select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue(rows) })) })) }
}

describe('GET /api/calendar/event-categories', () => {
  beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1' }) })

  it('returns 200 with categories', async () => {
    getDb.mockReturnValue(makeSelectWhere([{ id: 'cat-1', name: 'Work', color: '#ff0000' }]))
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
  })
})

describe('POST /api/calendar/event-categories', () => {
  beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1' }) })

  it('creates and returns 201', async () => {
    getDb.mockReturnValue({
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 'cat-1', name: 'Work', color: '#ff0000' }]) })) })),
    })
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ name: 'Work', color: '#ff0000' }),
    }))
    expect(res.status).toBe(201)
  })

  it('returns 400 for missing name', async () => {
    getDb.mockReturnValue({})
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ color: '#ff0000' }),
    }))
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/calendar/event-categories/[id]', () => {
  beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1' }) })

  it('returns 200 on success', async () => {
    getDb.mockReturnValue({
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 'cat-1', name: 'Personal' }]) })),
        })),
      })),
    })
    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ name: 'Personal' }) }),
      { params: Promise.resolve({ id: 'cat-1' }) },
    )
    expect(res.status).toBe(200)
  })

  it('returns 404 when not found', async () => {
    getDb.mockReturnValue({
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })),
        })),
      })),
    })
    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ name: 'X' }) }),
      { params: Promise.resolve({ id: 'missing' }) },
    )
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/calendar/event-categories/[id]', () => {
  beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1' }) })

  it('returns 204', async () => {
    // deleteEventCategory: first updates calendarEvents (set categoryId=null), then deletes category
    getDb.mockReturnValue({
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([]),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })),
      })),
    })
    const res = await DELETE(new Request('http://localhost'), { params: Promise.resolve({ id: 'cat-1' }) })
    expect(res.status).toBe(204)
  })
})
