import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCurrentUser, getDb, saveConversation } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
  saveConversation: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))
vi.mock('@/lib/db/conversations', () => ({ saveConversation }))

import { POST } from '@/app/api/chat/conversations/route'

describe('POST /api/chat/conversations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'user-1' })
    getDb.mockReturnValue({})
    saveConversation.mockResolvedValue({ id: 'conv-1', title: 'Hello world', createdAt: new Date() })
  })

  it('returns 401 when unauthenticated', async () => {
    getCurrentUser.mockRejectedValue(new Error('no user'))
    const res = await POST(new Request('http://localhost/api/chat/conversations', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }] }),
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(res.status).toBe(401)
  })

  it('returns 400 with fewer than 2 messages', async () => {
    const res = await POST(new Request('http://localhost/api/chat/conversations', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(res.status).toBe(400)
  })

  it('saves conversation and returns 201 with id and title', async () => {
    const messages = [
      { role: 'user', content: 'What should my next project be?' },
      { role: 'assistant', content: 'Based on your triggers...' },
    ]
    const res = await POST(new Request('http://localhost/api/chat/conversations', {
      method: 'POST',
      body: JSON.stringify({ messages }),
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('conv-1')
    expect(saveConversation).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        userId: 'user-1',
        title: 'What should my next project be?',
        messages,
      })
    )
  })

  it('truncates title to 60 chars', async () => {
    const longMessage = 'A'.repeat(100)
    const messages = [{ role: 'user', content: longMessage }, { role: 'assistant', content: 'reply' }]
    await POST(new Request('http://localhost/api/chat/conversations', {
      method: 'POST',
      body: JSON.stringify({ messages }),
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(saveConversation).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ title: 'A'.repeat(60) })
    )
  })
})
