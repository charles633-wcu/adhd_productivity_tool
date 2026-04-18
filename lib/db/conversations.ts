// Conversation persistence — save and list user chat histories.
// Accepts DrizzleDb so tests can inject in-memory DB.

import { eq, desc } from 'drizzle-orm'
import { conversations, type NewConversation, type Conversation } from './schema'
import type { DrizzleDb } from './client'

/**
 * Persists a conversation to the DB.
 * Caller is responsible for truncating title to 60 chars before calling.
 */
export async function saveConversation(
  db: DrizzleDb,
  data: NewConversation
): Promise<Conversation> {
  const [row] = await db.insert(conversations).values(data).returning()
  return row
}

/**
 * Returns all saved conversations for a user, newest first.
 * Only returns id, title, createdAt — messages JSON excluded for list efficiency.
 */
export async function listConversations(
  db: DrizzleDb,
  userId: string
): Promise<Pick<Conversation, 'id' | 'title' | 'createdAt'>[]> {
  return db
    .select({ id: conversations.id, title: conversations.title, createdAt: conversations.createdAt })
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.createdAt))
}
