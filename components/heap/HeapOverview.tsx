'use client'

import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { ProjectCircle } from './ProjectCircle'
import { AgentSuggestButton } from './AgentSuggestButton'
import type { HeapNode } from '@/lib/db/schema'

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
 * Provides a "New Project" FAB, orphan banner, and agent suggest button.
 */
export function HeapOverview({ orphanCount }: HeapOverviewProps) {
  const [projects, setProjects] = useState<ProjectData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/heap/nodes?type=project')
        if (!res.ok) throw new Error('fetch failed')
        const nodes: (HeapNode & { todoCount: number })[] = await res.json()
        if (cancelled) return

        // Fetch child counts for each project in parallel
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

  async function handleNewProject() {
    const res = await fetch('/api/heap/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Project', type: 'project' }),
    })
    if (!res.ok) {
      toast.error('Failed to create project')
      return
    }
    const node: HeapNode = await res.json()
    setProjects((current) => [...current, { id: node.id, title: node.title, color: node.color ?? null, childCount: 0 }])
  }

  return (
    <div className="relative flex-1 overflow-y-auto p-6">
      {/* Orphan banner — dismissible warning for uncategorized nodes */}
      {orphanCount > 0 && !bannerDismissed && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
          <span>You have {orphanCount} uncategorized node{orphanCount !== 1 ? 's' : ''}. They are not visible until assigned to a project.</span>
          <button type="button" aria-label="Dismiss" onClick={() => setBannerDismissed(true)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="mb-6">
        <AgentSuggestButton scope="overview" label="What should I work on?" />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

      {!isLoading && (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 justify-items-center">
          {projects.map((project) => (
            <ProjectCircle
              key={project.id}
              id={project.id}
              title={project.title}
              color={project.color}
              childCount={project.childCount}
            />
          ))}
        </div>
      )}

      {/* New project FAB — fixed to bottom-right */}
      <button
        type="button"
        onClick={handleNewProject}
        className="fixed bottom-6 right-6 z-30 bg-primary text-primary-foreground rounded-full w-14 h-14 flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
        aria-label="New project"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  )
}
