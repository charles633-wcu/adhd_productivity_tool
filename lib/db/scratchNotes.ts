// lib/db/scratchNotes.ts
// Persistence helpers for the triggers-page Quick Notes pad.
// Centralizes scratch-note CRUD + the "promote to /todos" action so route
// handlers stay thin. All functions are userId-scoped by the caller.

import { and, desc, eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { getDb } from './client'
import { scratchNotes, todos, type ScratchNote } from './schema'
import { ensureTodoListsForUser } from './todoLists'

/** All notes for a user, manual order first (sortOrder), newest within ties. */
export async function listScratchNotes(userId: string): Promise<ScratchNote[]> {
  const db = getDb()
  return db
    .select()
    .from(scratchNotes)
    .where(eq(scratchNotes.userId, userId))
    .orderBy(scratchNotes.sortOrder, desc(scratchNotes.createdAt))
}

/** Create a note; sortOrder = current max + 1. Content is trimmed by the caller/route. */
export async function createScratchNote(userId: string, content: string): Promise<ScratchNote> {
  const db = getDb()
  const existing = await db
    .select()
    .from(scratchNotes)
    .where(eq(scratchNotes.userId, userId))
    .orderBy(desc(scratchNotes.sortOrder))
  const nextOrder = existing.length > 0 ? existing[0].sortOrder + 1 : 0
  const [note] = await db
    .insert(scratchNotes)
    .values({ id: createId(), userId, content, sortOrder: nextOrder })
    .returning()
  return note
}

/** Patch content and/or checked. Returns undefined if not owned (no row updated). */
export async function updateScratchNote(
  userId: string,
  id: string,
  patch: { content?: string; checked?: boolean },
): Promise<ScratchNote | undefined> {
  const db = getDb()
  const values: Record<string, unknown> = {}
  if (patch.content !== undefined) values.content = patch.content
  if (patch.checked !== undefined) values.checked = patch.checked ? 1 : 0
  const [note] = await db
    .update(scratchNotes)
    .set(values)
    .where(and(eq(scratchNotes.id, id), eq(scratchNotes.userId, userId)))
    .returning()
  return note
}

/** Delete a note. Returns true if a row was removed (i.e. owned + existed). */
export async function deleteScratchNote(userId: string, id: string): Promise<boolean> {
  const db = getDb()
  const rows = await db
    .delete(scratchNotes)
    .where(and(eq(scratchNotes.id, id), eq(scratchNotes.userId, userId)))
    .returning()
  return rows.length > 0
}

/**
 * Promote a note into the user's Inbox /todos list. Idempotent: if the note is
 * already linked (promotedTodoId set), returns it unchanged without creating a
 * duplicate todo. Returns undefined if the note is not owned / not found.
 */
export async function promoteScratchNote(userId: string, id: string): Promise<ScratchNote | undefined> {
  const db = getDb()
  const [note] = await db
    .select()
    .from(scratchNotes)
    .where(and(eq(scratchNotes.id, id), eq(scratchNotes.userId, userId)))
  if (!note) return undefined
  if (note.promotedTodoId) return note // already promoted — no-op

  const lists = await ensureTodoListsForUser(userId)
  const inbox = lists.find(l => l.name === 'Inbox') ?? lists[0]
  const [todo] = await db
    .insert(todos)
    .values({ id: createId(), userId, listId: inbox.id, title: note.content })
    .returning()

  const [updated] = await db
    .update(scratchNotes)
    .set({ promotedTodoId: todo.id })
    .where(and(eq(scratchNotes.id, id), eq(scratchNotes.userId, userId)))
    .returning()
  return updated
}
