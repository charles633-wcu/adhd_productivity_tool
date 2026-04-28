'use client'
// TodoList — main task list for the active view. Manages view state, task fetching,
// optimistic toggle, subtask expand/collapse, and detail drawer.
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Todo, TodoList as TodoListType } from '@/lib/db/schema'
import { AddTodoInput } from './AddTodoInput'
import { TodoItem } from './TodoItem'
import { TodoSubtasks } from './TodoSubtasks'
import { TodoDetailDrawer } from './TodoDetailDrawer'

interface TodoListProps {
  lists: TodoListType[]
}

export function TodoList({ lists }: TodoListProps) {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'inbox'
  const listId = searchParams.get('listId')

  const [tasks, setTasks] = useState<Todo[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [subtaskMap, setSubtaskMap] = useState<Record<string, Todo[]>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)

  type TodoWithSubtasks = Todo & { subtasks: Todo[] }

  // Fetch tasks whenever view/listId changes; seed subtaskMap from nested response
  const fetchTasks = useCallback(async () => {
    const params = listId ? `listId=${listId}` : `view=${view}`
    const res = await fetch(`/api/todos?${params}`)
    if (!res.ok) return
    const data: TodoWithSubtasks[] = await res.json()
    setTasks(data)
    // Pre-populate subtaskMap from nested subtasks returned by the API
    const newMap: Record<string, Todo[]> = {}
    for (const task of data) {
      if (task.subtasks.length > 0) newMap[task.id] = task.subtasks
    }
    setSubtaskMap(newMap)
  }, [view, listId])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  async function handleAdd(title: string) {
    const body: Record<string, unknown> = { title }
    if (listId) body.listId = listId
    await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    fetchTasks()
  }

  async function handleToggle(id: string, completed: boolean) {
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: completed ? 1 : 0 } : t))
    await fetch(`/api/todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    })
  }

  async function handleToggleSubtasks(parentId: string) {
    if (expandedIds.has(parentId)) {
      setExpandedIds(prev => { const s = new Set(prev); s.delete(parentId); return s })
      return
    }
    setExpandedIds(prev => new Set(prev).add(parentId))
  }

  const rootTasks = tasks.filter(t => t.parentId === null)
  const incomplete = rootTasks.filter(t => t.completed === 0)
  const completed = rootTasks.filter(t => t.completed === 1)

  const viewLabel = listId
    ? lists.find(l => l.id === listId)?.name ?? 'List'
    : { inbox: 'Inbox', today: 'Today', upcoming: 'Upcoming', all: 'All Tasks' }[view] ?? 'Tasks'

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <h1 className="font-semibold text-lg">{viewLabel}</h1>
        <span className="text-xs text-muted-foreground">{incomplete.length} tasks</span>
      </div>

      {/* Quick add */}
      <AddTodoInput onAdd={handleAdd} />

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {incomplete.map(task => (
          <div key={task.id}>
            <TodoItem
              todo={task}
              subtaskCount={subtaskMap[task.id]?.length}
              subtasksExpanded={expandedIds.has(task.id)}
              onToggle={handleToggle}
              onSelect={setSelectedId}
              onToggleSubtasks={handleToggleSubtasks}
            />
            {expandedIds.has(task.id) && subtaskMap[task.id] && (
              <TodoSubtasks
                subtasks={subtaskMap[task.id]}
                onToggle={handleToggle}
                onSelect={setSelectedId}
              />
            )}
          </div>
        ))}

        {/* Completed section */}
        {completed.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowCompleted(v => !v)}
              className="px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground w-full text-left"
            >
              {showCompleted ? '▾' : '▸'} Show completed ({completed.length})
            </button>
            {showCompleted && completed.map(task => (
              <TodoItem key={task.id} todo={task} onToggle={handleToggle} onSelect={setSelectedId} />
            ))}
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selectedId && (
        <TodoDetailDrawer
          todoId={selectedId}
          lists={lists}
          onClose={() => setSelectedId(null)}
          onUpdate={fetchTasks}
        />
      )}
    </main>
  )
}
