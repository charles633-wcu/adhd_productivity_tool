// Summarize API - calls OpenAI (gpt-4o-mini) and updates the trigger's summary in the DB.
// The client fires this async after creating a trigger - it does not block the UI.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import { triggers } from '@/lib/db/schema'
import { summarizeTrigger } from '@/lib/services/summarizer'
import { getCurrentUser } from '@/lib/auth'
import { mergeMetadata } from '@/lib/db/notes'
import { buildSummarySource, INSUFFICIENT_SUMMARY_DETAIL_MESSAGE } from '@/lib/services/summarySource'
import { eq, and } from 'drizzle-orm'

const SummarizeSchema = z.object({
  triggerId: z.string().min(1),
  content: z.string().optional().default(''),
})

/**
 * POST /api/summarize - generates a summary and patches the trigger.
 * On success: returns { summary: string, summaryAvailable: true }
 * On skip: returns { skipped: true, reason: string, summaryAvailable: false }
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    const body = await request.json()
    const parsed = SummarizeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const { triggerId } = parsed.data
    const db = getDb()
    const [owned] = await db
      .select()
      .from(triggers)
      .where(and(eq(triggers.id, triggerId), eq(triggers.userId, user.id)))
      .limit(1)

    if (!owned) {
      return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    const source = buildSummarySource(owned)
    if (!source.hasEnoughDetail) {
      return NextResponse.json({
        skipped: true,
        reason: INSUFFICIENT_SUMMARY_DETAIL_MESSAGE,
        code: 'INSUFFICIENT_CONTENT',
        summaryAvailable: false,
      })
    }

    const summary = await summarizeTrigger(source.content, source.context)

    await db
      .update(triggers)
      .set({
        summary,
        summaryStatus: 'generated',
        agentMetadata: mergeMetadata(owned.agentMetadata, { lastAgentRun: new Date().toISOString() }),
      })
      .where(and(eq(triggers.id, triggerId), eq(triggers.userId, user.id)))

    return NextResponse.json({ summary, summaryAvailable: true })
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'SUMMARIZE_ERROR' }, { status: 500 })
  }
}
