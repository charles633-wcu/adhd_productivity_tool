// Chat API route — receives conversation history, runs the tool loop, returns final reply.
// Auth: getCurrentUser() — returns 401 if no user.
// Tool loop capped at 5 iterations; converges when provider returns type: 'text'.
// debug: true → returns trace array alongside reply.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { chatProvider } from '@/lib/services/chatProvider'
import { CHAT_TOOLS } from '@/lib/services/chatTools'
import { SYSTEM_PROMPT } from '@/lib/services/chatSystemPrompt'
import type { ChatMessage } from '@/lib/services/chatProvider'

const VERBOSE_REASONING_LINE =
  '\n\nBefore calling any tool, briefly explain which tool you plan to use and why.'

// Note: spec listed 'final_reply' as a TraceStep type, but it is the reply bubble
// itself in the UI — not a separate step. Intentionally omitted from this union.
export interface TraceStep {
  step: number
  // 'assistant_reasoning': text the model emitted before/after a tool call (usually null for gpt-4o-mini)
  // 'tool_call': a tool the model requested
  // 'tool_result': the result returned by the handler
  type: 'assistant_reasoning' | 'tool_call' | 'tool_result'
  toolName?: string
  args?: Record<string, unknown>
  result?: unknown
  text?: string | null
  durationMs?: number
}

const MessageSchema = z.object({
  // 'system' is intentionally excluded — injected server-side only; never accepted from clients
  role: z.enum(['user', 'assistant', 'tool']),
  content: z.string().max(4000),
  tool_call_id: z.string().optional(),
  name: z.string().optional(),
})

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1).max(50),
  debug: z.boolean().optional(),
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

  const debug = body.debug === true
  const systemContent = debug ? SYSTEM_PROMPT + VERBOSE_REASONING_LINE : SYSTEM_PROMPT
  const db = getDb()
  const toolDefinitions = CHAT_TOOLS.map(t => t.definition)
  const toolMap = Object.fromEntries(CHAT_TOOLS.map(t => [t.definition.name, t.handler]))

  // Prepend system message; keep user-supplied history after it
  // Map explicitly to avoid an unsafe cast (Zod infers content as string, ChatMessage allows null)
  const messages: ChatMessage[] = [
    { role: 'system', content: systemContent },
    ...body.messages.map(m => ({
      role: m.role as ChatMessage['role'],
      content: m.content,
      tool_call_id: m.tool_call_id,
      name: m.name,
    })),
  ]

  const trace: TraceStep[] = []
  let stepCounter = 0

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await chatProvider.chat(messages, toolDefinitions)

      if (response.type === 'text') {
        return NextResponse.json({
          reply: response.text,
          ...(debug ? { trace } : {}),
        })
      }

      // Collect assistant reasoning step (text is usually null for gpt-4o-mini)
      if (debug) {
        trace.push({
          step: stepCounter++,
          type: 'assistant_reasoning',
          text: response.text,
        })
      }

      // Execute all tool calls in parallel, collecting trace
      const toolResults = await Promise.all(
        response.toolCalls.map(async tc => {
          const start = Date.now()
          try {
            const handler = toolMap[tc.name]
            if (!handler) {
              const result = { error: `Unknown tool: ${tc.name}` }
              if (debug) trace.push({ step: stepCounter++, type: 'tool_call', toolName: tc.name, args: tc.arguments })
              if (debug) trace.push({ step: stepCounter++, type: 'tool_result', toolName: tc.name, result, durationMs: Date.now() - start })
              return { tool_call_id: tc.id, name: tc.name, result }
            }
            if (debug) trace.push({ step: stepCounter++, type: 'tool_call', toolName: tc.name, args: tc.arguments })
            const result = await handler(tc.arguments, user.id, db)
            if (debug) trace.push({ step: stepCounter++, type: 'tool_result', toolName: tc.name, result, durationMs: Date.now() - start })
            return { tool_call_id: tc.id, name: tc.name, result }
          } catch (err) {
            const result = { error: `Tool failed: ${String(err)}` }
            if (debug) trace.push({ step: stepCounter++, type: 'tool_result', toolName: tc.name, result, durationMs: Date.now() - start })
            return { tool_call_id: tc.id, name: tc.name, result }
          }
        })
      )

      // Append assistant message with tool_calls array (OpenAI requires exact replay of this shape)
      messages.push({ role: 'assistant', content: null, tool_calls: response.toolCalls })
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
  return NextResponse.json({
    reply: 'I ran into a loop limit. Please try a simpler question.',
    ...(debug ? { trace } : {}),
  })
}
