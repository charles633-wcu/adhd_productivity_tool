import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ScheduleCalendar } from '@/components/ScheduleCalendar'

// Helper: create a serialized trigger (dates as ISO strings, matching server->client shape)
function makeTrigger(overrides: Record<string, unknown> = {}) {
  const base = new Date()
  base.setUTCHours(12, 0, 0, 0)
  return {
    id: 'trig-1',
    userId: 'user-1',
    categoryId: 'cat-1',
    title: 'Test trigger',
    fullContent: '',
    summary: null,
    summaryStatus: 'pending' as const,
    priority: 2,
    reviewIntervalDays: 7,
    lastReviewedAt: null,
    nextReviewAt: base.toISOString(),
    status: 'active' as const,
    notifyChannel: null,
    notionPageId: null,
    agentMetadata: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function toLocalDateKey(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

describe('ScheduleCalendar', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders Sunday-first day-of-week labels and trigger list', () => {
    render(<ScheduleCalendar triggers={[]} />)
    const headerLabels = screen.getAllByText(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/).map(node => node.textContent)
    expect(headerLabels).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
    expect(screen.getByText(/All triggers/i)).toBeTruthy()
  })

  it('shows a green badge for 1 trigger due on a day', () => {
    const tomorrow = new Date()
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    tomorrow.setUTCHours(12, 0, 0, 0)
    render(<ScheduleCalendar triggers={[makeTrigger({ nextReviewAt: tomorrow.toISOString() })]} />)
    const badge = screen.getByTestId('count-badge')
    expect(badge.className).toContain('green')
    expect(badge.textContent).toBe('1')
  })

  it('shows a yellow badge for 2 triggers due on the same day', () => {
    const tomorrow = new Date()
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    tomorrow.setUTCHours(12, 0, 0, 0)
    const t1 = makeTrigger({ id: 'trig-1', title: 'T1', nextReviewAt: tomorrow.toISOString() })
    const t2 = makeTrigger({ id: 'trig-2', title: 'T2', nextReviewAt: tomorrow.toISOString() })
    render(<ScheduleCalendar triggers={[t1, t2]} />)
    const badge = screen.getByTestId('count-badge')
    expect(badge.className).toContain('yellow')
    expect(badge.textContent).toBe('2')
  })

  it('shows a red badge for 4 triggers due on the same day', () => {
    const tomorrow = new Date()
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    tomorrow.setUTCHours(12, 0, 0, 0)
    const triggers = Array.from({ length: 4 }, (_, i) =>
      makeTrigger({ id: `trig-${i}`, title: `T${i}`, nextReviewAt: tomorrow.toISOString() })
    )
    render(<ScheduleCalendar triggers={triggers} />)
    const badge = screen.getByTestId('count-badge')
    expect(badge.className).toContain('red')
    expect(badge.textContent).toBe('4')
  })

  it('selecting a trigger shows reschedule hint text', () => {
    render(<ScheduleCalendar triggers={[makeTrigger()]} />)
    const triggerButton = screen.getByText('Test trigger').closest('button')
    expect(triggerButton).toBeTruthy()
    fireEvent.click(triggerButton!)
    expect(screen.getByTestId('hint-trigger-title')).toHaveTextContent('Test trigger')
    expect(screen.getByText(/tap a day to reschedule/i)).toBeTruthy()
  })

  it('deselects a trigger when clicked a second time', () => {
    render(<ScheduleCalendar triggers={[makeTrigger()]} />)
    const triggerButton = screen.getByText('Test trigger').closest('button')
    expect(triggerButton).toBeTruthy()
    fireEvent.click(triggerButton!)
    expect(screen.queryByTestId('hint-trigger-title')).toBeTruthy()
    fireEvent.click(triggerButton!)
    expect(screen.queryByTestId('hint-trigger-title')).toBeNull()
  })

  it('calls PATCH with rescheduleDate when a future day is clicked while a trigger is selected', async () => {
    const inFuture = new Date()
    inFuture.setUTCDate(inFuture.getUTCDate() + 10)
    inFuture.setUTCHours(12, 0, 0, 0)
    render(<ScheduleCalendar triggers={[makeTrigger({ nextReviewAt: inFuture.toISOString() })]} />)

    const triggerButton = screen.getByText('Test trigger').closest('button')
    expect(triggerButton).toBeTruthy()
    fireEvent.click(triggerButton!)
    const futureDay = new Date()
    futureDay.setDate(futureDay.getDate() + 14)
    const y = futureDay.getFullYear()
    const m = String(futureDay.getMonth() + 1).padStart(2, '0')
    const d = String(futureDay.getDate()).padStart(2, '0')
    const dayKey = `${y}-${m}-${d}`
    const targetButton = screen.getByTestId(`day-${dayKey}`)
    fireEvent.click(targetButton)

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/triggers/trig-1'),
        expect.objectContaining({ method: 'PATCH' })
      )
    })
  })

  it('shows an error message and rolls back when PATCH fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: async () => 'Server error' }))

    const inFuture = new Date()
    inFuture.setUTCDate(inFuture.getUTCDate() + 10)
    inFuture.setUTCHours(12, 0, 0, 0)
    render(<ScheduleCalendar triggers={[makeTrigger({ nextReviewAt: inFuture.toISOString() })]} />)

    const triggerButton = screen.getByText('Test trigger').closest('button')
    expect(triggerButton).toBeTruthy()
    fireEvent.click(triggerButton!)
    const futureDay = new Date()
    futureDay.setDate(futureDay.getDate() + 7)
    const y = futureDay.getFullYear()
    const m = String(futureDay.getMonth() + 1).padStart(2, '0')
    const d = String(futureDay.getDate()).padStart(2, '0')
    const dayKey = `${y}-${m}-${d}`
    const targetButton = screen.getByTestId(`day-${dayKey}`)
    fireEvent.click(targetButton)

    await waitFor(() => {
      expect(screen.getByText(/failed to reschedule/i)).toBeTruthy()
    })
  })

  it('uses roving tabindex from today and moves focus with arrow keys', () => {
    render(<ScheduleCalendar triggers={[]} />)

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)
    const nextWeekFromTomorrow = new Date(today)
    nextWeekFromTomorrow.setDate(today.getDate() + 8)

    const todayButton = screen.getByTestId(`day-${toLocalDateKey(today)}`)
    const tomorrowButton = screen.getByTestId(`day-${toLocalDateKey(tomorrow)}`)
    const nextWeekButton = screen.getByTestId(`day-${toLocalDateKey(nextWeekFromTomorrow)}`)

    expect(todayButton).toHaveAttribute('tabindex', '0')
    expect(tomorrowButton).toHaveAttribute('tabindex', '-1')
    expect(todayButton).toHaveFocus()

    fireEvent.keyDown(todayButton, { key: 'ArrowRight' })
    expect(tomorrowButton).toHaveFocus()
    expect(tomorrowButton).toHaveAttribute('tabindex', '0')
    expect(todayButton).toHaveAttribute('tabindex', '-1')

    fireEvent.keyDown(tomorrowButton, { key: 'ArrowDown' })
    expect(nextWeekButton).toHaveFocus()
    expect(nextWeekButton).toHaveAttribute('tabindex', '0')
  })
})
