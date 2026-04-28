import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCurrentUser, getDb } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))

import { GET, POST } from '@/app/api/todo-labels/route'
import { PATCH, DELETE } from '@/app/api/todo-labels/[id]/route'

const mockUser = { id: 'u1' }
const mockLabel = { id: 'lb1', userId: 'u1', name: 'urgent', color: '#ef4444', createdAt: new Date() }

beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue(mockUser) })

describe('GET /api/todo-labels', () => {
  it('returns all labels for user', async () => {
    getDb.mockReturnValue({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([mockLabel]) })) })),
    })
    const res = await GET(new Request('http://localhost/api/todo-labels'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
  })
})

describe('POST /api/todo-labels', () => {
  it('returns 201 on valid create', async () => {
    getDb.mockReturnValue({
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([mockLabel]) })) })),
    })
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ name: 'urgent', color: '#ef4444' }),
    }))
    expect(res.status).toBe(201)
  })

  it('returns 400 when name exceeds 50 chars', async () => {
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ name: 'x'.repeat(51) }),
    }))
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/todo-labels/[id]', () => {
  it('returns 200 on rename', async () => {
    const updated = { ...mockLabel, name: 'renamed' }
    getDb.mockReturnValue({
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([updated]) })) })) })),
    })
    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ name: 'renamed' }) }),
      { params: Promise.resolve({ id: 'lb1' }) }
    )
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/todo-labels/[id]', () => {
  it('returns 204 and cleans up junction rows', async () => {
    const mockDb = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([mockLabel]) })) })),
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    }
    getDb.mockReturnValue(mockDb)
    const res = await DELETE(
      new Request('http://localhost', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'lb1' }) }
    )
    expect(res.status).toBe(204)
  })
})
