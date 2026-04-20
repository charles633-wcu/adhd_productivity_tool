// POST /api/triggers/[id]/summarize - re-summarizes a trigger using original content, notes, and history.
// Updates summary, summaryStatus, and agentMetadata.lastAgentRun.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { triggers } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { summarizeTrigger } from '@/lib/services/summarizer'
import { mergeMetadata } from '@/lib/db/notes'
import { buildSummarySource, INSUFFICIENT_SUMMARY_DETAIL_MESSAGE } from '@/lib/services/summarySource'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const db = getDb()

    const [owned] = await db
      .select()
      .from(triggers)
      .where(and(eq(triggers.id, id), eq(triggers.userId, user.id)))
      .limit(1)

    if (!owned) {
      return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    const source = buildSummarySource(owned)
    if (!source.hasEnoughDetail) {
      return NextResponse.json({ error: INSUFFICIENT_SUMMARY_DETAIL_MESSAGE, code: 'INSUFFICIENT_CONTENT' }, { status: 400 })
    }

    const summary = await summarizeTrigger(source.content, source.context)
    const newMeta = mergeMetadata(owned.agentMetadata, { lastAgentRun: new Date().toISOString() })

    const [updated] = await db
      .update(triggers)
      .set({ summary, summaryStatus: 'generated', agentMetadata: newMeta })
      .where(and(eq(triggers.id, id), eq(triggers.userId, user.id)))
      .returning()

    revalidatePath('/')
    revalidatePath('/review')
    revalidatePath(`/category/${updated.categoryId}`)
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'SUMMARIZE_ERROR' }, { status: 500 })
  }
}
