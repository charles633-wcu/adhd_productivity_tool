// Custom ReactFlow edge that shows a floating toolbar when selected.
// Toolbar contains a priority toggle (★ → gold glow) and a delete button (✕).
'use client'

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'

export type PriorityEdgeData = {
  priority?: 'normal' | 'high'
  onPriorityChange?: (id: string, priority: 'normal' | 'high') => void
  onDelete?: (id: string) => void
}

// Gold glow style applied when priority === 'high'
const HIGH_STYLE = {
  stroke: '#FFD700',
  strokeWidth: 3,
  filter: 'drop-shadow(0 0 8px #FFD70099)',
} as const

const NORMAL_STYLE = { strokeWidth: 1.5 } as const

export function PriorityEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
  style,
  markerEnd,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const edgeData = data as PriorityEdgeData | undefined
  const isHigh = edgeData?.priority === 'high'

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{ ...style, ...(isHigh ? HIGH_STYLE : NORMAL_STYLE) }}
      />
      {selected && (
        <EdgeLabelRenderer>
          <div
            data-testid="edge-toolbar"
            className="absolute flex items-center gap-1 rounded-full border border-border bg-card/95 px-2 py-1 shadow-lg backdrop-blur pointer-events-all nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
          >
            {/* Priority toggle — gold star when high, muted when normal */}
            <button
              type="button"
              aria-label={isHigh ? 'Remove high priority' : 'Mark high priority'}
              onClick={() => edgeData?.onPriorityChange?.(id, isHigh ? 'normal' : 'high')}
              className={`text-base leading-none transition-colors nodrag nopan ${isHigh ? 'text-yellow-400' : 'text-muted-foreground hover:text-yellow-400'}`}
            >
              ★
            </button>
            {/* Delete button */}
            <button
              type="button"
              aria-label="Delete connection"
              onClick={() => edgeData?.onDelete?.(id)}
              className="text-sm leading-none text-muted-foreground hover:text-destructive transition-colors nodrag nopan"
            >
              ✕
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
