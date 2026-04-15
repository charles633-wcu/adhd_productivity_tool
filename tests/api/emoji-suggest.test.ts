import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/emoji/suggest/route'
import { NextRequest } from 'next/server'

// Mock OpenAI
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: '💻' } }],
        }),
      },
    },
  })),
}))

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
    const mockInstance = { chat: { completions: { create: vi.fn().mockRejectedValue(new Error('API error')) } } }
    vi.mocked(OpenAI).mockImplementationOnce(() => mockInstance as unknown as InstanceType<typeof OpenAI>)

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
