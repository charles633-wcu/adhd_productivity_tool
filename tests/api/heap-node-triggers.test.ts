import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from '@/app/api/heap/nodes/[id]/triggers/route'

const { getCurrentUser, getDb } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))

function mockNode(userId = 'u1') {
  return { id: 'n-1', userId, type: 'brain_dump', title: 'N', body: null, color: null, posX: 0, posY: 0, createdAt: new Date(), updatedAt: new Date() }
}
function mockTrigger(userId = 'u1') {
  return { id: 'tr-1', userId, categoryId: 'c-1', title: 'My trigger', status: 'active', nextReviewAt: new Date(), reviewIntervalDays: 7, fullContent: '', summary: null, summaryStatus: 'pending', priority: 2, lastReviewedAt: null, notifyChannel: null, agentMetadata: null, createdAt: new Date(), updatedAt: new Date() }
}
function mockDb(rows: unknown[] = []) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain); chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => Promise.resolve(rows))
  chain.insert = vi.fn(() => chain); chain.values = vi.fn(() => chain)
  chain.returning = vi.fn(() => Promise.resolve(rows))
  chain.innerJoin = vi.fn(() => chain)
  return chain
}

describe('GET /api/heap/nodes/[id]/triggers', () => {
  beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1' }) })

  it('returns 404 when node not owned', async () => {
    getDb.mockReturnValue(mockDb([]))
    const res = await GET(new Request('http://localhost/api/heap/nodes/n-1/triggers'), { params: Promise.resolve({ id: 'n-1' }) })
    expect(res.status).toBe(404)
  })

  it('returns empty array when no triggers linked', async () => {
    let call = 0
    const db = mockDb()
    db.where = vi.fn(() => { call++; return Promise.resolve(call === 1 ? [mockNode()] : []) })
    getDb.mockReturnValue(db)
    const res = await GET(new Request('http://localhost/api/heap/nodes/n-1/triggers'), { params: Promise.resolve({ id: 'n-1' }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('returns linked triggers', async () => {
    let call = 0
    const db = mockDb()
    db.where = vi.fn(() => {
      call++
      if (call === 1) return Promise.resolve([mockNode()])
      if (call === 2) return Promise.resolve([{ nodeId: 'n-1', triggerId: 'tr-1' }])
      return Promise.resolve([mockTrigger()])
    })
    getDb.mockReturnValue(db)
    const res = await GET(new Request('http://localhost/api/heap/nodes/n-1/triggers'), { params: Promise.resolve({ id: 'n-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body[0].id).toBe('tr-1')
  })
})

describe('POST /api/heap/nodes/[id]/triggers', () => {
  beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1' }) })

  it('returns 404 when node not owned', async () => {
    getDb.mockReturnValue(mockDb([]))
    const res = await POST(
      new Request('http://localhost/api/heap/nodes/n-1/triggers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ triggerId: 'tr-1' }) }),
      { params: Promise.resolve({ id: 'n-1' }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns 404 when trigger not owned (IDOR guard)', async () => {
    let call = 0
    const db = mockDb()
    db.where = vi.fn(() => { call++; return Promise.resolve(call === 1 ? [mockNode()] : []) })
    getDb.mockReturnValue(db)
    const res = await POST(
      new Request('http://localhost/api/heap/nodes/n-1/triggers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ triggerId: 'tr-other' }) }),
      { params: Promise.resolve({ id: 'n-1' }) }
    )
    expect(res.status).toBe(404)
  })

  it('links trigger to node and returns 201 with lean trigger body', async () => {
    let call = 0
    const db = mockDb()
    db.where = vi.fn(() => { call++; return Promise.resolve(call === 1 ? [mockNode()] : [mockTrigger()]) })
    db.insert = vi.fn(() => db); db.values = vi.fn(() => Promise.resolve())
    getDb.mockReturnValue(db)
    const res = await POST(
      new Request('http://localhost/api/heap/nodes/n-1/triggers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ triggerId: 'tr-1' }) }),
      { params: Promise.resolve({ id: 'n-1' }) }
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('tr-1')
    expect(body.title).toBe('My trigger')
    // Should NOT include userId or fullContent — lean subset only
    expect(body.userId).toBeUndefined()
    expect(body.fullContent).toBeUndefined()
  })

  it('returns 409 when link already exists', async () => {
    let call = 0
    const db = mockDb()
    db.where = vi.fn(() => { call++; return Promise.resolve(call === 1 ? [mockNode()] : [mockTrigger()]) })
    db.insert = vi.fn(() => db)
    db.values = vi.fn(() => Promise.reject(new Error('UNIQUE constraint failed')))
    getDb.mockReturnValue(db)
    const res = await POST(
      new Request('http://localhost/api/heap/nodes/n-1/triggers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ triggerId: 'tr-1' }) }),
      { params: Promise.resolve({ id: 'n-1' }) }
    )
    expect(res.status).toBe(409)
  })
})
