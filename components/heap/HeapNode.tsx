'use client'

// HeapNode — renders a single Mind canvas node with one of four visual shapes.
// Shape is read from data.shape (defaults to 'rectangle' if absent).
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react'
import type { CSSProperties } from 'react'
import type { HeapNodePriority, HeapNodeType, HeapNodeShape } from '@/lib/db/schema'
import type { HandleSide, VisualHandle } from '@/lib/heap/handles'
import { cn } from '@/lib/utils'

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
  priority?: HeapNodePriority
  updatedAt?: Date | string | number | null
  focusMode?: boolean
  dimmed?: boolean
  visibleChildren?: Array<{ id: string; title: string }>
  overflowChildCount?: number
  onPreviewClick?: (nodeId: string) => void
  handles?: VisualHandle[]
}

const HANDLE_CLASS = '!bg-primary !border-2 !border-background !w-3 !h-3'
const RESIZER_OVERLAY_CLASS = 'z-20'

function priorityClass(priority: HeapNodePriority | undefined): string {
  if (priority === 'critical') return 'shadow-[0_0_24px_rgba(239,68,68,0.28)] ring-1 ring-destructive/40'
  if (priority === 'high') return 'shadow-primary/20 ring-1 ring-primary/30'
  if (priority === 'low') return 'opacity-85'
  return ''
}

function positionForSide(side: HandleSide): Position {
  if (side === 'top') return Position.Top
  if (side === 'right') return Position.Right
  if (side === 'bottom') return Position.Bottom
  return Position.Left
}

// Half the handle dot size (!w-3 !h-3 = 12px) used to center via calc().
const HANDLE_HALF_PX = 6

function DynamicHandles({ handles }: { handles?: VisualHandle[] }) {
  const list = handles?.length
    ? handles
    : ([
        { id: 'left-0', side: 'left', index: 0, count: 1, xPercent: 0, yPercent: 50 },
        { id: 'right-0', side: 'right', index: 0, count: 1, xPercent: 100, yPercent: 50 },
      ] satisfies VisualHandle[])

  return (
    <>
      {list.map((handle) => {
        // Place the handle's CENTER at (xPercent, yPercent) of the node container.
        // Using calc(X% - half) so the center lands exactly on the shape boundary.
        // transform:none overrides React Flow's class-based transform (translate±50%)
        // which assumes edge-anchored handles and would misplace diagonal circle handles.
        const style: CSSProperties = {
          left: `calc(${handle.xPercent}% - ${HANDLE_HALF_PX}px)`,
          top: `calc(${handle.yPercent}% - ${HANDLE_HALF_PX}px)`,
          transform: 'none',
        }
        const position = positionForSide(handle.side)
        return (
          <span key={handle.id} data-testid={`visual-handle-${handle.id}`}>
            <Handle
              id={handle.id}
              type="source"
              position={position}
              title="Connection point"
              className={cn(HANDLE_CLASS, 'absolute')}
              style={style}
            />
            <Handle
              id={handle.id}
              type="target"
              position={position}
              title="Connection point"
              className={cn(HANDLE_CLASS, 'absolute')}
              style={style}
            />
          </span>
        )
      })}
    </>
  )
}

function PreviewSlots({ data }: { data: HeapNodeData }) {
  const overflowCount = data.overflowChildCount ?? 0
  if (!data.focusMode || (!data.visibleChildren?.length && overflowCount <= 0)) return null

  return (
    <div className="pointer-events-auto absolute left-1/2 top-full z-10 mt-1 flex -translate-x-1/2 items-center gap-1">
      {data.visibleChildren?.map((child) => (
        <button
          key={child.id}
          type="button"
          aria-label={`Focus ${child.title}`}
          onClick={(event) => {
            event.stopPropagation()
            data.onPreviewClick?.(child.id)
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          className="nodrag nopan max-w-20 truncate rounded-full border border-border bg-popover px-2 py-0.5 text-[10px] text-popover-foreground shadow"
        >
          {child.title}
        </button>
      ))}
      {overflowCount > 0 && (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">+{overflowCount}</span>
      )}
    </div>
  )
}

export function HeapNode({ data, selected }: NodeProps) {
  const d = data as HeapNodeData
  const borderColor = d.color ?? '#475569'
  const shape = d.shape ?? 'rectangle'
  const ring = selected ? 'shadow-lg ring-1 ring-primary' : ''
  const sharedStateClass = cn(ring, !d.dimmed && priorityClass(d.priority), d.dimmed && 'opacity-25')

  // Rectangle — default card shape
  if (shape === 'rectangle') {
    return (
      <div
        data-priority={d.priority ?? 'normal'}
        style={{ borderColor }}
        className={cn(
          'relative bg-card border-2 rounded-xl px-3 py-2.5 min-w-[110px] shadow-md transition-shadow',
          d.width != null && 'w-full h-full',
          d.width == null && 'max-w-[160px]',
          sharedStateClass,
        )}
      >
        <NodeResizer isVisible={selected} minWidth={60} minHeight={40} keepAspectRatio={false} />
        <DynamicHandles handles={d.handles} />
        <div className="flex h-full min-h-0 items-start gap-1.5">
          <span className="text-[10px] leading-none text-muted-foreground">{TYPE_ICON[d.type]}</span>
          <span className="min-w-0 flex-1 whitespace-normal break-words text-xs font-medium leading-tight text-foreground">{d.title}</span>
          {d.todoCount > 0 && (
            <span className="ml-auto text-[10px] bg-primary/20 text-primary rounded-full px-1.5 py-0.5 flex-shrink-0">
              {d.todoCount}
            </span>
          )}
        </div>
        <PreviewSlots data={d} />
      </div>
    )
  }

  // Pill — full-radius capsule for tags / labels
  if (shape === 'pill') {
    return (
      <div
        data-priority={d.priority ?? 'normal'}
        style={{ borderColor }}
        className={cn(
          'relative bg-card border-2 rounded-full px-4 py-2 min-w-[120px] shadow-md transition-shadow',
          d.width != null && 'w-full h-full',
          sharedStateClass,
        )}
      >
        <NodeResizer isVisible={selected} minWidth={60} minHeight={40} keepAspectRatio={false} />
        <DynamicHandles handles={d.handles} />
        <div className="flex h-full min-h-0 items-center justify-center">
          <span className="min-w-0 whitespace-normal break-words text-center text-xs font-medium leading-tight text-foreground">{d.title}</span>
        </div>
        <PreviewSlots data={d} />
      </div>
    )
  }

  // Circle — resizable via NodeResizer drag handles (visible when selected)
  // Size is controlled by the ReactFlow node's style prop set in HeapCanvas.toFlowNode;
  // the component fills 100% of that container.
  if (shape === 'circle') {
    return (
      <div
        data-priority={d.priority ?? 'normal'}
        className={cn('relative w-full h-full', d.dimmed && 'opacity-25')}
      >
        {/* NodeResizer handles appear at corners when the node is selected */}
        <NodeResizer
          isVisible={selected}
          minWidth={60}
          minHeight={60}
          keepAspectRatio
          handleClassName={RESIZER_OVERLAY_CLASS}
          lineClassName={RESIZER_OVERLAY_CLASS}
        />
        {/* Handles must live on the outer wrapper, not inside overflow-hidden.
            React Flow's handle transform shifts them outside their parent;
            overflow-hidden on the inner surface would clip them. */}
        <DynamicHandles handles={d.handles} />
        <div
          style={{ borderColor }}
          className={cn(
            'absolute inset-0 bg-card border-2 rounded-full overflow-hidden shadow-md transition-shadow',
            ring,
            !d.dimmed && priorityClass(d.priority),
          )}
        >
          <div className="absolute inset-0 flex items-center justify-center p-2">
            <span className="text-xs font-medium text-center text-foreground break-words leading-tight">
              {d.title}
            </span>
          </div>
        </div>
        <PreviewSlots data={d} />
      </div>
    )
  }

  // Diamond — outer div rotated 45°; inner content counter-rotated so text stays upright
  const diamondSize = Math.max(d.width ?? 90, d.height ?? d.width ?? 90)
  const diamondSurfaceClass = cn(
    'absolute inset-0 bg-card border-2 rotate-45 rounded-md shadow-md transition-shadow',
    ring,
    !d.dimmed && priorityClass(d.priority),
  )
  return (
    <div
      data-priority={d.priority ?? 'normal'}
      style={{ width: diamondSize, height: diamondSize }}
      className={cn('relative', d.dimmed && 'opacity-25')}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={60}
        minHeight={60}
        keepAspectRatio
        handleClassName={RESIZER_OVERLAY_CLASS}
        lineClassName={RESIZER_OVERLAY_CLASS}
      />
      <DynamicHandles handles={d.handles} />
      {/* Rotated background square that forms the diamond shape */}
      <div
        style={{ borderColor, width: diamondSize, height: diamondSize }}
        className={diamondSurfaceClass}
      />
      {/* Counter-rotated text layer so title reads upright */}
      <div className="absolute inset-0 flex items-center justify-center p-3">
        <span className="text-xs font-medium text-center text-foreground break-words leading-tight">
          {d.title}
        </span>
      </div>
      <PreviewSlots data={d} />
    </div>
  )
}
