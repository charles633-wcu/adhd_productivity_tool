import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReviewQueueClient } from '@/components/ReviewQueueClient'
import type { Category, Trigger } from '@/lib/db/schema'

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

vi.mock('@/components/TriggerGridCard', () => ({
  TriggerGridCard: ({ trigger, selected, onSelect, onAcknowledge, isAnimatingOut }: any) => (
    <div data-testid={`grid-card-${trigger.id}`} data-selected={String(selected)} data-animating={String(isAnimatingOut)}>
      <span>{trigger.title}</span>
      <button onClick={onSelect}>select-{trigger.id}</button>
      <button onClick={onAcknowledge}>ack-grid-{trigger.id}</button>
    </div>
  ),
}))

vi.mock('@/components/TriggerCard', () => ({
  TriggerCard: ({ trigger, selected, onSelect, onSuccess }: any) => (
    <div data-testid={`drawer-card-${trigger.id}`} data-selected={String(selected)}>
      <span>{trigger.title}</span>
      <button onClick={onSelect}>select-drawer-{trigger.id}</button>
      <button onClick={onSuccess}>ack-drawer-{trigger.id}</button>
    </div>
  ),
}))

vi.mock('@/components/TriggerEditSheet', () => ({
  TriggerEditSheet: () => null,
}))

function makeCategory(id: string, name: string): Category {
  return { id, userId: 'u1', name, icon: null, createdAt: new Date() }
}
function makeTrigger(id: string, categoryId: string, title: string): Trigger {
  return {
    id, userId: 'u1', categoryId, title, fullContent: '', summary: null,
    summaryStatus: 'pending', priority: 2, reviewIntervalDays: 7,
    lastReviewedAt: null, nextReviewAt: new Date(), status: 'active',
    notifyChannel: null, notionPageId: null, agentMetadata: null,
    createdAt: new Date(), updatedAt: new Date(),
  }
}

const cat1 = makeCategory('cat-1', 'Work')
const cat2 = makeCategory('cat-2', 'Health')
const t1 = makeTrigger('t1', 'cat-1', 'Trigger One')
const t2 = makeTrigger('t2', 'cat-1', 'Trigger Two')
const t3 = makeTrigger('t3', 'cat-2', 'Trigger Three')
const grouped = [
  { category: cat1, triggers: [t1, t2] },
  { category: cat2, triggers: [t3] },
]
const nodeMap = {}

describe('ReviewQueueClient', () => {
  beforeEach(() => {
    mockRefresh.mockReset()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('renders all triggers as grid cards', () => {
    render(<ReviewQueueClient grouped={grouped} nodeMap={nodeMap} />)
    expect(screen.getByTestId('grid-card-t1')).toBeTruthy()
    expect(screen.getByTestId('grid-card-t2')).toBeTruthy()
    expect(screen.getByTestId('grid-card-t3')).toBeTruthy()
  })

  it('shows empty state when grouped is empty', () => {
    render(<ReviewQueueClient grouped={[]} nodeMap={nodeMap} />)
    expect(screen.getByText(/nothing due/i)).toBeTruthy()
  })

  it('category filter hides grid cards not in that category', () => {
    render(<ReviewQueueClient grouped={grouped} nodeMap={nodeMap} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cat-1' } })
    expect(screen.getByTestId('grid-card-t1')).toBeTruthy()
    expect(screen.queryByTestId('grid-card-t3')).toBeNull()
  })

  it('category filter does not affect drawer content', () => {
    render(<ReviewQueueClient grouped={grouped} nodeMap={nodeMap} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cat-1' } })
    fireEvent.click(screen.getByRole('button', { name: /open list/i }))
    expect(screen.getByTestId('drawer-card-t3')).toBeTruthy()
  })

  it('bulk bar is hidden when nothing is selected', () => {
    render(<ReviewQueueClient grouped={grouped} nodeMap={nodeMap} />)
    expect(screen.queryByRole('button', { name: /acknowledge selected/i })).toBeNull()
  })

  it('bulk bar appears when a grid card is selected', () => {
    render(<ReviewQueueClient grouped={grouped} nodeMap={nodeMap} />)
    fireEvent.click(screen.getByText('select-t1'))
    expect(screen.getByRole('button', { name: /acknowledge selected/i })).toBeTruthy()
  })

  it('bulk bar appears when a drawer card is selected', () => {
    render(<ReviewQueueClient grouped={grouped} nodeMap={nodeMap} />)
    fireEvent.click(screen.getByRole('button', { name: /open list/i }))
    fireEvent.click(screen.getByText('select-drawer-t1'))
    expect(screen.getByRole('button', { name: /acknowledge selected/i })).toBeTruthy()
  })

  it('count deduplicates when same ID is selected in grid and drawer (count = 1)', () => {
    render(<ReviewQueueClient grouped={grouped} nodeMap={nodeMap} />)
    fireEvent.click(screen.getByText('select-t1'))
    fireEvent.click(screen.getByRole('button', { name: /open list/i }))
    fireEvent.click(screen.getByText('select-drawer-t1'))
    expect(screen.getByText('1 selected')).toBeTruthy()
  })

  it('bulk acknowledge fires PATCH for each unique selected ID', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', mockFetch)
    render(<ReviewQueueClient grouped={grouped} nodeMap={nodeMap} />)
    fireEvent.click(screen.getByText('select-t1'))
    fireEvent.click(screen.getByText('select-t2'))
    fireEvent.click(screen.getByRole('button', { name: /acknowledge selected/i }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    expect(mockFetch).toHaveBeenCalledWith('/api/triggers/t1', expect.objectContaining({ method: 'PATCH' }))
    expect(mockFetch).toHaveBeenCalledWith('/api/triggers/t2', expect.objectContaining({ method: 'PATCH' }))
  })

  it('bulk acknowledge deduplicates: same ID in grid+drawer is PATCHed once', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', mockFetch)
    render(<ReviewQueueClient grouped={grouped} nodeMap={nodeMap} />)
    fireEvent.click(screen.getByText('select-t1'))
    fireEvent.click(screen.getByRole('button', { name: /open list/i }))
    fireEvent.click(screen.getByText('select-drawer-t1'))
    fireEvent.click(screen.getByRole('button', { name: /acknowledge selected/i }))
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    const t1Calls = mockFetch.mock.calls.filter((c: any[]) => c[0] === '/api/triggers/t1')
    expect(t1Calls).toHaveLength(1)
  })

  it('clear button resets selection and hides bulk bar', () => {
    render(<ReviewQueueClient grouped={grouped} nodeMap={nodeMap} />)
    fireEvent.click(screen.getByText('select-t1'))
    expect(screen.getByRole('button', { name: /acknowledge selected/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(screen.queryByRole('button', { name: /acknowledge selected/i })).toBeNull()
  })

  it('drawer opens when hamburger tab is clicked', () => {
    render(<ReviewQueueClient grouped={grouped} nodeMap={nodeMap} />)
    // Drawer cards should be present in DOM but hidden (translate-x-full)
    fireEvent.click(screen.getByRole('button', { name: /open list/i }))
    expect(screen.getByRole('button', { name: /close list/i })).toBeTruthy()
  })

  it('drawer closes when Close button is clicked', () => {
    render(<ReviewQueueClient grouped={grouped} nodeMap={nodeMap} />)
    fireEvent.click(screen.getByRole('button', { name: /open list/i }))
    fireEvent.click(screen.getByRole('button', { name: /close list/i }))
    expect(screen.queryByRole('button', { name: /close list/i })).toBeNull()
  })
})
