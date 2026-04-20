// Hex layout persistence — read/write the user's hex grid cell assignments.
// GET  /api/user/layout  → { layout: string | null }  (JSON-encoded Record<catId, "q,r">)
// PATCH /api/user/layout → { layout: string }          → saves to users.hex_layout
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { eq } from 'drizzle-orm'

export async function GET() {
  try {
    const user = await getCurrentUser()
    const db = getDb()
    const [row] = await db
      .select({ hexLayout: users.hexLayout })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1)
    return NextResponse.json({ layout: row?.hexLayout ?? null })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser()
    const { layout } = await request.json()
    if (typeof layout !== 'string') {
      return NextResponse.json({ error: 'layout must be a string' }, { status: 400 })
    }
    const db = getDb()
    await db.update(users).set({ hexLayout: layout }).where(eq(users.id, user.id))
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
