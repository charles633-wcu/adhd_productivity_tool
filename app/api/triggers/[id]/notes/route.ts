// POST /api/triggers/[id]/notes — append a review note to a trigger's agentMetadata.
// Enforces 50-note hard cap. Runs auto-compact if enabled and threshold met.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import { triggers } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { makeNote, mergeMetadata, maybeAutoCompact, NOTE_LIMIT } from '@/lib/db/notes'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { logTriggerAction } from '@/lib/dev/triggerActionLogger'

const NoteSchema = z.object({
  text: z.string().trim().min(1, 'Note text required').max(500),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const body = await request.json()
    const parsed = NoteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const db = getDb()
    const [owned] = await db.select().from(triggers).where(and(eq(triggers.id, id), eq(triggers.userId, user.id))).limit(1)
    if (!owned) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })

    // Enforce hard cap
    const currentNotes = owned.agentMetadata?.notes ?? []
    if (currentNotes.length >= NOTE_LIMIT) {
      return NextResponse.json({ error: 'Note limit reached', code: 'NOTE_LIMIT' }, { status: 400 })
    }

    // Append note then maybe auto-compact
    let newMeta = mergeMetadata(owned.agentMetadata, {
      notes: [...currentNotes, makeNote(parsed.data.text)],
    })
    newMeta = await maybeAutoCompact(newMeta)

    const [updated] = await db
      .update(triggers)
      .set({ agentMetadata: newMeta })
      .where(and(eq(triggers.id, id), eq(triggers.userId, user.id)))
      .returning()

    await logTriggerAction('add_note', updated)
    revalidatePath('/')
    revalidatePath('/review')
    revalidatePath(`/category/${updated.categoryId}`)
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
