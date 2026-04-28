'use client'
// TodoDetailDrawer — slide-over right panel (stub; full implementation in Task 8)
import type { TodoList } from '@/lib/db/schema'

interface TodoDetailDrawerProps {
  todoId: string
  lists: TodoList[]
  onClose: () => void
  onUpdate: () => void
}

export function TodoDetailDrawer({ onClose }: TodoDetailDrawerProps) {
  return (
    <div className="w-80 flex-shrink-0 border-l border-border bg-card flex items-center justify-center">
      <button onClick={onClose} className="text-xs text-muted-foreground">Close</button>
    </div>
  )
}
