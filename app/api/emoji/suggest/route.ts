// POST /api/emoji/suggest
// Accepts { name: string } and returns { emoji: string } — a single emoji
// that best represents the category name. Uses OpenAI gpt-4o-mini.
// Always returns 200 with a fallback emoji ("📌") on any error — never throws.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import OpenAI from 'openai'

const FALLBACK = '📌'

const BodySchema = z.object({
  name: z.string().min(1).max(100),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Validate request body
  let name: string
  try {
    const body = await req.json()
    const parsed = BodySchema.parse(body)
    name = parsed.name
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
          role: 'user',
          content: `Return a single emoji that best represents a category named "${name}". Respond with ONLY the emoji character. No punctuation, no explanation.`,
        },
      ],
      max_tokens: 10,
    })
    const raw = response.choices[0]?.message?.content?.trim() ?? ''
    const emoji = raw.length > 0 ? raw : FALLBACK
    return NextResponse.json({ emoji })
  } catch {
    return NextResponse.json({ emoji: FALLBACK })
  }
}
