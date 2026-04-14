// Trigger CRUD functions — all DB operations for the triggers table.
// Accepts a DrizzleDb instance so tests can inject an in-memory DB.
// All functions are async and return full Trigger objects.

import { eq, asc } from 'drizzle-orm'
import { triggers, type NewTrigger, type Trigger } from './schema'
import type { DrizzleDb } from './client'

/**
 * Inserts a new trigger. Validates that title is non-empty.
 * Returns the full trigger row including the generated cuid id.
 */
export async function createTrigger(db: DrizzleDb, data: NewTrigger): Promise<Trigger> {
  // Validate: title must not be empty
  if (!data.title || data.title.trim().length === 0) {
    throw new Error('Trigger title must not be empty')
  }
  const [row] = await db.insert(triggers).values(data).returning()
  return row
}

/**
 * Marks a trigger as acknowledged by the user.
 * Resets last_reviewed_at = now and recalculates next_review_at = now + interval.
 * Note: two queries by design — Drizzle cannot reference existing column values in .set().
 * updatedAt is handled automatically by the .$onUpdate() hook defined in schema.ts.
 */
export async function acknowledgeTrigger(db: DrizzleDb, triggerId: string): Promise<Trigger> {
  // Fetch current trigger to read review_interval_days before updating
  const [trigger] = await db
    .select()
    .from(triggers)
    .where(eq(triggers.id, triggerId))
    .limit(1)

  if (!trigger) throw new Error(`Trigger ${triggerId} not found`)

  const now = new Date()
  // Add a 65-minute grace on top of the interval so the trigger always escapes the
  // "due within 24h" review window after being acknowledged. Without this, a 1-day
  // trigger lands exactly ON the boundary and stays visible in the banner forever.
  const intervalMs = trigger.reviewIntervalDays * 24 * 60 * 60 * 1000
  const graceMs    = 65 * 60 * 1000  // 65 minutes
  const nextReviewAt = new Date(now.getTime() + intervalMs + graceMs)

  // Write last_reviewed_at, next_review_at, and updated_at
  const [updated] = await db
    .update(triggers)
    .set({ lastReviewedAt: now, nextReviewAt })
    .where(eq(triggers.id, triggerId))
    .returning()

  return updated
}

/**
 * Returns all triggers for a category, sorted by priority ASC then next_review_at ASC.
 * Secondary sort ensures deterministic order when multiple triggers share a priority.
 */
export async function getTriggersForCategory(db: DrizzleDb, categoryId: string): Promise<Trigger[]> {
  return db
    .select()
    .from(triggers)
    .where(eq(triggers.categoryId, categoryId))
    .orderBy(asc(triggers.priority), asc(triggers.nextReviewAt))
}

/**
 * Directly overrides nextReviewAt for a trigger (one-time anchor override).
 * Does NOT touch lastReviewedAt or reviewIntervalDays — this is not an acknowledgement.
 * Subsequent acknowledgeTrigger calls will compute from the new anchor as normal.
 */
export async function rescheduleTrigger(
  db: DrizzleDb,
  triggerId: string,
  date: Date
): Promise<Trigger> {
  const [updated] = await db
    .update(triggers)
    .set({ nextReviewAt: date })
    .where(eq(triggers.id, triggerId))
    .returning()

  if (!updated) throw new Error(`Trigger ${triggerId} not found`)
  return updated
}
