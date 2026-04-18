import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ChatSheet } from '@/components/ChatSheet'

global.fetch = vi.fn()

describe('ChatSheet', () => {
  const onOpenChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders greeting when no messages', () => {
    render(<ChatSheet open={true} onOpenChange={onOpenChange} />)
    expect(screen.getByText(/Hi, I'm Sentinel AI/i)).toBeInTheDocument()
  })

  it('save button is disabled with fewer than 2 turns', () => {
    render(<ChatSheet open={true} onOpenChange={onOpenChange} />)
    const saveBtn = screen.getByRole('button', { name: /save/i })
    expect(saveBtn).toBeDisabled()
  })

  it('sends a message and displays assistant reply', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reply: 'Here are your triggers.' }),
    })

    render(<ChatSheet open={true} onOpenChange={onOpenChange} />)
    const input = screen.getByPlaceholderText(/ask anything/i)
    fireEvent.change(input, { target: { value: 'show me my triggers' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => expect(screen.getByText('Here are your triggers.')).toBeInTheDocument())
  })

  it('shows error message when API fails', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false })

    render(<ChatSheet open={true} onOpenChange={onOpenChange} />)
    const input = screen.getByPlaceholderText(/ask anything/i)
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument())
  })
})
