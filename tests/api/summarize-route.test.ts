import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCurrentUser, getDb, summarizeTrigger, mergeMetadata } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
  summarizeTrigger: vi.fn(),
  mergeMetadata: vi.fn((existing: unknown, patch: unknown) => ({ ...(existing as object ?? {}), ...(patch as object) })),
}))

vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))
vi.mock('@/lib/services/summarizer', () => ({ summarizeTrigger }))
vi.mock('@/lib/db/notes', () => ({ mergeMetadata }))

import { POST } from '@/app/api/summarize/route'

function makeDb(trigger: unknown) {
  return {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([trigger]) })) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
  }
}

describe('POST /api/summarize', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'user-1' })
    summarizeTrigger.mockResolvedValue('Updated summary.')
  })

  it('uses accumulated memory context when original content is short', async () => {
    const trigger = {
      id: 'trig-1',
      userId: 'user-1',
      categoryId: 'cat-1',
      title: 'Buy pineapple',
      fullContent: '',
      agentMetadata: {
        condensedHistory: 'Waiting until the July sale before deciding which store to use.',
        notes: [
          { id: 'n1', date: '2026-04-10', text: 'Also compare canned versus fresh because shelf life matters for this plan.' },
        ],
      },
    }
    getDb.mockReturnValue(makeDb(trigger))

    const res = await POST(new Request('http://localhost/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggerId: 'trig-1', content: 'Buy pineapple' }),
    }))

    expect(res.status).toBe(200)
    expect(summarizeTrigger).toHaveBeenCalledWith(
      'Buy pineapple',
      {
        condensedHistory: trigger.agentMetadata.condensedHistory,
        notes: [{ date: '2026-04-10', text: trigger.agentMetadata.notes[0].text }],
      }
    )
  })

  it('returns skipped feedback when there is not enough detail yet', async () => {
    const trigger = {
      id: 'trig-1',
      userId: 'user-1',
      categoryId: 'cat-1',
      title: 'Buy pineapple',
      fullContent: '',
      agentMetadata: null,
    }
    getDb.mockReturnValue(makeDb(trigger))

    const res = await POST(new Request('http://localhost/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggerId: 'trig-1', content: 'Buy pineapple' }),
    }))
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload).toMatchObject({
      skipped: true,
      code: 'INSUFFICIENT_CONTENT',
    })
    expect(String(payload.reason)).toContain('Not enough detail')
    expect(summarizeTrigger).not.toHaveBeenCalled()
  })
})
