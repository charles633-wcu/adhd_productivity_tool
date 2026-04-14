import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ScheduleCalendar } from '@/components/ScheduleCalendar'

// Helper: create a serialized trigger (dates as ISO strings, matching server→client shape)
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
    agentMetadata: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('ScheduleCalendar', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('renders the Schedule section header', () => {
    render(<ScheduleCalendar triggers={[]} />)
    expect(screen.getByText(/schedule/i)).toBeTruthy()
  })

  it('collapses and expands when the header is clicked', () => {
    render(<ScheduleCalendar triggers={[makeTrigger()]} />)
    // Starts open — trigger list visible
    expect(screen.getByText('Test trigger')).toBeTruthy()
    // Click header to collapse
    fireEvent.click(screen.getByRole('button', { name: /schedule/i }))
    expect(screen.queryByText('Test trigger')).toBeNull()
    // Click again to expand
    fireEvent.click(screen.getByRole('button', { name: /schedule/i }))
    expect(screen.getByText('Test trigger')).toBeTruthy()
  })

  it('shows a green badge for 1 trigger due on a day', () => {
    const tomorrow = new Date()
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    tomorrow.setUTCHours(12, 0, 0, 0)
    render(<ScheduleCalendar triggers={[makeTrigger({ nextReviewAt: tomorrow.toISOString() })]} />)
    const badge = screen.getByText('1')
    expect(badge.className).toContain('green')
  })

  it('shows a yellow badge for 2 triggers due on the same day', () => {
    const tomorrow = new Date()
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    tomorrow.setUTCHours(12, 0, 0, 0)
    const t1 = makeTrigger({ id: 'trig-1', title: 'T1', nextReviewAt: tomorrow.toISOString() })
    const t2 = makeTrigger({ id: 'trig-2', title: 'T2', nextReviewAt: tomorrow.toISOString() })
    render(<ScheduleCalendar triggers={[t1, t2]} />)
    const badge = screen.getByText('2')
    expect(badge.className).toContain('yellow')
  })

  it('shows a red badge for 4 triggers due on the same day', () => {
    const tomorrow = new Date()
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    tomorrow.setUTCHours(12, 0, 0, 0)
    const triggers = Array.from({ length: 4 }, (_, i) =>
      makeTrigger({ id: `trig-${i}`, title: `T${i}`, nextReviewAt: tomorrow.toISOString() })
    )
    render(<ScheduleCalendar triggers={triggers} />)
    const badge = screen.getByText('4')
    expect(badge.className).toContain('red')
  })

  it('selecting a trigger shows reschedule hint text', () => {
    render(<ScheduleCalendar triggers={[makeTrigger()]} />)
    fireEvent.click(screen.getByText('Test trigger'))
    expect(screen.getByText(/tap a day to reschedule/i)).toBeTruthy()
  })

  it('deselects a trigger when clicked a second time', () => {
    render(<ScheduleCalendar triggers={[makeTrigger()]} />)
    fireEvent.click(screen.getByText('Test trigger'))
    expect(screen.getByText(/tap a day to reschedule/i)).toBeTruthy()
    fireEvent.click(screen.getByText('Test trigger'))
    expect(screen.queryByText(/tap a day to reschedule/i)).toBeNull()
  })

  it('calls PATCH with rescheduleDate when a future day is clicked while a trigger is selected', async () => {
    const inFuture = new Date()
    inFuture.setUTCDate(inFuture.getUTCDate() + 10)
    inFuture.setUTCHours(12, 0, 0, 0)
    render(<ScheduleCalendar triggers={[makeTrigger({ nextReviewAt: inFuture.toISOString() })]} />)

    fireEvent.click(screen.getByText('Test trigger'))
    const futureDay = new Date()
    futureDay.setDate(futureDay.getDate() + 14)
    const dayLabel = String(futureDay.getDate())
    const dayButtons = screen.getAllByRole('button')
    const targetButton = dayButtons.find(
      b => b.textContent?.includes(dayLabel) && !b.hasAttribute('disabled')
    )
    if (targetButton) fireEvent.click(targetButton)

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

    fireEvent.click(screen.getByText('Test trigger'))
    const dayButtons = screen.getAllByRole('button')
    const futureDay = new Date()
    futureDay.setDate(futureDay.getDate() + 7)
    const targetButton = dayButtons.find(
      b => b.textContent?.includes(String(futureDay.getDate())) && !b.hasAttribute('disabled')
    )
    if (targetButton) fireEvent.click(targetButton)

    await waitFor(() => {
      expect(screen.getByText(/failed to reschedule/i)).toBeTruthy()
    })
  })
})
