'use client'

// HeapNode — renders a single Mind canvas node with one of four visual shapes.
// Shape is read from data.shape (defaults to 'rectangle' if absent).
// Circle nodes get a NodeResizer (visible only when selected) for drag-resize.
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react'
import type { HeapNodeType, HeapNodeShape } from '@/lib/db/schema'

const TYPE_ICON: Record<HeapNodeType, string> = {
  task_cluster: 'Tasks',
  note: 'Note',
  goal: 'Goal',
  reference: 'Ref',
  brain_dump: 'Idea',
}

export type HeapNodeData = {
  title: string
  type: HeapNodeType
  color: string | null
  todoCount: number
  shape?: HeapNodeShape
  width?: number | null
  height?: number | null
}

const HANDLE_CLASS = '!bg-primary !border-2 !border-background !w-3 !h-3'

export function HeapNode({ data, selected }: NodeProps) {
  const d = data as HeapNodeData
  const borderColor = d.color ?? '#475569'
  const shape = d.shape ?? 'rectangle'
  const ring = selected ? ' shadow-lg ring-1 ring-primary' : ''

  // Rectangle — default card shape
  if (shape === 'rectangle') {
    return (
      <div
        style={{ borderColor }}
        className={`bg-card border-2 rounded-xl px-3 py-2.5 min-w-[110px] max-w-[160px] shadow-md transition-shadow${ring}`}
      >
        <Handle type="target" position={Position.Left} title="Drop connection here" className={HANDLE_CLASS} />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] leading-none text-muted-foreground">{TYPE_ICON[d.type]}</span>
          <span className="text-xs font-medium truncate text-foreground">{d.title}</span>
          {d.todoCount > 0 && (
            <span className="ml-auto text-[10px] bg-primary/20 text-primary rounded-full px-1.5 py-0.5 flex-shrink-0">
              {d.todoCount}
            </span>
          )}
        </div>
        <Handle type="source" position={Position.Right} title="Drag to connect" className={HANDLE_CLASS} />
      </div>
    )
  }

  // Pill — full-radius capsule for tags / labels
  if (shape === 'pill') {
    return (
      <div
        style={{ borderColor }}
        className={`bg-card border-2 rounded-full px-4 py-2 min-w-[120px] shadow-md transition-shadow${ring}`}
      >
        <Handle type="target" position={Position.Left} className={HANDLE_CLASS} />
        <div className="flex items-center justify-center">
          <span className="text-xs font-medium truncate text-foreground">{d.title}</span>
        </div>
        <Handle type="source" position={Position.Right} className={HANDLE_CLASS} />
      </div>
    )
  }

  // Circle — resizable via NodeResizer drag handles (visible when selected)
  // Size is controlled by the ReactFlow node's style prop set in HeapCanvas.toFlowNode;
  // the component fills 100% of that container.
  if (shape === 'circle') {
    return (
      <div
        style={{ borderColor }}
        className={`w-full h-full bg-card border-2 rounded-full overflow-hidden shadow-md transition-shadow relative${ring}`}
      >
        {/* NodeResizer handles appear at corners when the node is selected */}
        <NodeResizer isVisible={selected} minWidth={60} minHeight={60} keepAspectRatio />
        <Handle type="target" position={Position.Left} className={HANDLE_CLASS} />
        <div className="absolute inset-0 flex items-center justify-center p-2">
          <span className="text-xs font-medium text-center text-foreground break-words leading-tight">
            {d.title}
          </span>
        </div>
        <Handle type="source" position={Position.Right} className={HANDLE_CLASS} />
      </div>
    )
  }

  // Diamond — outer div rotated 45°; inner content counter-rotated so text stays upright
  const diamondSize = 90
  return (
    <div style={{ width: diamondSize, height: diamondSize }} className="relative">
      <Handle type="target" position={Position.Left} className={HANDLE_CLASS} />
      {/* Rotated background square that forms the diamond shape */}
      <div
        style={{ borderColor, width: diamondSize, height: diamondSize }}
        className={`absolute inset-0 bg-card border-2 rotate-45 rounded-md shadow-md transition-shadow${ring}`}
      />
      {/* Counter-rotated text layer so title reads upright */}
      <div className="absolute inset-0 flex items-center justify-center p-3">
        <span className="text-xs font-medium text-center text-foreground break-words leading-tight">
          {d.title}
        </span>
      </div>
      <Handle type="source" position={Position.Right} className={HANDLE_CLASS} />
    </div>
  )
}
