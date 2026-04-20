import { describe, it, expect, vi } from 'vitest'
import { POST } from '@/app/api/emoji/suggest/route'
import { NextRequest } from 'next/server'

// Mock auth — route requires getCurrentUser() to prevent quota abuse
vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn().mockResolvedValue({ id: 'user-1' }) }))

// Mock OpenAI
vi.mock('openai', () => {
  const MockOpenAI = vi.fn(function() {
    return {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: '💻' } }],
          }),
        },
      },
    }
  })
  return {
    default: MockOpenAI,
  }
})

describe('POST /api/emoji/suggest', () => {
  it('returns an emoji for a valid name', async () => {
    const req = new NextRequest('http://localhost/api/emoji/suggest', {
      method: 'POST',
      body: JSON.stringify({ name: 'CS Projects' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toHaveProperty('emoji')
    expect(typeof json.emoji).toBe('string')
    expect(json.emoji.length).toBeGreaterThan(0)
    expect(json.emoji).toBe('💻')
  })

  it('returns fallback emoji when name is empty', async () => {
    const req = new NextRequest('http://localhost/api/emoji/suggest', {
      method: 'POST',
      body: JSON.stringify({ name: '' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.emoji).toBe('📌')
  })

  it('returns fallback emoji when name is too long', async () => {
    const req = new NextRequest('http://localhost/api/emoji/suggest', {
      method: 'POST',
      body: JSON.stringify({ name: 'x'.repeat(101) }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.emoji).toBe('📌')
  })

  it('returns fallback emoji when OpenAI throws', async () => {
    const { default: OpenAI } = await import('openai')
    const MockOpenAIClass = OpenAI as any
    MockOpenAIClass.mockImplementationOnce(function() {
      return {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('API error')),
          },
        },
      }
    })

    const req = new NextRequest('http://localhost/api/emoji/suggest', {
      method: 'POST',
      body: JSON.stringify({ name: 'Health' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.emoji).toBe('📌')
  })
})
