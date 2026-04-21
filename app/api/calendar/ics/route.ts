// GET + POST + DELETE for /api/calendar/ics
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { getIcsSubscription, upsertIcsSubscription, deleteIcsSubscription } from '@/lib/db/calendar'
import { fetchAndParseIcs } from '@/lib/services/icsParser'

const SaveSchema = z.object({ url: z.string().url() })

export async function GET() {
  try {
    const user = await getCurrentUser()
    const db = getDb()
    const [sub] = await getIcsSubscription(db, user.id)
    return NextResponse.json(sub ?? null)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    const parsed = SaveSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })
    const { url } = parsed.data
    const events = await fetchAndParseIcs(url)
    const db = getDb()
    const [sub] = await upsertIcsSubscription(db, user.id, url, JSON.stringify(events), new Date())
    return NextResponse.json(sub)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser()
    const db = getDb()
    await deleteIcsSubscription(db, user.id)
    return new Response(null, { status: 204 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
