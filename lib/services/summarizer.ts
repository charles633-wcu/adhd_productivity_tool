// Summarizer service — generates a one-sentence AI summary for a trigger's content.
// Wraps the @google/genai SDK (gemini-3.1-flash-lite-preview).
//
// AGENT HOOK 1: Replace this Gemini implementation with an autonomous summarization agent.
// Contract: receives raw content string, returns a one-sentence summary string.
// Input constraints:
//   - Empty string → throw Error("Content must not be empty")
//   - content.length > 10000 → truncate to first 10,000 chars before sending to model
// Failure contract: throw Error("Summarization failed") on any model/network error.
//   Caller catches and leaves summary_status = 'pending' — never rethrows to UI.
// Future agent: replace function body only — signature must not change.

import { GoogleGenAI } from '@google/genai'

// Thin factory — wraps construction so the mock in tests (vi.fn arrow) can intercept it.
function createClient(apiKey: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (GoogleGenAI as any)({ apiKey })
}

/**
 * Summarizes trigger content in one sentence using Gemini.
 * Validates input, truncates to 10k chars, and wraps all errors.
 */
export async function summarizeTrigger(content: string): Promise<string> {
  // Validate: content must not be empty
  if (!content || content.trim().length === 0) {
    throw new Error('Content must not be empty')
  }

  // Truncate to 10,000 characters to stay within model context limits
  const truncated = content.slice(0, 10000)

  const client = createClient(process.env.GOOGLE_API_KEY!)

  try {
    const response = await client.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: `Summarize the following in exactly one clear, actionable sentence:\n\n${truncated}`,
    })
    return response.text.trim()
  } catch {
    throw new Error('Summarization failed')
  }
}
