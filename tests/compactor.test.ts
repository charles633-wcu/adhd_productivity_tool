import { describe, it, expect, vi, beforeEach } from 'vitest'

// Shared mock for chat.completions.create
const mockCreate = vi.fn()

vi.mock('openai', () => {
  function MockOpenAI() {
    return { chat: { completions: { create: mockCreate } } }
  }
  return { default: MockOpenAI }
})

import { compactNotes } from '@/lib/services/compactor'

describe('compactNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Compacted history.' } }],
    })
  })

  it('returns trimmed string from model response', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '  Compacted.  ' } }],
    })
    const result = await compactNotes([{ date: '2026-04-01', text: 'a note' }])
    expect(result).toBe('Compacted.')
  })

  it('serializes notes as "- [date]: [text]" lines in prompt', async () => {
    const notes = [
      { date: '2026-04-01', text: 'first note' },
      { date: '2026-04-10', text: 'second note' },
    ]
    await compactNotes(notes)
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content
    expect(prompt).toContain('- 2026-04-01: first note')
    expect(prompt).toContain('- 2026-04-10: second note')
  })

  it('includes existingHistory in prompt when provided', async () => {
    await compactNotes([{ date: '2026-04-01', text: 'a note' }], 'Prior history.')
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content
    expect(prompt).toContain('Prior history.')
  })

  it('omits history line when existingHistory is absent', async () => {
    await compactNotes([{ date: '2026-04-01', text: 'a note' }])
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content
    expect(prompt).not.toContain('Existing condensed history')
  })

  it('throws Error("Compaction failed") when model throws', async () => {
    mockCreate.mockRejectedValue(new Error('Network error'))
    await expect(
      compactNotes([{ date: '2026-04-01', text: 'a note' }])
    ).rejects.toThrow('Compaction failed')
  })
})
