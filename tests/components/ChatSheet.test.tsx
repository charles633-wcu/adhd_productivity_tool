import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ChatSheet } from '@/components/ChatSheet'

global.fetch = vi.fn()

type FetchMock = ReturnType<typeof vi.fn>
const fetchMock = () => fetch as FetchMock

// ChatSheet fetches /api/scratch-notes/reminder on open. A URL-aware default mock
// serves that endpoint (not-due by default) so chat-send assertions stay isolated.
// Tests that need a specific chat response override only the '/api/chat' branch.
function mockReminder(due: boolean, notes: { content: string }[] = []) {
  return { ok: true, json: async () => ({ due, notes }) }
}

function installFetch(chatHandler?: (url: string, opts?: RequestInit) => unknown) {
  fetchMock().mockImplementation((url: string, opts?: RequestInit) => {
    if (typeof url === 'string' && url.includes('/api/scratch-notes/reminder')) {
      return Promise.resolve(mockReminder(false))
    }
    if (chatHandler) return Promise.resolve(chatHandler(url, opts))
    return Promise.resolve({ ok: true, json: async () => ({ reply: 'default' }) })
  })
}

describe('ChatSheet', () => {
  const onOpenChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    installFetch()
  })

  it('renders greeting when no messages', () => {
    render(<ChatSheet open={true} onOpenChange={onOpenChange} />)
    expect(screen.getByText(/Hi I'm Your Sentinel/i)).toBeInTheDocument()
  })

  it('save button is disabled with fewer than 2 turns', () => {
    render(<ChatSheet open={true} onOpenChange={onOpenChange} />)
    const saveBtn = screen.getByRole('button', { name: /save/i })
    expect(saveBtn).toBeDisabled()
  })

  it('sends a message and displays assistant reply', async () => {
    installFetch(() => ({ ok: true, json: async () => ({ reply: 'Here are your triggers.' }) }))

    render(<ChatSheet open={true} onOpenChange={onOpenChange} />)
    const input = screen.getByPlaceholderText(/ask anything/i)
    fireEvent.change(input, { target: { value: 'show me my triggers' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => expect(screen.getByText('Here are your triggers.')).toBeInTheDocument())
  })

  it('shows error message when API fails', async () => {
    installFetch(() => ({ ok: false }))

    render(<ChatSheet open={true} onOpenChange={onOpenChange} />)
    const input = screen.getByPlaceholderText(/ask anything/i)
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument())
  })

  it('shows actionable server error messages when API returns one', async () => {
    installFetch(() => ({ ok: false, json: async () => ({ message: 'The OpenAI quota for this API key is exhausted.' }) }))

    render(<ChatSheet open={true} onOpenChange={onOpenChange} />)
    const input = screen.getByPlaceholderText(/ask anything/i)
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => expect(screen.getByText(/openai quota/i)).toBeInTheDocument())
  })

  it('renders a dev toggle button', () => {
    render(<ChatSheet open={true} onOpenChange={onOpenChange} />)
    expect(screen.getByRole('button', { name: /dev/i })).toBeInTheDocument()
  })

  it('shows tools strip after enabling dev mode', () => {
    render(<ChatSheet open={true} onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByRole('button', { name: /dev/i }))
    expect(screen.getByText('search_triggers')).toBeInTheDocument()
  })

  it('sends debug:true when dev mode is on', async () => {
    installFetch(() => ({ ok: true, json: async () => ({ reply: 'Got it.', trace: [] }) }))
    render(<ChatSheet open={true} onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByRole('button', { name: /dev/i }))

    const input = screen.getByPlaceholderText(/ask anything/i)
    fireEvent.change(input, { target: { value: 'search' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => expect(fetchMock().mock.calls.some(c => c[0] === '/api/chat')).toBe(true))
    const chatCall = fetchMock().mock.calls.find(c => c[0] === '/api/chat')!
    const body = JSON.parse((chatCall[1] as RequestInit).body as string)
    expect(body.debug).toBe(true)
  })

  // ── Task 11: 24h scratch-notes reminder ─────────────────────────────
  it('seeds a reminder message and stamps when due with unchecked notes', async () => {
    fetchMock().mockImplementation((url: string) => {
      if (url.includes('/api/scratch-notes/reminder')) {
        return Promise.resolve(mockReminder(true, [{ content: 'buy milk' }]))
      }
      return Promise.resolve({ ok: true, json: async () => ({ reply: 'x' }) })
    })

    render(<ChatSheet open={true} onOpenChange={onOpenChange} />)

    await waitFor(() => expect(screen.getByText(/Daily check-in/i)).toBeInTheDocument())
    expect(screen.getByText(/buy milk/)).toBeInTheDocument()
    // POSTs to stamp the reminder
    await waitFor(() =>
      expect(fetchMock().mock.calls.some(c => c[0] === '/api/scratch-notes/reminder' && (c[1] as RequestInit)?.method === 'POST')).toBe(true)
    )
  })

  it('shows no reminder and does not stamp when not due', async () => {
    installFetch() // reminder due:false
    render(<ChatSheet open={true} onOpenChange={onOpenChange} />)
    await waitFor(() => expect(screen.getByText(/Hi I'm Your Sentinel/i)).toBeInTheDocument())
    expect(screen.queryByText(/Daily check-in/i)).toBeNull()
    expect(fetchMock().mock.calls.some(c => (c[1] as RequestInit)?.method === 'POST')).toBe(false)
  })

  it('shows no reminder when due but there are no unchecked notes', async () => {
    fetchMock().mockImplementation((url: string) => {
      if (url.includes('/api/scratch-notes/reminder')) return Promise.resolve(mockReminder(true, []))
      return Promise.resolve({ ok: true, json: async () => ({ reply: 'x' }) })
    })
    render(<ChatSheet open={true} onOpenChange={onOpenChange} />)
    await waitFor(() => expect(screen.getByText(/Hi I'm Your Sentinel/i)).toBeInTheDocument())
    expect(screen.queryByText(/Daily check-in/i)).toBeNull()
  })
})
