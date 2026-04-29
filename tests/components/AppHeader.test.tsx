import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppHeader } from '@/components/AppHeader'

describe('AppHeader', () => {
  it('renders the centered Sentinel pill with only top-level feature navigation', () => {
    render(<AppHeader active="calendar" />)

    expect(screen.getByRole('link', { name: /sentinel/i })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /triggers/i })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /calendar/i })).toHaveAttribute('href', '/calendar')
    expect(screen.getByRole('link', { name: /to-dos/i })).toHaveAttribute('href', '/todos')

    const pill = screen.getByTestId('app-header-pill')
    expect(pill.className).toContain('fixed')
    expect(pill.className).toContain('left-1/2')
    expect(pill.className).toContain('-translate-x-1/2')
    expect(pill.className).toContain('rounded-full')
  })

  it('does not expose workflow endpoints or utility pages as top-level features', () => {
    render(<AppHeader active="triggers" />)

    expect(screen.queryByRole('link', { name: /review/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /import/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /chat/i })).toBeNull()
  })

  it('marks the current feature link as active', () => {
    render(<AppHeader active="todos" />)

    expect(screen.getByRole('link', { name: /to-dos/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /calendar/i })).not.toHaveAttribute('aria-current')
  })

  it('uses the same compact check mark treatment for To-Dos as the Triggers header', () => {
    render(<AppHeader active="calendar" />)

    const todosLink = screen.getByRole('link', { name: /to-dos/i })
    expect(todosLink).toHaveTextContent('✓ To-Dos')
    expect(todosLink.querySelector('.lucide-inbox')).toBeNull()
  })

  it('opens an empty subfeature menu from the hamburger', () => {
    render(<AppHeader active="todos" />)

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }))

    expect(screen.getByRole('heading', { name: /subfeatures/i })).toBeTruthy()
    expect(screen.getByText(/no subfeatures yet/i)).toBeTruthy()
  })
})
