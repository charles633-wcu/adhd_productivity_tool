'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Todo } from '@/lib/db/schema'

interface HeapTodoOverlayProps {
  selectedNodeId: string | null
  selectedNodeTitle: string | null
  onClose: () => void
}

type OverlayState = 'minimized' | 'open'

export function HeapTodoOverlay({ selectedNodeId, selectedNodeTitle, onClose }: HeapTodoOverlayProps) {
  const [panelState, setPanelState] = useState<OverlayState>('minimized')
  const [todos, setTodos] = useState<Todo[]>([])
  const [addInput, setAddInput] = useState('')

  useEffect(() => {
    if (selectedNodeId) setPanelState('open')
  }, [selectedNodeId])

  useEffect(() => {
    if (panelState === 'minimized') return
    const url = selectedNodeId
      ? `/api/heap/nodes/${selectedNodeId}/todos`
      : '/api/todos?view=all'
    fetch(url).then((res) => res.ok ? res.json() : []).then(setTodos).catch(() => {})
  }, [panelState, selectedNodeId])

  async function handleQuickAdd() {
    if (!addInput.trim()) return
    const res = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: addInput.trim() }),
    })
    if (!res.ok) {
      toast.error('Set up your Inbox first')
      return
    }
    const newTodo: Todo = await res.json()
    if (selectedNodeId) {
      const linkRes = await fetch(`/api/heap/nodes/${selectedNodeId}/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ todoId: newTodo.id }),
      })
      if (!linkRes.ok) {
        toast.error('Failed to link task')
        return
      }
    }
    setTodos((current) => [...current, newTodo])
    setAddInput('')
  }

  const incompleteTodos = todos.filter((todo) => todo.completed === 0)

  if (panelState === 'minimized') {
    return (
      <button
        type="button"
        onClick={() => setPanelState('open')}
        aria-label="Open tasks"
        className="absolute bottom-6 right-6 z-40 bg-primary text-primary-foreground rounded-full px-4 py-2 text-sm flex items-center gap-2 shadow-lg hover:bg-primary/90 transition-colors"
      >
        {incompleteTodos.length} tasks <ChevronUp className="w-3 h-3" />
      </button>
    )
  }

  return (
    <div className="absolute top-0 right-0 h-full w-72 bg-card/95 border-l border-border flex flex-col z-40 shadow-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-foreground">
          {selectedNodeId ? (selectedNodeTitle ?? 'Node tasks') : 'Tasks'}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Minimize tasks" onClick={() => setPanelState('minimized')} className="text-muted-foreground hover:text-foreground">
            <ChevronDown className="w-4 h-4" />
          </button>
          {selectedNodeId && (
            <button type="button" aria-label="Close tasks" onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {incompleteTodos.map((todo) => (
          <div key={todo.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/40 hover:bg-muted/50">
            <input
              type="checkbox"
              className="accent-primary flex-shrink-0"
              onChange={async (event) => {
                const checked = event.target.checked
                const res = await fetch(`/api/todos/${todo.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ completed: checked }),
                })
                if (!res.ok) {
                  toast.error('Failed to update task')
                  event.target.checked = !checked
                  return
                }
                setTodos((current) => current.map((item) => item.id === todo.id ? { ...item, completed: checked ? 1 : 0 } : item))
              }}
            />
            <span className="text-sm truncate">{todo.title}</span>
          </div>
        ))}
      </div>

      <div className="px-4 py-3 border-t border-border">
        <input
          value={addInput}
          onChange={(event) => setAddInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') void handleQuickAdd() }}
          placeholder="Add task..."
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
        />
      </div>
    </div>
  )
}
