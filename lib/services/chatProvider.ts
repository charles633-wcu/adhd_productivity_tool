// chatProvider — thin abstraction over a chat model.
// Swap the implementation (body of makeOpenAiProvider) to change model or vendor.
// The interface guarantees callers are decoupled from OpenAI specifics.

import OpenAI from 'openai'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string | null
  tool_call_id?: string  // required when role === 'tool'
  name?: string          // tool name, present when role === 'tool'
  // Present on assistant messages that triggered tool calls — must be replayed verbatim to OpenAI
  tool_calls?: ToolCall[]
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>  // JSON Schema object
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type ChatProviderResponse =
  | { type: 'text'; text: string }
  | { type: 'tool_calls'; toolCalls: ToolCall[]; text: string | null }

export interface ChatProvider {
  /**
   * Sends a conversation and callable tool schemas to the configured chat model.
   * @param messages - Ordered conversation transcript, including any tool-result turns.
   * @param tools - Tool definitions available for this model turn.
   * @returns A promise resolving to assistant text or requested tool invocations.
   */
  chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ChatProviderResponse>
}

// ── OpenAI implementation ─────────────────────────────────────────────────────

/**
 * Constructs the OpenAI-backed implementation of the chat provider contract.
 * @returns A provider whose `chat` method calls the configured OpenAI chat model.
 */
function makeOpenAiProvider(): ChatProvider {
  return {
    async chat(messages, tools) {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

      // Map internal ChatMessage shape → OpenAI message shape
      const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map(m => {
        if (m.role === 'tool') {
          return { role: 'tool', content: m.content ?? '', tool_call_id: m.tool_call_id! }
        }
        // Assistant messages that triggered tool calls must be replayed with the tool_calls array
        if (m.role === 'assistant' && m.tool_calls) {
          return {
            role: 'assistant',
            content: null,
            tool_calls: m.tool_calls.map(tc => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
            })),
          }
        }
        // System messages must be mapped explicitly — falling through to the cast below would silently strip the role
        if (m.role === 'system') {
          return { role: 'system', content: m.content ?? '' }
        }
        return { role: m.role as 'user' | 'assistant', content: m.content ?? '' }
      })

      // Map tool definitions → OpenAI tool shape
      const openAiTools: OpenAI.Chat.ChatCompletionTool[] = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }))

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: openAiMessages,
        tools: openAiTools.length > 0 ? openAiTools : undefined,
      })

      const choice = response.choices[0]

      if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
        return {
          type: 'tool_calls',
          text: choice.message.content ?? null,
          toolCalls: choice.message.tool_calls
            .filter(tc => tc.type === 'function')
            .map(tc => {
              const fn = (tc as Extract<typeof tc, { type: 'function' }>).function
              return {
                id: tc.id,
                name: fn.name,
                arguments: JSON.parse(fn.arguments) as Record<string, unknown>,
              }
            }),
        }
      }

      return { type: 'text', text: choice.message.content ?? '' }
    },
  }
}

// Singleton — one provider per process
export const chatProvider: ChatProvider = makeOpenAiProvider()
