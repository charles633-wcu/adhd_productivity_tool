import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TriggerCard } from '@/components/TriggerCard'
import type { Trigger } from '@/lib/db/schema'

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
    reviewIntervalDays: 3,
    lastReviewedAt: null,
    nextReviewAt: new Date('2026-04-18T12:00:00.000Z'),
    status: 'active',
    notifyChannel: null,
    agentMetadata: null,
    createdAt: new Date('2026-04-15T12:00:00.000Z'),
    updatedAt: new Date('2026-04-15T12:00:00.000Z'),
    ...overrides,
  }
}

describe('TriggerCard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-19T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the AI summary when summaryStatus is generated', () => {
    const trigger = makeTrigger({ summary: 'AI generated summary', summaryStatus: 'generated' })
    render(
      <TriggerCard
        trigger={trigger}
        categoryName="Work"
        onSuccess={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    )

    expect(screen.getByText('AI generated summary')).toBeTruthy()
  })

  it('shows created, reviewed, next review, and cadence metadata explicitly for never-reviewed triggers', () => {
    const trigger = makeTrigger()
    render(
      <TriggerCard
        trigger={trigger}
        categoryName="Work"
        onSuccess={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    )

    expect(screen.getByText(/created apr 15/i)).toBeTruthy()
    expect(screen.getByText(/not yet reviewed/i)).toBeTruthy()
    expect(screen.getByText(/next apr 18/i)).toBeTruthy()
    expect(screen.getByText(/every 3d/i)).toBeTruthy()
    expect(screen.queryByText(/4d ago/i)).toBeNull()
  })

  it('shows the last reviewed date when the trigger has review history', () => {
    const trigger = makeTrigger({
      lastReviewedAt: new Date('2026-04-17T12:00:00.000Z'),
      nextReviewAt: new Date('2026-04-20T12:00:00.000Z'),
    })

    render(
      <TriggerCard
        trigger={trigger}
        categoryName="Work"
        onSuccess={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    )

    expect(screen.getByText(/reviewed apr 17/i)).toBeTruthy()
    expect(screen.getByText(/next apr 20/i)).toBeTruthy()
  })

  it('shows full_content when Details expander is toggled', () => {
    const trigger = makeTrigger()
    render(
      <TriggerCard
        trigger={trigger}
        categoryName="Work"
        onSuccess={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /details/i }))
    expect(screen.getByText('Full content body here')).toBeTruthy()
  })
})
