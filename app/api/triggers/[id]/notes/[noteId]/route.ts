// PATCH + DELETE /api/triggers/[id]/notes/[noteId] — edit or delete a single review note.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import { triggers } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { mergeMetadata } from '@/lib/db/notes'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { logTriggerAction } from '@/lib/dev/triggerActionLogger'

const EditNoteSchema = z.object({
  text: z.string().min(1).max(500).trim(),
})

async function getOwnedTrigger(id: string, userId: string) {
  const db = getDb()
  const [owned] = await db.select().from(triggers).where(and(eq(triggers.id, id), eq(triggers.userId, userId))).limit(1)
  return { db, owned: owned ?? null }
}

function revalidate(categoryId: string) {
  revalidatePath('/')
  revalidatePath('/review')
  revalidatePath(`/category/${categoryId}`)
}

/**
 * PATCH — updates text of a note by ID. Returns 404 if noteId not found.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id, noteId } = await params
    const body = await request.json()
    const parsed = EditNoteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const { db, owned } = await getOwnedTrigger(id, user.id)
    if (!owned) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })

    const notes = owned.agentMetadata?.notes ?? []
    const noteIndex = notes.findIndex(n => n.id === noteId)
    if (noteIndex === -1) return NextResponse.json({ error: 'Note not found', code: 'NOT_FOUND' }, { status: 404 })

    const updatedNotes = notes.map(n => n.id === noteId ? { ...n, text: parsed.data.text } : n)
    const newMeta = mergeMetadata(owned.agentMetadata, { notes: updatedNotes })

    const [updated] = await db
      .update(triggers)
      .set({ agentMetadata: newMeta })
      .where(and(eq(triggers.id, id), eq(triggers.userId, user.id)))
      .returning()

    await logTriggerAction('edit_note', updated)
    revalidate(updated.categoryId)
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

/**
 * DELETE — removes a note by ID. Returns 404 if noteId not found.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id, noteId } = await params

    const { db, owned } = await getOwnedTrigger(id, user.id)
    if (!owned) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })

    const notes = owned.agentMetadata?.notes ?? []
    const noteIndex = notes.findIndex(n => n.id === noteId)
    if (noteIndex === -1) return NextResponse.json({ error: 'Note not found', code: 'NOT_FOUND' }, { status: 404 })

    const updatedNotes = notes.filter(n => n.id !== noteId)
    const newMeta = mergeMetadata(owned.agentMetadata, { notes: updatedNotes })

    const [updated] = await db
      .update(triggers)
      .set({ agentMetadata: newMeta })
      .where(and(eq(triggers.id, id), eq(triggers.userId, user.id)))
      .returning()

    await logTriggerAction('delete_note', updated)
    revalidate(updated.categoryId)
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
