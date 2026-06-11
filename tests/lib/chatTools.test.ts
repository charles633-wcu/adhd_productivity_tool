// Tests for the Phase-0 aggregation chat tools: get_due_todos, get_calendar, get_heap_nodes.
// Uses an in-memory SQLite DB with real migrations (same pattern as tests/triggers.test.ts).
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@/lib/db/schema'
import { CHAT_TOOLS } from '@/lib/services/chatTools'

function makeTestDb() {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './lib/db/migrations' })
  return db
}

// Resolve a tool handler by its registered name
function handlerFor(name: string) {
  const tool = CHAT_TOOLS.find(t => t.definition.name === name)
  if (!tool) throw new Error(`tool not found: ${name}`)
  return tool.handler
}

// YYYY-MM-DD for a date offset by N days from now
function ymd(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

let db: ReturnType<typeof makeTestDb>
let userId: string

beforeEach(async () => {
  db = makeTestDb()
  const [user] = await db.insert(schema.users).values({ email: 'test@test.com' }).returning()
  userId = user.id
})

describe('get_due_todos', () => {
  it('returns incomplete todos due within the window (including overdue), excludes far-future, completed, and undated', async () => {
    const [list] = await db.insert(schema.todoLists).values({ userId, name: 'Inbox' }).returning()
    await db.insert(schema.todos).values([
      { userId, listId: list.id, title: 'Overdue task', priority: 'high', dueDate: ymd(-2) },
      { userId, listId: list.id, title: 'Due soon', priority: 'medium', dueDate: ymd(3) },
      { userId, listId: list.id, title: 'Far future', priority: 'low', dueDate: ymd(30) },
      { userId, listId: list.id, title: 'Done', priority: 'high', dueDate: ymd(1), completed: 1 },
      { userId, listId: list.id, title: 'No due date', priority: 'none' },
    ])

    const result = (await handlerFor('get_due_todos')({ days: 7 }, userId, db)) as Array<{ title: string }>
    const titles = result.map(r => r.title)

    expect(titles).toContain('Overdue task')
    expect(titles).toContain('Due soon')
    expect(titles).not.toContain('Far future')
    expect(titles).not.toContain('Done')
    expect(titles).not.toContain('No due date')
    // Ordered by due date ascending — overdue first
    expect(titles[0]).toBe('Overdue task')
  })

  it('scopes to the requesting user', async () => {
    const [otherUser] = await db.insert(schema.users).values({ email: 'other@test.com' }).returning()
    const [otherList] = await db.insert(schema.todoLists).values({ userId: otherUser.id, name: 'Inbox' }).returning()
    await db.insert(schema.todos).values({ userId: otherUser.id, listId: otherList.id, title: 'Not mine', dueDate: ymd(1) })

    const result = (await handlerFor('get_due_todos')({ days: 7 }, userId, db)) as unknown[]
    expect(result).toHaveLength(0)
  })
})

describe('get_calendar', () => {
  it('returns expanded occurrences in the window with ISO date strings', async () => {
    // Floor to whole seconds: calendarEvents stores timestamps in seconds (mode: 'timestamp'),
    // so sub-second precision is lost on round-trip.
    const start = new Date(Math.floor((Date.now() + 2 * 24 * 60 * 60 * 1000) / 1000) * 1000)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    await db.insert(schema.calendarEvents).values({
      userId, title: 'Dentist', startAt: start, endAt: end,
      color: null, notes: null, rrule: null, exdates: null, categoryId: null,
    })

    const result = (await handlerFor('get_calendar')({ days: 7 }, userId, db)) as Array<{ title: string; startAt: string }>
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Dentist')
    expect(typeof result[0].startAt).toBe('string')
    expect(result[0].startAt).toBe(start.toISOString())
  })

  it('excludes events outside the window', async () => {
    const far = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
    await db.insert(schema.calendarEvents).values({
      userId, title: 'Way later', startAt: far, endAt: new Date(far.getTime() + 3600_000),
      color: null, notes: null, rrule: null, exdates: null, categoryId: null,
    })
    const result = (await handlerFor('get_calendar')({ days: 7 }, userId, db)) as unknown[]
    expect(result).toHaveLength(0)
  })
})

describe('get_heap_nodes', () => {
  it('returns nodes ordered by priority (critical first) then recency', async () => {
    await db.insert(schema.heapNodes).values([
      { userId, type: 'note', title: 'Normal idea', priority: 'normal' },
      { userId, type: 'goal', title: 'Critical goal', priority: 'critical' },
      { userId, type: 'note', title: 'High note', priority: 'high' },
    ])
    const result = (await handlerFor('get_heap_nodes')({}, userId, db)) as Array<{ title: string; priority: string }>
    expect(result.map(r => r.title)).toEqual(['Critical goal', 'High note', 'Normal idea'])
  })

  it('filters by priority when provided', async () => {
    await db.insert(schema.heapNodes).values([
      { userId, type: 'note', title: 'Normal idea', priority: 'normal' },
      { userId, type: 'goal', title: 'Critical goal', priority: 'critical' },
    ])
    const result = (await handlerFor('get_heap_nodes')({ priority: 'critical' }, userId, db)) as Array<{ title: string }>
    expect(result.map(r => r.title)).toEqual(['Critical goal'])
  })
})
