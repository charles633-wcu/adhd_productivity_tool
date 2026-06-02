// CRUD helpers for calendar tables. No imports from triggers.ts or categories.ts.
import { eq, and, lte, inArray } from 'drizzle-orm'
import { eventCategories, calendarEvents, calendarEventOverrides, icsSubscriptions } from './schema'
import type { DrizzleDb } from './client'
import type { CalendarEventOverride, NewEventCategory, NewCalendarEvent } from './schema'

// ── Event Categories ──────────────────────────────────────────────────────────

/**
 * Lists event categories owned by a user.
 * @param db - Database client used for the query.
 * @param userId - Owner identifier used to restrict the result set.
 * @returns A query promise resolving to matching event category rows.
 */
export function listEventCategories(db: DrizzleDb, userId: string) {
  return db.select().from(eventCategories).where(eq(eventCategories.userId, userId))
}

/**
 * Inserts one calendar event category.
 * @param db - Database client used for the insert.
 * @param data - Complete category values to persist, including its owner.
 * @returns A query promise resolving to the inserted category row array.
 */
export function createEventCategory(db: DrizzleDb, data: NewEventCategory) {
  return db.insert(eventCategories).values(data).returning()
}

/**
 * Updates editable fields on one category owned by a user.
 * @param db - Database client used for the update.
 * @param id - Category identifier.
 * @param userId - Owner identifier required for the update to match.
 * @param patch - Optional `name` and/or `color` replacements.
 * @returns A query promise resolving to updated rows, empty when not found.
 */
export function updateEventCategory(
  db: DrizzleDb,
  id: string,
  userId: string,
  patch: Partial<Pick<NewEventCategory, 'name' | 'color'>>,
) {
  return db
    .update(eventCategories)
    .set(patch)
    .where(and(eq(eventCategories.id, id), eq(eventCategories.userId, userId)))
    .returning()
}

/**
 * Removes a user's category after clearing it from that user's calendar events.
 * @param db - Database client used for both updates.
 * @param id - Category identifier.
 * @param userId - Owner identifier required for affected rows.
 * @returns A promise resolving to deleted category rows, empty when not found.
 */
export async function deleteEventCategory(db: DrizzleDb, id: string, userId: string) {
  // Null out categoryId on affected events before deleting (API-layer cascade per spec)
  await db
    .update(calendarEvents)
    .set({ categoryId: null })
    .where(and(eq(calendarEvents.categoryId, id), eq(calendarEvents.userId, userId)))
  return db
    .delete(eventCategories)
    .where(and(eq(eventCategories.id, id), eq(eventCategories.userId, userId)))
    .returning()
}

// ── Calendar Events ───────────────────────────────────────────────────────────

/**
 * Loads base events eligible to yield occurrences through an end date.
 * @param db - Database client used for the query.
 * @param userId - Owner identifier used to restrict rows.
 * @param _from - Requested range start; recurrence filtering occurs after expansion.
 * @param to - Inclusive upper bound for base event start times.
 * @returns A query promise resolving to candidate calendar event rows.
 */
export function listEventsInRange(db: DrizzleDb, userId: string, _from: Date, to: Date) {
  // Fetch all base event rows whose startAt is before the range end.
  // Repeating events whose base predates rangeFrom are included so the
  // repeat expander can project occurrences into the query window.
  return db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.userId, userId), lte(calendarEvents.startAt, to)))
}

/**
 * Inserts one base calendar event.
 * @param db - Database client used for the insert.
 * @param data - Complete calendar event values to persist.
 * @returns A query promise resolving to the inserted event row array.
 */
export function createCalendarEvent(db: DrizzleDb, data: NewCalendarEvent) {
  return db.insert(calendarEvents).values(data).returning()
}

/**
 * Looks up one event belonging to a user.
 * @param db - Database client used for the query.
 * @param id - Event identifier.
 * @param userId - Owner identifier required for the row to match.
 * @returns A query promise resolving to zero or one calendar event row.
 */
export function getCalendarEvent(db: DrizzleDb, id: string, userId: string) {
  return db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
    .limit(1)
}

/**
 * Applies a partial update to one owned base event.
 * @param db - Database client used for the update.
 * @param id - Event identifier.
 * @param userId - Owner identifier required for the update to match.
 * @param patch - Calendar event fields to replace.
 * @returns A query promise resolving to updated rows, empty when not found.
 */
export function updateCalendarEvent(
  db: DrizzleDb,
  id: string,
  userId: string,
  patch: Partial<NewCalendarEvent>,
) {
  return db
    .update(calendarEvents)
    .set(patch)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
    .returning()
}

/**
 * Deletes one owned base event.
 * @param db - Database client used for the deletion.
 * @param id - Event identifier.
 * @param userId - Owner identifier required for the deletion to match.
 * @returns A query promise resolving to deleted rows, empty when not found.
 */
export function deleteCalendarEvent(db: DrizzleDb, id: string, userId: string) {
  return db
    .delete(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
    .returning()
}

/**
 * Loads occurrence overrides for a set of recurrence masters.
 * @param db - Database client used for the query.
 * @param ids - Master event identifiers; an empty array avoids a query.
 * @returns Override rows for the supplied masters.
 */
export function listEventOverridesForIds(
  db: DrizzleDb,
  ids: string[],
): CalendarEventOverride[] {
  if (ids.length === 0) return []
  return db
    .select()
    .from(calendarEventOverrides)
    .where(inArray(calendarEventOverrides.masterEventId, ids))
    .all()
}

/**
 * Retrieves a user's imported ICS subscription.
 * @param db - Database client used for the query.
 * @param userId - User whose single subscription is requested.
 * @returns A query promise resolving to zero or one subscription row.
 */
export function getIcsSubscription(db: DrizzleDb, userId: string) {
  return db.select().from(icsSubscriptions).where(eq(icsSubscriptions.userId, userId)).limit(1)
}

/**
 * Creates or replaces a user's single ICS subscription record.
 * @param db - Database client used for the upsert.
 * @param userId - Subscription owner identifier.
 * @param url - Remote ICS calendar URL.
 * @param cachedEventsJson - Optional serialized fetched event cache.
 * @param lastFetchedAt - Optional timestamp for the cached fetch.
 * @returns A query promise resolving to the inserted or updated subscription row array.
 */
export function upsertIcsSubscription(
  db: DrizzleDb,
  userId: string,
  url: string,
  cachedEventsJson?: string,
  lastFetchedAt?: Date,
) {
  return db
    .insert(icsSubscriptions)
    .values({ userId, url, cachedEventsJson, lastFetchedAt })
    .onConflictDoUpdate({
      target: icsSubscriptions.userId,
      set: { url, cachedEventsJson, lastFetchedAt, updatedAt: new Date() },
    })
    .returning()
}

/**
 * Deletes the ICS subscription owned by a user.
 * @param db - Database client used for the deletion.
 * @param userId - Subscription owner identifier.
 * @returns A query promise resolving to deleted rows, empty when none existed.
 */
export function deleteIcsSubscription(db: DrizzleDb, userId: string) {
  return db.delete(icsSubscriptions).where(eq(icsSubscriptions.userId, userId)).returning()
}
