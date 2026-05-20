import { describe, expect, it } from 'vitest'
import {
  buildChildMap,
  calculateVisibleChildSlots,
  deriveFocusVisibility,
  pickVisibleChildren,
  type FocusEdge,
  type FocusNode,
} from '@/lib/heap/focus'

const nodes: FocusNode[] = [
  { id: 'a', title: 'Alpha', priority: 'critical', shape: 'rectangle', width: 110, height: 60, updatedAt: new Date('2026-05-09T10:00:00Z') },
  { id: 'b', title: 'Beta', priority: 'high', shape: 'circle', width: 120, height: 120, updatedAt: new Date('2026-05-09T09:00:00Z') },
  { id: 'c', title: 'Gamma', priority: 'normal', shape: 'pill', width: 120, height: 44, updatedAt: new Date('2026-05-09T08:00:00Z') },
  { id: 'd', title: 'Delta', priority: 'low', shape: 'diamond', width: 90, height: 90, updatedAt: new Date('2026-05-09T07:00:00Z') },
  { id: 'e', title: 'Epsilon', priority: 'critical', shape: 'rectangle', width: 180, height: 80, updatedAt: new Date('2026-05-09T06:00:00Z') },
]

const edges: FocusEdge[] = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'ac', source: 'a', target: 'c' },
  { id: 'ad', source: 'a', target: 'd' },
  { id: 'be', source: 'b', target: 'e' },
]

describe('mind focus helpers', () => {
  it('builds child lists from directed edges', () => {
    expect(buildChildMap(edges).get('a')).toEqual(['b', 'c', 'd'])
    expect(buildChildMap(edges).get('b')).toEqual(['e'])
  })

  it('calculates visible child slots by shape and size', () => {
    expect(calculateVisibleChildSlots({ shape: 'rectangle', width: 110, height: 60 })).toBe(2)
    expect(calculateVisibleChildSlots({ shape: 'rectangle', width: 250, height: 105 })).toBe(5)
    expect(calculateVisibleChildSlots({ shape: 'pill', width: 300, height: 44 })).toBe(3)
    expect(calculateVisibleChildSlots({ shape: 'circle', width: 160, height: 160 })).toBe(5)
    expect(calculateVisibleChildSlots({ shape: 'diamond', width: 190, height: 190 })).toBe(4)
  })

  it('picks visible children by priority, focus path, recency, then stable title', () => {
    const picked = pickVisibleChildren({
      parentId: 'a',
      nodes,
      childMap: buildChildMap(edges),
      focusPathIds: new Set(['d']),
      slotCount: 2,
    })
    expect(picked.visibleChildIds).toEqual(['b', 'd'])
    expect(picked.overflowCount).toBe(1)
  })

  it('derives bright and dimmed nodes in focus mode', () => {
    const result = deriveFocusVisibility({ nodes, edges, focusPathIds: new Set(['d']) })
    // All children of root nodes are now shown (Infinity slot cap removed)
    expect(result.brightNodeIds).toEqual(new Set(['a', 'b', 'c', 'd', 'e']))
    expect(result.dimmedNodeIds).toEqual(new Set())
    expect(result.brightEdgeIds).toEqual(new Set(['ab', 'ac', 'ad', 'be']))
    expect(result.dimmedEdgeIds).toEqual(new Set())
    // visibleChildrenByNodeId removed from return — do not access it
  })
})
