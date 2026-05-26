// ProjectCanvasPage — server component for /heap/[projectId].
// Loads the project node from the DB (ownership-checked), then renders
// the ProjectHeader, AgentSuggestButton, and a ReactFlow canvas scoped
// to this project's nodes only.
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { ReactFlowProvider } from '@xyflow/react'
import { AppHeader } from '@/components/AppHeader'
import { HeapCanvas } from '@/components/heap/HeapCanvas'
import { ProjectHeader } from '@/components/heap/ProjectHeader'
import { AgentSuggestButton } from '@/components/heap/AgentSuggestButton'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { heapNodes } from '@/lib/db/schema'
import { ensureTodoListsForUser } from '@/lib/db/todoLists'

type Props = { params: Promise<{ projectId: string }> }

export default async function ProjectCanvasPage({ params }: Props) {
  const { projectId } = await params
  const user = await getCurrentUser()
  await ensureTodoListsForUser(user.id)

  const db = getDb()

  // Load project node — ownership check (userId) prevents IDOR
  const [project] = await db.select()
    .from(heapNodes)
    .where(and(eq(heapNodes.id, projectId), eq(heapNodes.userId, user.id)))

  // 404 if not found or if the node is not a project type
  if (!project || project.type !== 'project') notFound()

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <AppHeader active="heap" />
      <ProjectHeader projectId={project.id} title={project.title} color={project.color ?? null} />
      {/* Position agent button below AppHeader (h-16) in the top-right corner */}
      <div className="absolute top-16 right-6 z-30">
        <AgentSuggestButton scope="project" projectId={projectId} label="What's next in here?" />
      </div>
      <div className="relative flex-1 overflow-hidden">
        <ReactFlowProvider>
          <HeapCanvas projectId={projectId} />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
