// Compactor service — compresses accumulated review notes into a condensed history string.
// Wraps the OpenAI SDK (gpt-4o-mini).
//
// Contract: receives notes array + optional existing history, returns 2-3 sentence summary.
// Failure contract: throws Error("Compaction failed") on any model/network error.

import OpenAI from 'openai'

/**
 * Compacts a notes array into a condensed history string using gpt-4o-mini.
 * Notes are serialized as "- [date]: [text]" lines (same format as summarizeTrigger context).
 * Caller writes result to agentMetadata.condensedHistory and clears notes.
 * @param notes - Chronological timestamped note bodies to condense.
 * @param existingHistory - Optional prior condensed history to fold into the result.
 * @returns A promise resolving to trimmed condensed history text.
 * @throws If the model request fails.
 */
export async function compactNotes(
  notes: { date: string; text: string }[],
  existingHistory?: string
): Promise<string> {
  // Serialize notes as "- [date]: [text]" lines
  const noteLines = notes.map(n => `- ${n.date}: ${n.text}`).join('\n')

  const lines: string[] = [
    'You have these review notes:',
    noteLines,
  ]
  if (existingHistory) {
    lines.push(`Existing condensed history: ${existingHistory}`)
  }
  lines.push(
    '\nCompress into 2-3 sentences of condensed history.',
    'Preserve only facts still relevant. Drop anything superseded by later notes.'
  )

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: lines.join('\n') }],
      max_tokens: 200,
    })
    return (response.choices[0]?.message?.content ?? '').trim()
  } catch {
    throw new Error('Compaction failed')
  }
}
