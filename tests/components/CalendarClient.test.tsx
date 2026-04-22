import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { CalendarClient } from '@/components/CalendarClient'

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))

const baseProps = {
  initialEvents: [],
  initialIcsEvents: [],
  eventCategories: [],
  icsUrl: null,
}

function todayKey() {
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

describe('CalendarClient', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('renders Sunday-first day-of-week headers', () => {
    render(<CalendarClient {...baseProps} />)
    const headerLabels = screen.getAllByText(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/).map(node => node.textContent)
    expect(headerLabels).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
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

  it('selects a day on first click and shows an add-event action', () => {
    render(<CalendarClient {...baseProps} />)
    fireEvent.click(screen.getByTestId(`calendar-day-${todayKey()}`))
    expect(screen.getByRole('button', { name: /add event/i })).toBeTruthy()
  })

  it('does not render the add-event action inside a native button', () => {
    render(<CalendarClient {...baseProps} />)
    fireEvent.click(screen.getByTestId(`calendar-day-${todayKey()}`))

    const addEventButton = screen.getByRole('button', { name: /add event/i })
    expect(addEventButton.tagName).toBe('BUTTON')
    expect(addEventButton.parentElement?.tagName).not.toBe('BUTTON')
    expect(addEventButton.closest('button')).toBe(addEventButton)
  })

  it('shows the selected-day add-event action in a bottom-centered slot', () => {
    render(<CalendarClient {...baseProps} />)
    const todayCell = screen.getByTestId(`calendar-day-${todayKey()}`)

    fireEvent.click(todayCell)

    const addButton = screen.getByRole('button', { name: /add event/i })
    expect(addButton.className).toContain('bottom-1')
    expect(addButton.className).toContain('left-1/2')
    expect(addButton.className).toContain('-translate-x-1/2')
  })

  it('does not open the modal when the selected day is clicked twice', () => {
    render(<CalendarClient {...baseProps} />)
    const todayCell = screen.getByTestId(`calendar-day-${todayKey()}`)

    fireEvent.click(todayCell)
    fireEvent.click(todayCell)

    expect(screen.queryByPlaceholderText(/Title/i)).toBeNull()
  })

  it('opens the add-event form when the selected day add-event action is clicked', () => {
    render(<CalendarClient {...baseProps} />)
    fireEvent.click(screen.getByTestId(`calendar-day-${todayKey()}`))
    fireEvent.click(screen.getByRole('button', { name: /add event/i }))

    expect(screen.getByPlaceholderText(/Title/i)).toBeTruthy()
  })

  it('toggles zoom to 6-month view', async () => {
    render(<CalendarClient {...baseProps} />)
    fireEvent.click(screen.getByLabelText(/Zoom out/i))
    await waitFor(() => expect(screen.getByText(/6 months/i)).toBeTruthy())
  })
})
