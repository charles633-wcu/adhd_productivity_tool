import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TriggerStatusSummary } from '@/components/TriggerStatusSummary'

describe('TriggerStatusSummary', () => {
  it('renders active, snoozed, and archived counts', () => {
    render(<TriggerStatusSummary active={17} snoozed={0} archived={2} />)

    expect(screen.getByText('Active')).toBeTruthy()
    expect(screen.getByText('17')).toBeTruthy()
    expect(screen.getByText('Snoozed')).toBeTruthy()
    expect(screen.getByText('0')).toBeTruthy()
    expect(screen.getByText('Archived')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('applies a custom wrapper class for canvas overlay placement', () => {
    render(
      <TriggerStatusSummary
        active={1}
        snoozed={2}
        archived={3}
        className="overlay-test"
      />
    )

    expect(screen.getByLabelText('Trigger status summary')).toHaveClass('overlay-test')
  })
})
