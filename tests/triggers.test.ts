// Trigger CRUD tests — uses an in-memory SQLite DB with real migrations applied.
// Each test gets a fresh DB, user, and category via beforeEach to ensure isolation.
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTrigger, acknowledgeTrigger, getTriggersForCategory, rescheduleTrigger } from '@/lib/db/triggers'
import type { NewTrigger } from '@/lib/db/schema'

// Use an in-memory SQLite DB for tests — no file on disk, fast and isolated
function makeTestDb() {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './lib/db/migrations' })
  return db
}

let db: ReturnType<typeof makeTestDb>
let userId: string
let categoryId: string

beforeEach(async () => {
  db = makeTestDb()
  // Seed a user and category for each test
  const [user] = await db.insert(schema.users).values({ email: 'test@test.com' }).returning()
  userId = user.id
  const [cat] = await db.insert(schema.categories).values({ userId, name: 'Test Category' }).returning()
  categoryId = cat.id
})

describe('createTrigger', () => {
  it('inserts a trigger and returns the full object with a generated cuid id', async () => {
    const data: NewTrigger = {
      userId,
      categoryId,
      title: 'Review auth flow',
      fullContent: 'Check JWT expiry handling',
      reviewIntervalDays: 7,
      nextReviewAt: new Date(Date.now() + 7 * 86400000),
    }
    const trigger = await createTrigger(db, data)
    expect(trigger.id).toBeTruthy()
    expect(trigger.id.length).toBeGreaterThan(8)
    expect(trigger.title).toBe('Review auth flow')
    expect(trigger.summaryStatus).toBe('pending')
  })

  it('throws when title is empty string', async () => {
    await expect(
      createTrigger(db, {
        userId,
        categoryId,
        title: '',
        reviewIntervalDays: 7,
        nextReviewAt: new Date(),
      })
    ).rejects.toThrow('Trigger title must not be empty')
  })
})

describe('acknowledgeTrigger', () => {
  it('updates last_reviewed_at and next_review_at within 5 seconds of expected values', async () => {
    const [trigger] = await db.insert(schema.triggers).values({
      userId,
      categoryId,
      title: 'Test trigger',
      reviewIntervalDays: 7,
      nextReviewAt: new Date(),
    }).returning()

    const before = Date.now()
    const updated = await acknowledgeTrigger(db, trigger.id)
    const after = Date.now()

    // last_reviewed_at should be ~now
    expect(updated.lastReviewedAt).toBeTruthy()
    expect(updated.lastReviewedAt!.getTime()).toBeGreaterThanOrEqual(before - 5000)
    expect(updated.lastReviewedAt!.getTime()).toBeLessThanOrEqual(after + 5000)

    // next_review_at should be ~now + 7 days + 65-min grace (see acknowledgeTrigger)
    const graceMs = 65 * 60 * 1000
    const expectedNextReview = before + 7 * 24 * 60 * 60 * 1000 + graceMs
    expect(updated.nextReviewAt.getTime()).toBeGreaterThanOrEqual(expectedNextReview - 5000)
    expect(updated.nextReviewAt.getTime()).toBeLessThanOrEqual(expectedNextReview + 5000)
  })
})

describe('getTriggersForCategory', () => {
  it('returns all triggers sorted by priority ASC then nextReviewAt ASC', async () => {
    const now = new Date()
    await db.insert(schema.triggers).values([
      {
        userId, categoryId, title: 'High', priority: 1, reviewIntervalDays: 7,
        nextReviewAt: new Date(now.getTime() + 5 * 86400000),
      },
      {
        userId, categoryId, title: 'Critical', priority: 0, reviewIntervalDays: 7,
        nextReviewAt: new Date(now.getTime() + 3 * 86400000),
      },
      {
        userId, categoryId, title: 'Medium', priority: 2, reviewIntervalDays: 7,
        nextReviewAt: new Date(now.getTime() + 7 * 86400000),
      },
    ])

    const results = await getTriggersForCategory(db, categoryId)
    expect(results).toHaveLength(3)
    expect(results[0].title).toBe('Critical')
    expect(results[1].title).toBe('High')
    expect(results[2].title).toBe('Medium')
  })
})

describe('rescheduleTrigger', () => {
  it('sets nextReviewAt to the given date', async () => {
    const [trigger] = await db.insert(schema.triggers).values({
      userId,
      categoryId,
      title: 'Reschedule test',
      reviewIntervalDays: 7,
      nextReviewAt: new Date(),
    }).returning()

    const newDate = new Date('2026-06-01T12:00:00.000Z')
    const updated = await rescheduleTrigger(db, trigger.id, newDate)

    expect(updated.nextReviewAt.getTime()).toBe(newDate.getTime())
  })

  it('does NOT change lastReviewedAt', async () => {
    const originalLastReview = new Date('2026-04-01T12:00:00.000Z')
    const [trigger] = await db.insert(schema.triggers).values({
      userId,
      categoryId,
      title: 'No touch lastReviewedAt',
      reviewIntervalDays: 7,
      nextReviewAt: new Date(),
      lastReviewedAt: originalLastReview,
    }).returning()

    await rescheduleTrigger(db, trigger.id, new Date('2026-06-15T12:00:00.000Z'))
    const [row] = await db.select().from(schema.triggers).where(eq(schema.triggers.id, trigger.id))

    expect(row.lastReviewedAt?.getTime()).toBe(originalLastReview.getTime())
  })

  it('does NOT change reviewIntervalDays', async () => {
    const [trigger] = await db.insert(schema.triggers).values({
      userId,
      categoryId,
      title: 'No touch interval',
      reviewIntervalDays: 14,
      nextReviewAt: new Date(),
    }).returning()

    await rescheduleTrigger(db, trigger.id, new Date('2026-06-15T12:00:00.000Z'))
    const [row] = await db.select().from(schema.triggers).where(eq(schema.triggers.id, trigger.id))

    expect(row.reviewIntervalDays).toBe(14)
  })

  it('throws when trigger id does not exist', async () => {
    await expect(
      rescheduleTrigger(db, 'nonexistent-id', new Date())
    ).rejects.toThrow('not found')
  })
})
