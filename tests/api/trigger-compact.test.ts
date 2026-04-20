import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCurrentUser, getDb, compactNotes, mergeMetadata, logTriggerAction } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
  compactNotes: vi.fn(),
  mergeMetadata: vi.fn((existing: unknown, patch: unknown) => ({ ...(existing as object ?? {}), ...(patch as object) })),
  logTriggerAction: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/compactor', () => ({ compactNotes }))
vi.mock('@/lib/db/notes', () => ({ mergeMetadata }))
vi.mock('@/lib/dev/triggerActionLogger', () => ({ logTriggerAction }))

import { POST } from '@/app/api/triggers/[id]/compact/route'

describe('POST /api/triggers/[id]/compact', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'user-1' })
    compactNotes.mockResolvedValue('Compacted history.')
  })

  it('calls compactNotes with notes + existing history and clears notes', async () => {
    const notes = [
      { id: 'n1', date: '2026-04-01', text: 'first' },
      { id: 'n2', date: '2026-04-10', text: 'second' },
    ]
    const trigger = {
      id: 'trig-1', userId: 'user-1', categoryId: 'cat-1',
      agentMetadata: { notes, condensedHistory: 'old' },
    }
    let capturedSet: unknown
    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([trigger]) })) })) })),
      update: vi.fn(() => ({ set: vi.fn((data: unknown) => { capturedSet = data; return { where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([trigger]) })) } }) })),
    }
    getDb.mockReturnValue(db)

    const res = await POST(
      new Request('http://localhost/api/triggers/trig-1/compact', { method: 'POST' }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )

    expect(res.status).toBe(200)
    expect(compactNotes).toHaveBeenCalledWith(
      [{ date: '2026-04-01', text: 'first' }, { date: '2026-04-10', text: 'second' }],
      'old'
    )
    expect(logTriggerAction).toHaveBeenCalledWith('compact_notes', expect.objectContaining({
      id: 'trig-1',
    }))
  })

  it('returns 400 when fewer than 2 notes', async () => {
    const trigger = {
      id: 'trig-1', userId: 'user-1', categoryId: 'cat-1',
      agentMetadata: { notes: [{ id: 'n1', date: '2026-04-01', text: 'one note' }] },
    }
    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([trigger]) })) })) })),
    }
    getDb.mockReturnValue(db)

    const res = await POST(
      new Request('http://localhost/api/triggers/trig-1/compact', { method: 'POST' }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INSUFFICIENT_NOTES')
    expect(logTriggerAction).not.toHaveBeenCalled()
  })

  it('returns 404 when trigger not owned', async () => {
    getDb.mockReturnValue({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })) })),
    })
    const res = await POST(
      new Request('http://localhost/api/triggers/ghost/compact', { method: 'POST' }),
      { params: Promise.resolve({ id: 'ghost' }) }
    )
    expect(res.status).toBe(404)
    expect(logTriggerAction).not.toHaveBeenCalled()
  })
})
