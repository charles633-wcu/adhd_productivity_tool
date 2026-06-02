'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { HeapNode, HeapNodeType } from '@/lib/db/schema'

const TYPE_LABELS: Record<HeapNodeType, string> = {
  task_cluster: 'Tasks',
  note: 'Note',
  goal: 'Goal',
  reference: 'Ref',
  brain_dump: 'Idea',
  project: 'Project',
}

interface OrphanSheetProps {
  open: boolean
  onClose: () => void
  /** Called after a node is successfully assigned, so the overview can recount orphans */
  onAssigned?: () => void
}

/**
 * OrphanSheet — right-side drawer listing nodes that have no project assignment.
 * Each row shows the node's type and title with a project dropdown + Assign button.
 */
export function OrphanSheet({ open, onClose, onAssigned }: OrphanSheetProps) {
  const [orphans, setOrphans] = useState<HeapNode[]>([])
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([])
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [assigning, setAssigning] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    Promise.all([
      fetch('/api/heap/nodes').then((r) => r.json()),
      fetch('/api/heap/nodes?type=project').then((r) => r.json()),
    ])
      .then(([allNodes, projectNodes]: [HeapNode[], HeapNode[]]) => {
        const orphanNodes = (allNodes as HeapNode[]).filter(
          (n) => n.projectId === null && n.type !== 'project',
        )
        const projectList = (projectNodes as HeapNode[]).map((p) => ({ id: p.id, title: p.title }))
        setOrphans(orphanNodes)
        setProjects(projectList)
        // Pre-select the first available project for each orphan
        const firstId = projectList[0]?.id ?? ''
        const initial: Record<string, string> = {}
        for (const n of orphanNodes) initial[n.id] = firstId
        setSelections(initial)
      })
      .catch(() => toast.error('Failed to load nodes'))
      .finally(() => setLoading(false))
  }, [open])

  async function handleAssign(nodeId: string) {
    const projectId = selections[nodeId]
    if (!projectId) { toast.error('Select a project first'); return }
    setAssigning((prev) => ({ ...prev, [nodeId]: true }))
    try {
      const res = await fetch(`/api/heap/nodes/${nodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!res.ok) { toast.error('Failed to assign node'); return }
      setOrphans((prev) => prev.filter((n) => n.id !== nodeId))
      onAssigned?.()
    } finally {
      setAssigning((prev) => ({ ...prev, [nodeId]: false }))
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
        <SheetHeader className="px-4 py-4 border-b border-border shrink-0">
          <SheetTitle>
            Unassigned nodes{!loading ? ` (${orphans.length})` : ''}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}

          {!loading && projects.length === 0 && orphans.length > 0 && (
            <p className="text-sm text-yellow-400 mb-4">
              Create a project first — then come back here to assign these nodes.
            </p>
          )}

          {!loading && orphans.length === 0 && (
            <p className="text-sm text-muted-foreground">All nodes are assigned to a project.</p>
          )}

          <ul className="flex flex-col gap-3">
            {orphans.map((node) => (
              <li
                key={node.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {TYPE_LABELS[node.type]}
                  </span>
                  <span className="flex-1 truncate text-sm text-foreground">{node.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selections[node.id] ?? ''}
                    onChange={(e) =>
                      setSelections((prev) => ({ ...prev, [node.id]: e.target.value }))
                    }
                    disabled={projects.length === 0}
                    className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  >
                    {projects.length === 0 ? (
                      <option value="">No projects yet</option>
                    ) : (
                      projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))
                    )}
                  </select>
                  <button
                    type="button"
                    disabled={assigning[node.id] || !selections[node.id]}
                    onClick={() => handleAssign(node.id)}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {assigning[node.id] ? '…' : 'Assign'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  )
}
