// POST /api/triggers/[id]/compact — compact notes into condensedHistory.
// Requires at least 2 notes. Clears notes after compaction. Updates lastAgentRun.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { triggers } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { compactNotes } from '@/lib/services/compactor'
import { mergeMetadata } from '@/lib/db/notes'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

const MIN_NOTES_FOR_COMPACT = 2

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const db = getDb()

    const [owned] = await db.select().from(triggers).where(and(eq(triggers.id, id), eq(triggers.userId, user.id))).limit(1)
    if (!owned) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })

    const notes = owned.agentMetadata?.notes ?? []
    if (notes.length < MIN_NOTES_FOR_COMPACT) {
      return NextResponse.json({ error: 'Need at least 2 notes to compact', code: 'INSUFFICIENT_NOTES' }, { status: 400 })
    }

    // Strip IDs — compactor only needs date + text
    const notesForCompact = notes.map(({ date, text }) => ({ date, text }))
    const condensed = await compactNotes(notesForCompact, owned.agentMetadata?.condensedHistory)

    const newMeta = mergeMetadata(owned.agentMetadata, {
      condensedHistory: condensed,
      notes: [],
      lastAgentRun: new Date().toISOString(),
    })

    const [updated] = await db
      .update(triggers)
      .set({ agentMetadata: newMeta })
      .where(and(eq(triggers.id, id), eq(triggers.userId, user.id)))
      .returning()

    revalidatePath('/')
    revalidatePath('/review')
    revalidatePath(`/category/${updated.categoryId}`)
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'COMPACT_ERROR' }, { status: 500 })
  }
}
