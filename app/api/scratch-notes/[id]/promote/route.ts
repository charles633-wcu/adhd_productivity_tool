// app/api/scratch-notes/[id]/promote/route.ts
// Promote a scratch note into the user's Inbox /todos list. Idempotent no-op if
// already promoted (returns the existing linked note with 200).
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { promoteScratchNote } from '@/lib/db/scratchNotes'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const note = await promoteScratchNote(user.id, id)
    if (!note) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json(note)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
