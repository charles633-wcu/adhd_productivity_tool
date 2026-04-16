// lib/db/notes.ts
// Pure helpers for agentMetadata note operations.
// All functions are synchronous except maybeAutoCompact (calls OpenAI).
// Import AgentMetadata shape from schema; callers handle DB writes.

import { createId } from '@paralleldrive/cuid2'
import { compactNotes } from '../services/compactor'

export type AgentMetadata = {
  notes?: { id: string; date: string; text: string }[]
  condensedHistory?: string
  autoCompact?: boolean
  lastAgentRun?: string
}

// NOTE_LIMIT: hard cap on the notes array length
export const NOTE_LIMIT = 50

// AUTO_COMPACT_THRESHOLD: number of notes that triggers auto-compaction
export const AUTO_COMPACT_THRESHOLD = 8

/**
 * Creates a new note object with a generated cuid ID and current timestamp.
 */
export function makeNote(text: string): { id: string; date: string; text: string } {
  return { id: createId(), date: new Date().toISOString(), text }
}

/**
 * Shallow-merges a patch into existing agentMetadata.
 * Never overwrites the full object — preserves notes, condensedHistory, etc.
 */
export function mergeMetadata(
  existing: AgentMetadata | null | undefined,
  patch: Partial<AgentMetadata>
): AgentMetadata {
  return { ...(existing ?? {}), ...patch }
}

/**
 * Runs auto-compaction if enabled and notes >= AUTO_COMPACT_THRESHOLD.
 * Returns updated metadata with condensedHistory set and notes cleared.
 * Returns metadata unchanged if autoCompact is false or threshold not met.
 */
export async function maybeAutoCompact(metadata: AgentMetadata): Promise<AgentMetadata> {
  if (!metadata.autoCompact) return metadata
  const notes = metadata.notes ?? []
  if (notes.length < AUTO_COMPACT_THRESHOLD) return metadata

  const condensed = await compactNotes(notes, metadata.condensedHistory)
  return {
    ...metadata,
    condensedHistory: condensed,
    notes: [],
    lastAgentRun: new Date().toISOString(),
  }
}
