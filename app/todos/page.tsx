// /todos page: server component shell.
// Fetches lists server-side and renders the two-panel layout.
// Triggers lazy Inbox creation directly through the DB helper if the user has no lists yet.
export const dynamic = 'force-dynamic'

import { getCurrentUser } from '@/lib/auth'
import { ensureTodoListsForUser } from '@/lib/db/todoLists'
import { TodoSidebar } from '@/components/todos/TodoSidebar'
import { TodoList } from '@/components/todos/TodoList'
import { AppHeader } from '@/components/AppHeader'

export default async function TodosPage() {
  const user = await getCurrentUser()
  const lists = await ensureTodoListsForUser(user.id)

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
