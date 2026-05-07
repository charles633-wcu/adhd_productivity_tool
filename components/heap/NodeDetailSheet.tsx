'use client'

import { useEffect, useRef, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { HeapNode, HeapNodeType } from '@/lib/db/schema'
import type { HeapNodeData } from './HeapNode'

const TYPE_OPTIONS: { value: HeapNodeType; label: string }[] = [
  { value: 'task_cluster', label: 'Tasks' },
  { value: 'note', label: 'Note' },
  { value: 'goal', label: 'Goal' },
  { value: 'reference', label: 'Ref' },
  { value: 'brain_dump', label: 'Dump' },
]

const SWATCHES = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#64748b']

interface NodeDetailSheetProps {
  nodeId: string | null
  onClose: () => void
  onDeleted: (nodeId: string) => void
  onUpdated: (nodeId: string, data: Partial<HeapNodeData>) => void
}

/**
 * NodeDetailSheet — right-side drawer for a Heap (Mind) canvas node.
 * Handles node editing (title, type, color, body), linked tasks (create-and-link
 * or detach), and linked triggers (lazy picker with single-focus fetch, detach).
 */
export function NodeDetailSheet({ nodeId, onClose, onDeleted, onUpdated }: NodeDetailSheetProps) {
  const [node, setNode] = useState<HeapNode | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [linkedTodos, setLinkedTodos] = useState<{ id: string; title: string }[]>([])
  const [newTodoInput, setNewTodoInput] = useState('')
  const [deleteConfirm, setConfirm] = useState(false)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pickerBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Linked triggers state
  const [linkedTriggers, setLinkedTriggers] = useState<{
    id: string; title: string; status: string; nextReviewAt: string | Date; categoryId: string
  }[]>([])
  const [allTriggers, setAllTriggers] = useState<{ id: string; title: string }[]>([])
  const [triggerPickerFetched, setTriggerPickerFetched] = useState(false)
  const [triggerInput, setTriggerInput] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
      if (pickerBlurTimerRef.current) clearTimeout(pickerBlurTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!nodeId) {
      setNode(null)
      setConfirm(false)
      setLinkedTriggers([])
      setAllTriggers([])
      setTriggerPickerFetched(false)
      setTriggerInput('')
      setPickerOpen(false)
      return
    }

    fetch(`/api/heap/nodes/${nodeId}`)
      .then((res) => res.ok ? res.json() : null)
      .then((nextNode: HeapNode | null) => {
        if (!nextNode) return
        setNode(nextNode)
        setTitle(nextNode.title)
        setBody(nextNode.body ?? '')
      })
    fetch(`/api/heap/nodes/${nodeId}/todos`)
      .then((res) => res.ok ? res.json() : [])
      .then(setLinkedTodos)
    fetch(`/api/heap/nodes/${nodeId}/triggers`)
      .then((res) => res.ok ? res.json() : [])
      .then(setLinkedTriggers)

    // Reset picker state on node change
    setAllTriggers([])
    setTriggerPickerFetched(false)
    setTriggerInput('')
    setPickerOpen(false)

    setConfirm(false)
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
  }, [nodeId])

  if (!nodeId || !node) return null
  const currentNodeId = nodeId
  const currentNode = node

  async function patch(fields: Record<string, unknown>) {
    const res = await fetch(`/api/heap/nodes/${currentNodeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    if (!res.ok) return null
    const updated: HeapNode = await res.json()
    setNode(updated)
    return updated
  }

  async function handleTitleBlur() {
    if (title.trim() === currentNode.title) return
    const updated = await patch({ title: title.trim() || currentNode.title })
    if (!updated) {
      toast.error('Failed to save title')
      setTitle(currentNode.title)
      return
    }
    onUpdated(currentNodeId, { title: updated.title })
  }

  async function handleBodyBlur() {
    if (body === (currentNode.body ?? '')) return
    const updated = await patch({ body })
    if (!updated) {
      toast.error('Failed to save notes')
      setBody(currentNode.body ?? '')
    }
  }

  async function handleTypeChange(type: HeapNodeType) {
    await patch({ type })
    setNode((current) => current ? { ...current, type } : current)
    onUpdated(currentNodeId, { type })
  }

  async function handleColorChange(color: string) {
    await patch({ color })
    setNode((current) => current ? { ...current, color } : current)
    onUpdated(currentNodeId, { color })
  }

  async function handleCreateAndLink() {
    if (!newTodoInput.trim()) return
    const res = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTodoInput.trim() }),
    })
    if (!res.ok) {
      toast.error('Failed to create todo')
      return
    }
    const newTodo = await res.json()
    await fetch(`/api/heap/nodes/${currentNodeId}/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ todoId: newTodo.id }),
    })
    setLinkedTodos((current) => [...current, { id: newTodo.id, title: newTodo.title }])
    setNewTodoInput('')
  }

  async function handleDetachTodo(todoId: string) {
    await fetch(`/api/heap/nodes/${currentNodeId}/todos/${todoId}`, { method: 'DELETE' })
    setLinkedTodos((current) => current.filter((todo) => todo.id !== todoId))
  }

  // Unlink a trigger from this node
  async function handleDetachTrigger(triggerId: string) {
    await fetch(`/api/heap/nodes/${currentNodeId}/triggers/${triggerId}`, { method: 'DELETE' })
    setLinkedTriggers((current) => current.filter((t) => t.id !== triggerId))
  }

  // Fetch all active triggers once when the picker is first focused
  async function handleTriggerPickerFocus() {
    if (triggerPickerFetched) return
    const res = await fetch('/api/triggers?status=active')
    if (res.ok) {
      const data = await res.json()
      setAllTriggers(data.map((t: { id: string; title: string }) => ({ id: t.id, title: t.title })))
    }
    setTriggerPickerFetched(true)
  }

  // Link a trigger to this node via POST
  async function handleLinkTrigger(triggerId: string) {
    const res = await fetch(`/api/heap/nodes/${currentNodeId}/triggers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggerId }),
    })
    if (res.ok) {
      const linked = await res.json()
      setLinkedTriggers((current) => [...current, linked])
    }
    setTriggerInput('')
    setPickerOpen(false)
  }

  function handleDeleteClick() {
    if (!deleteConfirm) {
      setConfirm(true)
      resetTimerRef.current = setTimeout(() => setConfirm(false), 3000)
      return
    }
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    fetch(`/api/heap/nodes/${currentNodeId}`, { method: 'DELETE' }).then(() => {
      onDeleted(currentNodeId)
    })
  }

  function handleClose() {
    setConfirm(false)
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    onClose()
  }

  // Filter the picker list by whatever the user has typed
  const filteredTriggers = triggerInput
    ? allTriggers.filter((t) => t.title.toLowerCase().includes(triggerInput.toLowerCase()))
    : allTriggers

  return (
    <div className="absolute top-0 right-0 h-full w-72 bg-card border-l border-border flex flex-col z-[60] shadow-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-medium text-muted-foreground">Node detail</span>
        <button type="button" aria-label="Close" onClick={handleClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={handleTitleBlur}
          maxLength={200}
          className="w-full bg-transparent font-medium text-sm outline-none border-b border-transparent focus:border-border pb-1"
        />

        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Type</p>
          <div className="flex gap-1 flex-wrap">
            {TYPE_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.value}
                onClick={() => handleTypeChange(option.value)}
                className={cn('text-xs px-2 py-1 rounded border transition-colors', node.type === option.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-muted-foreground')}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Color</p>
          <div className="flex gap-2">
            {SWATCHES.map((color) => (
              <button
                type="button"
                key={color}
                onClick={() => handleColorChange(color)}
                style={{ background: color }}
                className={cn('w-5 h-5 rounded-full border-2 transition-all', node.color === color ? 'border-white scale-110' : 'border-transparent')}
                aria-label={`Set color ${color}`}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Notes</p>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onBlur={handleBodyBlur}
            maxLength={10000}
            rows={4}
            placeholder="Add notes..."
            className="w-full bg-transparent text-sm text-muted-foreground outline-none resize-none placeholder:text-muted-foreground/50"
          />
        </div>

        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Linked tasks</p>
          {linkedTodos.map((todo) => (
            <div key={todo.id} className="flex items-center justify-between py-1 gap-2">
              <span className="text-sm truncate">{todo.title}</span>
              <button type="button" onClick={() => handleDetachTodo(todo.id)} className="text-muted-foreground hover:text-destructive flex-shrink-0 text-xs">x</button>
            </div>
          ))}
          <input
            value={newTodoInput}
            onChange={(event) => setNewTodoInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void handleCreateAndLink() }}
            placeholder="Create and link task..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50 mt-1"
            aria-label="Create and link task"
          />
        </div>

        {/* Linked triggers section */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Linked triggers</p>
          {linkedTriggers.length === 0 && (
            <p className="text-xs text-muted-foreground/50 italic mb-2">No linked triggers.</p>
          )}
          {linkedTriggers.map((trigger) => (
            <div key={trigger.id} className="flex items-center justify-between py-1 gap-2">
              <div className="flex flex-col min-w-0">
                <span className="text-sm truncate">{trigger.title}</span>
                <span className="text-[10px] text-muted-foreground/60">
                  due {new Date(trigger.nextReviewAt as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <button
                type="button"
                aria-label="Unlink trigger"
                onClick={() => handleDetachTrigger(trigger.id)}
                className="text-muted-foreground hover:text-destructive flex-shrink-0 text-xs"
              >
                ×
              </button>
            </div>
          ))}
          <div className="relative mt-1">
            <input
              value={triggerInput}
              onChange={(e) => { setTriggerInput(e.target.value); setPickerOpen(true) }}
              onFocus={() => { setPickerOpen(true); void handleTriggerPickerFocus() }}
              onBlur={() => {
                if (pickerBlurTimerRef.current) clearTimeout(pickerBlurTimerRef.current)
                pickerBlurTimerRef.current = setTimeout(() => setPickerOpen(false), 150)
              }}
              placeholder="Link a trigger..."
              aria-label="Link a trigger"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            />
            {pickerOpen && filteredTriggers.length > 0 && (
              <div className="absolute left-0 right-0 top-full bg-popover border border-border rounded-md shadow-lg z-[70] max-h-48 overflow-y-auto">
                {filteredTriggers.slice(0, 10).map((t) => {
                  const isLinked = linkedTriggers.some((lt) => lt.id === t.id)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onMouseDown={() => { if (!isLinked) void handleLinkTrigger(t.id) }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm transition-colors',
                        isLinked ? 'text-muted-foreground/50 cursor-default' : 'hover:bg-muted',
                      )}
                    >
                      {t.title}
                      {isLinked && <span className="ml-2 text-[10px]">linked</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-t border-border">
        <button
          type="button"
          onClick={handleDeleteClick}
          className={cn('flex items-center gap-2 text-sm transition-colors w-full', deleteConfirm ? 'text-destructive font-medium' : 'text-muted-foreground hover:text-destructive')}
        >
          <Trash2 className="w-4 h-4" />
          {deleteConfirm ? 'Tap again to delete' : 'Delete node'}
        </button>
      </div>
    </div>
  )
}
