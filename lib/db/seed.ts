import { getDb } from './client'
import { users } from './schema'

// Seed script — creates the single MVP user on first run
// Run with: npm run db:seed (which calls: npx tsx lib/db/seed.ts)
async function seed() {
  const db = getDb()
  const existing = await db.select().from(users).limit(1)

  if (existing.length === 0) {
    await db.insert(users).values({
      email: 'local@sentinel.app',
      name: 'Local User',
    })
    console.log('Seeded default user: local@sentinel.app')
  } else {
    console.log('Seed skipped — user already exists')
  }
}

seed().catch(console.error)
