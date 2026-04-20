import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TriggerCard } from '@/components/TriggerCard'
import type { Trigger } from '@/lib/db/schema'

vi.mock('@/components/TriggerMemorySheet', () => ({
  TriggerMemorySheet: ({ open, startInAddNoteMode }: { open: boolean; startInAddNoteMode?: boolean }) =>
    open ? <div>{startInAddNoteMode ? 'Memory sheet add note open' : 'Memory sheet open'}</div> : null,
}))

function makeTrigger(overrides: Partial<Trigger> = {}): Trigger {
  return {
    id: 'trig-1',
    userId: 'user-1',
    categoryId: 'cat-1',
    title: 'Raw title text',
    fullContent: 'Full content body here',
    summary: null,
    summaryStatus: 'pending',
    priority: 1,
    reviewIntervalDays: 3,
    lastReviewedAt: null,
    nextReviewAt: new Date('2026-04-18T12:00:00.000Z'),
    status: 'active',
    notifyChannel: null,
    agentMetadata: null,
    createdAt: new Date('2026-04-15T12:00:00.000Z'),
    updatedAt: new Date('2026-04-15T12:00:00.000Z'),
    ...overrides,
  }
}

describe('TriggerCard', () => {
  const mockSuccess = vi.fn()
  const mockEdit = vi.fn()
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-19T12:00:00.000Z'))
    mockSuccess.mockReset()
    mockEdit.mockReset()
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renders the AI summary when summaryStatus is generated', () => {
    const trigger = makeTrigger({ summary: 'AI generated summary', summaryStatus: 'generated' })
    render(<TriggerCard trigger={trigger} categoryName="Work" onSuccess={mockSuccess} onEdit={mockEdit} onDelete={vi.fn()} />)
    expect(screen.getByText('AI generated summary')).toBeTruthy()
  })

  it('renders raw title when summaryStatus is "pending"', () => {
    const trigger = makeTrigger({ summary: null, summaryStatus: 'pending' })
    render(<TriggerCard trigger={trigger} categoryName="Work" onSuccess={mockSuccess} onEdit={mockEdit} onDelete={vi.fn()} />)
    expect(screen.getByText('Raw title text')).toBeTruthy()
  })

  it('shows created, reviewed, next review, and cadence metadata explicitly for never-reviewed triggers', () => {
    const trigger = makeTrigger()
    render(<TriggerCard trigger={trigger} categoryName="Work" onSuccess={mockSuccess} onEdit={mockEdit} onDelete={vi.fn()} />)
    expect(screen.getByText(/created apr 15/i)).toBeTruthy()
    expect(screen.getByText(/not yet reviewed/i)).toBeTruthy()
    expect(screen.getByText(/next apr 18/i)).toBeTruthy()
    expect(screen.getByText(/every 3d/i)).toBeTruthy()
    expect(screen.queryByText(/4d ago/i)).toBeNull()
  })

  it('shows the last reviewed date when the trigger has review history', () => {
    const trigger = makeTrigger({
      lastReviewedAt: new Date('2026-04-17T12:00:00.000Z'),
      nextReviewAt: new Date('2026-04-20T12:00:00.000Z'),
    })
    render(<TriggerCard trigger={trigger} categoryName="Work" onSuccess={mockSuccess} onEdit={mockEdit} onDelete={vi.fn()} />)
    expect(screen.getByText(/reviewed apr 17/i)).toBeTruthy()
    expect(screen.getByText(/next apr 20/i)).toBeTruthy()
  })

  it('acknowledges immediately when Acknowledge button is clicked', async () => {
    vi.useRealTimers()
    const trigger = makeTrigger()
    render(<TriggerCard trigger={trigger} categoryName="Work" onSuccess={mockSuccess} onEdit={mockEdit} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^acknowledge$/i }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/triggers/trig-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ acknowledge: true }),
      })
    )
    expect(mockSuccess).toHaveBeenCalled()
    expect(screen.queryByText(/add note sheet open/i)).toBeNull()
  })

  it('opens the note sheet when Add note is clicked', () => {
    const trigger = makeTrigger()
    render(<TriggerCard trigger={trigger} categoryName="Work" onSuccess={mockSuccess} onEdit={mockEdit} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /add note/i }))
    expect(screen.getByText(/memory sheet add note open/i)).toBeTruthy()
  })

  it('shows memory note count and opens memory from the trigger card', () => {
    const trigger = makeTrigger()
    render(<TriggerCard trigger={trigger} categoryName="Work" onSuccess={mockSuccess} onEdit={mockEdit} onDelete={vi.fn()} />)
    expect(screen.getByRole('button', { name: /memory \(0\)/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /memory \(0\)/i }))
    expect(screen.getByText(/memory sheet open/i)).toBeTruthy()
  })

  it('shows full_content when Details expander is toggled', () => {
    const trigger = makeTrigger()
    render(<TriggerCard trigger={trigger} categoryName="Work" onSuccess={mockSuccess} onEdit={mockEdit} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /details/i }))
    expect(screen.getByText(/^original$/i)).toBeTruthy()
    expect(screen.getByText('Full content body here')).toBeTruthy()
  })

  it('shows Retry button inside expander when summaryStatus is "pending"', () => {
    const trigger = makeTrigger({ summaryStatus: 'pending' })
    render(<TriggerCard trigger={trigger} categoryName="Work" onSuccess={mockSuccess} onEdit={mockEdit} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /details/i }))
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
  })

  it('collapses and hides full_content when Details is toggled a second time', () => {
    const trigger = makeTrigger()
    render(<TriggerCard trigger={trigger} categoryName="Work" onSuccess={mockSuccess} onEdit={mockEdit} onDelete={vi.fn()} />)
    const detailsBtn = screen.getByRole('button', { name: /details/i })
    fireEvent.click(detailsBtn)
    expect(screen.getByText('Full content body here')).toBeTruthy()
    fireEvent.click(detailsBtn)
    expect(screen.queryByText('Full content body here')).toBeNull()
  })

  it('falls back to title when summaryStatus is "generated" but summary is null', () => {
    const trigger = makeTrigger({ summary: null, summaryStatus: 'generated' })
    render(<TriggerCard trigger={trigger} categoryName="Work" onSuccess={mockSuccess} onEdit={mockEdit} onDelete={vi.fn()} />)
    expect(screen.getByText('Raw title text')).toBeTruthy()
  })

  it('shows retry feedback when Generate is skipped for insufficient detail', async () => {
    vi.useRealTimers()
    const trigger = makeTrigger({ summaryStatus: 'pending' })
    const onRetry = vi.fn().mockResolvedValue('Not enough detail to generate a summary yet. Add more original content or review notes.')
    render(
      <TriggerCard
        trigger={trigger}
        categoryName="Work"
        onSuccess={mockSuccess}
        onEdit={mockEdit}
        onDelete={vi.fn()}
        onRetry={onRetry}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /details/i }))
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toContain('Not enough detail')
  })
})
