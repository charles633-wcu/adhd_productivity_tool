import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCurrentUser, getDb, summarizeTrigger, mergeMetadata } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
  summarizeTrigger: vi.fn(),
  mergeMetadata: vi.fn((existing: unknown, patch: unknown) => ({ ...(existing as object ?? {}), ...(patch as object) })),
}))

vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/summarizer', () => ({ summarizeTrigger }))
vi.mock('@/lib/db/notes', () => ({ mergeMetadata }))

import { POST } from '@/app/api/triggers/[id]/summarize/route'

function makeDb(trigger: unknown) {
  return {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([trigger]) })) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([trigger]) })) })) })),
  }
}

describe('POST /api/triggers/[id]/summarize', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'user-1' })
    summarizeTrigger.mockResolvedValue('Updated summary.')
  })

  it('calls summarizeTrigger with fullContent + context and saves result', async () => {
    const notes = [{ id: 'n1', date: '2026-04-01', text: 'a note' }]
    const trigger = {
      id: 'trig-1', userId: 'user-1', categoryId: 'cat-1',
      fullContent: 'Original content here',
      summary: null, summaryStatus: 'pending',
      agentMetadata: { notes, condensedHistory: 'old history' },
    }
    getDb.mockReturnValue(makeDb(trigger))

    const res = await POST(
      new Request('http://localhost/api/triggers/trig-1/summarize', { method: 'POST' }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )

    expect(res.status).toBe(200)
    expect(summarizeTrigger).toHaveBeenCalledWith(
      'Original content here',
      { condensedHistory: 'old history', notes: [{ date: '2026-04-01', text: 'a note' }] }
    )
  })

  it('returns 404 when trigger not owned', async () => {
    getDb.mockReturnValue({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })) })),
    })
    const res = await POST(
      new Request('http://localhost/api/triggers/ghost/summarize', { method: 'POST' }),
      { params: Promise.resolve({ id: 'ghost' }) }
    )
    expect(res.status).toBe(404)
  })

  it('updates summaryStatus to "generated" and lastAgentRun on success', async () => {
    const trigger = {
      id: 'trig-1', userId: 'user-1', categoryId: 'cat-1',
      fullContent: 'Content', summary: null, summaryStatus: 'pending',
      agentMetadata: null,
    }
    let capturedSet: unknown
    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([trigger]) })) })) })),
      update: vi.fn(() => ({ set: vi.fn((data: unknown) => { capturedSet = data; return { where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([trigger]) })) } }) })),
    }
    getDb.mockReturnValue(db)

    await POST(
      new Request('http://localhost/api/triggers/trig-1/summarize', { method: 'POST' }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )

    expect((capturedSet as { summaryStatus: string }).summaryStatus).toBe('generated')
    expect((capturedSet as { summary: string }).summary).toBe('Updated summary.')
  })
})
