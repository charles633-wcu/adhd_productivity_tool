import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCurrentUser, getDb } = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getDb: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))

import { GET, POST } from '@/app/api/scratch-notes/reminder/route'

const DAY = 24 * 60 * 60 * 1000

beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1', lastTodoReminderAt: null }) })

function dbWithNotes(notes: unknown[]) {
  return { select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue(notes) })) })) }
}

describe('GET /api/scratch-notes/reminder', () => {
  it('due=true when never reminded and has unchecked notes', async () => {
    getDb.mockReturnValue(dbWithNotes([{ id: 'n1', content: 'a', checked: 0 }]))
    const res = await GET(new Request('http://localhost'))
    const body = await res.json()
    expect(body.due).toBe(true)
    expect(body.notes).toHaveLength(1)
  })

  it('due=false when reminded < 24h ago', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1', lastTodoReminderAt: new Date(Date.now() - DAY / 2) })
    getDb.mockReturnValue(dbWithNotes([{ id: 'n1', checked: 0 }]))
    const res = await GET(new Request('http://localhost'))
    expect((await res.json()).due).toBe(false)
  })

  it('due=true when reminded > 24h ago', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1', lastTodoReminderAt: new Date(Date.now() - DAY * 2) })
    getDb.mockReturnValue(dbWithNotes([{ id: 'n1', checked: 0 }]))
    const res = await GET(new Request('http://localhost'))
    expect((await res.json()).due).toBe(true)
  })
})

describe('POST /api/scratch-notes/reminder', () => {
  it('stamps lastTodoReminderAt and returns ok', async () => {
    const where = vi.fn().mockResolvedValue(undefined)
    const set = vi.fn(() => ({ where }))
    getDb.mockReturnValue({ update: vi.fn(() => ({ set })) })
    const res = await POST(new Request('http://localhost', { method: 'POST' }))
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ lastTodoReminderAt: expect.any(Date) }))
  })
})
