import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TriggerGridCard } from '@/components/TriggerGridCard'
import type { Trigger } from '@/lib/db/schema'

vi.mock('@/components/TriggerMemorySheet', () => ({
  TriggerMemorySheet: ({ open }: { open: boolean }) =>
    open ? <div>Memory sheet open</div> : null,
}))

function makeTrigger(overrides: Partial<Trigger> = {}): Trigger {
  return {
    id: 'trig-1',
    userId: 'user-1',
    categoryId: 'cat-1',
    title: 'Grid card title',
    fullContent: 'Full content',
    summary: null,
    summaryStatus: 'pending',
    priority: 2,
    reviewIntervalDays: 7,
    lastReviewedAt: null,
    nextReviewAt: new Date('2026-05-30T12:00:00.000Z'),
    status: 'active',
    notifyChannel: null,
    notionPageId: null,
    agentMetadata: null,
    createdAt: new Date('2026-05-01T12:00:00.000Z'),
    updatedAt: new Date('2026-05-01T12:00:00.000Z'),
    ...overrides,
  }
}

function defaultProps(overrides = {}) {
  return {
    trigger: makeTrigger(),
    categoryName: 'Work',
    selected: false,
    onSelect: vi.fn(),
    onAcknowledge: vi.fn().mockResolvedValue(undefined),
    onEdit: vi.fn(),
    isProcessing: false,
    isAnimatingOut: false,
    linkedNodes: [],
    ...overrides,
  }
}

describe('TriggerGridCard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('renders priority badge and title', () => {
    render(<TriggerGridCard {...defaultProps()} />)
    expect(screen.getByText('Medium')).toBeTruthy()
    expect(screen.getByText('Grid card title')).toBeTruthy()
  })

  it('renders AI summary when summaryStatus is generated', () => {
    render(
      <TriggerGridCard
        {...defaultProps({ trigger: makeTrigger({ summary: 'AI text', summaryStatus: 'generated' }) })}
      />
    )
    expect(screen.getByText('AI text')).toBeTruthy()
  })

  it('renders category name', () => {
    render(<TriggerGridCard {...defaultProps()} />)
    expect(screen.getByText('Work')).toBeTruthy()
  })

  it('calls onSelect when card body is clicked', () => {
    const onSelect = vi.fn()
    render(<TriggerGridCard {...defaultProps({ onSelect })} />)
    fireEvent.click(screen.getByText('Grid card title'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('does not call onSelect when Acknowledge button is clicked', async () => {
    const onSelect = vi.fn()
    const onAcknowledge = vi.fn().mockResolvedValue(undefined)
    render(<TriggerGridCard {...defaultProps({ onSelect, onAcknowledge })} />)
    fireEvent.click(screen.getByRole('button', { name: /acknowledge/i }))
    await waitFor(() => expect(onAcknowledge).toHaveBeenCalled())
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('does not call onSelect when isAnimatingOut=true', () => {
    const onSelect = vi.fn()
    render(<TriggerGridCard {...defaultProps({ onSelect, isAnimatingOut: true })} />)
    fireEvent.click(screen.getByText('Grid card title'))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('applies indigo ring when selected=true', () => {
    render(<TriggerGridCard {...defaultProps({ selected: true })} />)
    const card = screen.getByTestId('trigger-grid-card')
    expect(card.className).toContain('border-indigo-500')
  })

  it('does not apply indigo ring when selected=false', () => {
    render(<TriggerGridCard {...defaultProps({ selected: false })} />)
    const card = screen.getByTestId('trigger-grid-card')
    expect(card.className).not.toContain('border-indigo-500')
  })

  it('applies animate-out class when isAnimatingOut=true', () => {
    render(<TriggerGridCard {...defaultProps({ isAnimatingOut: true })} />)
    const card = screen.getByTestId('trigger-grid-card')
    expect(card.className).toContain('opacity-0')
  })

  it('calls onEdit with trigger id when Edit button is clicked', () => {
    const onEdit = vi.fn()
    render(<TriggerGridCard {...defaultProps({ onEdit })} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(onEdit).toHaveBeenCalledWith('trig-1')
  })

  it('calls onAcknowledge when Acknowledge button is clicked', async () => {
    const onAcknowledge = vi.fn().mockResolvedValue(undefined)
    render(<TriggerGridCard {...defaultProps({ onAcknowledge })} />)
    fireEvent.click(screen.getByRole('button', { name: /acknowledge/i }))
    await waitFor(() => expect(onAcknowledge).toHaveBeenCalledTimes(1))
  })

  it('disables Acknowledge button when isProcessing=true', () => {
    render(<TriggerGridCard {...defaultProps({ isProcessing: true })} />)
    expect(screen.getByRole('button', { name: /acknowledge/i })).toBeDisabled()
  })

  it('disables Edit button when isProcessing=true', () => {
    render(<TriggerGridCard {...defaultProps({ isProcessing: true })} />)
    expect(screen.getByRole('button', { name: /edit/i })).toBeDisabled()
  })

  it('opens memory sheet when Memory button is clicked', () => {
    render(<TriggerGridCard {...defaultProps()} />)
    fireEvent.click(screen.getByRole('button', { name: /memory/i }))
    expect(screen.getByText('Memory sheet open')).toBeTruthy()
  })

  it('renders Mind badges when linkedNodes is non-empty', () => {
    render(
      <TriggerGridCard
        {...defaultProps({ linkedNodes: [{ id: 'n-1', title: 'Goal node' }] })}
      />
    )
    expect(screen.getByText('Mind: Goal node')).toBeTruthy()
  })

  it('renders no Mind badges when linkedNodes is empty', () => {
    render(<TriggerGridCard {...defaultProps()} />)
    expect(screen.queryByText(/Mind:/)).toBeNull()
  })
})
