import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the @google/genai module so tests never make real API calls
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(),
}))

import { GoogleGenAI } from '@google/genai'
import { summarizeTrigger } from '@/lib/services/summarizer'

describe('summarizeTrigger', () => {
  let mockGenerateContent: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerateContent = vi.fn()
    ;(GoogleGenAI as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      models: { generateContent: mockGenerateContent },
    }))
  })

  it('returns a trimmed summary string when Gemini responds successfully', async () => {
    mockGenerateContent.mockResolvedValue({ text: '  This is a summary.  ' })
    const result = await summarizeTrigger('Some content about a project milestone')
    expect(result).toBe('This is a summary.')
  })

  it('throws Error("Summarization failed") when Gemini throws', async () => {
    mockGenerateContent.mockRejectedValue(new Error('Network error'))
    await expect(summarizeTrigger('Some content')).rejects.toThrow('Summarization failed')
  })

  it('throws Error("Content must not be empty") when content is empty string', async () => {
    await expect(summarizeTrigger('')).rejects.toThrow('Content must not be empty')
  })

  it('truncates content to 10,000 chars before sending to Gemini', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'Summary.' })
    const longContent = 'a'.repeat(15000)
    await summarizeTrigger(longContent)
    // The prompt passed to Gemini must contain exactly 10,000 'a' chars (not 10,001+)
    const callArg: string = mockGenerateContent.mock.calls[0][0].contents
    expect(callArg.includes('a'.repeat(10000))).toBe(true)
    expect(callArg.includes('a'.repeat(10001))).toBe(false)
  })

  it('includes the content string in the prompt sent to Gemini', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'Summary.' })
    const content = 'Review the NFL dashboard authentication flow'
    await summarizeTrigger(content)
    const prompt: string = mockGenerateContent.mock.calls[0][0].contents
    expect(prompt).toContain(content)
  })
})
