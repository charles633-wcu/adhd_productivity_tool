// app/api/scratch-notes/route.ts
// Quick Notes pad API — list all notes and create a new one. UserId-scoped.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { listScratchNotes, createScratchNote } from '@/lib/db/scratchNotes'

// Trim first, then validate non-empty + max length.
const CreateSchema = z.object({
  content: z.string().transform(s => s.trim()).pipe(z.string().min(1).max(2000)),
})

export async function GET(_request: Request) {
  try {
    const user = await getCurrentUser()
    const notes = await listScratchNotes(user.id)
    return NextResponse.json(notes)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    const parsed = CreateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }
    const note = await createScratchNote(user.id, parsed.data.content)
    return NextResponse.json(note, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
