import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCurrentUser, getDb, chatProvider } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
  chatProvider: { chat: vi.fn() },
}))

vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))
vi.mock('@/lib/services/chatProvider', () => ({ chatProvider }))
vi.mock('@/lib/services/chatTools', () => ({
  CHAT_TOOLS: [
    {
      definition: { name: 'test_tool', description: 'test', parameters: { type: 'object', properties: {}, required: [] } },
      handler: vi.fn().mockResolvedValue({ result: 'tool output' }),
    },
  ],
}))
vi.mock('@/lib/services/chatSystemPrompt', () => ({ SYSTEM_PROMPT: 'You are Sentinel.' }))

import { POST } from '@/app/api/chat/route'

const mockDb = {}

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'user-1' })
    getDb.mockReturnValue(mockDb)
  })

  it('returns 401 when not authenticated', async () => {
    getCurrentUser.mockRejectedValue(new Error('No user'))
    const res = await POST(new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid body', async () => {
    const res = await POST(new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: 'not-an-array' }),
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(res.status).toBe(400)
  })

  it('returns reply when provider returns text directly', async () => {
    chatProvider.chat.mockResolvedValue({ type: 'text', text: 'Hello!' })
    const res = await POST(new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.reply).toBe('Hello!')
  })

  it('executes tool calls and re-calls provider', async () => {
    chatProvider.chat
      .mockResolvedValueOnce({ type: 'tool_calls', toolCalls: [{ id: 'tc1', name: 'test_tool', arguments: {} }], text: null })
      .mockResolvedValueOnce({ type: 'text', text: 'Done with tools!' })

    const res = await POST(new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'use the tool' }] }),
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.reply).toBe('Done with tools!')
    expect(chatProvider.chat).toHaveBeenCalledTimes(2)
  })

  it('returns 400 when messages array exceeds 50 turns', async () => {
    const messages = Array.from({ length: 51 }, (_, i) => ({ role: 'user', content: `msg ${i}` }))
    const res = await POST(new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages }),
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(res.status).toBe(400)
  })

  it('prepends system message as first message sent to provider', async () => {
    chatProvider.chat.mockResolvedValue({ type: 'text', text: 'Hi!' })
    await POST(new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
      headers: { 'Content-Type': 'application/json' },
    }))
    const sentMessages = chatProvider.chat.mock.calls[0][0]
    expect(sentMessages[0]).toEqual({ role: 'system', content: 'You are Sentinel.' })
  })

  it('appends verbose reasoning line to system message in debug mode', async () => {
    chatProvider.chat.mockResolvedValue({ type: 'text', text: 'Hi!' })
    await POST(new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }], debug: true }),
      headers: { 'Content-Type': 'application/json' },
    }))
    const sentMessages = chatProvider.chat.mock.calls[0][0]
    expect(sentMessages[0].content).toContain('Before calling any tool')
  })

  it('returns trace array when debug is true', async () => {
    // Include text: null on tool_calls mock — route reads response.text for the reasoning step
    chatProvider.chat
      .mockResolvedValueOnce({ type: 'tool_calls', toolCalls: [{ id: 'tc1', name: 'test_tool', arguments: { q: 'x' } }], text: null })
      .mockResolvedValueOnce({ type: 'text', text: 'Done!' })

    const res = await POST(new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'search' }], debug: true }),
      headers: { 'Content-Type': 'application/json' },
    }))
    const body = await res.json()
    expect(body.trace).toBeDefined()
    expect(body.trace.length).toBeGreaterThan(0)
    const toolCallStep = body.trace.find((s: { type: string }) => s.type === 'tool_call')
    expect(toolCallStep?.toolName).toBe('test_tool')
  })

  it('omits trace when debug is false or absent', async () => {
    chatProvider.chat.mockResolvedValue({ type: 'text', text: 'Hi!' })
    const res = await POST(new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
      headers: { 'Content-Type': 'application/json' },
    }))
    const body = await res.json()
    expect(body.trace).toBeUndefined()
  })

  it('returns 502 without trace when provider throws with debug true', async () => {
    chatProvider.chat.mockRejectedValue(new Error('OpenAI down'))
    const res = await POST(new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }], debug: true }),
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.trace).toBeUndefined()
  })

  it('returns an actionable quota error when the provider reports insufficient quota', async () => {
    const quotaError = Object.assign(new Error('quota exceeded'), {
      status: 429,
      code: 'insufficient_quota',
      type: 'insufficient_quota',
    })
    chatProvider.chat.mockRejectedValue(quotaError)

    const res = await POST(new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
      headers: { 'Content-Type': 'application/json' },
    }))

    expect(res.status).toBe(402)
    const body = await res.json()
    expect(body.error).toBe('AI quota exhausted')
    expect(body.message).toContain('OpenAI quota')
  })
})
