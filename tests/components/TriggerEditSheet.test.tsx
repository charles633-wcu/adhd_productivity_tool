import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TriggerEditSheet } from '@/components/TriggerEditSheet'
import type { Trigger } from '@/lib/db/schema'

const trigger = {
  id: 'trig-1',
  userId: 'user-1',
  categoryId: 'cat-1',
  title: 'Existing title',
  fullContent: '',
  priority: 2,
  reviewIntervalDays: 7,
} as unknown as Trigger

describe('TriggerEditSheet error messages', () => {
  const onOpenChange = vi.fn()
  const onSuccess = vi.fn()

  beforeEach(() => {
    onOpenChange.mockReset()
    onSuccess.mockReset()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('blocks save and explains when the title is over the character limit', async () => {
    render(<TriggerEditSheet trigger={trigger} open onOpenChange={onOpenChange} onSuccess={onSuccess} />)

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'x'.repeat(501) } })
    expect(screen.getByText('501/500')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    expect((await screen.findByRole('alert')).textContent).toBe('Too many characters in Title: 501/500')
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('shows the server error message instead of a generic failure', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Review interval must be at most 365' }), { status: 400 })
    )
    render(<TriggerEditSheet trigger={trigger} open onOpenChange={onOpenChange} onSuccess={onSuccess} />)

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    expect((await screen.findByRole('alert')).textContent).toBe('Review interval must be at most 365')
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
