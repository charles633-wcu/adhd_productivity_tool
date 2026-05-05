import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DayDetailModal } from '@/components/DayDetailModal'
import type { EventOccurrence } from '@/lib/types/calendar'

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))

function makeOccurrence(overrides: Partial<EventOccurrence> = {}): EventOccurrence {
  return {
    occurrenceId: 'e1::2026-04-15T09:00:00.000Z',
    sourceEventId: 'e1',
    title: 'Team standup',
    startAt: new Date('2026-04-15T09:00:00.000Z'),
    endAt: new Date('2026-04-15T09:30:00.000Z'),
    notes: null,
    color: null,
    categoryId: null,
    rrule: null,
    isOverride: false,
    originalDate: null,
    ...overrides,
  }
}

const baseProps = {
  date: new Date('2026-04-15T00:00:00'),
  events: [] as EventOccurrence[],
  icsEvents: [],
  eventCategories: [],
  startInAddMode: false,
  onClose: vi.fn(),
  onEventCreated: vi.fn(),
  onEventDeleted: vi.fn(),
  onEditEvent: vi.fn(),
}

describe('DayDetailModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the date heading and empty state', () => {
    render(<DayDetailModal {...baseProps} />)
    expect(screen.getByText(/April 15/i)).toBeTruthy()
    expect(screen.getByText(/Nothing scheduled/i)).toBeTruthy()
  })

  it('renders personal events and sends them to onEditEvent', () => {
    const event = makeOccurrence()
    render(<DayDetailModal {...baseProps} events={[event]} />)
    fireEvent.click(screen.getByText('Team standup'))
    expect(baseProps.onEditEvent).toHaveBeenCalledWith(event)
  })

  it('renders add event in the centered draggable editor format', () => {
    render(<DayDetailModal {...baseProps} startInAddMode />)
    expect(screen.getByTestId('add-event-editor-overlay').className).toContain('items-center')
    expect(screen.getByTestId('add-event-editor-panel').className).toContain('rounded-2xl')
    expect(screen.getByRole('button', { name: /done/i })).toBeTruthy()
  })

  it('submits new events with rrule instead of repeat triplet fields', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'e1' }), { status: 201 }))
    render(<DayDetailModal {...baseProps} startInAddMode />)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Planning' } })
    fireEvent.click(screen.getByRole('button', { name: /^repeat$/i }))
    fireEvent.click(screen.getByText('Every week'))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => {
      const [url, init] = vi.mocked(fetch).mock.calls[0]
      expect(url).toBe('/api/calendar/events')
      const body = JSON.parse(String(init?.body))
      expect(body).toEqual(expect.objectContaining({
        title: 'Planning',
        rrule: 'FREQ=WEEKLY;INTERVAL=1',
      }))
      expect(body).not.toHaveProperty('repeatFrequency')
      expect(body).not.toHaveProperty('repeatInterval')
      expect(body).not.toHaveProperty('repeatEndsAt')
    })
  })

  it('omits blank notes', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'e1' }), { status: 201 }))
    render(<DayDetailModal {...baseProps} startInAddMode />)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Planning' } })
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => {
      const [, init] = vi.mocked(fetch).mock.calls[0]
      const body = JSON.parse(String(init?.body))
      expect(body.rrule).toBeNull()
      expect(body).not.toHaveProperty('notes')
    })
  })
})
