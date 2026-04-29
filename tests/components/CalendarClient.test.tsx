import { render, screen, fireEvent, act, within } from '@testing-library/react'
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

function localDateKey(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

describe('CalendarClient', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

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

  it('renders previous and next month previews around the active month', () => {
    render(<CalendarClient {...baseProps} />)
    const now = new Date()
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    expect(screen.getByLabelText(`Previous month preview: ${previousMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}`)).toBeTruthy()
    expect(screen.getByLabelText(`Next month preview: ${nextMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}`)).toBeTruthy()
  })

  it('does not show the old six-month zoom control', () => {
    render(<CalendarClient {...baseProps} />)
    expect(screen.queryByLabelText(/Zoom out/i)).toBeNull()
    expect(screen.queryByLabelText(/Zoom in/i)).toBeNull()
  })

  it('returns to the current month when Today is clicked', () => {
    render(<CalendarClient {...baseProps} />)
    const now = new Date()
    const currentMonthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' })

    fireEvent.click(screen.getByLabelText('Next month'))
    fireEvent.click(screen.getByRole('button', { name: /today/i }))

    expect(screen.getByRole('heading', { name: currentMonthLabel })).toBeTruthy()
    expect(screen.getByTestId(`calendar-day-${todayKey()}`)).toBeTruthy()
  })

  it('selects a day on first click and shows a selected-day dock with add-event action', () => {
    render(<CalendarClient {...baseProps} />)
    fireEvent.click(screen.getByTestId(`calendar-day-${todayKey()}`))

    expect(screen.getByTestId('selected-day-dock')).toBeTruthy()
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

  it('shows the selected-day add-event action in the dock, not inside the day cell', () => {
    render(<CalendarClient {...baseProps} />)
    const todayCell = screen.getByTestId(`calendar-day-${todayKey()}`)

    fireEvent.click(todayCell)

    const addButton = screen.getByRole('button', { name: /add event/i })
    expect(screen.getByTestId('selected-day-dock').contains(addButton)).toBe(true)
    expect(todayCell.contains(addButton)).toBe(false)
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

  it('shows selected-day calendar and ICS items in the dock', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00'))
    render(
      <CalendarClient
        {...baseProps}
        initialEvents={[{
          occurrenceId: 'local-1',
          sourceEventId: 'event-1',
          title: 'Planning block',
          startAt: '2026-04-15T13:00:00.000Z',
          endAt: '2026-04-15T14:00:00.000Z',
          color: '#2563eb',
        }]}
        initialIcsEvents={[{
          uid: 'ics-1',
          title: 'Dentist',
          startAt: '2026-04-15T18:00:00.000Z',
          endAt: '2026-04-15T19:00:00.000Z',
        }]}
      />,
    )

    fireEvent.click(screen.getByTestId('calendar-day-2026-04-15'))

    const dock = screen.getByTestId('selected-day-dock')
    expect(dock.textContent).toContain('Planning block')
    expect(dock.textContent).toContain('Dentist')
  })

  it('clicking an adjacent month preview moves that month into the center', () => {
    render(<CalendarClient {...baseProps} />)
    const now = new Date()
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const nextMonthLabel = nextMonth.toLocaleString('default', { month: 'long', year: 'numeric' })

    fireEvent.click(screen.getByLabelText(`Next month preview: ${nextMonthLabel}`))

    expect(screen.getByRole('heading', { name: nextMonthLabel })).toBeTruthy()
    expect(screen.getByTestId(`calendar-day-${localDateKey(nextMonth)}`)).toBeTruthy()
  })

  it('horizontal wheel scrolling advances the carousel month', () => {
    render(<CalendarClient {...baseProps} />)
    const now = new Date()
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const nextMonthLabel = nextMonth.toLocaleString('default', { month: 'long', year: 'numeric' })

    fireEvent.wheel(screen.getByTestId('month-carousel'), { deltaX: 120, deltaY: 0 })

    expect(screen.getByRole('heading', { name: nextMonthLabel })).toBeTruthy()
  })

  it('normalizes created rows and expands recurring events locally after save', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'ev-1',
      title: 'Planning',
      startAt: '2026-04-15T13:00:00.000Z',
      endAt: '2026-04-15T14:00:00.000Z',
      color: null,
      categoryId: null,
      repeatFrequency: 'day',
      repeatInterval: 1,
      repeatEndsAt: null,
    }), { status: 201 })))

    render(<CalendarClient {...baseProps} />)
    fireEvent.click(screen.getByTestId('calendar-day-2026-04-15'))
    fireEvent.click(screen.getByRole('button', { name: /add event/i }))
    fireEvent.change(screen.getByPlaceholderText(/title/i), { target: { value: 'Planning' } })
    fireEvent.click(screen.getByRole('button', { name: /repeat never/i }))
    fireEvent.click(screen.getByRole('button', { name: /every day/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      await Promise.resolve()
    })

    await act(async () => {
      await vi.runAllTimersAsync()
    })
    expect(screen.queryByPlaceholderText(/title/i)).toBeNull()

    fireEvent.click(screen.getByTestId('calendar-day-2026-04-16'))
    expect(within(screen.getByTestId('selected-day-dock')).getByText('Planning')).toBeTruthy()
  })

})
