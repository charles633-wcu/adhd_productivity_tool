// POST /api/emoji/suggest
// Accepts { name: string } and returns { emoji: string } — a single emoji
// that best represents the category name. Uses OpenAI gpt-4o-mini.
// Always returns 200 with a fallback emoji ("📌") on any error — never throws.
// Requires an authenticated session (getCurrentUser()) to prevent quota abuse.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import OpenAI from 'openai'
import { getCurrentUser } from '@/lib/auth'

const FALLBACK = '📌'

const BodySchema = z.object({
  name: z.string().min(1).max(100),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Require authenticated session — prevents unauthenticated quota drain
  try {
    await getCurrentUser()
  } catch {
    return NextResponse.json({ emoji: FALLBACK }, { status: 401 })
  }

  // Validate request body
  let name: string
  try {
    const body = await req.json()
    const parsed = BodySchema.parse(body)
    // Strip characters that could be used for prompt injection (quotes, newlines, backticks)
    name = parsed.name.replace(/["`\n\r]/g, '')
    if (!name.trim()) return NextResponse.json({ emoji: FALLBACK })
  } catch {
    // Invalid body — return fallback, never 4xx (keeps client code simple)
    return NextResponse.json({ emoji: FALLBACK })
  }

  // Call OpenAI
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          // System message separates instruction from user data, reducing injection risk
          role: 'system',
          content: 'You are an emoji selector. The user will give you a category name. Respond with exactly one emoji that best represents it. No punctuation, no explanation, no other text.',
        },
        {
          role: 'user',
          content: name,
        },
      ],
      max_tokens: 10,
      temperature: 1.4,
    })
    const raw = response.choices[0]?.message?.content?.trim() ?? ''
    // Guard: only accept if the response is exactly one grapheme cluster (one emoji)
    const segments = [...new Intl.Segmenter().segment(raw)]
    const emoji = segments.length === 1 ? raw : FALLBACK
    return NextResponse.json({ emoji })
  } catch {
    return NextResponse.json({ emoji: FALLBACK })
  }
}
