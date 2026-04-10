// Auth stub — returns the single seeded user for all MVP requests.
// Replace with NextAuth session lookup in Phase 2 (multi-user).
import { getDb } from './db/client'
import { users } from './db/schema'

/**
 * Returns the current user. MVP: always returns the single seeded local user.
 * Throws if no user exists — run `npm run db:seed` to fix.
 */
export async function getCurrentUser() {
  const db = getDb()
  const [user] = await db.select().from(users).limit(1)
  if (!user) throw new Error('No user found — run npm run db:seed first')
  return user
}
