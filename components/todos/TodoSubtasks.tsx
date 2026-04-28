'use client'
// TodoSubtasks — inline subtask list rendered under a parent TodoItem when expanded.
import type { Todo } from '@/lib/db/schema'
import { TodoItem } from './TodoItem'

interface TodoSubtasksProps {
  subtasks: Todo[]
  onToggle: (id: string, completed: boolean) => void
  onSelect: (id: string) => void
}

export function TodoSubtasks({ subtasks, onToggle, onSelect }: TodoSubtasksProps) {
  return (
    <div className="pl-8 border-l border-border/60 ml-4 bg-muted/10">
      {subtasks.map(sub => (
        <TodoItem key={sub.id} todo={sub} onToggle={onToggle} onSelect={onSelect} />
      ))}
    </div>
  )
}
