import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { CalendarClient } from '@/components/CalendarClient'

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))

const baseProps = {
  initialTriggers: [],
  initialEvents: [],
  initialIcsEvents: [],
  eventCategories: [],
  icsUrl: null,
}

describe('CalendarClient', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('renders day-of-week headers', () => {
    render(<CalendarClient {...baseProps} />)
    expect(screen.getByText('Mon')).toBeTruthy()
    expect(screen.getByText('Sun')).toBeTruthy()
  })

  it('shows current month and year in header', () => {
    render(<CalendarClient {...baseProps} />)
    const now = new Date()
    expect(screen.getByText(now.toLocaleString('default', { month: 'long', year: 'numeric' }))).toBeTruthy()
  })

  it('navigates to next month on > click', () => {
    render(<CalendarClient {...baseProps} />)
    const now = new Date()
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    fireEvent.click(screen.getByLabelText('Next month'))
    expect(screen.getByText(nextMonth.toLocaleString('default', { month: 'long', year: 'numeric' }))).toBeTruthy()
  })

  it('selects a day on first click (shows expand icon)', () => {
    render(<CalendarClient {...baseProps} />)
    const today = new Date()
    const dayNum = today.getDate().toString()
    const cells = screen.getAllByRole('button', { name: new RegExp(`^${dayNum}$`) })
    fireEvent.click(cells[0])
    expect(screen.getByLabelText(/Expand day/i)).toBeTruthy()
  })

  it('toggles zoom to 6-month view', async () => {
    render(<CalendarClient {...baseProps} />)
    fireEvent.click(screen.getByLabelText(/Zoom out/i))
    await waitFor(() => expect(screen.getByText(/6 months/i)).toBeTruthy())
  })
})
