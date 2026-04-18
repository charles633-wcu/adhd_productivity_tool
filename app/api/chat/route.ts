// Chat API route — receives conversation history, runs the tool loop, returns final reply.
// Auth: getCurrentUser() — returns 401 if no user.
// Tool loop capped at 5 iterations; converges when provider returns type: 'text'.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { chatProvider } from '@/lib/services/chatProvider'
import { CHAT_TOOLS } from '@/lib/services/chatTools'
import type { ChatMessage } from '@/lib/services/chatProvider'

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'tool']),
  content: z.string().max(4000),
  tool_call_id: z.string().optional(),
  name: z.string().optional(),
})

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1).max(50),
})

const MAX_TOOL_ITERATIONS = 5

export async function POST(req: Request) {
  // Auth
  let user: { id: string }
  try {
    user = await getCurrentUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Validate
  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', detail: String(err) }, { status: 400 })
  }

  const db = getDb()
  const toolDefinitions = CHAT_TOOLS.map(t => t.definition)
  const toolMap = Object.fromEntries(CHAT_TOOLS.map(t => [t.definition.name, t.handler]))

  // Mutable message history for the tool loop
  const messages: ChatMessage[] = body.messages as ChatMessage[]

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await chatProvider.chat(messages, toolDefinitions)

      if (response.type === 'text') {
        return NextResponse.json({ reply: response.text })
      }

      // Execute all tool calls in parallel
      const toolResults = await Promise.all(
        response.toolCalls.map(async tc => {
          try {
            const handler = toolMap[tc.name]
            if (!handler) {
              return { tool_call_id: tc.id, name: tc.name, result: { error: `Unknown tool: ${tc.name}` } }
            }
            const result = await handler(tc.arguments, user.id, db)
            return { tool_call_id: tc.id, name: tc.name, result }
          } catch (err) {
            return { tool_call_id: tc.id, name: tc.name, result: { error: `Tool failed: ${String(err)}` } }
          }
        })
      )

      // Append assistant tool_calls message + one tool result message per call
      messages.push({ role: 'assistant', content: JSON.stringify(response.toolCalls) })
      for (const tr of toolResults) {
        messages.push({
          role: 'tool',
          tool_call_id: tr.tool_call_id,
          name: tr.name,
          content: JSON.stringify(tr.result),
        })
      }
    }
  } catch (err) {
    console.error('[chat] provider error:', err)
    return NextResponse.json({ error: 'AI service error' }, { status: 502 })
  }

  // Loop cap hit
  return NextResponse.json({ reply: "I ran into a loop limit. Please try a simpler question." })
}
