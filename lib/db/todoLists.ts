import { eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { getDb } from './client'
import { todoLists, type TodoList } from './schema'

/**
 * Todo list persistence helpers.
 * Centralizes first-run Inbox creation so server components do not need to call
 * their own HTTP API through a localhost URL.
 */
export async function ensureTodoListsForUser(userId: string): Promise<TodoList[]> {
  const db = getDb()
  let lists = await db.select().from(todoLists).where(eq(todoLists.userId, userId))

  if (lists.length === 0) {
    const [inbox] = await db
      .insert(todoLists)
      .values({ id: createId(), userId, name: 'Inbox' })
      .returning()
    lists = [inbox]
  }

  return lists
}
