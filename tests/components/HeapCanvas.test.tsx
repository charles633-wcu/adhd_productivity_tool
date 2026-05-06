import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HeapCanvas } from '@/components/heap/HeapCanvas'

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children: React.ReactNode }) => <div data-testid="react-flow-mock">{children}</div>,
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReactFlow: () => ({ screenToFlowPosition: (p: unknown) => p, addEdge: vi.fn(), fitView: vi.fn() }),
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  useNodesState: () => [[], vi.fn(), vi.fn()],
  useEdgesState: () => [[], vi.fn(), vi.fn()],
  addEdge: vi.fn((params, edges) => [...edges, params]),
  Position: { Left: 'left', Right: 'right' },
  Handle: () => null,
}))

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
})
