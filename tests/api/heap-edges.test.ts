import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from '@/app/api/heap/edges/route'
import { DELETE } from '@/app/api/heap/edges/[id]/route'

const { getCurrentUser, getDb } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))

function mockEdge(overrides = {}) {
  return { id: 'e-1', userId: 'u1', sourceId: 'n-1', targetId: 'n-2', label: null, createdAt: new Date(), ...overrides }
}

function mockNode(id: string) {
  return { id, userId: 'u1', type: 'brain_dump', title: 'Node', body: null, color: null, posX: 0, posY: 0, createdAt: new Date(), updatedAt: new Date() }
}

function mockDb(rows: unknown[] = []) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain)
  chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => Promise.resolve(rows))
  chain.insert = vi.fn(() => chain)
  chain.values = vi.fn(() => chain)
  chain.returning = vi.fn(() => Promise.resolve(rows))
  chain.delete = vi.fn(() => chain)
  return chain
}

describe('GET /api/heap/edges', () => {
  beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1' }) })

  it('returns edges mapped to source/target for React Flow', async () => {
    getDb.mockReturnValue(mockDb([mockEdge()]))
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body[0]).toMatchObject({ id: 'e-1', source: 'n-1', target: 'n-2' })
    expect(body[0].sourceId).toBeUndefined()
  })
})

describe('POST /api/heap/edges', () => {
  beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1' }) })

  it('returns 400 when sourceId === targetId (after ownership verified)', async () => {
    // Ownership check runs first — both lookups for the same id return the node
    const db = mockDb([mockNode('n-1')])
    getDb.mockReturnValue(db)
    const res = await POST(new Request('http://localhost/api/heap/edges', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: 'n-1', targetId: 'n-1' }),
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('returns 404 when source node not owned by user', async () => {
    let call = 0
    const db = { ...mockDb([]), where: vi.fn(() => { call++; return Promise.resolve(call === 1 ? [] : [mockNode('n-2')]) }) } as Record<string, unknown>
    db.select = vi.fn(() => db); db.from = vi.fn(() => db)
    getDb.mockReturnValue(db)
    const res = await POST(new Request('http://localhost/api/heap/edges', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: 'n-1', targetId: 'n-2' }),
    }))
    expect(res.status).toBe(404)
  })

  it('creates an edge and returns source/target fields', async () => {
    const edge = mockEdge()
    let selectCall = 0
    const db = mockDb()
    db.where = vi.fn(() => {
      selectCall++
      if (selectCall <= 2) return Promise.resolve([mockNode(selectCall === 1 ? 'n-1' : 'n-2')])
      return Promise.resolve([edge])
    })
    db.insert = vi.fn(() => db); db.values = vi.fn(() => db)
    db.returning = vi.fn(() => Promise.resolve([edge]))
    getDb.mockReturnValue(db)
    const res = await POST(new Request('http://localhost/api/heap/edges', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: 'n-1', targetId: 'n-2' }),
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toMatchObject({ source: 'n-1', target: 'n-2' })
  })
})

describe('DELETE /api/heap/edges/[id]', () => {
  beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1' }) })

  it('returns 404 when edge not found or wrong user', async () => {
    getDb.mockReturnValue(mockDb([]))
    const res = await DELETE(
      new Request('http://localhost/api/heap/edges/e-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'e-1' }) }
    )
    expect(res.status).toBe(404)
  })

  it('deletes edge and returns 204', async () => {
    const db = mockDb([mockEdge()])
    getDb.mockReturnValue(db)
    const res = await DELETE(
      new Request('http://localhost/api/heap/edges/e-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'e-1' }) }
    )
    expect(res.status).toBe(204)
  })
})
