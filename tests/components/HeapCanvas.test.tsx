import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HeapCanvas } from '@/components/heap/HeapCanvas'

const reactFlowProps = vi.hoisted(() => ({ current: null as null | { onNodesChange?: (changes: unknown[]) => void; onNodeClick?: (event: MouseEvent, node: unknown) => void } }))
const nodeDetailSheetProps = vi.hoisted(() => ({ current: null as null | { onUpdated: (nodeId: string, data: Record<string, unknown>) => void } }))

vi.mock('@xyflow/react', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  return {
  ReactFlow: (props: { children: React.ReactNode; nodes: unknown[]; edges: unknown[]; onNodesChange?: (changes: unknown[]) => void; onNodeClick?: (event: MouseEvent, node: unknown) => void }) => {
    reactFlowProps.current = props
    return (
      <div data-testid="react-flow-mock" data-nodes={JSON.stringify(props.nodes)} data-edges={JSON.stringify(props.edges)}>
        {props.children}
      </div>
    )
  },
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
  Position: { Top: 'top', Right: 'right', Bottom: 'bottom', Left: 'left' },
  Handle: () => null,
  ConnectionMode: { Loose: 'loose', Strict: 'strict' },
}})

vi.mock('@/components/heap/NodeDetailSheet', () => ({
  NodeDetailSheet: (props: { onUpdated: (nodeId: string, data: Record<string, unknown>) => void }) => {
    nodeDetailSheetProps.current = props
    return null
  },
}))

global.fetch = vi.fn()

describe('HeapCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reactFlowProps.current = null
    nodeDetailSheetProps.current = null
  })

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
      const parsedNodes = JSON.parse(flow.getAttribute('data-nodes') ?? '[]') as Array<{ id: string; data: { dimmed?: boolean } }>
      expect(parsedNodes.find((n) => n.id === 'old')?.data.dimmed).toBe(false)
      expect(parsedNodes.find((n) => n.id === 'recent')?.data.dimmed).toBe(false)
    })
  })

  it('updates local node dimensions after resize so focus slots react immediately', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => [
        { id: 'p', userId: 'u1', title: 'Parent', type: 'brain_dump', color: null, priority: 'high', shape: 'rectangle', width: 110, height: 60, posX: 0, posY: 0, body: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 'a', userId: 'u1', title: 'A', type: 'brain_dump', color: null, priority: 'normal', shape: 'rectangle', width: null, height: null, posX: 200, posY: 0, body: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 'b', userId: 'u1', title: 'B', type: 'brain_dump', color: null, priority: 'normal', shape: 'rectangle', width: null, height: null, posX: 400, posY: 0, body: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 'c', userId: 'u1', title: 'C', type: 'brain_dump', color: null, priority: 'normal', shape: 'rectangle', width: null, height: null, posX: 600, posY: 0, body: null, createdAt: new Date(), updatedAt: new Date() },
      ] })
      .mockResolvedValueOnce({ ok: true, json: async () => [
        { id: 'pa', source: 'p', target: 'a' },
        { id: 'pb', source: 'p', target: 'b' },
        { id: 'pc', source: 'p', target: 'c' },
      ] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    render(<HeapCanvas />)
    await waitFor(() => screen.getByRole('button', { name: /focus mode/i }))
    fireEvent.click(screen.getByRole('button', { name: /focus mode/i }))
    const flow = screen.getByTestId('react-flow-mock')

    // Wait for nodes to load before triggering resize
    await waitFor(() => {
      const parsedNodes = JSON.parse(flow.getAttribute('data-nodes') ?? '[]') as Array<{ id: string }>
      expect(parsedNodes.find((n) => n.id === 'p')).toBeTruthy()
    })

    reactFlowProps.current?.onNodesChange?.([
      { type: 'dimensions', id: 'p', dimensions: { width: 250, height: 105 }, resizing: false },
    ])

    await waitFor(() => {
      const parsedNodes = JSON.parse(flow.getAttribute('data-nodes') ?? '[]') as Array<{ id: string; data: { width?: number; height?: number }; style?: { width?: number; height?: number } }>
      const parent = parsedNodes.find((node) => node.id === 'p')
      expect(parent?.data.width).toBe(250)
      expect(parent?.data.height).toBe(105)
      expect(parent?.style).toEqual(expect.objectContaining({ width: 250, height: 105 }))
    })
  })

  it('assigns visual edge handles from current node geometry', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => [
        { id: 'p', userId: 'u1', title: 'Parent', type: 'brain_dump', color: null, priority: 'normal', shape: 'rectangle', width: 250, height: 120, posX: 0, posY: 0, body: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 'a', userId: 'u1', title: 'A', type: 'brain_dump', color: null, priority: 'normal', shape: 'rectangle', width: null, height: null, posX: 400, posY: 0, body: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 'b', userId: 'u1', title: 'B', type: 'brain_dump', color: null, priority: 'normal', shape: 'rectangle', width: null, height: null, posX: 400, posY: 90, body: null, createdAt: new Date(), updatedAt: new Date() },
      ] })
      .mockResolvedValueOnce({ ok: true, json: async () => [
        { id: 'pa', source: 'p', target: 'a' },
        { id: 'pb', source: 'p', target: 'b' },
      ] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    render(<HeapCanvas />)
    const flow = screen.getByTestId('react-flow-mock')

    await waitFor(() => {
      const parsedNodes = JSON.parse(flow.getAttribute('data-nodes') ?? '[]') as Array<{ id: string; data: { handles?: Array<{ id: string }> } }>
      const parent = parsedNodes.find((node) => node.id === 'p')
      expect(parent?.data.handles?.map((handle) => handle.id)).toContain('right-1')

      const parsedEdges = JSON.parse(flow.getAttribute('data-edges') ?? '[]') as Array<{
        id: string
        sourceHandle?: string
        targetHandle?: string
      }>
      expect(parsedEdges.map((edge) => edge.sourceHandle)).toEqual(['right-0', 'right-1'])
      expect(parsedEdges.every((edge) => edge.targetHandle === 'left-0')).toBe(true)
    })

    act(() => {
      reactFlowProps.current?.onNodesChange?.([
        { type: 'dimensions', id: 'p', dimensions: { width: 110, height: 60 }, resizing: false },
      ])
    })

    await waitFor(() => {
      const parsedEdges = JSON.parse(flow.getAttribute('data-edges') ?? '[]') as Array<{ sourceHandle?: string }>
      expect(parsedEdges.map((edge) => edge.sourceHandle)).toEqual(['right-0', 'right-0'])
    })
  })

  it('toggles the graph inspector panel open and closed', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => [
        { id: 'n1', userId: 'u1', title: 'Node 1', type: 'brain_dump', color: null, priority: 'normal', shape: 'circle', width: 120, height: 120, posX: 10, posY: 20, body: null, createdAt: new Date(), updatedAt: new Date() },
      ] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
    render(<HeapCanvas />)
    await waitFor(() => screen.getByRole('button', { name: /graph inspector/i }))

    expect(screen.queryByTestId('graph-debug-panel')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /graph inspector/i }))

    await waitFor(() => {
      expect(screen.getByTestId('graph-debug-panel')).toBeTruthy()
    })
    expect(screen.getByText(/n1/)).toBeTruthy()
    expect(screen.getByText(/circle/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /graph inspector/i }))
    expect(screen.queryByTestId('graph-debug-panel')).toBeNull()
  })

  it('graph inspector export button triggers a JSON download', async () => {
    const createObjectURLMock = vi.fn(() => 'blob:test')
    const revokeObjectURLMock = vi.fn()
    const anchorClickMock = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL: createObjectURLMock, revokeObjectURL: revokeObjectURLMock })
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag)
      if (tag === 'a') vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(anchorClickMock)
      return el
    })

    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
    render(<HeapCanvas />)
    await waitFor(() => screen.getByRole('button', { name: /graph inspector/i }))
    fireEvent.click(screen.getByRole('button', { name: /graph inspector/i }))
    await waitFor(() => screen.getByTestId('graph-debug-panel'))

    fireEvent.click(screen.getByRole('button', { name: /export json/i }))

    expect(createObjectURLMock).toHaveBeenCalledOnce()
    expect(anchorClickMock).toHaveBeenCalledOnce()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('calls PATCH when text style is changed via toolbar callback', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => [
        { id: 'n1', userId: 'u1', title: 'Node', type: 'brain_dump', color: null, priority: 'normal',
          shape: 'rectangle', width: null, height: null, posX: 0, posY: 0, body: null,
          fontFamily: null, fontSize: null, fontBold: null,
          createdAt: new Date(), updatedAt: new Date() },
      ] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    render(<HeapCanvas />)
    // Wait for nodes to load and onTextStyleChange to be wired — check via live props (not JSON, which strips functions)
    await waitFor(() => {
      const liveNodes = reactFlowProps.current?.nodes as Array<{ id: string; data: Record<string, unknown> }> | undefined
      expect(typeof liveNodes?.find((n) => n.id === 'n1')?.data.onTextStyleChange).toBe('function')
    })
    const liveNodes = reactFlowProps.current?.nodes as Array<{ id: string; data: { onTextStyleChange?: (style: Record<string, unknown>) => void } }> | undefined
    act(() => {
      liveNodes?.find((n) => n.id === 'n1')?.data.onTextStyleChange?.({ fontFamily: 'serif' })
    })
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.some((call: unknown[]) => call[0] === '/api/heap/nodes/n1' && (call[1] as RequestInit)?.method === 'PATCH')).toBe(true)
    })
  })

  it('drills into a bright child when clicked in focus mode', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => [
        { id: 'a', userId: 'u1', title: 'Root', type: 'brain_dump', color: null, priority: 'high',
          shape: 'rectangle', width: null, height: null, posX: 0, posY: 0, body: null,
          fontFamily: null, fontSize: null, fontBold: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 'b', userId: 'u1', title: 'Child', type: 'brain_dump', color: null, priority: 'normal',
          shape: 'rectangle', width: null, height: null, posX: 200, posY: 0, body: null,
          fontFamily: null, fontSize: null, fontBold: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 'c', userId: 'u1', title: 'Grandchild', type: 'brain_dump', color: null, priority: 'normal',
          shape: 'rectangle', width: null, height: null, posX: 400, posY: 0, body: null,
          fontFamily: null, fontSize: null, fontBold: null, createdAt: new Date(), updatedAt: new Date() },
      ] })
      .mockResolvedValueOnce({ ok: true, json: async () => [
        { id: 'ab', source: 'a', target: 'b' },
        { id: 'bc', source: 'b', target: 'c' },
      ] })
    render(<HeapCanvas />)
    await waitFor(() => screen.getByRole('button', { name: /focus mode/i }))
    fireEvent.click(screen.getByRole('button', { name: /focus mode/i }))
    const flow = screen.getByTestId('react-flow-mock')

    // Initially: a (root/high) + b (child) are bright; c is dimmed
    await waitFor(() => {
      const parsedNodes = JSON.parse(flow.getAttribute('data-nodes') ?? '[]') as Array<{ id: string; data: { dimmed?: boolean } }>
      expect(parsedNodes.find((n) => n.id === 'c')?.data.dimmed).toBe(true)
    })

    // Simulate clicking node 'b' (bright child, not root, not in path)
    act(() => {
      reactFlowProps.current?.onNodeClick?.(new MouseEvent('click'), { id: 'b', position: { x: 200, y: 0 }, data: { priority: 'normal' } })
    })

    // After drilling: b is in focusPathIds; c becomes bright
    await waitFor(() => {
      const parsedNodes = JSON.parse(flow.getAttribute('data-nodes') ?? '[]') as Array<{ id: string; data: { dimmed?: boolean } }>
      expect(parsedNodes.find((n) => n.id === 'c')?.data.dimmed).toBe(false)
    })
  })

  it('keeps persisted dimensions when a resized node changes to a non-circle shape', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => [
        { id: 'p', userId: 'u1', title: 'Parent', type: 'brain_dump', color: null, priority: 'normal', shape: 'circle', width: 180, height: 180, posX: 0, posY: 0, body: null, createdAt: new Date(), updatedAt: new Date() },
      ] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
    render(<HeapCanvas />)
    const flow = screen.getByTestId('react-flow-mock')
    await waitFor(() => {
      const parsedNodes = JSON.parse(flow.getAttribute('data-nodes') ?? '[]') as Array<{ id: string; style?: { width?: number; height?: number } }>
      expect(parsedNodes.find((node) => node.id === 'p')?.style).toEqual(expect.objectContaining({ width: 180, height: 180 }))
    })

    nodeDetailSheetProps.current?.onUpdated('p', { shape: 'pill' })

    await waitFor(() => {
      const parsedNodes = JSON.parse(flow.getAttribute('data-nodes') ?? '[]') as Array<{ id: string; data: { shape?: string; width?: number; height?: number }; style?: { width?: number; height?: number } }>
      const parent = parsedNodes.find((node) => node.id === 'p')
      expect(parent?.data.shape).toBe('pill')
      expect(parent?.style).toEqual(expect.objectContaining({ width: 180, height: 180 }))
    })
  })
})
