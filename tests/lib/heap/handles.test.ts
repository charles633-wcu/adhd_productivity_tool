import { describe, expect, it } from 'vitest'
import {
  assignEdgeHandles,
  buildNodeHandles,
  chooseHandleForEndpoint,
  type HandleEdge,
  type HandleNode,
} from '@/lib/heap/handles'

const baseNode = (overrides: Partial<HandleNode>): HandleNode => ({
  id: 'node',
  x: 0,
  y: 0,
  width: 110,
  height: 60,
  shape: 'rectangle',
  ...overrides,
})

describe('dynamic heap handles', () => {
  it('keeps one handle per side for a small rectangle', () => {
    const handles = buildNodeHandles(baseNode({ width: 110, height: 60 }))

    expect(handles.map((handle) => handle.id)).toEqual(['top-0', 'right-0', 'bottom-0', 'left-0'])
  })

  it('adds more handles as a rectangle grows', () => {
    const handles = buildNodeHandles(baseNode({ width: 340, height: 180 }))

    expect(handles.filter((handle) => handle.side === 'top')).toHaveLength(4)
    expect(handles.filter((handle) => handle.side === 'right')).toHaveLength(3)
    expect(handles).toContainEqual(expect.objectContaining({ id: 'right-2', side: 'right' }))
  })

  it('chooses the side facing the opposite node center', () => {
    const node = baseNode({ id: 'a', x: 0, y: 0, width: 200, height: 100 })
    const handles = buildNodeHandles(node)

    expect(chooseHandleForEndpoint(node, baseNode({ id: 'b', x: 400, y: 20 }), handles, 0, 1)?.side).toBe('right')
    expect(chooseHandleForEndpoint(node, baseNode({ id: 'c', x: -400, y: 20 }), handles, 0, 1)?.side).toBe('left')
    expect(chooseHandleForEndpoint(node, baseNode({ id: 'd', x: 20, y: -400 }), handles, 0, 1)?.side).toBe('top')
    expect(chooseHandleForEndpoint(node, baseNode({ id: 'e', x: 20, y: 400 }), handles, 0, 1)?.side).toBe('bottom')
  })

  it('spreads multiple same-side edges across available handles', () => {
    const nodes = [
      baseNode({ id: 'a', x: 0, y: 0, width: 340, height: 120 }),
      baseNode({ id: 'b', x: 500, y: 0 }),
      baseNode({ id: 'c', x: 500, y: 80 }),
      baseNode({ id: 'd', x: 500, y: 160 }),
    ]
    const edges: HandleEdge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'a', target: 'c' },
      { id: 'e3', source: 'a', target: 'd' },
    ]

    const result = assignEdgeHandles(nodes, edges)

    expect(result.map((edge) => edge.sourceHandle)).toEqual(['right-0', 'right-1', 'right-0'])
    expect(result.every((edge) => edge.targetHandle === 'left-0')).toBe(true)
  })

  it('collapses assignments to remaining handles when a node shrinks', () => {
    const nodes = [
      baseNode({ id: 'a', x: 0, y: 0, width: 110, height: 60 }),
      baseNode({ id: 'b', x: 500, y: 0 }),
      baseNode({ id: 'c', x: 500, y: 80 }),
    ]

    const result = assignEdgeHandles(nodes, [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'a', target: 'c' },
    ])

    expect(result.map((edge) => edge.sourceHandle)).toEqual(['right-0', 'right-0'])
  })
})
