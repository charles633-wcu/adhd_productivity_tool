import type { Trigger } from '@/lib/db/schema'
import type { SummarizeContext } from '@/lib/services/summarizer'

export const MIN_SUMMARY_SOURCE_LENGTH = 100
export const INSUFFICIENT_SUMMARY_DETAIL_MESSAGE =
  'Not enough detail to generate a summary yet. Add more original content or review notes.'

type TriggerSummaryInput = Pick<Trigger, 'title' | 'fullContent' | 'agentMetadata'>

export interface SummarySource {
  content: string
  context: SummarizeContext
  totalLength: number
  hasEnoughDetail: boolean
}

export function buildSummarySource(trigger: TriggerSummaryInput): SummarySource {
  const meta = trigger.agentMetadata ?? {}
  const content = trigger.fullContent.trim() || trigger.title.trim()
  const condensedHistory = meta.condensedHistory?.trim() || undefined
  const notes = (meta.notes ?? [])
    .map(({ date, text }) => ({ date, text: text.trim() }))
    .filter(note => note.text.length > 0)

  const totalLength = [
    content,
    condensedHistory ?? '',
    ...notes.map(note => note.text),
  ].reduce((sum, part) => sum + part.length, 0)

  return {
    content,
    context: {
      condensedHistory,
      notes: notes.length > 0 ? notes : undefined,
    },
    totalLength,
    hasEnoughDetail: totalLength >= MIN_SUMMARY_SOURCE_LENGTH,
  }
}
