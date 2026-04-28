'use client'

// TodoList — main task list panel (stub; full implementation in Task 7).
// Receives the user's todo lists and will render todos filtered by the active
// view / listId from URL search params once the real implementation lands.

import type { TodoList as TodoListType } from '@/lib/db/schema'

interface TodoListProps {
  lists: TodoListType[]
}

export function TodoList({ lists: _ }: TodoListProps) {
  return (
    <main className="flex-1 flex flex-col overflow-hidden items-center justify-center">
      <p className="text-muted-foreground text-sm">Loading tasks...</p>
    </main>
  )
}
