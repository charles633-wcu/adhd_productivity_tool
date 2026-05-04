import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DatePickerMini } from '@/components/DatePickerMini'

describe('DatePickerMini', () => {
  it('renders month and year heading', () => {
    render(<DatePickerMini value={new Date(2026, 4, 15)} onChange={vi.fn()} />)
    expect(screen.getByText('May 2026')).toBeTruthy()
  })

  it('renders day column headers', () => {
    render(<DatePickerMini value={null} onChange={vi.fn()} />)
    expect(screen.getByText('Su')).toBeTruthy()
    expect(screen.getByText('Sa')).toBeTruthy()
  })

  it('previous month button navigates back', () => {
    render(<DatePickerMini value={new Date(2026, 4, 15)} onChange={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Previous month'))
    expect(screen.getByText('April 2026')).toBeTruthy()
  })

  it('next month button navigates forward', () => {
    render(<DatePickerMini value={new Date(2026, 4, 15)} onChange={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Next month'))
    expect(screen.getByText('June 2026')).toBeTruthy()
  })

  it('clicking a day calls onChange with that date', () => {
    const onChange = vi.fn()
    render(<DatePickerMini value={new Date(2026, 4, 1)} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('May 15, 2026'))
    expect(onChange).toHaveBeenCalledOnce()
    const date: Date = onChange.mock.calls[0][0]
    expect(date.getDate()).toBe(15)
    expect(date.getMonth()).toBe(4)
    expect(date.getFullYear()).toBe(2026)
  })

  it('Clear calls onChange with null', () => {
    const onChange = vi.fn()
    render(<DatePickerMini value={new Date(2026, 4, 15)} onChange={onChange} />)
    fireEvent.click(screen.getByText('Clear'))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('clicking the month/year heading opens year picker', () => {
    render(<DatePickerMini value={new Date(2026, 4, 15)} onChange={vi.fn()} />)
    fireEvent.click(screen.getByText('May 2026'))
    expect(screen.getByText('Year')).toBeTruthy()
  })

  it('selecting a year in year picker returns to month view', () => {
    render(<DatePickerMini value={new Date(2026, 4, 15)} onChange={vi.fn()} />)
    fireEvent.click(screen.getByText('May 2026'))
    fireEvent.click(screen.getByText('2027'))
    expect(screen.getByText('May 2027')).toBeTruthy()
  })
})
