import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { RepeatPicker } from '@/components/RepeatPicker'
import type { RepeatValue } from '@/lib/types/calendar'

const NEVER: RepeatValue = { frequency: null, interval: 1 }
const WEEKLY: RepeatValue = { frequency: 'week', interval: 1 }
const BIWEEKLY: RepeatValue = { frequency: 'week', interval: 2 }
const CUSTOM: RepeatValue = { frequency: 'day', interval: 3 }

describe('RepeatPicker', () => {
  it('shows "Never" summary when frequency is null', () => {
    render(<RepeatPicker value={NEVER} onChange={vi.fn()} />)
    expect(screen.getByText('Never')).toBeTruthy()
  })

  it('shows "Every week" summary for weekly value', () => {
    render(<RepeatPicker value={WEEKLY} onChange={vi.fn()} />)
    expect(screen.getByText('Every week')).toBeTruthy()
  })

  it('shows "Every 2 weeks" summary for biweekly value', () => {
    render(<RepeatPicker value={BIWEEKLY} onChange={vi.fn()} />)
    expect(screen.getByText('Every 2 weeks')).toBeTruthy()
  })

  it('shows custom summary for non-preset value', () => {
    render(<RepeatPicker value={CUSTOM} onChange={vi.fn()} />)
    expect(screen.getByText('Every 3 days')).toBeTruthy()
  })

  it('opens preset menu on trigger click', () => {
    render(<RepeatPicker value={NEVER} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Repeat/i }))
    expect(screen.getByText('Every day')).toBeTruthy()
    expect(screen.getByText('Every 2 weeks')).toBeTruthy()
    expect(screen.getByText('Custom')).toBeTruthy()
  })

  it('selecting a preset fires onChange with correct RepeatValue', () => {
    const onChange = vi.fn()
    render(<RepeatPicker value={NEVER} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Repeat/i }))
    fireEvent.click(screen.getByText('Every week'))
    expect(onChange).toHaveBeenCalledWith({ frequency: 'week', interval: 1 })
  })

  it('selecting Every 2 weeks fires onChange with interval 2', () => {
    const onChange = vi.fn()
    render(<RepeatPicker value={NEVER} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Repeat/i }))
    fireEvent.click(screen.getByText('Every 2 weeks'))
    expect(onChange).toHaveBeenCalledWith({ frequency: 'week', interval: 2 })
  })

  it('selecting Custom shows tab panel with Daily/Weekly tabs and Every label', () => {
    render(<RepeatPicker value={NEVER} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Repeat/i }))
    fireEvent.click(screen.getByText('Custom'))
    expect(screen.getByText('Daily')).toBeTruthy()
    expect(screen.getByText('Weekly')).toBeTruthy()
    expect(screen.getByText('Every')).toBeTruthy()
  })

  it('switching to Weekly tab shows "1 week" in the drum', () => {
    render(<RepeatPicker value={NEVER} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Repeat/i }))
    fireEvent.click(screen.getByText('Custom'))
    fireEvent.click(screen.getByText('Weekly'))
    expect(screen.getByText('1 week')).toBeTruthy()
    expect(screen.getByText('2 weeks')).toBeTruthy()
  })

  it('clicking "3 days" in the drum and Done fires onChange({ frequency: day, interval: 3 })', () => {
    const onChange = vi.fn()
    render(<RepeatPicker value={NEVER} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Repeat/i }))
    fireEvent.click(screen.getByText('Custom'))
    fireEvent.click(screen.getByText('3 days'))
    fireEvent.click(screen.getByText('Done'))
    expect(onChange).toHaveBeenCalledWith({ frequency: 'day', interval: 3 })
  })

  it('clicking outside closes the menu', () => {
    render(
      <div>
        <RepeatPicker value={NEVER} onChange={vi.fn()} />
        <div data-testid="outside">outside</div>
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Repeat/i }))
    expect(screen.getByText('Every day')).toBeTruthy()
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByText('Every day')).toBeNull()
  })
})
