// Summarize API — calls Gemini and updates the trigger's summary in the DB.
// The client fires this async after creating a trigger — it does not block the UI.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import { triggers } from '@/lib/db/schema'
import { summarizeTrigger } from '@/lib/services/summarizer'
import { eq } from 'drizzle-orm'

// Request body schema
const SummarizeSchema = z.object({
  triggerId: z.string().min(1),
  content: z.string().min(1),
})

/**
 * POST /api/summarize — generates a summary via Gemini and patches the trigger.
 * On success: returns { summary: string }
 * On failure: returns { error: string } — client leaves trigger in 'pending' state
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = SummarizeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }
    const { triggerId, content } = parsed.data

    // Call Gemini via the summarizer service (AGENT HOOK 1)
    const summary = await summarizeTrigger(content)

    // Patch the trigger row directly — no round-trip to client needed
    const db = getDb()
    await db.update(triggers).set({ summary, summaryStatus: 'generated' }).where(eq(triggers.id, triggerId))

    return NextResponse.json({ summary })
  } catch (error) {
    // Return error response — client shows retry button, trigger stays 'pending'
    return NextResponse.json({ error: String(error), code: 'SUMMARIZE_ERROR' }, { status: 500 })
  }
}
