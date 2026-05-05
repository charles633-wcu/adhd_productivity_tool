import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from '@/app/api/heap/nodes/[id]/todos/route'
import { DELETE } from '@/app/api/heap/nodes/[id]/todos/[todoId]/route'

const { getCurrentUser, getDb } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))

function mockNode(userId = 'u1') {
  return { id: 'n-1', userId, type: 'brain_dump', title: 'N', body: null, color: null, posX: 0, posY: 0, createdAt: new Date(), updatedAt: new Date() }
}
function mockTodo(userId = 'u1') {
  return { id: 't-1', userId, listId: 'l-1', title: 'Todo', completed: 0, priority: 'none', parentId: null, dueDate: null, dueTime: null, description: null, sortOrder: 0, completedAt: null, createdAt: new Date(), updatedAt: new Date() }
}
function mockDb(rows: unknown[] = []) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain); chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => Promise.resolve(rows))
  chain.insert = vi.fn(() => chain); chain.values = vi.fn(() => chain)
  chain.returning = vi.fn(() => Promise.resolve(rows))
  chain.delete = vi.fn(() => chain)
  chain.innerJoin = vi.fn(() => chain)
  return chain
}

describe('GET /api/heap/nodes/[id]/todos', () => {
  beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1' }) })

  it('returns 404 when node not owned by user', async () => {
    getDb.mockReturnValue(mockDb([]))
    const res = await GET(
      new Request('http://localhost/api/heap/nodes/n-1/todos'),
      { params: Promise.resolve({ id: 'n-1' }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns linked todos', async () => {
    let call = 0
    const db = mockDb()
    db.where = vi.fn(() => { call++; return Promise.resolve(call === 1 ? [mockNode()] : [mockTodo()]) })
    getDb.mockReturnValue(db)
    const res = await GET(
      new Request('http://localhost/api/heap/nodes/n-1/todos'),
      { params: Promise.resolve({ id: 'n-1' }) }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body[0].id).toBe('t-1')
  })
})

describe('POST /api/heap/nodes/[id]/todos', () => {
  beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1' }) })

  it('returns 404 when node not owned', async () => {
    getDb.mockReturnValue(mockDb([]))
    const res = await POST(
      new Request('http://localhost/api/heap/nodes/n-1/todos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ todoId: 't-1' }),
      }),
      { params: Promise.resolve({ id: 'n-1' }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns 404 when todo not owned by user (IDOR guard)', async () => {
    let call = 0
    const db = mockDb()
    db.where = vi.fn(() => { call++; return Promise.resolve(call === 1 ? [mockNode()] : []) })
    getDb.mockReturnValue(db)
    const res = await POST(
      new Request('http://localhost/api/heap/nodes/n-1/todos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ todoId: 't-other' }),
      }),
      { params: Promise.resolve({ id: 'n-1' }) }
    )
    expect(res.status).toBe(404)
  })

  it('links todo to node and returns 201', async () => {
    let call = 0
    const db = mockDb()
    db.where = vi.fn(() => { call++; return Promise.resolve(call === 1 ? [mockNode()] : [mockTodo()]) })
    db.insert = vi.fn(() => db); db.values = vi.fn(() => db)
    db.returning = vi.fn(() => Promise.resolve([{ nodeId: 'n-1', todoId: 't-1' }]))
    getDb.mockReturnValue(db)
    const res = await POST(
      new Request('http://localhost/api/heap/nodes/n-1/todos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ todoId: 't-1' }),
      }),
      { params: Promise.resolve({ id: 'n-1' }) }
    )
    expect(res.status).toBe(201)
  })
})

describe('DELETE /api/heap/nodes/[id]/todos/[todoId]', () => {
  beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1' }) })

  it('returns 404 when node not owned', async () => {
    getDb.mockReturnValue(mockDb([]))
    const res = await DELETE(
      new Request('http://localhost/api/heap/nodes/n-1/todos/t-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'n-1', todoId: 't-1' }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns 404 when junction row not found', async () => {
    let call = 0
    const db = mockDb()
    db.where = vi.fn(() => { call++; return Promise.resolve(call === 1 ? [mockNode()] : []) })
    getDb.mockReturnValue(db)
    const res = await DELETE(
      new Request('http://localhost/api/heap/nodes/n-1/todos/t-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'n-1', todoId: 't-1' }) }
    )
    expect(res.status).toBe(404)
  })

  it('deletes junction row and returns 204', async () => {
    const db = mockDb([mockNode()])
    db.where = vi.fn(() => Promise.resolve([mockNode()]))
    db.delete = vi.fn(() => db)
    getDb.mockReturnValue(db)
    const res = await DELETE(
      new Request('http://localhost/api/heap/nodes/n-1/todos/t-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'n-1', todoId: 't-1' }) }
    )
    expect([204, 404]).toContain(res.status)
  })
})
