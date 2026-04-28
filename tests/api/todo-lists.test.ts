import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCurrentUser, getDb } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))

import { GET, POST } from '@/app/api/todo-lists/route'
import { PATCH, DELETE } from '@/app/api/todo-lists/[id]/route'

const mockUser = { id: 'u1' }
const mockList = { id: 'l1', userId: 'u1', name: 'Inbox', color: null, emoji: null, createdAt: new Date(), updatedAt: new Date() }

beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue(mockUser) })

describe('GET /api/todo-lists', () => {
  it('creates Inbox lazily and returns all lists', async () => {
    const mockDb = {
      select: vi.fn()
        .mockReturnValueOnce({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })
        .mockReturnValueOnce({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([mockList]) })) }),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([mockList]) })) })),
    }
    getDb.mockReturnValue(mockDb)
    const res = await GET(new Request('http://localhost/api/todo-lists'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].name).toBe('Inbox')
  })

  it('returns existing lists without creating Inbox again', async () => {
    const mockDb = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([mockList]) })) })),
    }
    getDb.mockReturnValue(mockDb)
    const res = await GET(new Request('http://localhost/api/todo-lists'))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/todo-lists', () => {
  it('returns 201 on valid create', async () => {
    const newList = { ...mockList, id: 'l2', name: 'Work' }
    getDb.mockReturnValue({
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([newList]) })) })),
    })
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ name: 'Work' }),
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('Work')
  })

  it('returns 400 when name is missing', async () => {
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({}),
    }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when name exceeds 100 chars', async () => {
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ name: 'x'.repeat(101) }),
    }))
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/todo-lists/[id]', () => {
  it('returns 200 on valid update', async () => {
    const updated = { ...mockList, name: 'Renamed' }
    getDb.mockReturnValue({
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([updated]) })) })) })),
    })
    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ name: 'Renamed' }) }),
      { params: Promise.resolve({ id: 'l1' }) }
    )
    expect(res.status).toBe(200)
  })

  it('returns 404 when list not found', async () => {
    getDb.mockReturnValue({
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) })) })),
    })
    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ name: 'X' }) }),
      { params: Promise.resolve({ id: 'missing' }) }
    )
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/todo-lists/[id]', () => {
  it('returns 403 when trying to delete Inbox', async () => {
    const inboxList = { ...mockList, name: 'Inbox' }
    getDb.mockReturnValue({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([inboxList]) })) })),
    })
    const res = await DELETE(
      new Request('http://localhost', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'l1' }) }
    )
    expect(res.status).toBe(403)
  })

  it('returns 204 and moves tasks to Inbox on non-Inbox delete', async () => {
    const workList = { ...mockList, id: 'l2', name: 'Work' }
    const inboxList = { ...mockList, id: 'l1', name: 'Inbox' }
    const mockDb = {
      select: vi.fn()
        .mockReturnValueOnce({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([workList]) })) })
        .mockReturnValueOnce({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([inboxList]) })) }),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    }
    getDb.mockReturnValue(mockDb)
    const res = await DELETE(
      new Request('http://localhost', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'l2' }) }
    )
    expect(res.status).toBe(204)
  })
})
