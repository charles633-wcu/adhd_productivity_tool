// app/api/scratch-notes/reminder/route.ts
// 24h reminder support for the Quick Notes pad.
// GET → { due, notes } where notes are the user's unchecked scratch notes and
//   due = (lastTodoReminderAt is null) OR (now - lastTodoReminderAt > 24h). GET is
//   side-effect free.
// POST → stamps users.lastTodoReminderAt = now (called by the client after it shows
//   the reminder).
import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { scratchNotes, users } from '@/lib/db/schema'

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000

export async function GET(_request: Request) {
  try {
    const user = await getCurrentUser()
    const db = getDb()
    const notes = await db
      .select()
      .from(scratchNotes)
      .where(and(eq(scratchNotes.userId, user.id), eq(scratchNotes.checked, 0)))
    const last = (user as { lastTodoReminderAt?: Date | null }).lastTodoReminderAt ?? null
    const due = last === null || Date.now() - new Date(last).getTime() > TWENTY_FOUR_HOURS
    return NextResponse.json({ due, notes })
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

export async function POST(_request: Request) {
  try {
    const user = await getCurrentUser()
    const db = getDb()
    await db.update(users).set({ lastTodoReminderAt: new Date() }).where(eq(users.id, user.id))
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
