'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { HeapNodeType } from '@/lib/db/schema'

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
}

export function HeapNode({ data, selected }: NodeProps) {
  const d = data as HeapNodeData
  const borderColor = d.color ?? '#475569'

  return (
    <div
      style={{ borderColor }}
      className={`bg-card border-2 rounded-xl px-3 py-2.5 min-w-[110px] max-w-[160px] shadow-md transition-shadow ${selected ? 'shadow-lg ring-1 ring-primary' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-border !w-2 !h-2" />

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] leading-none text-muted-foreground">{TYPE_ICON[d.type]}</span>
        <span className="text-xs font-medium truncate text-foreground">{d.title}</span>
        {d.todoCount > 0 && (
          <span className="ml-auto text-[10px] bg-primary/20 text-primary rounded-full px-1.5 py-0.5 flex-shrink-0">
            {d.todoCount}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!bg-border !w-2 !h-2" />
    </div>
  )
}
