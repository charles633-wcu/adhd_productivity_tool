import { getTableColumns } from 'drizzle-orm'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { heapNodes, heapEdges, heapNodeTodos } from '@/lib/db/schema'

const { getCurrentUser, getDb } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))

import { GET, POST } from '@/app/api/heap/nodes/route'
import { GET as GET_ONE, PATCH, DELETE } from '@/app/api/heap/nodes/[id]/route'

describe('heap schema columns', () => {
  it('heap_nodes has required columns', () => {
    const cols = getTableColumns(heapNodes) as Record<string, { name: string }>
    expect(cols.id.name).toBe('id')
    expect(cols.userId.name).toBe('user_id')
    expect(cols.type.name).toBe('type')
    expect(cols.posX.name).toBe('pos_x')
    expect(cols.posY.name).toBe('pos_y')
  })

  it('heap_edges has required columns', () => {
    const cols = getTableColumns(heapEdges) as Record<string, { name: string }>
    expect(cols.sourceId.name).toBe('source_id')
    expect(cols.targetId.name).toBe('target_id')
  })

  it('heap_node_todos has composite PK columns', () => {
    const cols = getTableColumns(heapNodeTodos) as Record<string, { name: string }>
    expect(cols.nodeId.name).toBe('node_id')
    expect(cols.todoId.name).toBe('todo_id')
  })
})

function mockNode(overrides = {}) {
  return {
    id: 'node-1',
    userId: 'u1',
    type: 'brain_dump',
    title: 'Test node',
    body: null,
    color: null,
    posX: 0,
    posY: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function mockDb(rows: unknown[] = []) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain)
  chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => Promise.resolve(rows))
  chain.insert = vi.fn(() => chain)
  chain.values = vi.fn(() => chain)
  chain.returning = vi.fn(() => Promise.resolve(rows))
  chain.update = vi.fn(() => chain)
  chain.set = vi.fn(() => chain)
  chain.delete = vi.fn(() => chain)
  return chain
}

describe('GET /api/heap/nodes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'u1' })
  })

  it('returns nodes for current user', async () => {
    const node = mockNode()
    const db = mockDb([node])
    getDb.mockReturnValue(db)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe('node-1')
  })
})

describe('GET /api/heap/nodes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'u1' })
  })

  it('returns 404 when node not found or wrong user', async () => {
    getDb.mockReturnValue(mockDb([]))
    const res = await GET_ONE(
      new Request('http://localhost/api/heap/nodes/node-1'),
      { params: Promise.resolve({ id: 'node-1' }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns node by id', async () => {
    const node = mockNode()
    getDb.mockReturnValue(mockDb([node]))
    const res = await GET_ONE(
      new Request('http://localhost/api/heap/nodes/node-1'),
      { params: Promise.resolve({ id: 'node-1' }) }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe('node-1')
  })
})

describe('POST /api/heap/nodes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'u1' })
  })

  it('creates a node with defaults', async () => {
    const node = mockNode()
    const db = mockDb([node])
    getDb.mockReturnValue(db)
    const res = await POST(new Request('http://localhost/api/heap/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test node' }),
    }))
    expect(res.status).toBe(201)
  })

  it('rejects missing title with 400', async () => {
    const res = await POST(new Request('http://localhost/api/heap/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }))
    expect(res.status).toBe(400)
  })

  it('rejects invalid color with 400', async () => {
    const res = await POST(new Request('http://localhost/api/heap/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'X', color: 'red' }),
    }))
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/heap/nodes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'u1' })
  })

  it('returns 404 when node not found or wrong user', async () => {
    getDb.mockReturnValue(mockDb([]))
    const res = await PATCH(
      new Request('http://localhost/api/heap/nodes/node-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New' }),
      }),
      { params: Promise.resolve({ id: 'node-1' }) }
    )
    expect(res.status).toBe(404)
  })

  it('updates node fields and returns 200', async () => {
    const node = mockNode({ title: 'New' })
    const db = mockDb([node])
    getDb.mockReturnValue(db)
    const res = await PATCH(
      new Request('http://localhost/api/heap/nodes/node-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New' }),
      }),
      { params: Promise.resolve({ id: 'node-1' }) }
    )
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/heap/nodes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'u1' })
  })

  it('returns 404 when node not found or wrong user', async () => {
    getDb.mockReturnValue(mockDb([]))
    const res = await DELETE(
      new Request('http://localhost/api/heap/nodes/node-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'node-1' }) }
    )
    expect(res.status).toBe(404)
  })

  it('deletes node and returns 204', async () => {
    const db = mockDb([mockNode()])
    getDb.mockReturnValue(db)
    const res = await DELETE(
      new Request('http://localhost/api/heap/nodes/node-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'node-1' }) }
    )
    expect(res.status).toBe(204)
  })
})
