import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HomePill } from '@/components/HomePill'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/components/QuickAddForm', () => ({
  QuickAddForm: ({ open }: { open: boolean }) => (
    <div data-testid="quick-add-form-state">{open ? 'open' : 'closed'}</div>
  ),
}))

vi.mock('@/components/ScheduleCalendar', () => ({
  ScheduleCalendar: () => <div>Schedule Calendar</div>,
}))

describe('HomePill', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      configurable: true,
    })
  })

  it('opens the quick add trigger flow when the + Trigger FAB is pressed', () => {
    render(
      <HomePill
        categories={[{ id: 'cat-1', name: 'Work', color: null, icon: null }]}
        triggers={[]}
        todayTodoCount={0}
      />
    )

    expect(screen.getByTestId('quick-add-form-state').textContent).toBe('closed')
    fireEvent.click(screen.getByRole('button', { name: /^trigger$/i }))
    expect(screen.getByTestId('quick-add-form-state').textContent).toBe('open')
  })

  it('keeps app switcher labels on one line', () => {
    render(
      <HomePill
        categories={[{ id: 'cat-1', name: 'Work', color: null, icon: null }]}
        triggers={[]}
        todayTodoCount={3}
      />
    )

    for (const name of [/triggers/i, /calendar/i, /to-dos/i, /mind/i]) {
      const item = screen.getByRole(name.source === 'triggers' ? 'button' : 'link', { name })
      expect(item.className).toContain('whitespace-nowrap')
      expect(item.className).toContain('shrink-0')
    }
  })
})
