import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock node:fs before importing the module under test
vi.mock('node:fs', () => ({
  default: { readFileSync: vi.fn() },
}))
vi.mock('node:path', () => ({
  default: { join: (...args: string[]) => args.join('/') },
}))

describe('chatSystemPrompt', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('exports SYSTEM_PROMPT string when file exists', async () => {
    const fs = await import('node:fs')
    ;(fs.default.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('  You are Sentinel.  ')
    const { SYSTEM_PROMPT } = await import('@/lib/services/chatSystemPrompt')
    expect(SYSTEM_PROMPT).toBe('You are Sentinel.')
  })

  it('throws when the system prompt file is missing', async () => {
    const fs = await import('node:fs')
    ;(fs.default.readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory')
    })
    await expect(import('@/lib/services/chatSystemPrompt')).rejects.toThrow('ENOENT')
  })
})
