import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  TRIGGER_TITLE_MAX,
  titleLengthError,
  describeValidationError,
  readApiError,
} from '@/lib/validation/apiErrors'

describe('titleLengthError', () => {
  it('accepts a title exactly at the limit', () => {
    expect(titleLengthError('x'.repeat(TRIGGER_TITLE_MAX))).toBeNull()
  })

  it('rejects a title one past the limit with the character count', () => {
    expect(titleLengthError('x'.repeat(TRIGGER_TITLE_MAX + 1))).toBe(
      `Too many characters in Title: ${TRIGGER_TITLE_MAX + 1}/${TRIGGER_TITLE_MAX}`
    )
  })

  it('rejects an empty or whitespace-only title', () => {
    expect(titleLengthError('')).toBe('Title is required')
    expect(titleLengthError('   ')).toBe('Title is required')
  })
})

describe('describeValidationError', () => {
  const schema = z.object({
    title: z.string().min(1).max(5),
    priority: z.number().int().min(0).max(3),
    reviewIntervalDays: z.number().int().min(0).max(365).optional(),
  })

  function messageFor(input: unknown) {
    const parsed = schema.safeParse(input)
    if (parsed.success) throw new Error('expected failure')
    return describeValidationError(parsed.error, input)
  }

  it('reports too-long strings as "Too many characters" with the count', () => {
    expect(messageFor({ title: 'abcdefg', priority: 1 })).toBe('Too many characters in Title: 7/5')
  })

  it('reports empty strings as required', () => {
    expect(messageFor({ title: '', priority: 1 })).toBe('Title is required')
  })

  it('reports out-of-range numbers with the bound', () => {
    expect(messageFor({ title: 'ok', priority: 9 })).toBe('Priority must be at most 3')
    expect(messageFor({ title: 'ok', priority: 1, reviewIntervalDays: -1 })).toBe(
      'Review interval must be at least 0'
    )
  })

  it('reports missing or wrong-type fields', () => {
    expect(messageFor({ title: 'ok' })).toBe('Priority is missing or invalid')
  })

  it('joins multiple problems', () => {
    expect(messageFor({ title: 'abcdefg', priority: 9 })).toBe(
      'Too many characters in Title: 7/5; Priority must be at most 3'
    )
  })
})

describe('readApiError', () => {
  function response(status: number, body: string) {
    return new Response(body, { status })
  }

  it('returns the server error message when the body has one', async () => {
    const res = response(400, JSON.stringify({ error: 'Too many characters in Title: 501/500' }))
    expect(await readApiError(res, 'Failed to save trigger')).toBe('Too many characters in Title: 501/500')
  })

  it('falls back with the status code when the body is not JSON', async () => {
    const res = response(502, '<html>Bad gateway</html>')
    expect(await readApiError(res, 'Failed to save trigger')).toBe('Failed to save trigger (HTTP 502)')
  })

  it('falls back when the JSON has no usable error field', async () => {
    const res = response(500, JSON.stringify({ error: '' }))
    expect(await readApiError(res, 'Failed to save trigger')).toBe('Failed to save trigger (HTTP 500)')
  })
})
