import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HeapCanvas } from '@/components/heap/HeapCanvas'

vi.mock('@xyflow/react', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  return {
  ReactFlow: ({ children, nodes, edges }: { children: React.ReactNode; nodes: unknown[]; edges: unknown[] }) => (
    <div data-testid="react-flow-mock" data-nodes={JSON.stringify(nodes)} data-edges={JSON.stringify(edges)}>
      {children}
    </div>
  ),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReactFlow: () => ({ screenToFlowPosition: (p: unknown) => p, addEdge: vi.fn(), fitView: vi.fn() }),
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  useNodesState: (initial: unknown[]) => {
    const [items, setItems] = React.useState(initial)
    return [items, setItems, vi.fn()]
  },
  useEdgesState: (initial: unknown[]) => {
    const [items, setItems] = React.useState(initial)
    return [items, setItems, vi.fn()]
  },
  addEdge: vi.fn((params, edges) => [...edges, params]),
  Position: { Left: 'left', Right: 'right' },
  Handle: () => null,
  ConnectionMode: { Loose: 'loose', Strict: 'strict' },
}})

global.fetch = vi.fn()

describe('HeapCanvas', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the React Flow container', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
    render(<HeapCanvas />)
    await waitFor(() => {
      expect(screen.getByTestId('heap-canvas-container')).toBeTruthy()
    })
  })

  it('renders without crashing when fetch fails', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('network'))
    render(<HeapCanvas />)
    await waitFor(() => {
      expect(screen.getByTestId('heap-canvas-container')).toBeTruthy()
    })
  })

  it('toggles focus mode and dims unrelated nodes', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => [
        { id: 'a', userId: 'u1', title: 'Alpha', type: 'brain_dump', color: null, priority: 'high', shape: 'rectangle', width: 250, height: 105, posX: 0, posY: 0, body: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 'b', userId: 'u1', title: 'Beta', type: 'brain_dump', color: null, priority: 'normal', shape: 'rectangle', width: null, height: null, posX: 200, posY: 0, body: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 'c', userId: 'u1', title: 'Gamma', type: 'brain_dump', color: null, priority: 'normal', shape: 'rectangle', width: null, height: null, posX: 400, posY: 0, body: null, createdAt: new Date(), updatedAt: new Date() },
      ] })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'ab', source: 'a', target: 'b' }] })
    render(<HeapCanvas />)
    await waitFor(() => screen.getByRole('button', { name: /focus mode/i }))
    fireEvent.click(screen.getByRole('button', { name: /focus mode/i }))
    const flow = screen.getByTestId('react-flow-mock')
    await waitFor(() => {
      const parsedNodes = JSON.parse(flow.getAttribute('data-nodes') ?? '[]') as Array<{ id: string; data: { dimmed?: boolean; focusMode?: boolean } }>
      expect(parsedNodes.find((node) => node.id === 'a')?.data.focusMode).toBe(true)
      expect(parsedNodes.find((node) => node.id === 'c')?.data.dimmed).toBe(true)
    })
    expect(screen.getByText(/focused: 2 \/ 3/i)).toBeTruthy()
  })

  it('shows empty focus guidance when no high priority nodes exist', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => [
        { id: 'a', userId: 'u1', title: 'Alpha', type: 'brain_dump', color: null, priority: 'normal', shape: 'rectangle', width: null, height: null, posX: 0, posY: 0, body: null, createdAt: new Date(), updatedAt: new Date() },
      ] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
    render(<HeapCanvas />)
    await waitFor(() => screen.getByRole('button', { name: /focus mode/i }))
    fireEvent.click(screen.getByRole('button', { name: /focus mode/i }))
    expect(screen.getByText(/mark nodes high priority/i)).toBeTruthy()
  })

  it('passes updatedAt into focus child preview ordering', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => [
        { id: 'p', userId: 'u1', title: 'Parent', type: 'brain_dump', color: null, priority: 'high', shape: 'rectangle', width: 110, height: 60, posX: 0, posY: 0, body: null, createdAt: new Date(), updatedAt: new Date('2026-05-09T08:00:00Z') },
        { id: 'old', userId: 'u1', title: 'Alpha old child', type: 'brain_dump', color: null, priority: 'normal', shape: 'rectangle', width: null, height: null, posX: 200, posY: 0, body: null, createdAt: new Date(), updatedAt: new Date('2026-05-09T08:00:00Z') },
        { id: 'recent', userId: 'u1', title: 'Zeta recent child', type: 'brain_dump', color: null, priority: 'normal', shape: 'rectangle', width: null, height: null, posX: 400, posY: 0, body: null, createdAt: new Date(), updatedAt: new Date('2026-05-09T10:00:00Z') },
      ] })
      .mockResolvedValueOnce({ ok: true, json: async () => [
        { id: 'p-old', source: 'p', target: 'old' },
        { id: 'p-recent', source: 'p', target: 'recent' },
      ] })
    render(<HeapCanvas />)
    await waitFor(() => screen.getByRole('button', { name: /focus mode/i }))
    fireEvent.click(screen.getByRole('button', { name: /focus mode/i }))
    const flow = screen.getByTestId('react-flow-mock')
    await waitFor(() => {
      const parsedNodes = JSON.parse(flow.getAttribute('data-nodes') ?? '[]') as Array<{ id: string; data: { visibleChildren?: Array<{ id: string }> } }>
      expect(parsedNodes.find((node) => node.id === 'p')?.data.visibleChildren?.map((child) => child.id)).toEqual(['recent', 'old'])
    })
  })
})
