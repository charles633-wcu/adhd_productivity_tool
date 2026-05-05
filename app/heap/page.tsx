export const dynamic = 'force-dynamic'

import { AppHeader } from '@/components/AppHeader'
import { HeapCanvas } from '@/components/heap/HeapCanvas'
import { getCurrentUser } from '@/lib/auth'

export default async function HeapPage() {
  await getCurrentUser()
  await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/todo-lists`)

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <AppHeader active="heap" />
      <div className="relative flex-1 overflow-hidden">
        <HeapCanvas />
      </div>
    </div>
  )
}
