import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DayDetailModal } from '@/components/DayDetailModal'

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))

const baseProps = {
  date: new Date('2026-04-15T00:00:00'),
  triggers: [],
  events: [],
  icsEvents: [],
  eventCategories: [],
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

  it('renders trigger titles', () => {
    const props = { ...baseProps, triggers: [{ id: 't1', title: 'Review Go notes' }] }
    render(<DayDetailModal {...props} />)
    expect(screen.getByText('Review Go notes')).toBeTruthy()
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
})
