import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

// Singleton DB connection — reused across all API route invocations in the same process
let _db: ReturnType<typeof drizzle> | null = null

export function getDb() {
  if (!_db) {
    const sqlite = new Database('./sentinel.db')
    // Enable WAL mode for better read/write concurrency
    sqlite.pragma('journal_mode = WAL')
    _db = drizzle(sqlite, { schema })
  }
  return _db
}

// Export the db instance type so it can be used in function signatures
// (avoids importing the singleton in tests where we pass an in-memory DB)
export type DrizzleDb = ReturnType<typeof getDb>
