import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryPanel } from '@/components/MemoryPanel'
import type { Trigger } from '@/lib/db/schema'

function makeTrigger(overrides: Partial<Trigger> = {}): Trigger {
  return {
    id: 'trig-1',
    userId: 'user-1',
    categoryId: 'cat-1',
    title: 'Review item',
    fullContent: 'Full content',
    summary: 'Current AI summary.',
    summaryStatus: 'generated',
    priority: 1,
    reviewIntervalDays: 7,
    lastReviewedAt: null,
    nextReviewAt: new Date('2026-04-20T12:00:00.000Z'),
    status: 'active',
    notifyChannel: null,
    agentMetadata: {
      notes: [
        { id: 'n1', date: '2026-04-01T12:00:00.000Z', text: 'first note' },
        { id: 'n2', date: '2026-04-10T12:00:00.000Z', text: 'second note' },
      ],
      condensedHistory: 'Older condensed history.',
      autoCompact: false,
      lastAgentRun: '2026-04-11T12:00:00.000Z',
    },
    createdAt: new Date('2026-04-01T12:00:00.000Z'),
    updatedAt: new Date('2026-04-11T12:00:00.000Z'),
    ...overrides,
  }
}

describe('MemoryPanel', () => {
  const onBack = vi.fn()
  const onUpdate = vi.fn()
  const mockFetch = vi.fn()

  beforeEach(() => {
    onBack.mockReset()
    onUpdate.mockReset()
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders notes with most recent note first', () => {
    render(<MemoryPanel trigger={makeTrigger()} onBack={onBack} onUpdate={onUpdate} />)

    const notes = screen.getAllByText(/note$/i)
    expect(notes[0].textContent).toBe('second note')
    expect(notes[1].textContent).toBe('first note')
  })

  it('adds a note through the notes route', async () => {
    const updatedTrigger = makeTrigger({
      agentMetadata: {
        notes: [
          { id: 'n1', date: '2026-04-01T12:00:00.000Z', text: 'first note' },
          { id: 'n2', date: '2026-04-10T12:00:00.000Z', text: 'second note' },
          { id: 'n3', date: '2026-04-12T12:00:00.000Z', text: 'New detail from review.' },
        ],
        condensedHistory: 'Older condensed history.',
        autoCompact: false,
        lastAgentRun: '2026-04-11T12:00:00.000Z',
      },
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => updatedTrigger,
    })

    render(<MemoryPanel trigger={makeTrigger()} onBack={onBack} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('button', { name: /add note/i }))
    fireEvent.change(screen.getByPlaceholderText(/new note/i), {
      target: { value: 'New detail from review.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/triggers/trig-1/notes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: 'New detail from review.' }),
      })
    )
    expect(onUpdate).toHaveBeenCalled()
    expect(screen.getByText('New detail from review.')).toBeTruthy()
    expect(screen.queryByPlaceholderText(/new note/i)).toBeNull()
  })

  it('edits a note inline', async () => {
    render(<MemoryPanel trigger={makeTrigger()} onBack={onBack} onUpdate={onUpdate} />)

    fireEvent.click(screen.getAllByRole('button', { name: /edit/i })[0])
    fireEvent.change(screen.getByDisplayValue('second note'), {
      target: { value: 'updated second note' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/triggers/trig-1/notes/n2',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ text: 'updated second note' }),
      })
    )
    expect(onUpdate).toHaveBeenCalled()
  })

  it('can start directly in add-note mode for shortcut entry', () => {
    render(
      <MemoryPanel
        trigger={makeTrigger()}
        onBack={onBack}
        onUpdate={onUpdate}
        startInAddNoteMode
      />
    )

    expect(screen.getByPlaceholderText(/new note/i)).toBeTruthy()
  })

  it('deletes a note after confirm', async () => {
    render(<MemoryPanel trigger={makeTrigger()} onBack={onBack} onUpdate={onUpdate} />)

    fireEvent.click(screen.getAllByRole('button', { name: /delete/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/triggers/trig-1/notes/n2',
      expect.objectContaining({
        method: 'DELETE',
      })
    )
    expect(onUpdate).toHaveBeenCalled()
  })

  it('re-summarizes through the summarize route', async () => {
    const updatedTrigger = makeTrigger({ summary: 'Freshly re-summarized text.' })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => updatedTrigger,
    })

    render(<MemoryPanel trigger={makeTrigger()} onBack={onBack} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('button', { name: /re-summarize/i }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/triggers/trig-1/summarize',
      expect.objectContaining({
        method: 'POST',
      })
    )
    expect(onUpdate).toHaveBeenCalled()
    expect(screen.getByText('Freshly re-summarized text.')).toBeTruthy()
  })

  it('shows an inline error instead of throwing when re-summarize returns 400', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'No content to summarize', code: 'NO_CONTENT' }),
    })

    render(
      <MemoryPanel
        trigger={makeTrigger({ fullContent: '' })}
        onBack={onBack}
        onUpdate={onUpdate}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /re-summarize/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toContain('No content to summarize')
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('compacts notes through the compact route', async () => {
    render(<MemoryPanel trigger={makeTrigger()} onBack={onBack} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('button', { name: /compact now/i }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/triggers/trig-1/compact',
      expect.objectContaining({
        method: 'POST',
      })
    )
    expect(onUpdate).toHaveBeenCalled()
  })

  it('disables compact when fewer than 2 notes exist', () => {
    render(
      <MemoryPanel
        trigger={makeTrigger({ agentMetadata: { notes: [{ id: 'n1', date: '2026-04-01', text: 'one' }] } })}
        onBack={onBack}
        onUpdate={onUpdate}
      />
    )

    expect(screen.getByRole('button', { name: /compact now/i })).toBeDisabled()
  })

  it('patches autoCompact when toggled', async () => {
    render(<MemoryPanel trigger={makeTrigger()} onBack={onBack} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('checkbox', { name: /auto-compact/i }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/triggers/trig-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ autoCompact: true }),
      })
    )
    expect(onUpdate).toHaveBeenCalled()
  })
})
