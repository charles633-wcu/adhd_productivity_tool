'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { ProjectCircle } from './ProjectCircle'
import { AgentSuggestButton } from './AgentSuggestButton'
import { OrphanSheet } from './OrphanSheet'
import type { HeapNode } from '@/lib/db/schema'

const COLOR_SWATCHES = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#64748b']

interface ProjectData {
  id: string
  title: string
  color: string | null
  childCount: number
}

interface HeapOverviewProps {
  orphanCount: number
}

/**
 * HeapOverview — level-1 grid of project circles.
 * Fetches all project-type nodes, resolves child counts, and renders the grid.
 * Provides a "New Project" FAB with name + color form, inline rename on each circle,
 * orphan banner, and a small agent suggest button.
 */
export function HeapOverview({ orphanCount }: HeapOverviewProps) {
  const [projects, setProjects] = useState<ProjectData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [showOrphanSheet, setShowOrphanSheet] = useState(false)
  const [liveOrphanCount, setLiveOrphanCount] = useState(orphanCount)

  // Create form state
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newColor, setNewColor] = useState(COLOR_SWATCHES[0])
  const [creating, setCreating] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Agent button visibility
  const [showAgent, setShowAgent] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/heap/nodes?type=project')
        if (!res.ok) throw new Error('fetch failed')
        const nodes: (HeapNode & { todoCount: number })[] = await res.json()
        if (cancelled) return

        const counts = await Promise.all(
          nodes.map(async (project) => {
            const childRes = await fetch(`/api/heap/nodes?projectId=${encodeURIComponent(project.id)}`)
            const children: unknown[] = childRes.ok ? await childRes.json() : []
            return { id: project.id, count: children.length }
          })
        )
        if (cancelled) return

        const countMap = new Map(counts.map((c) => [c.id, c.count]))
        setProjects(nodes.map((n) => ({
          id: n.id,
          title: n.title,
          color: n.color ?? null,
          childCount: countMap.get(n.id) ?? 0,
        })))
      } catch {
        toast.error('Failed to load projects')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [])

  // Auto-focus the title input when create form opens
  useEffect(() => {
    if (showCreate) {
      setTimeout(() => titleInputRef.current?.focus(), 50)
    }
  }, [showCreate])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newTitle.trim()
    if (!trimmed) return
    setCreating(true)
    try {
      const res = await fetch('/api/heap/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed, type: 'project', color: newColor }),
      })
      if (!res.ok) { toast.error('Failed to create project'); return }
      const node: HeapNode = await res.json()
      setProjects((curr) => [...curr, { id: node.id, title: node.title, color: node.color ?? null, childCount: 0 }])
      setNewTitle('')
      setNewColor(COLOR_SWATCHES[0])
      setShowCreate(false)
    } finally {
      setCreating(false)
    }
  }

  async function handleRename(id: string, title: string) {
    const res = await fetch(`/api/heap/nodes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    if (!res.ok) { toast.error('Failed to rename project'); return }
    setProjects((curr) => curr.map((p) => p.id === id ? { ...p, title } : p))
  }

  return (
    <div className="relative flex-1 overflow-y-auto p-6">
      {/* Orphan banner */}
      {liveOrphanCount > 0 && !bannerDismissed && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
          <span>
            You have {liveOrphanCount} uncategorized node{liveOrphanCount !== 1 ? 's' : ''} not assigned to any project.
          </span>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            <button
              type="button"
              onClick={() => setShowOrphanSheet(true)}
              className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-1 text-xs font-medium text-yellow-400 hover:bg-yellow-500/20 transition-colors"
            >
              View &amp; assign
            </button>
            <button type="button" aria-label="Dismiss" onClick={() => setBannerDismissed(true)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <OrphanSheet
        open={showOrphanSheet}
        onClose={() => setShowOrphanSheet(false)}
        onAssigned={() => setLiveOrphanCount((c) => Math.max(0, c - 1))}
      />

      {/* Page header row */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Projects</h2>
        <button
          type="button"
          aria-label="What should I work on?"
          title="What should I work on?"
          onClick={() => setShowAgent((v) => !v)}
          className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Ask AI
        </button>
      </div>

      {/* Agent panel — shown only when toggled */}
      {showAgent && (
        <div className="mb-6">
          <AgentSuggestButton scope="overview" label="What should I work on?" />
        </div>
      )}

      {/* Create project inline form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-xl border border-border bg-card p-4 flex flex-col gap-3"
        >
          <p className="text-sm font-medium text-foreground">New project</p>
          <input
            ref={titleInputRef}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Project name…"
            maxLength={200}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            onKeyDown={(e) => { if (e.key === 'Escape') { setShowCreate(false); setNewTitle('') } }}
          />
          {/* Color swatches */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Color</span>
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => setNewColor(c)}
                className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                style={{ background: c, borderColor: newColor === c ? '#fff' : c }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating || !newTitle.trim()}
              className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => { setShowCreate(false); setNewTitle('') }}
              className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

      {!isLoading && projects.length === 0 && !showCreate && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <p className="text-sm">No projects yet.</p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="text-sm text-primary hover:underline"
          >
            Create your first project
          </button>
        </div>
      )}

      {!isLoading && projects.length > 0 && (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 justify-items-center">
          {projects.map((project) => (
            <ProjectCircle
              key={project.id}
              id={project.id}
              title={project.title}
              color={project.color}
              childCount={project.childCount}
              onRename={(title) => handleRename(project.id, title)}
            />
          ))}
        </div>
      )}

      {/* New project FAB */}
      {!showCreate && (
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="fixed bottom-6 right-6 z-30 bg-primary text-primary-foreground rounded-full w-14 h-14 flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
          aria-label="New project"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}
    </div>
  )
}
