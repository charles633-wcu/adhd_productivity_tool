import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCurrentUser, getDb } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))

// Shared mock for chat.completions.create — declared before vi.mock hoisting
const mockCreate = vi.fn()

// Must use a regular function (not arrow) so it works with `new OpenAI()`
vi.mock('openai', () => {
  function MockOpenAI() {
    return { chat: { completions: { create: mockCreate } } }
  }
  return { default: MockOpenAI }
})

import { POST } from '@/app/api/heap/agent/suggest/route'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/heap/agent/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/heap/agent/suggest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    getCurrentUser.mockRejectedValue(new Error('Unauthorized'))
    const response = await POST(makeRequest({ scope: 'overview' }))
    expect(response.status).toBe(401)
  })

  it('returns structured suggestions from OpenAI', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1' })
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        { id: 'n1', title: 'Finish resume', type: 'goal', priority: 'high', updatedAt: new Date() },
      ]),
    }
    getDb.mockReturnValue({ select: vi.fn().mockReturnValue(selectChain) })

    mockCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            suggestions: [{ nodeId: 'n1', firstStep: 'Open Google Docs', effort: 'medium' }],
          }),
        },
      }],
    })

    const response = await POST(makeRequest({ scope: 'overview' }))
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.suggestions).toHaveLength(1)
    expect(data.suggestions[0].nodeId).toBe('n1')
    expect(data.suggestions[0].effort).toBe('medium')
  })

  it('returns degraded response when OpenAI fails', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1' })
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: 'n1', title: 'Test', type: 'note', priority: 'normal', updatedAt: new Date() }]),
    }
    getDb.mockReturnValue({ select: vi.fn().mockReturnValue(selectChain) })
    mockCreate.mockRejectedValue(new Error('API error'))

    const response = await POST(makeRequest({ scope: 'overview' }))
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.suggestions).toEqual([])
    expect(data.degraded).toBe(true)
  })

  it('caps nodes at 50', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1' })
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    }
    getDb.mockReturnValue({ select: vi.fn().mockReturnValue(selectChain) })
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ suggestions: [] }) } }],
    })

    await POST(makeRequest({ scope: 'overview' }))
    expect(selectChain.limit).toHaveBeenCalledWith(50)
  })
})
