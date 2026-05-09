import type { HeapNodePriority, HeapNodeShape } from '@/lib/db/schema'

export type FocusNode = {
  id: string
  title: string
  priority?: HeapNodePriority | null
  shape?: HeapNodeShape | null
  width?: number | null
  height?: number | null
  updatedAt?: Date | string | number | null
}

export type FocusEdge = {
  id: string
  source: string
  target: string
}

type VisibleChildren = {
  visibleChildIds: string[]
  overflowCount: number
}

export function buildChildMap(edges: FocusEdge[]): Map<string, string[]> {
  const childMap = new Map<string, string[]>()

  for (const edge of edges) {
    const childIds = childMap.get(edge.source) ?? []
    childIds.push(edge.target)
    childMap.set(edge.source, childIds)
  }

  return childMap
}

export function calculateVisibleChildSlots(node: Pick<FocusNode, 'shape' | 'width' | 'height'>): number {
  const shape = node.shape ?? 'rectangle'
  const width = node.width ?? defaultWidth(shape)
  const height = node.height ?? defaultHeight(shape)

  if (shape === 'pill') {
    return clamp(1 + Math.floor(Math.max(0, width - 120) / 90), 1, 4)
  }

  if (shape === 'circle') {
    const diameter = Math.max(width, height)
    return clamp(3 + Math.floor(Math.max(0, diameter - 80) / 40), 3, 10)
  }

  if (shape === 'diamond') {
    const size = Math.max(width, height)
    return clamp(2 + Math.floor(Math.max(0, size - 90) / 50), 2, 6)
  }

  const widthSlots = Math.floor(Math.max(0, width - 110) / 70)
  const heightSlots = Math.floor(Math.max(0, height - 60) / 45)
  return clamp(2 + widthSlots + heightSlots, 2, 8)
}

export function pickVisibleChildren({
  parentId,
  nodes,
  childMap,
  focusPathIds,
  slotCount,
}: {
  parentId: string
  nodes: FocusNode[]
  childMap: Map<string, string[]>
  focusPathIds: Set<string>
  slotCount: number
}): VisibleChildren {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const childIds = childMap.get(parentId) ?? []
  const sortedChildIds = [...childIds].sort((a, b) => compareChildren(nodesById.get(a), nodesById.get(b), focusPathIds))
  const visibleChildIds = sortedChildIds.slice(0, Math.max(0, slotCount))

  return {
    visibleChildIds,
    overflowCount: Math.max(0, sortedChildIds.length - visibleChildIds.length),
  }
}

export function deriveFocusVisibility({
  nodes,
  edges,
  focusPathIds,
}: {
  nodes: FocusNode[]
  edges: FocusEdge[]
  focusPathIds: Set<string>
}): {
  brightNodeIds: Set<string>
  dimmedNodeIds: Set<string>
  brightEdgeIds: Set<string>
  dimmedEdgeIds: Set<string>
  visibleChildrenByNodeId: Map<string, VisibleChildren>
} {
  const childMap = buildChildMap(edges)
  const brightNodeIds = new Set<string>()
  const visibleChildrenByNodeId = new Map<string, VisibleChildren>()
  const rootNodes = nodes.filter((node) => node.priority === 'critical' || node.priority === 'high' || focusPathIds.has(node.id))

  for (const node of rootNodes) {
    brightNodeIds.add(node.id)

    const picked = pickVisibleChildren({
      parentId: node.id,
      nodes,
      childMap,
      focusPathIds,
      slotCount: calculateVisibleChildSlots(node),
    })
    visibleChildrenByNodeId.set(node.id, picked)

    for (const childId of picked.visibleChildIds) {
      brightNodeIds.add(childId)
    }
  }

  const dimmedNodeIds = new Set(nodes.map((node) => node.id).filter((id) => !brightNodeIds.has(id)))
  const brightEdgeIds = new Set(edges.filter((edge) => brightNodeIds.has(edge.source) && brightNodeIds.has(edge.target)).map((edge) => edge.id))
  const dimmedEdgeIds = new Set(edges.filter((edge) => !brightEdgeIds.has(edge.id)).map((edge) => edge.id))

  return {
    brightNodeIds,
    dimmedNodeIds,
    brightEdgeIds,
    dimmedEdgeIds,
    visibleChildrenByNodeId,
  }
}

function compareChildren(a: FocusNode | undefined, b: FocusNode | undefined, focusPathIds: Set<string>): number {
  return (
    priorityRank(b) - priorityRank(a) ||
    Number(focusPathIds.has(b?.id ?? '')) - Number(focusPathIds.has(a?.id ?? '')) ||
    timestamp(b) - timestamp(a) ||
    (a?.title ?? '').localeCompare(b?.title ?? '') ||
    (a?.id ?? '').localeCompare(b?.id ?? '')
  )
}

function priorityRank(node: FocusNode | undefined): number {
  if (node?.priority === 'critical') return 2
  if (node?.priority === 'high') return 1
  return 0
}

function timestamp(node: FocusNode | undefined): number {
  if (node?.updatedAt == null) return 0
  const value = new Date(node.updatedAt).getTime()
  return Number.isFinite(value) ? value : 0
}

function defaultWidth(shape: HeapNodeShape): number {
  if (shape === 'pill') return 120
  if (shape === 'circle') return 80
  if (shape === 'diamond') return 90
  return 110
}

function defaultHeight(shape: HeapNodeShape): number {
  if (shape === 'pill') return 44
  if (shape === 'circle') return 80
  if (shape === 'diamond') return 90
  return 60
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
