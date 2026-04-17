// Summarizer service — generates a one-sentence AI summary for a trigger's content.
// Wraps the OpenAI SDK (gpt-4o-mini).
//
// AGENT HOOK 1: Replace this OpenAI implementation with an autonomous summarization agent.
// Contract: receives raw content string + optional context, returns a one-sentence summary string.
// Input constraints:
//   - Empty string → throw Error("Content must not be empty")
//   - content.length > 10000 → truncate to first 10,000 chars before sending to model
// Failure contract: throw Error("Summarization failed") on any model/network error.
//   Caller catches and leaves summary_status = 'pending' — never rethrows to UI.
// Future agent: replace function body only — signature must not change.

import OpenAI from 'openai'

export interface SummarizeContext {
  condensedHistory?: string
  notes?: { date: string; text: string }[]
}

/**
 * Summarizes trigger content in one sentence using gpt-4o-mini.
 * When context is provided, incorporates condensed history and review notes.
 * Backwards-compatible: callers that pass only content behave identically to before.
 */
export async function summarizeTrigger(
  content: string,
  context?: SummarizeContext
): Promise<string> {
  // Validate: content must not be empty
  if (!content || content.trim().length === 0) {
    throw new Error('Content must not be empty')
  }

  // Truncate to 10,000 characters to stay within model context limits
  const truncated = content.slice(0, 10000)

  // Build prompt — rich when context provided, simple when not
  let prompt: string
  if (context && (context.condensedHistory || (context.notes && context.notes.length > 0))) {
    const lines: string[] = [`Original content: ${truncated}`]
    if (context.condensedHistory) {
      lines.push(`History: ${context.condensedHistory}`)
    }
    if (context.notes && context.notes.length > 0) {
      lines.push('Recent notes (chronological):')
      for (const note of context.notes) {
        lines.push(`- ${note.date}: ${note.text}`)
      }
    }
    lines.push('\nSummarize in one clear, actionable sentence incorporating all of the above.')
    prompt = lines.join('\n')
  } else {
    prompt = `Summarize the following in exactly one clear, actionable sentence:\n\n${truncated}`
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
    })
    return (response.choices[0]?.message?.content ?? '').trim()
  } catch {
    throw new Error('Summarization failed')
  }
}
