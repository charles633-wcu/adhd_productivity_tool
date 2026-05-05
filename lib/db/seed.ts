import { createId } from '@paralleldrive/cuid2'
import { eq } from 'drizzle-orm'
import { getDb } from './client'
import { calendarEvents, users } from './schema'

// Seed script - creates the single MVP user on first run.
// Run with: npm run db:seed (which calls: npx tsx lib/db/seed.ts)
async function seed() {
  const db = getDb()
  const existing = await db.select().from(users).limit(1)
  let user = existing[0]

  if (!user) {
    const [created] = await db.insert(users).values({
      email: 'local@sentinel.app',
      name: 'Local User',
    }).returning()
    user = created
    console.log('Seeded default user: local@sentinel.app')
  } else {
    console.log('Seed skipped - user already exists')
  }

  const existingEvents = db.select().from(calendarEvents).where(eq(calendarEvents.userId, user.id)).all()
  if (existingEvents.length === 0) {
    db.insert(calendarEvents).values({
      id: createId(),
      userId: user.id,
      title: 'Weekly standup',
      startAt: new Date('2026-05-04T09:00:00.000Z'),
      endAt: new Date('2026-05-04T09:30:00.000Z'),
      rrule: 'FREQ=WEEKLY;BYDAY=MO;INTERVAL=1',
      color: '#6366f1',
    }).run()
    console.log('Seeded sample recurring event: Weekly standup')
  }
}

seed().catch(console.error)
