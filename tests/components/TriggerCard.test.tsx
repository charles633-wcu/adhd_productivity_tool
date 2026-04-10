import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TriggerCard } from '@/components/TriggerCard'
import type { Trigger } from '@/lib/db/schema'

// Minimal trigger factory for tests
function makeTrigger(overrides: Partial<Trigger> = {}): Trigger {
  return {
    id: 'trig-1',
    userId: 'user-1',
    categoryId: 'cat-1',
    title: 'Raw title text',
    fullContent: 'Full content body here',
    summary: null,
    summaryStatus: 'pending',
    priority: 1,
    reviewIntervalDays: 7,
    lastReviewedAt: null,
    nextReviewAt: new Date(Date.now() + 2 * 86400000),
    status: 'active',
    notifyChannel: null,
    agentMetadata: null,
    createdAt: new Date(Date.now() - 3 * 86400000),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('TriggerCard', () => {
  const mockAcknowledge = vi.fn()

  beforeEach(() => {
    mockAcknowledge.mockReset()
  })

  it('renders the AI summary when summaryStatus is "generated"', () => {
    const trigger = makeTrigger({ summary: 'AI generated summary', summaryStatus: 'generated' })
    render(<TriggerCard trigger={trigger} categoryName="Work" onAcknowledge={mockAcknowledge} />)
    expect(screen.getByText('AI generated summary')).toBeTruthy()
  })

  it('renders raw title when summaryStatus is "pending"', () => {
    const trigger = makeTrigger({ summary: null, summaryStatus: 'pending' })
    render(<TriggerCard trigger={trigger} categoryName="Work" onAcknowledge={mockAcknowledge} />)
    expect(screen.getByText('Raw title text')).toBeTruthy()
  })

  it('calls onAcknowledge with triggerId when Acknowledge button is clicked', () => {
    const trigger = makeTrigger()
    render(<TriggerCard trigger={trigger} categoryName="Work" onAcknowledge={mockAcknowledge} />)
    fireEvent.click(screen.getByRole('button', { name: /acknowledge/i }))
    expect(mockAcknowledge).toHaveBeenCalledWith('trig-1')
  })

  it('shows full_content when Details expander is toggled', async () => {
    const trigger = makeTrigger()
    render(<TriggerCard trigger={trigger} categoryName="Work" onAcknowledge={mockAcknowledge} />)
    fireEvent.click(screen.getByRole('button', { name: /details/i }))
    expect(screen.getByText('Full content body here')).toBeTruthy()
  })

  it('shows Retry button inside expander when summaryStatus is "pending"', () => {
    const trigger = makeTrigger({ summaryStatus: 'pending' })
    render(<TriggerCard trigger={trigger} categoryName="Work" onAcknowledge={mockAcknowledge} />)
    fireEvent.click(screen.getByRole('button', { name: /details/i }))
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
  })

  it('collapses and hides full_content when Details is toggled a second time', () => {
    const trigger = makeTrigger()
    render(<TriggerCard trigger={trigger} categoryName="Work" onAcknowledge={mockAcknowledge} />)
    const detailsBtn = screen.getByRole('button', { name: /details/i })
    fireEvent.click(detailsBtn)
    expect(screen.getByText('Full content body here')).toBeTruthy()
    fireEvent.click(detailsBtn)
    expect(screen.queryByText('Full content body here')).toBeNull()
  })

  it('falls back to title when summaryStatus is "generated" but summary is null', () => {
    const trigger = makeTrigger({ summary: null, summaryStatus: 'generated' })
    render(<TriggerCard trigger={trigger} categoryName="Work" onAcknowledge={mockAcknowledge} />)
    expect(screen.getByText('Raw title text')).toBeTruthy()
  })
})
