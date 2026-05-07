import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/triggers/route'

const { getCurrentUser, getDb } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))
vi.mock('@/lib/dev/triggerActionLogger', () => ({ logTriggerAction: vi.fn() }))

function mockTrigger(status = 'active') {
  return { id: 't-1', userId: 'u1', categoryId: 'c1', title: 'T', status, nextReviewAt: new Date(), reviewIntervalDays: 7, fullContent: '', summary: null, summaryStatus: 'pending', priority: 2, lastReviewedAt: null, notifyChannel: null, agentMetadata: null, createdAt: new Date(), updatedAt: new Date() }
}
function mockDb(rows: unknown[] = []) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain); chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => Promise.resolve(rows))
  return chain
}

describe('GET /api/triggers?status=', () => {
  beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1' }) })

  it('returns all triggers when no status param', async () => {
    getDb.mockReturnValue(mockDb([mockTrigger('active'), mockTrigger('snoozed')]))
    const res = await GET(new Request('http://localhost/api/triggers'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(2)
  })

  it('returns 400 for invalid status value', async () => {
    getDb.mockReturnValue(mockDb([]))
    const res = await GET(new Request('http://localhost/api/triggers?status=garbage'))
    expect(res.status).toBe(400)
  })

  it('filters by status=active', async () => {
    getDb.mockReturnValue(mockDb([mockTrigger('active')]))
    const res = await GET(new Request('http://localhost/api/triggers?status=active'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].status).toBe('active')
  })
})
