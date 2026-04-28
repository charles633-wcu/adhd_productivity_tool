import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCurrentUser, getDb } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))

import { GET, POST } from '@/app/api/todos/route'
import { GET as GET_ONE, PATCH, DELETE } from '@/app/api/todos/[id]/route'

const mockUser = { id: 'u1' }
const mockInbox = { id: 'inbox1', userId: 'u1', name: 'Inbox' }
const mockTodo = {
  id: 't1', userId: 'u1', listId: 'inbox1', parentId: null,
  title: 'Buy groceries', description: null, priority: 'high',
  dueDate: null, dueTime: null, completed: 0, completedAt: null,
  sortOrder: 0, createdAt: new Date(), updatedAt: new Date(),
}

beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue(mockUser) })

// Helper: builds a mock select chain that supports .from().where().orderBy()
// Returns an empty array — nestSubtasks short-circuits on empty, so no second select needed.
function makeEmptySelectChain() {
  const orderBy = vi.fn().mockResolvedValue([])
  const where = vi.fn(() => ({ orderBy }))
  const from = vi.fn(() => ({ where }))
  return { from }
}

// Helper: builds a mock select chain for a list lookup that resolves with `rows`
// (no .orderBy() — used for todoLists Inbox lookup which has no order clause)
function makeSelectChain(rows: unknown[]) {
  const where = vi.fn().mockResolvedValue(rows)
  const from = vi.fn(() => ({ where }))
  return { from }
}

describe('GET /api/todos', () => {
  it('defaults to "all" view when no params provided', async () => {
    // Root tasks query returns empty → nestSubtasks short-circuits (no second select)
    getDb.mockReturnValue({
      select: vi.fn(() => makeEmptySelectChain()),
    })
    const res = await GET(new Request('http://localhost/api/todos'))
    expect(res.status).toBe(200)
  })

  it('returns tasks with view=inbox', async () => {
    const mockDb = {
      select: vi.fn()
        // First call: Inbox list lookup — uses .where() with no .orderBy()
        .mockReturnValueOnce(makeSelectChain([mockInbox]))
        // Second call: root tasks query — uses .where().orderBy(), returns empty
        .mockReturnValueOnce(makeEmptySelectChain()),
    }
    getDb.mockReturnValue(mockDb)
    const res = await GET(new Request('http://localhost/api/todos?view=inbox'))
    expect(res.status).toBe(200)
  })

  it('returns 200 with view=today', async () => {
    getDb.mockReturnValue({
      select: vi.fn(() => makeEmptySelectChain()),
    })
    const res = await GET(new Request('http://localhost/api/todos?view=today'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  it('upcoming view returns 200', async () => {
    getDb.mockReturnValue({
      select: vi.fn(() => makeEmptySelectChain()),
    })
    const res = await GET(new Request('http://localhost/api/todos?view=upcoming'))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/todos', () => {
  it('returns 201 on valid task create', async () => {
    getDb.mockReturnValue({
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([mockTodo]) })) })),
    })
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ title: 'Buy groceries', listId: 'inbox1' }),
    }))
    expect(res.status).toBe(201)
  })

  it('returns 400 when title is missing', async () => {
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ listId: 'inbox1' }),
    }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when dueTime is provided without dueDate', async () => {
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ title: 'Task', dueTime: '09:00' }),
    }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when title exceeds 500 chars', async () => {
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ title: 'x'.repeat(501) }),
    }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when parentId points to a non-root task', async () => {
    const nonRoot = { ...mockTodo, id: 'child1', parentId: 't1' }
    getDb.mockReturnValue({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([nonRoot]) })) })),
    })
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ title: 'Sub-subtask', parentId: 'child1' }),
    }))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/todos/[id]', () => {
  it('returns single todo with 200', async () => {
    getDb.mockReturnValue({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([mockTodo]) })) })),
    })
    const res = await GET_ONE(
      new Request('http://localhost/api/todos/t1'),
      { params: Promise.resolve({ id: 't1' }) }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe('t1')
  })

  it('returns 404 when not found', async () => {
    getDb.mockReturnValue({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
    })
    const res = await GET_ONE(
      new Request('http://localhost/api/todos/missing'),
      { params: Promise.resolve({ id: 'missing' }) }
    )
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/todos/[id]', () => {
  it('marks task as completed and sets completedAt', async () => {
    const updated = { ...mockTodo, completed: 1, completedAt: new Date() }
    getDb.mockReturnValue({
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([updated]) })) })) })),
    })
    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ completed: true }) }),
      { params: Promise.resolve({ id: 't1' }) }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.completed).toBe(1)
  })

  it('returns 400 with no fields', async () => {
    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: 't1' }) }
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 when task not found', async () => {
    getDb.mockReturnValue({
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) })) })),
    })
    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ title: 'X' }) }),
      { params: Promise.resolve({ id: 'missing' }) }
    )
    expect(res.status).toBe(404)
  })

  it('marks task as incomplete and clears completedAt', async () => {
    const updated = { ...mockTodo, completed: 0, completedAt: null }
    getDb.mockReturnValue({
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([updated]) })) })) })),
    })
    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ completed: false }) }),
      { params: Promise.resolve({ id: 't1' }) }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.completed).toBe(0)
    expect(body.completedAt).toBeNull()
  })
})

describe('DELETE /api/todos/[id]', () => {
  it('returns 204 and cascades to subtasks', async () => {
    const mockDb = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([mockTodo]) })) })),
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    }
    getDb.mockReturnValue(mockDb)
    const res = await DELETE(
      new Request('http://localhost', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 't1' }) }
    )
    expect(res.status).toBe(204)
  })

  it('returns 204 even when task not found (idempotent)', async () => {
    getDb.mockReturnValue({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
    })
    const res = await DELETE(
      new Request('http://localhost', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'nonexistent' }) }
    )
    expect(res.status).toBe(204)
  })
})
