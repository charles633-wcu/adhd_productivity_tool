// Save conversation API — persists a completed chat session to the DB.
// title: auto-generated from first user message, special chars stripped, truncated to 60 chars.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { saveConversation } from '@/lib/db/conversations'

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(2),
})

export async function POST(req: Request) {
  let user: { id: string }
  try {
    user = await getCurrentUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Need at least 2 messages (one user, one assistant)' }, { status: 400 })
  }

  // Auto-title: first user message, strip non-printable/special chars, truncate to 60
  const firstUserMsg = body.messages.find(m => m.role === 'user')?.content ?? 'Conversation'
  const title = firstUserMsg.replace(/[^\w\s.,?!'-]/g, '').trim().slice(0, 60) || 'Conversation'

  const db = getDb()
  const conversation = await saveConversation(db, {
    userId: user.id,
    title,
    messages: body.messages,
  })

  return NextResponse.json({ id: conversation.id, title: conversation.title }, { status: 201 })
}
