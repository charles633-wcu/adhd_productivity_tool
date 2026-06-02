// Auth stub — returns the single seeded user for all MVP requests.
// Replace with NextAuth session lookup in Phase 2 (multi-user).
import { getDb } from './db/client'
import { users } from './db/schema'

/**
 * Returns the current user. MVP: always returns the single seeded local user.
 * @returns A promise resolving to the first persisted user row.
 * @throws If no seeded user exists.
 */
export async function getCurrentUser() {
  const db = getDb()
  const [user] = await db.select().from(users).limit(1)
  if (!user) throw new Error('No user found — run npm run db:seed first')
  return user
}
