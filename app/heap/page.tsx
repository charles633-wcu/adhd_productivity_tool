export const dynamic = 'force-dynamic'

import { ReactFlowProvider } from '@xyflow/react'
import { AppHeader } from '@/components/AppHeader'
import { HeapCanvas } from '@/components/heap/HeapCanvas'
import { getCurrentUser } from '@/lib/auth'
import { ensureTodoListsForUser } from '@/lib/db/todoLists'

export default async function HeapPage() {
  const user = await getCurrentUser()
  await ensureTodoListsForUser(user.id)

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <AppHeader active="heap" />
      <div className="relative flex-1 overflow-hidden">
        <ReactFlowProvider>
          <HeapCanvas />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
