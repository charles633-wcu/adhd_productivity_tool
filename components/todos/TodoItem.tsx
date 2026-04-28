'use client'
// TodoItem — single task row with checkbox, title, priority badge, due date, subtask toggle.
import type { Todo } from '@/lib/db/schema'
import { cn } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-red-950 text-red-300',
  medium: 'bg-blue-950 text-blue-300',
  low: 'bg-green-950 text-green-300',
  none: '',
}

const PRIORITY_LABELS: Record<string, string> = {
  high: 'High', medium: 'Medium', low: 'Low', none: '',
}

interface TodoItemProps {
  todo: Todo
  subtaskCount?: number
  subtasksExpanded?: boolean
  onToggle: (id: string, completed: boolean) => void
  onSelect: (id: string) => void
  onToggleSubtasks?: (id: string) => void
}

export function TodoItem({
  todo,
  subtaskCount = 0,
  subtasksExpanded = false,
  onToggle,
  onSelect,
  onToggleSubtasks,
}: TodoItemProps) {
  const isCompleted = todo.completed === 1

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer group border-b border-border/40"
      onClick={() => onSelect(todo.id)}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isCompleted}
        onChange={e => { e.stopPropagation(); onToggle(todo.id, e.target.checked) }}
        onClick={e => e.stopPropagation()}
        className="rounded border-border accent-primary flex-shrink-0 cursor-pointer"
      />

      {/* Title */}
      <span className={cn('flex-1 text-sm truncate', isCompleted && 'line-through text-muted-foreground')}>
        {todo.title}
      </span>

      {/* Priority badge */}
      {todo.priority !== 'none' && (
        <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0', PRIORITY_STYLES[todo.priority])}>
          {PRIORITY_LABELS[todo.priority]}
        </span>
      )}

      {/* Due date */}
      {todo.dueDate && (
        <span className="text-xs text-muted-foreground flex-shrink-0">{todo.dueDate}</span>
      )}

      {/* Subtask toggle */}
      {subtaskCount > 0 && onToggleSubtasks && (
        <button
          onClick={e => { e.stopPropagation(); onToggleSubtasks(todo.id) }}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground flex-shrink-0"
        >
          <ChevronRight className={cn('w-3 h-3 transition-transform', subtasksExpanded && 'rotate-90')} />
          {subtaskCount}
        </button>
      )}
    </div>
  )
}
