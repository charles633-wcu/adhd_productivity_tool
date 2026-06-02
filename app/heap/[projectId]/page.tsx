// ProjectCanvasPage — server component for /heap/[projectId].
// Loads the project node (ownership-checked), renders ProjectHeader and a
// ReactFlow canvas scoped to this project's nodes. The project node itself
// is passed as a prop so HeapCanvas can render it as the root circle.
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { ReactFlowProvider } from '@xyflow/react'
import { AppHeader } from '@/components/AppHeader'
import { HeapCanvas } from '@/components/heap/HeapCanvas'
import { ProjectHeader } from '@/components/heap/ProjectHeader'
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

  const [project] = await db.select()
    .from(heapNodes)
    .where(and(eq(heapNodes.id, projectId), eq(heapNodes.userId, user.id)))

  if (!project || project.type !== 'project') notFound()

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <AppHeader active="heap" />
      <ProjectHeader projectId={project.id} title={project.title} color={project.color ?? null} />
      <div className="relative flex-1 overflow-hidden">
        <ReactFlowProvider>
          <HeapCanvas projectId={projectId} projectNode={project} />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
