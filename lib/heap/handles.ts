import type { HeapNodeShape } from '@/lib/db/schema'

export type HandleSide = 'top' | 'right' | 'bottom' | 'left'

export type VisualHandle = {
  id: string
  side: HandleSide
  index: number
  count: number
  xPercent: number
  yPercent: number
}

export type HandleNode = {
  id: string
  x: number
  y: number
  width?: number | null
  height?: number | null
  shape?: HeapNodeShape | null
}

export type HandleEdge = {
  id: string
  source: string
  target: string
}

export type AssignedHandleEdge<T extends HandleEdge = HandleEdge> = T & {
  sourceHandle?: string
  targetHandle?: string
}

const SIDES: HandleSide[] = ['top', 'right', 'bottom', 'left']

export function buildNodeHandles(node: HandleNode): VisualHandle[] {
  const width = node.width ?? defaultWidth(node.shape)
  const height = node.height ?? defaultHeight(node.shape)

  // Circles use angular circumference positions so handles land on the visual border.
  if (node.shape === 'circle') {
    return buildCircleHandles(Math.max(width, height))
  }

  // Diamonds place handles at the four visual tips, which overflow the bounding box.
  if (node.shape === 'diamond') {
    return buildDiamondHandles()
  }

  const sideCounts = getSideCounts(width, height)
  return SIDES.flatMap((side) => Array.from({ length: sideCounts[side] }, (_, index) => {
    const count = sideCounts[side]
    const offset = count === 1 ? 50 : ((index + 1) / (count + 1)) * 100
    return {
      id: `${side}-${index}`,
      side,
      index,
      count,
      xPercent: side === 'left' ? 0 : side === 'right' ? 100 : offset,
      yPercent: side === 'top' ? 0 : side === 'bottom' ? 100 : offset,
    }
  }))
}

function buildCircleHandles(size: number): VisualHandle[] {
  // Scale handle count with circle size; each handle is placed exactly on the circumference.
  const count = size < 120 ? 4 : size < 250 ? 8 : 12
  return Array.from({ length: count }, (_, i) => {
    // Angle: start at top (12 o'clock = -π/2), advance clockwise.
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / count
    const xPercent = 50 + 50 * Math.cos(angle)
    // CSS y increases downward, matching Math.sin's positive direction from top.
    const yPercent = 50 + 50 * Math.sin(angle)

    // Map to nearest cardinal direction for React Flow edge routing.
    const clockwiseDeg = (i / count) * 360
    const side: HandleSide =
      clockwiseDeg < 45 || clockwiseDeg >= 315 ? 'top'
      : clockwiseDeg < 135 ? 'right'
      : clockwiseDeg < 225 ? 'bottom'
      : 'left'

    return { id: `circle-${i}`, side, index: i, count, xPercent, yPercent }
  })
}

function buildDiamondHandles(): VisualHandle[] {
  // The visual diamond (a square rotated 45°) overflows the bounding box.
  // Each tip is at distance containerSize × √2/2 from the center.
  // Expressed as a percentage of the container that puts handles outside 0–100%
  // so they land on the visual tip, not the bounding-box edge.
  const TIP_PERCENT = 50 * Math.SQRT2 // ≈ 70.71
  return [
    { id: 'top-0', side: 'top', index: 0, count: 1, xPercent: 50, yPercent: 50 - TIP_PERCENT },
    { id: 'right-0', side: 'right', index: 0, count: 1, xPercent: 50 + TIP_PERCENT, yPercent: 50 },
    { id: 'bottom-0', side: 'bottom', index: 0, count: 1, xPercent: 50, yPercent: 50 + TIP_PERCENT },
    { id: 'left-0', side: 'left', index: 0, count: 1, xPercent: 50 - TIP_PERCENT, yPercent: 50 },
  ]
}

export function assignEdgeHandles<T extends HandleEdge>(nodes: HandleNode[], edges: T[]): AssignedHandleEdge<T>[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const handlesByNodeId = new Map(nodes.map((node) => [node.id, buildNodeHandles(node)]))
  const endpointGroups = new Map<string, Array<{ edge: T; endpoint: 'source' | 'target'; oppositeId: string }>>()

  for (const edge of edges) {
    addEndpoint(endpointGroups, edge.source, { edge, endpoint: 'source', oppositeId: edge.target })
    addEndpoint(endpointGroups, edge.target, { edge, endpoint: 'target', oppositeId: edge.source })
  }

  const assignments = new Map<string, { sourceHandle?: string; targetHandle?: string }>()

  for (const [nodeId, endpoints] of endpointGroups) {
    const node = nodesById.get(nodeId)
    const handles = handlesByNodeId.get(nodeId)
    if (!node || !handles) continue

    const bySide = new Map<HandleSide, typeof endpoints>()
    for (const endpoint of endpoints) {
      const opposite = nodesById.get(endpoint.oppositeId)
      if (!opposite) continue
      const side = sideFacing(node, opposite)
      const current = bySide.get(side) ?? []
      current.push(endpoint)
      bySide.set(side, current)
    }

    for (const [side, sideEndpoints] of bySide) {
      const sideHandles = handles.filter((handle) => handle.side === side)
      const ordered = [...sideEndpoints].sort((a, b) =>
        a.edge.id.localeCompare(b.edge.id) || a.oppositeId.localeCompare(b.oppositeId),
      )

      ordered.forEach((endpoint, index) => {
        const handle = sideHandles[index % Math.max(1, sideHandles.length)] ?? handles[0]
        const current = assignments.get(endpoint.edge.id) ?? {}
        if (endpoint.endpoint === 'source') current.sourceHandle = handle?.id
        else current.targetHandle = handle?.id
        assignments.set(endpoint.edge.id, current)
      })
    }
  }

  return edges.map((edge) => ({ ...edge, ...(assignments.get(edge.id) ?? {}) }))
}

export function chooseHandleForEndpoint(
  node: HandleNode,
  opposite: HandleNode,
  handles: VisualHandle[],
  index: number,
  count: number,
): VisualHandle | undefined {
  const side = sideFacing(node, opposite)
  const sideHandles = handles.filter((handle) => handle.side === side)
  if (sideHandles.length === 0) return handles[0]
  const clampedIndex = Math.min(sideHandles.length - 1, Math.floor((index / Math.max(1, count)) * sideHandles.length))
  return sideHandles[clampedIndex]
}

function addEndpoint<T extends HandleEdge>(
  groups: Map<string, Array<{ edge: T; endpoint: 'source' | 'target'; oppositeId: string }>>,
  nodeId: string,
  endpoint: { edge: T; endpoint: 'source' | 'target'; oppositeId: string },
) {
  const current = groups.get(nodeId) ?? []
  current.push(endpoint)
  groups.set(nodeId, current)
}

function sideFacing(node: HandleNode, opposite: HandleNode): HandleSide {
  const nodeCenter = center(node)
  const oppositeCenter = center(opposite)
  const dx = oppositeCenter.x - nodeCenter.x
  const dy = oppositeCenter.y - nodeCenter.y
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

function center(node: HandleNode): { x: number; y: number } {
  const width = node.width ?? defaultWidth(node.shape)
  const height = node.height ?? defaultHeight(node.shape)
  return { x: node.x + width / 2, y: node.y + height / 2 }
}

function getSideCounts(width: number, height: number): Record<HandleSide, number> {
  const horizontal = clamp(1 + Math.floor(Math.max(0, width - 110) / 70), 1, 5)
  const vertical = clamp(1 + Math.floor(Math.max(0, height - 60) / 60), 1, 4)
  return { top: horizontal, right: vertical, bottom: horizontal, left: vertical }
}

function defaultWidth(shape?: HeapNodeShape | null): number {
  if (shape === 'pill') return 120
  if (shape === 'circle') return 80
  if (shape === 'diamond') return 90
  return 110
}

function defaultHeight(shape?: HeapNodeShape | null): number {
  if (shape === 'pill') return 44
  if (shape === 'circle') return 80
  if (shape === 'diamond') return 90
  return 60
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
