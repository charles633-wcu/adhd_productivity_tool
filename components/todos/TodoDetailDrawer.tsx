'use client'
// TodoDetailDrawer — slide-over right panel for viewing and editing a single task.
// Includes: title, description, priority, due date, list selector, label multi-select,
// inline subtask add, and delete. Opens when a TodoItem row is clicked.
import { useState, useEffect, KeyboardEvent } from 'react'
import type { Todo, TodoList, TodoLabel } from '@/lib/db/schema'
import { X, Trash2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TodoDetailDrawerProps {
  todoId: string
  lists: TodoList[]
  onClose: () => void
  onUpdate: () => void
}

const PRIORITY_OPTIONS = [
  { value: 'high', label: 'High', color: 'text-red-400' },
  { value: 'medium', label: 'Medium', color: 'text-blue-400' },
  { value: 'low', label: 'Low', color: 'text-green-400' },
  { value: 'none', label: 'None', color: 'text-muted-foreground' },
] as const

export function TodoDetailDrawer({ todoId, lists, onClose, onUpdate }: TodoDetailDrawerProps) {
  const [todo, setTodo] = useState<Todo | null>(null)
  const [subtasks, setSubtasks] = useState<Todo[]>([])
  const [labels, setLabels] = useState<TodoLabel[]>([])
  const [assignedLabelIds, setAssignedLabelIds] = useState<Set<string>>(new Set())
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [subtaskInput, setSubtaskInput] = useState('')

  // Fetch task, available labels, and assigned labels on open
  useEffect(() => {
    fetch(`/api/todos/${todoId}`)
      .then(r => r.json())
      .then((t: Todo & { subtasks?: Todo[] }) => {
        setTodo(t)
        setTitle(t.title)
        setDescription(t.description ?? '')
        setSubtasks(t.subtasks ?? [])
      })
    fetch('/api/todo-labels')
      .then(r => r.json())
      .then((lbls: TodoLabel[]) => setLabels(lbls))
    fetch(`/api/todos/${todoId}/labels`)
      .then(r => r.ok ? r.json() : [])
      .then((lbls: TodoLabel[]) => setAssignedLabelIds(new Set(lbls.map(l => l.id))))
      .catch(() => {})
  }, [todoId])

  async function patch(fields: Record<string, unknown>) {
    await fetch(`/api/todos/${todoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    onUpdate()
  }

  async function toggleLabel(labelId: string) {
    const isAssigned = assignedLabelIds.has(labelId)
    if (isAssigned) {
      await fetch(`/api/todos/${todoId}/labels/${labelId}`, { method: 'DELETE' })
      setAssignedLabelIds(prev => { const s = new Set(prev); s.delete(labelId); return s })
    } else {
      await fetch(`/api/todos/${todoId}/labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelId }),
      })
      setAssignedLabelIds(prev => new Set(prev).add(labelId))
    }
  }

  async function addSubtask() {
    if (!subtaskInput.trim()) return
    const res = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: subtaskInput.trim(), parentId: todoId }),
    })
    if (res.ok) {
      const newSub: Todo = await res.json()
      setSubtasks(prev => [...prev, newSub])
      setSubtaskInput('')
      onUpdate()
    }
  }

  async function handleDelete() {
    await fetch(`/api/todos/${todoId}`, { method: 'DELETE' })
    onUpdate()
    onClose()
  }

  if (!todo) {
    return (
      <div className="w-80 flex-shrink-0 border-l border-border bg-card flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="w-80 flex-shrink-0 border-l border-border bg-card flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-medium text-muted-foreground">Task detail</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Title */}
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== todo.title && patch({ title: title.trim() })}
          className="w-full bg-transparent font-medium text-sm outline-none border-b border-transparent focus:border-border pb-1 transition-colors"
        />

        {/* Description */}
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          onBlur={() => description !== (todo.description ?? '') && patch({ description })}
          placeholder="Add a note..."
          rows={3}
          className="w-full bg-transparent text-sm text-muted-foreground outline-none resize-none placeholder:text-muted-foreground/50"
        />

        {/* Priority */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Priority</p>
          <div className="flex gap-1 flex-wrap">
            {PRIORITY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { patch({ priority: opt.value }); setTodo(t => t ? { ...t, priority: opt.value } : t) }}
                className={cn(
                  'text-xs px-2 py-1 rounded border transition-colors',
                  todo.priority === opt.value
                    ? 'border-primary bg-primary/10 ' + opt.color
                    : 'border-border text-muted-foreground hover:border-muted-foreground'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Due date */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Due date</p>
          <input
            type="date"
            value={todo.dueDate ?? ''}
            onChange={e => { patch({ dueDate: e.target.value || null }); setTodo(t => t ? { ...t, dueDate: e.target.value || null } : t) }}
            className="bg-transparent text-sm text-foreground outline-none border border-border rounded px-2 py-1"
          />
        </div>

        {/* List selector */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">List</p>
          <select
            value={todo.listId}
            onChange={e => { patch({ listId: e.target.value }); setTodo(t => t ? { ...t, listId: e.target.value } : t) }}
            className="bg-card text-sm text-foreground outline-none border border-border rounded px-2 py-1 w-full"
          >
            {lists.map(l => (
              <option key={l.id} value={l.id}>{l.emoji ?? '📋'} {l.name}</option>
            ))}
          </select>
        </div>

        {/* Labels multi-select */}
        {labels.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Labels</p>
            <div className="flex flex-wrap gap-1">
              {labels.map(label => (
                <button
                  key={label.id}
                  onClick={() => toggleLabel(label.id)}
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full border transition-colors',
                    assignedLabelIds.has(label.id)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-muted-foreground'
                  )}
                  style={label.color && assignedLabelIds.has(label.id) ? { borderColor: label.color, color: label.color } : {}}
                >
                  #{label.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Subtasks */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Subtasks</p>
          <div className="flex flex-col gap-1.5 mb-2">
            {subtasks.map(sub => (
              <div key={sub.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sub.completed === 1}
                  onChange={async e => {
                    await fetch(`/api/todos/${sub.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ completed: e.target.checked }),
                    })
                    setSubtasks(prev => prev.map(s => s.id === sub.id ? { ...s, completed: e.target.checked ? 1 : 0 } : s))
                  }}
                  className="accent-primary"
                />
                <span className={cn('flex-1 text-muted-foreground text-xs', sub.completed === 1 && 'line-through')}>{sub.title}</span>
              </div>
            ))}
          </div>
          {/* Inline subtask add */}
          <div className="flex items-center gap-2">
            <Plus className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            <input
              value={subtaskInput}
              onChange={e => setSubtaskInput(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && addSubtask()}
              placeholder="Add subtask..."
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
            />
          </div>
        </div>
      </div>

      {/* Delete */}
      <div className="px-4 py-3 border-t border-border">
        <button
          onClick={handleDelete}
          className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80 transition-colors w-full"
        >
          <Trash2 className="w-4 h-4" />
          Delete task
        </button>
      </div>
    </div>
  )
}
