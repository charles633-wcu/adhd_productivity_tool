import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { CalendarClient } from '@/components/CalendarClient'

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
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses deterministic date labels instead of the runtime locale', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00'))
    vi.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('15 April 2026')
    vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('April 2026')

    render(<CalendarClient {...baseProps} />)

    expect(screen.getByTestId('calendar-day-2026-04-15')).toHaveAttribute(
      'aria-label',
      'Select April 15, 2026',
    )
    expect(screen.getByText('April 2026')).toBeTruthy()
  })

  it('renders Sunday-first day-of-week headers', () => {
    render(<CalendarClient {...baseProps} />)
    const headerLabels = screen.getAllByText(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/).map(node => node.textContent)
    expect(headerLabels).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
  })

  it('shows current month and year in header', () => {
    render(<CalendarClient {...baseProps} />)
    const now = new Date()
    const heading = screen.getByRole('heading', {
      name: now.toLocaleString('default', { month: 'long', year: 'numeric' }),
    })

    expect(heading.className).toContain('text-4xl')
    expect(heading.className).toContain('scale-x-95')
    expect(within(screen.getByTestId('calendar-month-heading')).getByLabelText('Previous month')).toBeTruthy()
    expect(within(screen.getByTestId('calendar-month-heading')).getByLabelText('Next month')).toBeTruthy()
  })

  it('does not show a Today control in the calendar header', () => {
    render(<CalendarClient {...baseProps} />)

    expect(screen.queryByRole('button', { name: /today/i })).toBeNull()
  })

  it('renders calendar controls as a separate island from the Sentinel header', () => {
    render(<CalendarClient {...baseProps} />)

    const appHeader = screen.getByTestId('app-header-pill')
    const calendarControls = screen.getByTestId('calendar-controls-island')

    expect(appHeader.contains(calendarControls)).toBe(false)
    expect(calendarControls.className).toContain('rounded-full')
    expect(calendarControls.className).toContain('shadow-lg')
    expect(calendarControls.className.split(/\s+/)).not.toContain('border-b')
  })

  it('keeps the month grid compact instead of stretched across the page', () => {
    render(<CalendarClient {...baseProps} />)
    const now = new Date()
    const calendar = screen.getByRole('region', {
      name: `${now.toLocaleString('default', { month: 'long', year: 'numeric' })} calendar`,
    })

    expect(calendar.className).toContain('max-w-xl')
    expect(screen.getByTestId('calendar-month-heading').className).toContain('max-w-xl')
    expect(screen.getByTestId(`calendar-day-${todayKey()}`).className).toContain('aspect-square')
  })

  it('places the month heading directly above the calendar grid', () => {
    render(<CalendarClient {...baseProps} />)

    expect(screen.getByTestId('calendar-stack').className).toContain('gap-1')
    expect(screen.getByTestId('month-carousel').className.split(/\s+/)).not.toContain('flex-1')
    expect(screen.getByTestId('month-carousel').className).toContain('pt-1')
    expect(screen.getByTestId('month-carousel').className).toContain('items-start')
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

  it('shows full adjacent month previews with subdued month labels', () => {
    render(<CalendarClient {...baseProps} />)
    const now = new Date()
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const previousMonthPreview = screen.getByLabelText(`Previous month preview: ${previousMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}`)
    const nextMonthPreview = screen.getByLabelText(`Next month preview: ${nextMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}`)
    const nextMonthLabel = within(nextMonthPreview).getByText(nextMonth.toLocaleString('default', { month: 'long', year: 'numeric' }))

    expect(previousMonthPreview.className).not.toContain('-ml-')
    expect(nextMonthPreview.className).not.toContain('-mr-')
    expect(nextMonthPreview.className).toContain('opacity-70')
    expect(screen.getByTestId('month-carousel').className).toContain('overflow-visible')
    expect(nextMonthPreview.querySelectorAll('[data-preview-day]').length).toBe(42)
    expect(nextMonthLabel.className).toContain('text-xs')
    expect(nextMonthLabel.className).toContain('font-medium')
  })

  it('does not show the old six-month zoom control', () => {
    render(<CalendarClient {...baseProps} />)
    expect(screen.queryByLabelText(/Zoom out/i)).toBeNull()
    expect(screen.queryByLabelText(/Zoom in/i)).toBeNull()
  })

  it('drags the calendar to the next month', () => {
    render(<CalendarClient {...baseProps} />)
    const now = new Date()
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const nextMonthLabel = nextMonth.toLocaleString('default', { month: 'long', year: 'numeric' })

    fireEvent.pointerDown(screen.getByTestId('month-carousel'), { clientX: 260 })
    fireEvent.pointerUp(screen.getByTestId('month-carousel'), { clientX: 90 })

    expect(screen.getByRole('heading', { name: nextMonthLabel })).toBeTruthy()
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

  it('clicking a dock event opens EventDetailSheet', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-03T12:00:00'))

    const today = new Date('2026-05-03T12:00:00')
    const todayIso = today.toISOString().slice(0, 10)
    const event = {
      occurrenceId: `ev1::${todayIso}T09:00:00.000Z`,
      sourceEventId: 'ev1',
      title: 'Morning run',
      startAt: `${todayIso}T09:00:00.000Z`,
      endAt: `${todayIso}T09:30:00.000Z`,
      color: '#6366f1',
      categoryId: null,
      repeatFrequency: null,
      repeatInterval: null,
      repeatEndsAt: null,
    }

    render(<CalendarClient {...baseProps} initialEvents={[event]} />)

    fireEvent.click(screen.getByTestId(`calendar-day-${todayIso}`))

    const dockBtn = screen.getByRole('button', { name: /Morning run/i })
    fireEvent.click(dockBtn)

    expect(screen.getByText('Edit Event')).toBeTruthy()
  })

  it('closes the edit event panel and updates the visible event after Done', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-03T12:00:00'))

    const today = new Date('2026-05-03T12:00:00')
    const todayIso = today.toISOString().slice(0, 10)
    const event = {
      occurrenceId: `ev1::${todayIso}T09:00:00.000Z`,
      sourceEventId: 'ev1',
      title: 'Morning run',
      startAt: `${todayIso}T09:00:00.000Z`,
      endAt: `${todayIso}T09:30:00.000Z`,
      color: '#6366f1',
      categoryId: null,
      repeatFrequency: null,
      repeatInterval: null,
      repeatEndsAt: null,
    }
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'ev1',
      title: 'Morning walk',
      startAt: `${todayIso}T09:00:00.000Z`,
      endAt: `${todayIso}T09:30:00.000Z`,
      color: '#6366f1',
      categoryId: null,
      rrule: null,
    }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify([{
      occurrenceId: `ev1::${todayIso}T09:00:00.000Z`,
      sourceEventId: 'ev1',
      title: 'Morning walk',
      startAt: `${todayIso}T09:00:00.000Z`,
      endAt: `${todayIso}T09:30:00.000Z`,
      notes: null,
      color: '#6366f1',
      categoryId: null,
      rrule: null,
      isOverride: false,
      originalDate: null,
    }]), { status: 200 }))

    render(<CalendarClient {...baseProps} initialEvents={[event]} />)

    fireEvent.click(screen.getByTestId(`calendar-day-${todayIso}`))
    fireEvent.click(screen.getByRole('button', { name: /Morning run/i }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Morning walk' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /done/i }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.queryByText('Edit Event')).toBeNull()
    expect(within(screen.getByTestId('selected-day-dock')).getByText('Morning walk')).toBeTruthy()
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

  it('refetches expanded recurring events after save', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'ev-1',
      title: 'Planning',
      startAt: '2026-04-15T13:00:00.000Z',
      endAt: '2026-04-15T14:00:00.000Z',
      color: null,
      categoryId: null,
      rrule: 'FREQ=DAILY;INTERVAL=1',
    }), { status: 201 })).mockResolvedValueOnce(new Response(JSON.stringify([
      {
        occurrenceId: 'ev-1::2026-04-15T13:00:00.000Z',
        sourceEventId: 'ev-1',
        title: 'Planning',
        startAt: '2026-04-15T13:00:00.000Z',
        endAt: '2026-04-15T14:00:00.000Z',
        notes: null,
        color: null,
        categoryId: null,
        rrule: 'FREQ=DAILY;INTERVAL=1',
        isOverride: false,
        originalDate: null,
      },
      {
        occurrenceId: 'ev-1::2026-04-16T13:00:00.000Z',
        sourceEventId: 'ev-1',
        title: 'Planning',
        startAt: '2026-04-16T13:00:00.000Z',
        endAt: '2026-04-16T14:00:00.000Z',
        notes: null,
        color: null,
        categoryId: null,
        rrule: 'FREQ=DAILY;INTERVAL=1',
        isOverride: false,
        originalDate: null,
      },
    ]), { status: 200 })))

    render(<CalendarClient {...baseProps} />)
    fireEvent.click(screen.getByTestId('calendar-day-2026-04-15'))
    fireEvent.click(screen.getByRole('button', { name: /add event/i }))
    fireEvent.change(screen.getByPlaceholderText(/title/i), { target: { value: 'Planning' } })
    fireEvent.click(screen.getByRole('button', { name: /^repeat$/i }))
    fireEvent.click(screen.getByRole('button', { name: /every day/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /done/i }))
      await Promise.resolve()
    })

    await act(async () => {
      await vi.runAllTimersAsync()
      await Promise.resolve()
    })
    expect(screen.queryByPlaceholderText(/title/i)).toBeNull()

    fireEvent.click(screen.getByTestId('calendar-day-2026-04-16'))
    expect(within(screen.getByTestId('selected-day-dock')).getByText('Planning')).toBeTruthy()
  })

})
