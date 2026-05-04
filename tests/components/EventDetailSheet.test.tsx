import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventDetailSheet } from '@/components/EventDetailSheet'

const baseEvent = {
  occurrenceId: 'e1::2026-04-15',
  sourceEventId: 'e1',
  title: 'Team standup',
  startAt: new Date('2026-04-15T09:00:00'),
  endAt: new Date('2026-04-15T09:30:00'),
  color: '#6366f1',
  categoryId: null,
  repeatFrequency: null as null | 'day' | 'week' | 'month' | 'year',
  repeatInterval: null as number | null,
  repeatEndsAt: null as string | null,
}

const baseProps = {
  event: baseEvent,
  onClose: vi.fn(),
  onSaved: vi.fn(),
  onDeleted: vi.fn(),
}

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

describe('EventDetailSheet', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.clearAllMocks()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('pre-fills title and times from the passed event', () => {
    render(<EventDetailSheet {...baseProps} />)
    expect((screen.getByPlaceholderText('Title') as HTMLInputElement).value).toBe('Team standup')
    expect((screen.getByLabelText('Start') as HTMLInputElement).value).toBe('09:00')
    expect((screen.getByLabelText('End') as HTMLInputElement).value).toBe('09:30')
  })

  it('renders nothing when event is null', () => {
    const { container } = render(<EventDetailSheet {...baseProps} event={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('Done fires PATCH with repeat fields in body and calls onSaved on 200', async () => {
    const updated = { id: 'e1', title: 'Team standup', startAt: '2026-04-15T09:00:00.000Z', endAt: '2026-04-15T09:30:00.000Z' }
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(updated), { status: 200 }))
    render(<EventDetailSheet {...baseProps} />)
    fireEvent.click(screen.getByText('Done'))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/calendar/events/e1', expect.objectContaining({ method: 'PATCH' }))
      const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
      expect('repeatEndsAt' in body).toBe(true)
      expect('repeatFrequency' in body).toBe(true)
      expect(baseProps.onSaved).toHaveBeenCalledWith(updated)
    })
  })

  it('shows RepeatPicker instead of a select element', () => {
    render(<EventDetailSheet {...baseProps} />)
    expect(screen.getByRole('button', { name: /^Repeat$/i })).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('shows End repeat field', () => {
    render(<EventDetailSheet {...baseProps} />)
    expect(screen.getByLabelText('End repeat')).toBeTruthy()
  })

  it('pre-fills repeat from event.repeatFrequency and repeatInterval', () => {
    const weeklyEvent = {
      ...baseEvent,
      repeatFrequency: 'week' as const,
      repeatInterval: 2,
    }
    render(<EventDetailSheet {...baseProps} event={weeklyEvent} />)
    expect(screen.getByText('Every 2 weeks')).toBeTruthy()
  })

  it('clicking End repeat field opens DatePickerMini', () => {
    render(<EventDetailSheet {...baseProps} />)
    fireEvent.click(screen.getByLabelText('End repeat'))
    expect(screen.getByLabelText('Date picker')).toBeTruthy()
  })

  it('selecting a date from DatePickerMini closes the picker and updates display', () => {
    const event = {
      ...baseEvent,
      repeatEndsAt: '2026-05-15T00:00:00.000Z',
    }
    render(<EventDetailSheet {...baseProps} event={event} />)
    fireEvent.click(screen.getByLabelText('End repeat'))
    const picker = screen.getByLabelText('Date picker')
    fireEvent.click(within(picker).getByLabelText('May 20, 2026'))
    expect(screen.queryByLabelText('Date picker')).toBeNull()
    expect(screen.getByText('5/20/2026')).toBeTruthy()
  })

  it('first delete tap shows confirm text; second tap fires DELETE /api/calendar/events/e1 and calls onDeleted', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }))
    render(<EventDetailSheet {...baseProps} />)
    fireEvent.click(screen.getByText('Delete event'))
    expect(screen.getByText('Tap again to confirm')).toBeTruthy()
    fireEvent.click(screen.getByText('Tap again to confirm'))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/calendar/events/e1', expect.objectContaining({ method: 'DELETE' }))
      expect(baseProps.onDeleted).toHaveBeenCalledWith('e1')
    })
  })

  it('Cancel calls onClose and fires no API calls', () => {
    render(<EventDetailSheet {...baseProps} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(baseProps.onClose).toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('PATCH failure shows toast.error, keeps sheet open, and re-enables Done button', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Server error', { status: 500 }))
    const { toast } = await import('sonner')
    render(<EventDetailSheet {...baseProps} />)
    fireEvent.click(screen.getByText('Done'))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(baseProps.onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Done')).not.toBeDisabled()
  })

  it('DELETE failure shows toast.error, keeps sheet open, and re-enables delete button', async () => {
    const { toast } = await import('sonner')
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Server error', { status: 500 }))
    render(<EventDetailSheet {...baseProps} />)
    fireEvent.click(screen.getByText('Delete event'))
    fireEvent.click(screen.getByText('Tap again to confirm'))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(baseProps.onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Delete event')).not.toBeDisabled()
  })

  it('Done button shows spinner (no "Done" text) while PATCH is in flight', async () => {
    let resolve!: (v: Response) => void
    vi.mocked(fetch).mockReturnValueOnce(new Promise(r => { resolve = r }))
    render(<EventDetailSheet {...baseProps} />)
    fireEvent.click(screen.getByText('Done'))
    await waitFor(() => expect(screen.queryByText('Done')).toBeNull())
    resolve(new Response(JSON.stringify({}), { status: 200 }))
  })

  it('Delete button shows spinner while DELETE is in flight', async () => {
    let resolve!: (v: Response) => void
    vi.mocked(fetch).mockReturnValueOnce(new Promise(r => { resolve = r }))
    render(<EventDetailSheet {...baseProps} />)
    fireEvent.click(screen.getByText('Delete event'))
    fireEvent.click(screen.getByText('Tap again to confirm'))
    await waitFor(() => expect(screen.queryByText('Tap again to confirm')).toBeNull())
    resolve(new Response(null, { status: 204 }))
  })
})
