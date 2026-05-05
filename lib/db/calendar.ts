// CRUD helpers for calendar tables. No imports from triggers.ts or categories.ts.
import { eq, and, lte, inArray } from 'drizzle-orm'
import { eventCategories, calendarEvents, calendarEventOverrides, icsSubscriptions } from './schema'
import type { DrizzleDb } from './client'
import type { CalendarEventOverride, NewEventCategory, NewCalendarEvent } from './schema'

// ── Event Categories ──────────────────────────────────────────────────────────

export function listEventCategories(db: DrizzleDb, userId: string) {
  return db.select().from(eventCategories).where(eq(eventCategories.userId, userId))
}

export function createEventCategory(db: DrizzleDb, data: NewEventCategory) {
  return db.insert(eventCategories).values(data).returning()
}

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

export function listEventsInRange(db: DrizzleDb, userId: string, _from: Date, to: Date) {
  // Fetch all base event rows whose startAt is before the range end.
  // Repeating events whose base predates rangeFrom are included so the
  // repeat expander can project occurrences into the query window.
  return db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.userId, userId), lte(calendarEvents.startAt, to)))
}

export function createCalendarEvent(db: DrizzleDb, data: NewCalendarEvent) {
  return db.insert(calendarEvents).values(data).returning()
}

export function getCalendarEvent(db: DrizzleDb, id: string, userId: string) {
  return db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
    .limit(1)
}

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

export function deleteCalendarEvent(db: DrizzleDb, id: string, userId: string) {
  return db
    .delete(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
    .returning()
}

// ── ICS Subscriptions ─────────────────────────────────────────────────────────

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

export function getIcsSubscription(db: DrizzleDb, userId: string) {
  return db.select().from(icsSubscriptions).where(eq(icsSubscriptions.userId, userId)).limit(1)
}

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

export function deleteIcsSubscription(db: DrizzleDb, userId: string) {
  return db.delete(icsSubscriptions).where(eq(icsSubscriptions.userId, userId)).returning()
}
