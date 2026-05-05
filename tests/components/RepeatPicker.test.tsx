import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RepeatPicker } from '@/components/RepeatPicker'

describe('RepeatPicker', () => {
  it('shows Never for null RRULE', () => {
    render(<RepeatPicker value={null} onChange={vi.fn()} />)
    expect(screen.getByText('Never')).toBeTruthy()
  })

  it('summarizes weekly RRULE strings', () => {
    render(<RepeatPicker value="FREQ=WEEKLY;INTERVAL=2" onChange={vi.fn()} />)
    expect(screen.getByText('Every 2 weeks')).toBeTruthy()
  })

  it('emits an RRULE string when selecting a preset', () => {
    const onChange = vi.fn()
    render(<RepeatPicker value={null} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /repeat/i }))
    fireEvent.click(screen.getByText('Every week'))
    expect(onChange).toHaveBeenCalledWith('FREQ=WEEKLY;INTERVAL=1')
  })

  it('custom weekly picker can emit BYDAY selections', () => {
    const onChange = vi.fn()
    render(<RepeatPicker value={null} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /repeat/i }))
    fireEvent.click(screen.getByText('Custom'))
    fireEvent.click(screen.getByText('Weekly'))
    fireEvent.click(screen.getByText('Mo'))
    fireEvent.click(screen.getByText('Done'))
    expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('BYDAY=MO'))
  })

  it('uses a number scroller with the selected frequency unit for the repeat interval', () => {
    render(<RepeatPicker value={null} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /repeat/i }))
    fireEvent.click(screen.getByText('Custom'))

    expect(screen.getByLabelText('Repeat interval scroller')).toBeTruthy()
    expect(screen.getByText('days')).toBeTruthy()

    fireEvent.click(screen.getByText('Monthly'))
    expect(screen.getByText('months')).toBeTruthy()
  })

  it('labels count end mode as For and uses a times scroller', () => {
    const onChange = vi.fn()
    render(<RepeatPicker value={null} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /repeat/i }))
    fireEvent.click(screen.getByText('Custom'))
    fireEvent.click(screen.getByRole('button', { name: 'For' }))

    expect(screen.getByLabelText('Occurrence count scroller')).toBeTruthy()
    expect(screen.getByText('times')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '2' }))
    fireEvent.click(screen.getByText('Done'))
    expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('COUNT=2'))
  })

  it('clicking outside closes the menu', () => {
    render(
      <div>
        <RepeatPicker value={null} onChange={vi.fn()} />
        <div data-testid="outside">outside</div>
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: /repeat/i }))
    expect(screen.getByText('Every day')).toBeTruthy()
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByText('Every day')).toBeNull()
  })
})
