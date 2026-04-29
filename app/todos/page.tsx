// /todos page: server component shell.
// Fetches lists server-side and renders the two-panel layout.
// Triggers lazy Inbox creation via the API if the user has no lists yet.
export const dynamic = 'force-dynamic'

import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { todoLists } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { TodoSidebar } from '@/components/todos/TodoSidebar'
import { TodoList } from '@/components/todos/TodoList'
import { AppHeader } from '@/components/AppHeader'

export default async function TodosPage() {
  const user = await getCurrentUser()
  const db = getDb()
  let lists = await db.select().from(todoLists).where(eq(todoLists.userId, user.id))

  if (lists.length === 0) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/todo-lists`)
    if (res.ok) lists = await res.json()
  }

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden pt-[60px]">
      <AppHeader active="todos" />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <TodoSidebar lists={lists} />
        <TodoList lists={lists} />
      </div>
    </div>
  )
}
