// app/api/scratch-notes/[id]/route.ts
// Update (content/checked) or delete a single scratch note. Ownership-checked.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { updateScratchNote, deleteScratchNote } from '@/lib/db/scratchNotes'

const PatchSchema = z.object({
  content: z.string().transform(s => s.trim()).pipe(z.string().min(1).max(2000)).optional(),
  checked: z.boolean().optional(),
}).refine(d => d.content !== undefined || d.checked !== undefined, { message: 'No fields to update' })

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const parsed = PatchSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }
    const note = await updateScratchNote(user.id, id, parsed.data)
    if (!note) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json(note)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const ok = await deleteScratchNote(user.id, id)
    if (!ok) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
