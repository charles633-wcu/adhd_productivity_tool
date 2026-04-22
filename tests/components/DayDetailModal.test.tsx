import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DayDetailModal } from '@/components/DayDetailModal'

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))

const baseProps = {
  date: new Date('2026-04-15T00:00:00'),
  events: [],
  icsEvents: [],
  eventCategories: [],
  startInAddMode: false,
  onClose: vi.fn(),
  onEventCreated: vi.fn(),
  onEventDeleted: vi.fn(),
}

describe('DayDetailModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the date heading', () => {
    render(<DayDetailModal {...baseProps} />)
    expect(screen.getByText(/April 15/i)).toBeTruthy()
  })

  it('shows empty state when nothing scheduled', () => {
    render(<DayDetailModal {...baseProps} />)
    expect(screen.getByText(/Nothing scheduled/i)).toBeTruthy()
  })

  it('renders personal events', () => {
    const props = {
      ...baseProps,
      events: [{
        occurrenceId: 'e1::2026-04-15', sourceEventId: 'e1', title: 'Team standup',
        startAt: new Date('2026-04-15T09:00:00'), endAt: new Date('2026-04-15T09:30:00'),
      }],
    }
    render(<DayDetailModal {...props} />)
    expect(screen.getByText('Team standup')).toBeTruthy()
  })

  it('renders ICS events as read-only', () => {
    const props = {
      ...baseProps,
      icsEvents: [{
        uid: 'u1', title: 'Doctor appt',
        startAt: new Date('2026-04-15T10:00:00Z'),
        endAt: new Date('2026-04-15T11:00:00Z'),
      }],
    }
    render(<DayDetailModal {...props} />)
    expect(screen.getByText('Doctor appt')).toBeTruthy()
  })

  it('shows add event form on button click', () => {
    render(<DayDetailModal {...baseProps} />)
    fireEvent.click(screen.getByText(/Add Event/i))
    expect(screen.getByPlaceholderText(/Title/i)).toBeTruthy()
  })

  it('can start with the add event form already open', () => {
    render(<DayDetailModal {...baseProps} startInAddMode />)
    expect(screen.getByPlaceholderText(/Title/i)).toBeTruthy()
    expect(screen.queryByText(/Nothing scheduled/i)).toBeNull()
  })

  it('submits blank notes without sending null notes', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      occurrenceId: 'e1::2026-04-15T09:00:00.000Z',
      sourceEventId: 'e1',
      title: 'Planning',
      startAt: '2026-04-15T09:00:00.000Z',
      endAt: '2026-04-15T10:00:00.000Z',
      color: null,
      categoryId: null,
    }), { status: 201 }))

    render(<DayDetailModal {...baseProps} startInAddMode />)
    fireEvent.change(screen.getByPlaceholderText(/Title/i), { target: { value: 'Planning' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      const [url, init] = vi.mocked(fetch).mock.calls[0]
      expect(url).toBe('/api/calendar/events')
      expect(init).toEqual(expect.objectContaining({ method: 'POST' }))

      const body = JSON.parse(String(init.body))
      expect(body).toEqual({
        title: 'Planning',
        startAt: expect.any(String),
        endAt: expect.any(String),
        categoryId: null,
        repeatIntervalDays: null,
      })
      expect(body).not.toHaveProperty('notes')
    })
  })
})
