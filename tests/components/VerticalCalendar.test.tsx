import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { VerticalCalendar } from '@/components/VerticalCalendar'

// jsdom lacks IntersectionObserver — provide an inert mock so the component mounts.
beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  })
})

const today = new Date(2026, 5, 17)
const months = [new Date(2026, 5, 1)] // June 2026 only

function eventItem(dayKey: string, title: string, hour: number, id: string) {
  const day = Number(dayKey.slice(-2))
  const start = new Date(2026, 5, day, hour).toISOString()
  return { occurrenceId: id, sourceEventId: 's', title, startAt: start, endAt: start, color: '#6366f1', categoryId: null }
}

function renderCal(props: Partial<React.ComponentProps<typeof VerticalCalendar>> = {}) {
  return render(
    <VerticalCalendar
      today={today}
      months={months}
      eventsByDate={new Map()}
      icsEventsByDate={new Map()}
      categories={[]}
      onSelectDay={() => {}}
      {...props}
    />,
  )
}

describe('VerticalCalendar', () => {
  it('renders a month section per anchor with a data-month key', () => {
    renderCal()
    expect(document.querySelector('[data-month="2026-06"]')).toBeTruthy()
  })

  it('shows at most 8 rows with +N more when a day has > 8 events', () => {
    const evs = Array.from({ length: 11 }, (_, i) => eventItem('2026-06-18', `E${i}`, 7 + i, `e${i}`))
    renderCal({ eventsByDate: new Map([['2026-06-18', evs]]) })
    const cell = screen.getByTestId('vcal-day-2026-06-18')
    expect(cell.querySelectorAll('[data-testid="vcal-chip"]')).toHaveLength(7)
    expect(cell).toHaveTextContent('+4 more')
  })

  it('truncates chip titles to 13 chars + ellipsis', () => {
    renderCal({ eventsByDate: new Map([['2026-06-19', [eventItem('2026-06-19', 'Quarterly business review', 9, 'q')]]]) })
    expect(screen.getByText('Quarterly bus…')).toBeTruthy()
  })

  it('calls onSelectDay with the date key when a day is clicked', () => {
    const onSelectDay = vi.fn()
    renderCal({ onSelectDay })
    fireEvent.click(screen.getByTestId('vcal-day-2026-06-17'))
    expect(onSelectDay).toHaveBeenCalledWith('2026-06-17')
  })
})
