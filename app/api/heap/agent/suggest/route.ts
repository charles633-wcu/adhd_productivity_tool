// POST /api/heap/agent/suggest
// Returns 1-2 AI-suggested "what to work on next" items from the user's heap nodes.
// Calls OpenAI (gpt-4o-mini) with a productivity-focused system prompt and a
// serialised list of the user's most-recently-updated nodes (capped at 50).
//
// scope=overview  — considers all nodes for the current user
// scope=project   — narrows to nodes whose projectId matches the supplied value
//
// On any OpenAI failure the endpoint degrades gracefully: returns
//   { suggestions: [], degraded: true }  (HTTP 200) so the client can show a soft error.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import OpenAI from 'openai'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { heapNodes } from '@/lib/db/schema'

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const RequestSchema = z.object({
  scope: z.enum(['overview', 'project']),
  projectId: z.string().nullable().optional(),
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Suggestion = { nodeId: string; firstStep: string; effort: 'quick' | 'medium' | 'deep' }

// ---------------------------------------------------------------------------
// System prompt — instructs the model to return structured JSON only
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a productivity assistant for someone who may struggle with task initiation.
Given a list of nodes from a knowledge graph, identify the 1-2 most actionable items right now.
For each, provide a concrete one-sentence first step and an effort estimate.
Respond ONLY with valid JSON in this exact shape:
{"suggestions":[{"nodeId":"<id>","firstStep":"<one sentence>","effort":"quick"|"medium"|"deep"}]}`

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  // Auth guard — getCurrentUser throws when the session is absent
  let user: { id: string }
  try {
    user = await getCurrentUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Validate request body
    const body = await request.json()
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    // Build query conditions — always scope to the current user (IDOR guard)
    const db = getDb()
    const conditions = [eq(heapNodes.userId, user.id)]
    if (parsed.data.scope === 'project' && parsed.data.projectId) {
      conditions.push(eq(heapNodes.projectId, parsed.data.projectId))
    }

    // Fetch up to 50 most-recently-updated nodes (title + metadata only — no body)
    const nodes = await db
      .select({
        id: heapNodes.id,
        title: heapNodes.title,
        type: heapNodes.type,
        priority: heapNodes.priority,
        updatedAt: heapNodes.updatedAt,
      })
      .from(heapNodes)
      .where(and(...conditions))
      .orderBy(desc(heapNodes.updatedAt))
      .limit(50)

    // Nothing to suggest when the user has no nodes
    if (nodes.length === 0) {
      return NextResponse.json({ suggestions: [] })
    }

    // Serialise nodes into a compact text list for the model
    const nodeList = nodes
      .map((n) => `[${n.id}] ${n.title} (type: ${n.type}, priority: ${n.priority})`)
      .join('\n')

    // Call OpenAI — use the same pattern as lib/services/summarizer.ts
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Here are the nodes:\n${nodeList}\n\nWhat should I work on?` },
      ],
      temperature: 0.4,
      max_tokens: 300,
    })

    // Parse the model response — degrade gracefully on malformed JSON
    const raw = completion.choices[0]?.message?.content ?? ''
    let suggestions: Suggestion[] = []
    try {
      const parsed2 = JSON.parse(raw) as { suggestions: Suggestion[] }
      suggestions = parsed2.suggestions ?? []
    } catch {
      return NextResponse.json({ suggestions: [], degraded: true })
    }

    return NextResponse.json({ suggestions })
  } catch {
    // Catch-all: OpenAI network errors, DB errors, etc. — always degrade gracefully
    return NextResponse.json({ suggestions: [], degraded: true })
  }
}
