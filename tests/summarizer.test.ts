import { describe, it, expect, vi, beforeEach } from 'vitest'

// Shared mock for chat.completions.create — must be declared before vi.mock hoisting
const mockCreate = vi.fn()

// Mock the openai module so tests never make real API calls.
// Must use a regular function (not arrow) so it can be called with `new`.
vi.mock('openai', () => {
  function MockOpenAI() {
    return { chat: { completions: { create: mockCreate } } }
  }
  return { default: MockOpenAI }
})

import { summarizeTrigger } from '@/lib/services/summarizer'

describe('summarizeTrigger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a trimmed summary string when OpenAI responds successfully', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '  This is a summary.  ' } }],
    })
    const result = await summarizeTrigger('Some content about a project milestone')
    expect(result).toBe('This is a summary.')
  })

  it('throws Error("Summarization failed") when OpenAI throws', async () => {
    mockCreate.mockRejectedValue(new Error('Network error'))
    await expect(summarizeTrigger('Some content')).rejects.toThrow('Summarization failed')
  })

  it('throws Error("Content must not be empty") when content is empty string', async () => {
    await expect(summarizeTrigger('')).rejects.toThrow('Content must not be empty')
  })

  it('truncates content to 10,000 chars before sending to OpenAI', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Summary.' } }],
    })
    const longContent = 'a'.repeat(15000)
    await summarizeTrigger(longContent)
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content
    expect(prompt.includes('a'.repeat(10000))).toBe(true)
    expect(prompt.includes('a'.repeat(10001))).toBe(false)
  })

  it('includes the content string in the prompt sent to OpenAI', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Summary.' } }],
    })
    const content = 'Review the NFL dashboard authentication flow'
    await summarizeTrigger(content)
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content
    expect(prompt).toContain(content)
  })
})

describe('summarizeTrigger with context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Contextual summary.' } }],
    })
  })

  it('includes notes in prompt when context.notes provided', async () => {
    const notes = [
      { date: '2026-04-02', text: 'decided to wait until Q3' },
      { date: '2026-04-10', text: 'insurance might cover it' },
    ]
    await summarizeTrigger('Original content', { notes })
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content
    expect(prompt).toContain('- 2026-04-02: decided to wait until Q3')
    expect(prompt).toContain('- 2026-04-10: insurance might cover it')
  })

  it('includes condensedHistory in prompt when provided', async () => {
    const condensedHistory = 'Previously researched whitener options in Feb.'
    await summarizeTrigger('Original content', { condensedHistory })
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content
    expect(prompt).toContain(condensedHistory)
  })

  it('omits History line when condensedHistory is absent', async () => {
    await summarizeTrigger('Original content', { notes: [{ date: '2026-04-02', text: 'a note' }] })
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content
    expect(prompt).not.toContain('History:')
  })

  it('existing callers with no context still work', async () => {
    const result = await summarizeTrigger('Some content about a project')
    expect(result).toBe('Contextual summary.')
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content
    expect(prompt).toContain('Summarize the following in exactly one clear, actionable sentence')
  })
})
