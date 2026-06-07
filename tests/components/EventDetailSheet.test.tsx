import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventDetailSheet } from '@/components/EventDetailSheet'
import type { EventOccurrence } from '@/lib/types/calendar'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

function makeOccurrence(overrides: Partial<EventOccurrence> = {}): EventOccurrence {
  return {
    occurrenceId: 'e1::2026-04-15T09:00:00.000Z',
    sourceEventId: 'e1',
    title: 'Team standup',
    startAt: new Date('2026-04-15T09:00:00.000Z'),
    endAt: new Date('2026-04-15T09:30:00.000Z'),
    notes: null,
    color: '#6366f1',
    categoryId: null,
    rrule: null,
    isOverride: false,
    originalDate: null,
    ...overrides,
  }
}

const baseProps = {
  event: makeOccurrence(),
  onClose: vi.fn(),
  onSaved: vi.fn(),
  onDeleted: vi.fn(),
}

describe('EventDetailSheet', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.clearAllMocks()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('pre-fills title and times from the passed occurrence', () => {
    render(<EventDetailSheet {...baseProps} />)
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Team standup')
    expect((screen.getByLabelText('Start') as HTMLInputElement).value).toBe('05:00')
    expect((screen.getByLabelText('End') as HTMLInputElement).value).toBe('05:30')
  })

  it('saves non-recurring occurrences without showing scope choices', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'e1' }), { status: 200 }))
    render(<EventDetailSheet {...baseProps} />)

    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/calendar/events/e1', expect.objectContaining({ method: 'PATCH' })))
    expect(screen.queryByTestId('scope-sheet-overlay')).toBeNull()
    expect(baseProps.onSaved).toHaveBeenCalledWith('e1')
  })

  it('shows scope sheet before saving recurring occurrences', () => {
    render(<EventDetailSheet {...baseProps} event={makeOccurrence({ rrule: 'FREQ=WEEKLY;INTERVAL=1' })} />)

    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    expect(screen.getByTestId('scope-sheet-overlay')).toBeTruthy()
    expect(screen.getByText('This event')).toBeTruthy()
  })

  it('passes scope and occurrenceDate for recurring save', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'e1' }), { status: 200 }))
    render(<EventDetailSheet {...baseProps} event={makeOccurrence({ rrule: 'FREQ=WEEKLY;INTERVAL=1' })} />)

    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    fireEvent.click(screen.getByText('This event'))

    await waitFor(() => {
      const [, init] = vi.mocked(fetch).mock.calls[0]
      const body = JSON.parse(String(init?.body))
      expect(body).toEqual(expect.objectContaining({
        scope: 'this',
        occurrenceDate: '2026-04-15T09:00:00.000Z',
        rrule: 'FREQ=WEEKLY;INTERVAL=1',
      }))
    })
  })

  it('uses originalDate when re-editing an override occurrence', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'e1' }), { status: 200 }))
    render(<EventDetailSheet {...baseProps} event={makeOccurrence({
      rrule: 'FREQ=WEEKLY;INTERVAL=1',
      isOverride: true,
      originalDate: '2026-04-15T09:00:00.000Z',
      startAt: new Date('2026-04-15T14:00:00.000Z'),
      endAt: new Date('2026-04-15T14:30:00.000Z'),
    })} />)

    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    fireEvent.click(screen.getByText('This event'))

    await waitFor(() => {
      const [, init] = vi.mocked(fetch).mock.calls[0]
      expect(JSON.parse(String(init?.body)).occurrenceDate).toBe('2026-04-15T09:00:00.000Z')
    })
  })

  it('deletes recurring occurrences through the scope sheet', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }))
    render(<EventDetailSheet {...baseProps} event={makeOccurrence({ rrule: 'FREQ=WEEKLY;INTERVAL=1' })} />)

    fireEvent.click(screen.getByText('Delete event'))
    fireEvent.click(screen.getByText('This event'))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/calendar/events/e1?scope=this&occurrenceDate=2026-04-15T09%3A00%3A00.000Z',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })
})
