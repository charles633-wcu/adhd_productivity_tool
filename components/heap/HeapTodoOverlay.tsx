'use client'

/**
 * HeapTodoOverlay — project-scoped task panel for the Mind canvas.
 * Shows todos linked to the project root node (not individual canvas nodes).
 * Stays hidden until the user explicitly opens it via the "Tasks" button.
 * Includes an "Import" picker to pull in existing todos from the To-Dos feature.
 */

import { useEffect, useState } from 'react'
import { CheckSquare, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Todo } from '@/lib/db/schema'

interface HeapTodoOverlayProps {
  projectNodeId: string
  projectTitle: string
}

export function HeapTodoOverlay({ projectNodeId, projectTitle }: HeapTodoOverlayProps) {
  const [open, setOpen] = useState(false)
  const [todos, setTodos] = useState<Todo[]>([])
  const [showImport, setShowImport] = useState(false)
  const [importCandidates, setImportCandidates] = useState<Todo[]>([])
  const [loadingImport, setLoadingImport] = useState(false)

  // Fetch project todos on mount so the badge count is accurate without opening the panel
  useEffect(() => {
    fetch(`/api/heap/nodes/${projectNodeId}/todos`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Todo[]) => setTodos(data))
      .catch(() => {})
  }, [projectNodeId])

  const incompleteTodos = todos.filter((t) => t.completed === 0)

  async function handleOpenImport() {
    setLoadingImport(true)
    try {
      const [allRes, linkedRes] = await Promise.all([
        fetch('/api/todos?view=all'),
        fetch(`/api/heap/nodes/${projectNodeId}/todos`),
      ])
      const [all, linked]: [Todo[], Todo[]] = await Promise.all([
        allRes.ok ? allRes.json() : [],
        linkedRes.ok ? linkedRes.json() : [],
      ])
      setTodos(linked)
      const linkedIds = new Set((linked as Todo[]).map((t) => t.id))
      setImportCandidates((all as Todo[]).filter((t) => !linkedIds.has(t.id)))
      setShowImport(true)
    } catch {
      toast.error('Failed to load tasks')
    } finally {
      setLoadingImport(false)
    }
  }

  async function handleLink(todo: Todo) {
    const res = await fetch(`/api/heap/nodes/${projectNodeId}/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ todoId: todo.id }),
    })
    if (!res.ok) { toast.error('Failed to link task'); return }
    setTodos((prev) => [...prev, todo])
    setImportCandidates((prev) => prev.filter((t) => t.id !== todo.id))
  }

  async function handleUnlink(todoId: string) {
    const res = await fetch(`/api/heap/nodes/${projectNodeId}/todos/${todoId}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to unlink task'); return }
    setTodos((prev) => prev.filter((t) => t.id !== todoId))
  }

  // Minimized toggle button — positioned above the AddNodeFab
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open project tasks"
        className="absolute bottom-24 right-6 z-30 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground shadow-lg hover:text-foreground hover:border-primary transition-colors"
      >
        <CheckSquare className="w-3.5 h-3.5" />
        Tasks{incompleteTodos.length > 0 ? ` (${incompleteTodos.length})` : ''}
      </button>
    )
  }

  return (
    <div className="absolute top-0 right-0 h-full w-72 bg-card/97 border-l border-border flex flex-col z-40 shadow-xl">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <span className="flex-1 truncate text-sm font-semibold text-foreground">
          {projectTitle} — Tasks
        </span>
        <button
          type="button"
          aria-label="Import from To-Dos"
          title="Import from To-Dos"
          onClick={handleOpenImport}
          disabled={loadingImport}
          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          type="button"
          aria-label="Close tasks"
          onClick={() => { setOpen(false); setShowImport(false) }}
          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Import picker */}
      {showImport && (
        <div className="border-b border-border bg-muted/20 flex flex-col gap-1 px-3 py-2 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium text-muted-foreground">Import from To-Dos</p>
            <button
              type="button"
              onClick={() => setShowImport(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Done
            </button>
          </div>
          {importCandidates.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">No more tasks to import.</p>
          ) : (
            <div className="max-h-44 overflow-y-auto flex flex-col gap-0.5">
              {importCandidates.map((todo) => (
                <button
                  key={todo.id}
                  type="button"
                  onClick={() => handleLink(todo)}
                  className="flex items-center gap-2 w-full rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted transition-colors"
                >
                  <Plus className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="truncate">{todo.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {todos.length === 0 && !showImport && (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
            <p className="text-xs">No tasks linked to this project.</p>
            <button
              type="button"
              onClick={handleOpenImport}
              className="text-xs text-primary hover:underline"
            >
              Import from To-Dos
            </button>
          </div>
        )}
        {todos.map((todo) => (
          <div
            key={todo.id}
            className="group flex items-center gap-3 px-4 py-2.5 border-b border-border/40 hover:bg-muted/40 transition-colors"
          >
            <div
              className={cn(
                'w-3.5 h-3.5 rounded-sm border shrink-0',
                todo.completed !== 0
                  ? 'border-primary/40 bg-primary/20'
                  : 'border-border',
              )}
            />
            <span
              className={cn(
                'flex-1 truncate text-sm',
                todo.completed !== 0 && 'line-through text-muted-foreground',
              )}
            >
              {todo.title}
            </span>
            <button
              type="button"
              aria-label="Remove from project"
              onClick={() => handleUnlink(todo.id)}
              className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-muted-foreground hover:text-destructive transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
