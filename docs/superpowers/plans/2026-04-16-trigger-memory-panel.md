# Trigger Memory Panel Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-trigger Memory panel with an editable note log, AI re-summarization using accumulated context, note compaction, and a quick-note prompt on Acknowledge.

**Architecture:** Extend the existing `agentMetadata` JSON column (TypeScript type change only, no SQL migration). Shared note helpers in `lib/db/notes.ts`. Five new API routes under `app/api/triggers/[id]/`. Two new components (`AcknowledgeSheet`, `MemoryPanel`) and modifications to `TriggerEditSheet` and `TriggerCard`.

**Tech Stack:** Next.js 15 App Router · TypeScript · Drizzle ORM · SQLite · shadcn/ui Sheet · OpenAI `gpt-4o-mini` · `@paralleldrive/cuid2` · Vitest + React Testing Library

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `lib/db/schema.ts` | Update `AgentMetadata` TypeScript type |
| Create | `lib/db/notes.ts` | Pure helpers: `makeNote`, `mergeMetadata`, `maybeAutoCompact` |
| Modify | `lib/services/summarizer.ts` | Add optional `context` param (backwards-compat) |
| Create | `lib/services/compactor.ts` | `compactNotes` service |
| Modify | `app/api/triggers/[id]/route.ts` | Add `note` + `autoCompact` fields to PATCH |
| Create | `app/api/triggers/[id]/notes/route.ts` | POST — add note |
| Create | `app/api/triggers/[id]/notes/[noteId]/route.ts` | PATCH/DELETE — edit/delete note |
| Create | `app/api/triggers/[id]/summarize/route.ts` | POST — re-summarize with context |
| Create | `app/api/triggers/[id]/compact/route.ts` | POST — compact notes |
| Create | `components/AcknowledgeSheet.tsx` | Mini bottom sheet with optional note |
| Create | `components/MemoryPanel.tsx` | Notes list + summary + compaction UI |
| Modify | `components/TriggerEditSheet.tsx` | Add view state + Memory link |
| Modify | `components/TriggerCard.tsx` | Replace `onAcknowledge` with `AcknowledgeSheet` |
| Modify | `tests/summarizer.test.ts` | Add context tests |
| Create | `tests/compactor.test.ts` | compactNotes tests |
| Extend | `tests/api.create-trigger-route.test.ts` | Add note + autoCompact PATCH tests |
| Create | `tests/api/trigger-notes.test.ts` | Notes CRUD route tests |
| Create | `tests/api/trigger-summarize.test.ts` | Re-summarize route tests |
| Create | `tests/api/trigger-compact.test.ts` | Compact route tests |
| Create | `tests/components/AcknowledgeSheet.test.tsx` | AcknowledgeSheet tests |
| Create | `tests/components/MemoryPanel.test.tsx` | MemoryPanel tests |
| Extend | `tests/components/TriggerCard.test.tsx` | Acknowledge opens sheet |

---

## Task 1: Update AgentMetadata type

**Files:**
- Modify: `lib/db/schema.ts`

- [ ] **Step 1: Update the `agentMetadata` column type in schema.ts**

Replace the existing `agentMetadata` column definition:

```ts
// In lib/db/schema.ts — replace the agentMetadata column definition
agentMetadata: text('agent_metadata', { mode: 'json' }).$type<{
  notes?: { id: string; date: string; text: string }[]
  condensedHistory?: string
  autoCompact?: boolean
  lastAgentRun?: string
}>(),
```

No SQL migration needed — only the TypeScript type changes.

- [ ] **Step 2: Run the type checker to confirm no breakage**

```bash
cd C:/Users/czw53/Downloads/projects/reminders_tool
npx tsc --noEmit
```

Expected: no errors (existing `agentNotes` usages are absent in the codebase — confirm with grep if tsc flags anything).

- [ ] **Step 3: Commit**

```bash
git add lib/db/schema.ts
git commit -m "feat: update AgentMetadata type for memory panel"
```

---

## Task 2: Create lib/db/notes.ts (shared helpers)

**Files:**
- Create: `lib/db/notes.ts`

These pure helpers are shared by every API route that appends or compacts notes. Extracting them here keeps the routes thin and testable.

- [ ] **Step 1: Create `lib/db/notes.ts`**

```ts
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
```

- [ ] **Step 2: Run tsc to verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db/notes.ts
git commit -m "feat: add notes helpers (makeNote, mergeMetadata, maybeAutoCompact)"
```

---

## Task 3: Extend summarizeTrigger with context (TDD)

**Files:**
- Modify: `lib/services/summarizer.ts`
- Modify: `tests/summarizer.test.ts`

- [ ] **Step 1: Write failing tests for context-aware summarization**

Add to `tests/summarizer.test.ts` (after existing tests):

```ts
describe('summarizeTrigger with context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Contextual summary.' } }],
    })
  })

  it('includes notes in prompt when context.notes provided', async () => {
    const notes = [
      { date: '2026-04-02', text: 'decided to wait until Q3' },
      { date: '2026-04-10', text: 'insurance might cover it' },
    ]
    await summarizeTrigger('Original content', { notes })
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content
    expect(prompt).toContain('- 2026-04-02: decided to wait until Q3')
    expect(prompt).toContain('- 2026-04-10: insurance might cover it')
  })

  it('includes condensedHistory in prompt when provided', async () => {
    const condensedHistory = 'Previously researched whitener options in Feb.'
    await summarizeTrigger('Original content', { condensedHistory })
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content
    expect(prompt).toContain(condensedHistory)
  })

  it('omits History line when condensedHistory is absent', async () => {
    await summarizeTrigger('Original content', { notes: [{ date: '2026-04-02', text: 'a note' }] })
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content
    expect(prompt).not.toContain('History:')
  })

  it('existing callers with no context still work', async () => {
    const result = await summarizeTrigger('Some content about a project')
    expect(result).toBe('Contextual summary.')
    // Prompt should be the old single-line format
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content
    expect(prompt).toContain('Summarize the following in exactly one clear, actionable sentence')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- tests/summarizer.test.ts
```

Expected: new tests FAIL (context parameter not yet implemented).

- [ ] **Step 3: Implement context-aware summarizeTrigger**

Replace the body of `lib/services/summarizer.ts`:

```ts
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
```

- [ ] **Step 4: Run all summarizer tests**

```bash
npm test -- tests/summarizer.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/summarizer.ts tests/summarizer.test.ts
git commit -m "feat: extend summarizeTrigger with optional context (notes + history)"
```

---

## Task 4: Create compactNotes service (TDD)

**Files:**
- Create: `lib/services/compactor.ts`
- Create: `tests/compactor.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/compactor.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Shared mock for chat.completions.create
const mockCreate = vi.fn()

vi.mock('openai', () => {
  function MockOpenAI() {
    return { chat: { completions: { create: mockCreate } } }
  }
  return { default: MockOpenAI }
})

import { compactNotes } from '@/lib/services/compactor'

describe('compactNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Compacted history.' } }],
    })
  })

  it('returns trimmed string from model response', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '  Compacted.  ' } }],
    })
    const result = await compactNotes([{ date: '2026-04-01', text: 'a note' }])
    expect(result).toBe('Compacted.')
  })

  it('serializes notes as "- [date]: [text]" lines in prompt', async () => {
    const notes = [
      { date: '2026-04-01', text: 'first note' },
      { date: '2026-04-10', text: 'second note' },
    ]
    await compactNotes(notes)
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content
    expect(prompt).toContain('- 2026-04-01: first note')
    expect(prompt).toContain('- 2026-04-10: second note')
  })

  it('includes existingHistory in prompt when provided', async () => {
    await compactNotes([{ date: '2026-04-01', text: 'a note' }], 'Prior history.')
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content
    expect(prompt).toContain('Prior history.')
  })

  it('omits history line when existingHistory is absent', async () => {
    await compactNotes([{ date: '2026-04-01', text: 'a note' }])
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content
    expect(prompt).not.toContain('Existing condensed history')
  })

  it('throws Error("Compaction failed") when model throws', async () => {
    mockCreate.mockRejectedValue(new Error('Network error'))
    await expect(
      compactNotes([{ date: '2026-04-01', text: 'a note' }])
    ).rejects.toThrow('Compaction failed')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- tests/compactor.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement compactNotes**

Create `lib/services/compactor.ts`:

```ts
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
```

- [ ] **Step 4: Run compactor tests**

```bash
npm test -- tests/compactor.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
npm test
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add lib/services/compactor.ts tests/compactor.test.ts
git commit -m "feat: add compactNotes service"
```

---

## Task 5: Extend PATCH /api/triggers/[id] with note + autoCompact (TDD)

**Files:**
- Modify: `app/api/triggers/[id]/route.ts`
- Modify: `tests/api.create-trigger-route.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/api.create-trigger-route.test.ts`. First add the new mocks in the `vi.hoisted()` block and `vi.mock` calls at the top:

```ts
// Add to vi.hoisted() return object:
acknowledgeTrigger: vi.fn(),
maybeAutoCompact: vi.fn(),

// Add vi.mock calls (after existing ones):
vi.mock('@/lib/db/triggers', () => ({
  acknowledgeTrigger,
  rescheduleTrigger: vi.fn(),
}))

vi.mock('@/lib/db/notes', () => ({
  makeNote,
  mergeMetadata: vi.fn((existing, patch) => ({ ...(existing ?? {}), ...patch })),
  maybeAutoCompact,
  NOTE_LIMIT: 50,
}))
```

Then add the test cases:

```ts
describe('PATCH /api/triggers/[id] — note on acknowledge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'user-1' })
  })

  it('appends note to agentMetadata when acknowledge + note provided', async () => {
    const existingTrigger = {
      id: 'trig-1', userId: 'user-1', categoryId: 'cat-1',
      agentMetadata: { notes: [] },
    }
    const updatedTrigger = { ...existingTrigger, agentMetadata: { notes: [{ id: 'note-1', date: '2026-04-16T12:00:00.000Z', text: 'test note' }] } }

    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([existingTrigger]) })) })) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([updatedTrigger]) })) })) })),
    }
    getDb.mockReturnValue(db)
    acknowledgeTrigger.mockResolvedValue(existingTrigger)
    maybeAutoCompact.mockResolvedValue({ notes: [{ id: 'note-1', date: '2026-04-16T12:00:00.000Z', text: 'test note' }] })

    const { PATCH } = await import('@/app/api/triggers/[id]/route')
    const res = await PATCH(
      new Request('http://localhost/api/triggers/trig-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledge: true, note: 'test note' }),
      }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )
    expect(res.status).toBe(200)
    expect(maybeAutoCompact).toHaveBeenCalled()
  })

  it('does not append empty note on acknowledge', async () => {
    const existingTrigger = { id: 'trig-1', userId: 'user-1', categoryId: 'cat-1', agentMetadata: null }
    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([existingTrigger]) })) })) })),
    }
    getDb.mockReturnValue(db)
    acknowledgeTrigger.mockResolvedValue(existingTrigger)

    const { PATCH } = await import('@/app/api/triggers/[id]/route')
    const res = await PATCH(
      new Request('http://localhost/api/triggers/trig-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledge: true, note: '   ' }),
      }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )
    expect(res.status).toBe(200)
    // maybeAutoCompact not called because no note was appended
    expect(maybeAutoCompact).not.toHaveBeenCalled()
  })

  it('persists autoCompact preference using shallow merge', async () => {
    const existingTrigger = {
      id: 'trig-1', userId: 'user-1', categoryId: 'cat-1',
      agentMetadata: { notes: [{ id: 'n1', date: '2026-04-01', text: 'existing note' }], condensedHistory: 'old history' },
    }
    let capturedSet: unknown
    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([existingTrigger]) })) })) })),
      update: vi.fn(() => ({ set: vi.fn((data) => { capturedSet = data; return { where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([existingTrigger]) })) } }) })),
    }
    getDb.mockReturnValue(db)

    const { PATCH } = await import('@/app/api/triggers/[id]/route')
    await PATCH(
      new Request('http://localhost/api/triggers/trig-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoCompact: true }),
      }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )
    // Shallow merge: existing notes and condensedHistory preserved
    const meta = (capturedSet as { agentMetadata: unknown }).agentMetadata as Record<string, unknown>
    expect(meta.autoCompact).toBe(true)
    expect(meta.notes).toHaveLength(1)
    expect(meta.condensedHistory).toBe('old history')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- tests/api.create-trigger-route.test.ts
```

Expected: new tests FAIL.

- [ ] **Step 3: Implement note + autoCompact in PATCH route**

In `app/api/triggers/[id]/route.ts`:

Add to imports:
```ts
import { makeNote, mergeMetadata, maybeAutoCompact, NOTE_LIMIT } from '@/lib/db/notes'
```

Add to `UpdateTriggerSchema`:
```ts
note: z.string().max(500).optional(),
autoCompact: z.boolean().optional(),
```

Replace the acknowledge branch with:
```ts
if (parsed.data.acknowledge) {
  const [owned] = await db.select().from(triggers).where(and(eq(triggers.id, id), eq(triggers.userId, user.id))).limit(1)
  if (!owned) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })

  let result = await acknowledgeTrigger(db, id)

  // Append note if provided and non-empty
  const noteText = parsed.data.note?.trim()
  if (noteText) {
    const currentNotes = (owned.agentMetadata?.notes ?? [])
    if (currentNotes.length >= NOTE_LIMIT) {
      return NextResponse.json({ error: 'Note limit reached', code: 'NOTE_LIMIT' }, { status: 400 })
    }
    let newMeta = mergeMetadata(owned.agentMetadata, {
      notes: [...currentNotes, makeNote(noteText)],
    })
    newMeta = await maybeAutoCompact(newMeta)
    const [updated] = await db
      .update(triggers)
      .set({ agentMetadata: newMeta })
      .where(and(eq(triggers.id, id), eq(triggers.userId, user.id)))
      .returning()
    result = updated
  }

  revalidateTriggerViews(result.categoryId)
  return NextResponse.json(result)
}
```

Add autoCompact handling in the general field update branch, before the final update:
```ts
// Handle autoCompact — shallow merge into existing agentMetadata
if (parsed.data.autoCompact !== undefined) {
  const [owned] = await db.select().from(triggers).where(and(eq(triggers.id, id), eq(triggers.userId, user.id))).limit(1)
  if (!owned) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
  const newMeta = mergeMetadata(owned.agentMetadata, { autoCompact: parsed.data.autoCompact })
  const [updated] = await db
    .update(triggers)
    .set({ agentMetadata: newMeta })
    .where(and(eq(triggers.id, id), eq(triggers.userId, user.id)))
    .returning()
  if (!updated) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
  revalidateTriggerViews(updated.categoryId)
  return NextResponse.json(updated)
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/api.create-trigger-route.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Run full suite**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/triggers/[id]/route.ts tests/api.create-trigger-route.test.ts
git commit -m "feat: extend PATCH trigger with note-on-acknowledge and autoCompact"
```

---

## Task 6: POST /api/triggers/[id]/notes (TDD)

**Files:**
- Create: `app/api/triggers/[id]/notes/route.ts`
- Create: `tests/api/trigger-notes.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/api/trigger-notes.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCurrentUser, getDb, makeNote, mergeMetadata, maybeAutoCompact } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
  makeNote: vi.fn(),
  mergeMetadata: vi.fn((existing: unknown, patch: unknown) => ({ ...(existing as object ?? {}), ...(patch as object) })),
  maybeAutoCompact: vi.fn(async (meta: unknown) => meta),
}))

vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))
vi.mock('@/lib/db/notes', () => ({
  makeNote,
  mergeMetadata,
  maybeAutoCompact,
  NOTE_LIMIT: 50,
  AUTO_COMPACT_THRESHOLD: 8,
}))

import { POST } from '@/app/api/triggers/[id]/notes/route'

function makeDb(trigger: unknown) {
  return {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([trigger]) })) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([trigger]) })) })) })),
  }
}

describe('POST /api/triggers/[id]/notes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'user-1' })
    makeNote.mockReturnValue({ id: 'note-1', date: '2026-04-16T12:00:00.000Z', text: 'new note' })
  })

  it('appends note and returns updated trigger', async () => {
    const trigger = { id: 'trig-1', userId: 'user-1', categoryId: 'cat-1', agentMetadata: { notes: [] } }
    getDb.mockReturnValue(makeDb(trigger))

    const res = await POST(
      new Request('http://localhost/api/triggers/trig-1/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'new note' }),
      }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )
    expect(res.status).toBe(200)
    expect(makeNote).toHaveBeenCalledWith('new note')
  })

  it('returns 404 when trigger not owned by user', async () => {
    getDb.mockReturnValue({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })) })),
    })

    const res = await POST(
      new Request('http://localhost/api/triggers/trig-1/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'a note' }),
      }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns 400 NOTE_LIMIT when notes array is full', async () => {
    const notes = Array.from({ length: 50 }, (_, i) => ({ id: `n${i}`, date: '2026-04-01', text: 'note' }))
    const trigger = { id: 'trig-1', userId: 'user-1', categoryId: 'cat-1', agentMetadata: { notes } }
    getDb.mockReturnValue(makeDb(trigger))

    const res = await POST(
      new Request('http://localhost/api/triggers/trig-1/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'overflow note' }),
      }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('NOTE_LIMIT')
  })

  it('calls maybeAutoCompact after appending', async () => {
    const trigger = { id: 'trig-1', userId: 'user-1', categoryId: 'cat-1', agentMetadata: { notes: [], autoCompact: true } }
    getDb.mockReturnValue(makeDb(trigger))

    await POST(
      new Request('http://localhost/api/triggers/trig-1/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'a note' }),
      }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )
    expect(maybeAutoCompact).toHaveBeenCalled()
  })

  it('returns 400 for empty text', async () => {
    const trigger = { id: 'trig-1', userId: 'user-1', categoryId: 'cat-1', agentMetadata: null }
    getDb.mockReturnValue(makeDb(trigger))

    const res = await POST(
      new Request('http://localhost/api/triggers/trig-1/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '   ' }),
      }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- tests/api/trigger-notes.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement POST /api/triggers/[id]/notes**

Create `app/api/triggers/[id]/notes/route.ts`:

```ts
// POST /api/triggers/[id]/notes — append a review note to a trigger's agentMetadata.
// Enforces 50-note hard cap. Runs auto-compact if enabled and threshold met.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import { triggers } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { makeNote, mergeMetadata, maybeAutoCompact, NOTE_LIMIT } from '@/lib/db/notes'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

const NoteSchema = z.object({
  text: z.string().min(1, 'Note text required').max(500).trim(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const body = await request.json()
    const parsed = NoteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const db = getDb()
    const [owned] = await db.select().from(triggers).where(and(eq(triggers.id, id), eq(triggers.userId, user.id))).limit(1)
    if (!owned) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })

    // Enforce hard cap
    const currentNotes = owned.agentMetadata?.notes ?? []
    if (currentNotes.length >= NOTE_LIMIT) {
      return NextResponse.json({ error: 'Note limit reached', code: 'NOTE_LIMIT' }, { status: 400 })
    }

    // Append note then maybe auto-compact
    let newMeta = mergeMetadata(owned.agentMetadata, {
      notes: [...currentNotes, makeNote(parsed.data.text)],
    })
    newMeta = await maybeAutoCompact(newMeta)

    const [updated] = await db
      .update(triggers)
      .set({ agentMetadata: newMeta })
      .where(and(eq(triggers.id, id), eq(triggers.userId, user.id)))
      .returning()

    revalidatePath('/')
    revalidatePath('/review')
    revalidatePath(`/category/${updated.categoryId}`)
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/api/trigger-notes.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/triggers/[id]/notes/route.ts tests/api/trigger-notes.test.ts
git commit -m "feat: add POST /api/triggers/[id]/notes"
```

---

## Task 7: PATCH + DELETE /api/triggers/[id]/notes/[noteId] (TDD)

**Files:**
- Create: `app/api/triggers/[id]/notes/[noteId]/route.ts`
- Modify: `tests/api/trigger-notes.test.ts`

- [ ] **Step 1: Add failing tests to trigger-notes.test.ts**

Add at top of file (in `vi.hoisted` and imports):
```ts
import { PATCH, DELETE } from '@/app/api/triggers/[id]/notes/[noteId]/route'
```

Add test cases:
```ts
describe('PATCH /api/triggers/[id]/notes/[noteId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'user-1' })
  })

  it('updates note text by ID', async () => {
    const notes = [
      { id: 'note-1', date: '2026-04-01', text: 'original text' },
      { id: 'note-2', date: '2026-04-10', text: 'other note' },
    ]
    const trigger = { id: 'trig-1', userId: 'user-1', categoryId: 'cat-1', agentMetadata: { notes } }
    getDb.mockReturnValue(makeDb(trigger))

    const res = await PATCH(
      new Request('http://localhost/api/triggers/trig-1/notes/note-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'updated text' }),
      }),
      { params: Promise.resolve({ id: 'trig-1', noteId: 'note-1' }) }
    )
    expect(res.status).toBe(200)
    expect(mergeMetadata).toHaveBeenCalled()
  })

  it('returns 404 when noteId not found', async () => {
    const trigger = { id: 'trig-1', userId: 'user-1', categoryId: 'cat-1', agentMetadata: { notes: [] } }
    getDb.mockReturnValue(makeDb(trigger))

    const res = await PATCH(
      new Request('http://localhost/api/triggers/trig-1/notes/ghost', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'new text' }),
      }),
      { params: Promise.resolve({ id: 'trig-1', noteId: 'ghost' }) }
    )
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/triggers/[id]/notes/[noteId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'user-1' })
  })

  it('removes note by ID', async () => {
    const notes = [
      { id: 'note-1', date: '2026-04-01', text: 'to delete' },
      { id: 'note-2', date: '2026-04-10', text: 'to keep' },
    ]
    const trigger = { id: 'trig-1', userId: 'user-1', categoryId: 'cat-1', agentMetadata: { notes } }
    getDb.mockReturnValue(makeDb(trigger))

    const res = await DELETE(
      new Request('http://localhost/api/triggers/trig-1/notes/note-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'trig-1', noteId: 'note-1' }) }
    )
    expect(res.status).toBe(200)
  })

  it('returns 404 when noteId not found', async () => {
    const trigger = { id: 'trig-1', userId: 'user-1', categoryId: 'cat-1', agentMetadata: { notes: [] } }
    getDb.mockReturnValue(makeDb(trigger))

    const res = await DELETE(
      new Request('http://localhost/api/triggers/trig-1/notes/ghost', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'trig-1', noteId: 'ghost' }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns 404 for IDOR (wrong user)', async () => {
    getCurrentUser.mockResolvedValue({ id: 'attacker' })
    getDb.mockReturnValue({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })) })),
    })

    const res = await DELETE(
      new Request('http://localhost/api/triggers/trig-1/notes/note-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'trig-1', noteId: 'note-1' }) }
    )
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
npm test -- tests/api/trigger-notes.test.ts
```

Expected: new tests FAIL.

- [ ] **Step 3: Implement PATCH + DELETE**

Create `app/api/triggers/[id]/notes/[noteId]/route.ts`:

```ts
// PATCH + DELETE /api/triggers/[id]/notes/[noteId] — edit or delete a single review note.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import { triggers } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { mergeMetadata } from '@/lib/db/notes'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

const EditNoteSchema = z.object({
  text: z.string().min(1).max(500).trim(),
})

async function getOwnedTrigger(id: string, userId: string) {
  const db = getDb()
  const [owned] = await db.select().from(triggers).where(and(eq(triggers.id, id), eq(triggers.userId, userId))).limit(1)
  return { db, owned: owned ?? null }
}

function revalidate(categoryId: string) {
  revalidatePath('/')
  revalidatePath('/review')
  revalidatePath(`/category/${categoryId}`)
}

/**
 * PATCH — updates text of a note by ID. Returns 404 if noteId not found.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id, noteId } = await params
    const body = await request.json()
    const parsed = EditNoteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const { db, owned } = await getOwnedTrigger(id, user.id)
    if (!owned) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })

    const notes = owned.agentMetadata?.notes ?? []
    const noteIndex = notes.findIndex(n => n.id === noteId)
    if (noteIndex === -1) return NextResponse.json({ error: 'Note not found', code: 'NOT_FOUND' }, { status: 404 })

    const updatedNotes = notes.map(n => n.id === noteId ? { ...n, text: parsed.data.text } : n)
    const newMeta = mergeMetadata(owned.agentMetadata, { notes: updatedNotes })

    const [updated] = await db
      .update(triggers)
      .set({ agentMetadata: newMeta })
      .where(and(eq(triggers.id, id), eq(triggers.userId, user.id)))
      .returning()

    revalidate(updated.categoryId)
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

/**
 * DELETE — removes a note by ID. Returns 404 if noteId not found.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id, noteId } = await params

    const { db, owned } = await getOwnedTrigger(id, user.id)
    if (!owned) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })

    const notes = owned.agentMetadata?.notes ?? []
    const noteIndex = notes.findIndex(n => n.id === noteId)
    if (noteIndex === -1) return NextResponse.json({ error: 'Note not found', code: 'NOT_FOUND' }, { status: 404 })

    const updatedNotes = notes.filter(n => n.id !== noteId)
    const newMeta = mergeMetadata(owned.agentMetadata, { notes: updatedNotes })

    const [updated] = await db
      .update(triggers)
      .set({ agentMetadata: newMeta })
      .where(and(eq(triggers.id, id), eq(triggers.userId, user.id)))
      .returning()

    revalidate(updated.categoryId)
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/api/trigger-notes.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/triggers/[id]/notes/[noteId]/route.ts tests/api/trigger-notes.test.ts
git commit -m "feat: add PATCH + DELETE /api/triggers/[id]/notes/[noteId]"
```

---

## Task 8: POST /api/triggers/[id]/summarize (TDD)

**Files:**
- Create: `app/api/triggers/[id]/summarize/route.ts`
- Create: `tests/api/trigger-summarize.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/api/trigger-summarize.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCurrentUser, getDb, summarizeTrigger, mergeMetadata } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
  summarizeTrigger: vi.fn(),
  mergeMetadata: vi.fn((existing: unknown, patch: unknown) => ({ ...(existing as object ?? {}), ...(patch as object) })),
}))

vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))
vi.mock('@/lib/services/summarizer', () => ({ summarizeTrigger }))
vi.mock('@/lib/db/notes', () => ({ mergeMetadata }))

import { POST } from '@/app/api/triggers/[id]/summarize/route'

function makeDb(trigger: unknown) {
  return {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([trigger]) })) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([trigger]) })) })) })),
  }
}

describe('POST /api/triggers/[id]/summarize', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'user-1' })
    summarizeTrigger.mockResolvedValue('Updated summary.')
  })

  it('calls summarizeTrigger with fullContent + context and saves result', async () => {
    const notes = [{ id: 'n1', date: '2026-04-01', text: 'a note' }]
    const trigger = {
      id: 'trig-1', userId: 'user-1', categoryId: 'cat-1',
      fullContent: 'Original content here',
      summary: null, summaryStatus: 'pending',
      agentMetadata: { notes, condensedHistory: 'old history' },
    }
    getDb.mockReturnValue(makeDb(trigger))

    const res = await POST(
      new Request('http://localhost/api/triggers/trig-1/summarize', { method: 'POST' }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )

    expect(res.status).toBe(200)
    expect(summarizeTrigger).toHaveBeenCalledWith(
      'Original content here',
      { condensedHistory: 'old history', notes: [{ date: '2026-04-01', text: 'a note' }] }
    )
  })

  it('returns 404 when trigger not owned', async () => {
    getDb.mockReturnValue({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })) })),
    })
    const res = await POST(
      new Request('http://localhost/api/triggers/ghost/summarize', { method: 'POST' }),
      { params: Promise.resolve({ id: 'ghost' }) }
    )
    expect(res.status).toBe(404)
  })

  it('updates summaryStatus to "generated" and lastAgentRun on success', async () => {
    const trigger = {
      id: 'trig-1', userId: 'user-1', categoryId: 'cat-1',
      fullContent: 'Content', summary: null, summaryStatus: 'pending',
      agentMetadata: null,
    }
    let capturedSet: unknown
    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([trigger]) })) })) })),
      update: vi.fn(() => ({ set: vi.fn((data) => { capturedSet = data; return { where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([trigger]) })) } }) })),
    }
    getDb.mockReturnValue(db)

    await POST(
      new Request('http://localhost/api/triggers/trig-1/summarize', { method: 'POST' }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )

    expect((capturedSet as { summaryStatus: string }).summaryStatus).toBe('generated')
    expect((capturedSet as { summary: string }).summary).toBe('Updated summary.')
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
npm test -- tests/api/trigger-summarize.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the route**

Create `app/api/triggers/[id]/summarize/route.ts`:

```ts
// POST /api/triggers/[id]/summarize — re-summarizes a trigger using fullContent + notes + history.
// Updates summary, summaryStatus, and agentMetadata.lastAgentRun.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { triggers } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { summarizeTrigger } from '@/lib/services/summarizer'
import { mergeMetadata } from '@/lib/db/notes'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const db = getDb()

    const [owned] = await db.select().from(triggers).where(and(eq(triggers.id, id), eq(triggers.userId, user.id))).limit(1)
    if (!owned) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })

    if (!owned.fullContent || owned.fullContent.trim().length === 0) {
      return NextResponse.json({ error: 'No content to summarize', code: 'NO_CONTENT' }, { status: 400 })
    }

    // Build context from agentMetadata
    const meta = owned.agentMetadata
    const context = {
      condensedHistory: meta?.condensedHistory,
      // Strip ID from notes — summarizer only needs date + text
      notes: meta?.notes?.map(({ date, text }) => ({ date, text })),
    }

    const summary = await summarizeTrigger(owned.fullContent, context)

    const newMeta = mergeMetadata(meta, { lastAgentRun: new Date().toISOString() })

    const [updated] = await db
      .update(triggers)
      .set({ summary, summaryStatus: 'generated', agentMetadata: newMeta })
      .where(and(eq(triggers.id, id), eq(triggers.userId, user.id)))
      .returning()

    revalidatePath('/')
    revalidatePath('/review')
    revalidatePath(`/category/${updated.categoryId}`)
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'SUMMARIZE_ERROR' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/api/trigger-summarize.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/triggers/[id]/summarize/route.ts tests/api/trigger-summarize.test.ts
git commit -m "feat: add POST /api/triggers/[id]/summarize with context"
```

---

## Task 9: POST /api/triggers/[id]/compact (TDD)

**Files:**
- Create: `app/api/triggers/[id]/compact/route.ts`
- Create: `tests/api/trigger-compact.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/api/trigger-compact.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCurrentUser, getDb, compactNotes, mergeMetadata } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
  compactNotes: vi.fn(),
  mergeMetadata: vi.fn((existing: unknown, patch: unknown) => ({ ...(existing as object ?? {}), ...(patch as object) })),
}))

vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))
vi.mock('@/lib/services/compactor', () => ({ compactNotes }))
vi.mock('@/lib/db/notes', () => ({ mergeMetadata }))

import { POST } from '@/app/api/triggers/[id]/compact/route'

describe('POST /api/triggers/[id]/compact', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'user-1' })
    compactNotes.mockResolvedValue('Compacted history.')
  })

  it('calls compactNotes with notes + existing history and clears notes', async () => {
    const notes = [
      { id: 'n1', date: '2026-04-01', text: 'first' },
      { id: 'n2', date: '2026-04-10', text: 'second' },
    ]
    const trigger = {
      id: 'trig-1', userId: 'user-1', categoryId: 'cat-1',
      agentMetadata: { notes, condensedHistory: 'old' },
    }
    let capturedSet: unknown
    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([trigger]) })) })) })),
      update: vi.fn(() => ({ set: vi.fn((data) => { capturedSet = data; return { where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([trigger]) })) } }) })),
    }
    getDb.mockReturnValue(db)

    const res = await POST(
      new Request('http://localhost/api/triggers/trig-1/compact', { method: 'POST' }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )

    expect(res.status).toBe(200)
    expect(compactNotes).toHaveBeenCalledWith(
      [{ date: '2026-04-01', text: 'first' }, { date: '2026-04-10', text: 'second' }],
      'old'
    )
  })

  it('returns 400 when fewer than 2 notes', async () => {
    const trigger = {
      id: 'trig-1', userId: 'user-1', categoryId: 'cat-1',
      agentMetadata: { notes: [{ id: 'n1', date: '2026-04-01', text: 'one note' }] },
    }
    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([trigger]) })) })) })),
    }
    getDb.mockReturnValue(db)

    const res = await POST(
      new Request('http://localhost/api/triggers/trig-1/compact', { method: 'POST' }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INSUFFICIENT_NOTES')
  })

  it('returns 404 when trigger not owned', async () => {
    getDb.mockReturnValue({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })) })),
    })
    const res = await POST(
      new Request('http://localhost/api/triggers/ghost/compact', { method: 'POST' }),
      { params: Promise.resolve({ id: 'ghost' }) }
    )
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
npm test -- tests/api/trigger-compact.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the route**

Create `app/api/triggers/[id]/compact/route.ts`:

```ts
// POST /api/triggers/[id]/compact — compact notes into condensedHistory.
// Requires at least 2 notes. Clears notes after compaction. Updates lastAgentRun.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { triggers } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { compactNotes } from '@/lib/services/compactor'
import { mergeMetadata } from '@/lib/db/notes'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

const MIN_NOTES_FOR_COMPACT = 2

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const db = getDb()

    const [owned] = await db.select().from(triggers).where(and(eq(triggers.id, id), eq(triggers.userId, user.id))).limit(1)
    if (!owned) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })

    const notes = owned.agentMetadata?.notes ?? []
    if (notes.length < MIN_NOTES_FOR_COMPACT) {
      return NextResponse.json({ error: 'Need at least 2 notes to compact', code: 'INSUFFICIENT_NOTES' }, { status: 400 })
    }

    // Strip IDs — compactor only needs date + text
    const notesForCompact = notes.map(({ date, text }) => ({ date, text }))
    const condensed = await compactNotes(notesForCompact, owned.agentMetadata?.condensedHistory)

    const newMeta = mergeMetadata(owned.agentMetadata, {
      condensedHistory: condensed,
      notes: [],
      lastAgentRun: new Date().toISOString(),
    })

    const [updated] = await db
      .update(triggers)
      .set({ agentMetadata: newMeta })
      .where(and(eq(triggers.id, id), eq(triggers.userId, user.id)))
      .returning()

    revalidatePath('/')
    revalidatePath('/review')
    revalidatePath(`/category/${updated.categoryId}`)
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'COMPACT_ERROR' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/api/trigger-compact.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Run full suite**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/triggers/[id]/compact/route.ts tests/api/trigger-compact.test.ts
git commit -m "feat: add POST /api/triggers/[id]/compact"
```

---

## Task 10: AcknowledgeSheet component (TDD)

**Files:**
- Create: `components/AcknowledgeSheet.tsx`
- Create: `tests/components/AcknowledgeSheet.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/components/AcknowledgeSheet.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AcknowledgeSheet } from '@/components/AcknowledgeSheet'
import type { Trigger } from '@/lib/db/schema'

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeTrigger(overrides: Partial<Trigger> = {}): Trigger {
  return {
    id: 'trig-1', userId: 'user-1', categoryId: 'cat-1',
    title: 'Test trigger', fullContent: '', summary: null,
    summaryStatus: 'pending', priority: 2, reviewIntervalDays: 7,
    lastReviewedAt: null, nextReviewAt: new Date(Date.now() + 86400000),
    status: 'active', notifyChannel: null, agentMetadata: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

describe('AcknowledgeSheet', () => {
  const onOpenChange = vi.fn()
  const onSuccess = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
  })

  it('renders when open', () => {
    render(
      <AcknowledgeSheet
        trigger={makeTrigger()}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    )
    expect(screen.getByPlaceholderText(/What happened during review/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /skip/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /acknowledge/i })).toBeTruthy()
  })

  it('Skip fires PATCH without note and calls onSuccess', async () => {
    render(
      <AcknowledgeSheet
        trigger={makeTrigger()}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/triggers/trig-1')
    const body = JSON.parse(opts.body)
    expect(body.acknowledge).toBe(true)
    expect(body.note).toBeUndefined()
    expect(onSuccess).toHaveBeenCalled()
  })

  it('Acknowledge with note fires PATCH with note text', async () => {
    render(
      <AcknowledgeSheet
        trigger={makeTrigger()}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    )
    fireEvent.change(screen.getByPlaceholderText(/What happened during review/i), {
      target: { value: 'insurance might cover it' },
    })
    fireEvent.click(screen.getByRole('button', { name: /acknowledge/i }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.acknowledge).toBe(true)
    expect(body.note).toBe('insurance might cover it')
    expect(onSuccess).toHaveBeenCalled()
  })

  it('Acknowledge with empty textarea sends no note (same as skip)', async () => {
    render(
      <AcknowledgeSheet
        trigger={makeTrigger()}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /acknowledge/i }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.note).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
npm test -- tests/components/AcknowledgeSheet.test.tsx
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement AcknowledgeSheet**

Create `components/AcknowledgeSheet.tsx`:

```tsx
'use client'

// AcknowledgeSheet — mini bottom sheet shown when Acknowledge is tapped on TriggerCard.
// Allows an optional quick note before acknowledging. Skip skips the note but still acknowledges.
// iPad-friendly: drag handle at top, large touch targets on buttons.

import { useState } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import type { Trigger } from '@/lib/db/schema'

interface AcknowledgeSheetProps {
  trigger: Trigger
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function AcknowledgeSheet({ trigger, open, onOpenChange, onSuccess }: AcknowledgeSheetProps) {
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  async function acknowledge(withNote: boolean) {
    setLoading(true)
    try {
      const body: Record<string, unknown> = { acknowledge: true }
      const trimmed = note.trim()
      if (withNote && trimmed.length > 0) body.note = trimmed

      await fetch(`/api/triggers/${trigger.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      onOpenChange(false)
      onSuccess()
    } finally {
      setLoading(false)
      setNote('')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl px-6 pb-8 pt-4 max-w-lg mx-auto"
      >
        {/* Drag handle */}
        <div className="w-8 h-1 rounded-full bg-border mx-auto mb-5" />

        {/* Label */}
        <p className="text-sm font-semibold text-foreground mb-1">
          Any notes? <span className="text-muted-foreground font-normal text-xs">(optional)</span>
        </p>

        {/* Note input */}
        <textarea
          rows={2}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="What happened during review…"
          className="w-full rounded-xl border border-input bg-muted/40 px-4 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow resize-none mb-4"
        />

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => acknowledge(false)}
            className="flex-1 min-h-[44px] rounded-xl border border-border px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Skip
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => acknowledge(true)}
            className="flex-[2] min-h-[44px] rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25 px-3 py-3 text-sm font-semibold hover:bg-emerald-500/25 disabled:opacity-50 transition-all active:scale-[0.98]"
          >
            {loading ? 'Saving…' : '✓ Acknowledge'}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/components/AcknowledgeSheet.test.tsx
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add components/AcknowledgeSheet.tsx tests/components/AcknowledgeSheet.test.tsx
git commit -m "feat: add AcknowledgeSheet component with optional quick note"
```

---

## Task 11: MemoryPanel component (TDD)

**Files:**
- Create: `components/MemoryPanel.tsx`
- Create: `tests/components/MemoryPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/components/MemoryPanel.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryPanel } from '@/components/MemoryPanel'
import type { Trigger } from '@/lib/db/schema'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeTrigger(overrides: Partial<Trigger> = {}): Trigger {
  return {
    id: 'trig-1', userId: 'user-1', categoryId: 'cat-1',
    title: 'Test', fullContent: 'Full content', summary: 'Current summary',
    summaryStatus: 'generated', priority: 2, reviewIntervalDays: 7,
    lastReviewedAt: null, nextReviewAt: new Date(Date.now() + 86400000),
    status: 'active', notifyChannel: null, agentMetadata: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

describe('MemoryPanel', () => {
  const onBack = vi.fn()
  const onUpdate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
  })

  it('renders back link and Memory title', () => {
    render(<MemoryPanel trigger={makeTrigger()} onBack={onBack} onUpdate={onUpdate} />)
    expect(screen.getByRole('button', { name: /← Details/i })).toBeTruthy()
    expect(screen.getByText(/Memory/i)).toBeTruthy()
  })

  it('renders existing notes', () => {
    const trigger = makeTrigger({
      agentMetadata: {
        notes: [
          { id: 'n1', date: '2026-04-01', text: 'first note' },
          { id: 'n2', date: '2026-04-10', text: 'second note' },
        ],
      },
    })
    render(<MemoryPanel trigger={trigger} onBack={onBack} onUpdate={onUpdate} />)
    expect(screen.getByText('first note')).toBeTruthy()
    expect(screen.getByText('second note')).toBeTruthy()
  })

  it('Add note fires POST and calls onUpdate', async () => {
    render(<MemoryPanel trigger={makeTrigger()} onBack={onBack} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByRole('button', { name: /add note/i }))

    const textarea = screen.getByPlaceholderText(/New note/i)
    fireEvent.change(textarea, { target: { value: 'new note text' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/triggers/trig-1/notes')
    expect(JSON.parse(opts.body).text).toBe('new note text')
    expect(onUpdate).toHaveBeenCalled()
  })

  it('Delete note fires DELETE request', async () => {
    const trigger = makeTrigger({
      agentMetadata: { notes: [{ id: 'n1', date: '2026-04-01', text: 'to delete' }] },
    })
    render(<MemoryPanel trigger={trigger} onBack={onBack} onUpdate={onUpdate} />)

    // First click arms confirm, second confirms
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
    fireEvent.click(deleteButtons[0])
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/triggers/trig-1/notes/n1')
    expect(opts.method).toBe('DELETE')
  })

  it('Re-summarize fires POST to /summarize', async () => {
    render(<MemoryPanel trigger={makeTrigger()} onBack={onBack} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByRole('button', { name: /re-summarize/i }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(mockFetch.mock.calls[0][0]).toContain('/api/triggers/trig-1/summarize')
  })

  it('Compact now fires POST to /compact', async () => {
    const trigger = makeTrigger({
      agentMetadata: {
        notes: [
          { id: 'n1', date: '2026-04-01', text: 'a' },
          { id: 'n2', date: '2026-04-10', text: 'b' },
        ],
      },
    })
    render(<MemoryPanel trigger={trigger} onBack={onBack} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByRole('button', { name: /compact now/i }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(mockFetch.mock.calls[0][0]).toContain('/api/triggers/trig-1/compact')
  })

  it('Compact now is disabled when fewer than 2 notes', () => {
    const trigger = makeTrigger({
      agentMetadata: { notes: [{ id: 'n1', date: '2026-04-01', text: 'one' }] },
    })
    render(<MemoryPanel trigger={trigger} onBack={onBack} onUpdate={onUpdate} />)
    const btn = screen.getByRole('button', { name: /compact now/i })
    expect(btn).toBeDisabled()
  })

  it('Auto-compact toggle fires PATCH with autoCompact value', async () => {
    render(<MemoryPanel trigger={makeTrigger()} onBack={onBack} onUpdate={onUpdate} />)
    const toggle = screen.getByRole('checkbox', { name: /auto-compact/i })
    fireEvent.click(toggle)
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.autoCompact).toBeDefined()
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
npm test -- tests/components/MemoryPanel.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement MemoryPanel**

Create `components/MemoryPanel.tsx`:

```tsx
'use client'

// MemoryPanel — Memory view rendered inside TriggerEditSheet when user taps "✦ Memory ▾".
// Shows: notes list (add/edit/delete inline), auto-compact toggle, compact button,
// condensed history accordion, and AI summary with re-summarize button.
// All interactive elements are min 44px for iPad touch targets.

import { useState } from 'react'
import type { Trigger } from '@/lib/db/schema'

interface MemoryPanelProps {
  trigger: Trigger
  onBack: () => void
  onUpdate: () => void
}

type Note = { id: string; date: string; text: string }

export function MemoryPanel({ trigger, onBack, onUpdate }: MemoryPanelProps) {
  const meta = trigger.agentMetadata ?? {}
  const notes: Note[] = meta.notes ?? []
  const [addingNote, setAddingNote] = useState(false)
  const [newNoteText, setNewNoteText] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [loading, setLoading] = useState<string | null>(null) // key of active operation

  const autoCompact = meta.autoCompact ?? false
  const lastRun = meta.lastAgentRun ? new Date(meta.lastAgentRun).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null

  async function post(url: string, method = 'POST', body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) throw new Error(`Request failed: ${res.status}`)
    return res.json()
  }

  async function handleAddNote() {
    if (!newNoteText.trim()) return
    setLoading('add')
    try {
      await post(`/api/triggers/${trigger.id}/notes`, 'POST', { text: newNoteText.trim() })
      setNewNoteText('')
      setAddingNote(false)
      onUpdate()
    } finally { setLoading(null) }
  }

  async function handleDeleteNote(noteId: string) {
    setLoading(`delete-${noteId}`)
    try {
      await post(`/api/triggers/${trigger.id}/notes/${noteId}`, 'DELETE')
      setConfirmDeleteId(null)
      onUpdate()
    } finally { setLoading(null) }
  }

  async function handleResummarize() {
    setLoading('summarize')
    try {
      await post(`/api/triggers/${trigger.id}/summarize`)
      onUpdate()
    } finally { setLoading(null) }
  }

  async function handleCompact() {
    setLoading('compact')
    try {
      await post(`/api/triggers/${trigger.id}/compact`)
      onUpdate()
    } finally { setLoading(null) }
  }

  async function handleAutoCompactToggle() {
    setLoading('autoCompact')
    try {
      await fetch(`/api/triggers/${trigger.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoCompact: !autoCompact }),
      })
      onUpdate()
    } finally { setLoading(null) }
  }

  const sortedNotes = [...notes].reverse() // most recent first

  return (
    <div className="flex flex-col gap-0 flex-1 overflow-hidden">

      {/* ── Header ── */}
      <div className="px-6 pt-4 pb-4 border-b border-border shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Details
          </button>
          <span className="text-border">|</span>
          <span className="text-sm font-semibold text-indigo-400">✦ Memory</span>
        </div>
        {lastRun && (
          <span className="text-[10px] text-muted-foreground/50">last run: {lastRun}</span>
        )}
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

        {/* Review Notes */}
        <section className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Review Notes</p>

          {sortedNotes.length === 0 && !addingNote && (
            <p className="text-xs text-muted-foreground/50 italic">No notes yet.</p>
          )}

          {sortedNotes.map(note => (
            <div key={note.id} className="bg-muted/30 rounded-xl border border-border px-3 py-2.5 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground/60 mb-0.5">
                  {new Date(note.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
                <p className="text-xs text-foreground leading-snug break-words">{note.text}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {confirmDeleteId === note.id ? (
                  <>
                    <button
                      type="button"
                      aria-label="confirm"
                      disabled={loading === `delete-${note.id}`}
                      onClick={() => handleDeleteNote(note.id)}
                      className="min-h-[44px] px-2 text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      Confirm
                    </button>
                    <button type="button" onClick={() => setConfirmDeleteId(null)} className="min-h-[44px] px-2 text-xs text-muted-foreground">
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    aria-label="delete"
                    onClick={() => setConfirmDeleteId(note.id)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground/40 hover:text-red-400 transition-colors text-sm"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Add note inline */}
          {addingNote ? (
            <div className="space-y-2">
              <textarea
                autoFocus
                rows={2}
                value={newNoteText}
                onChange={e => setNewNoteText(e.target.value)}
                placeholder="New note…"
                className="w-full rounded-xl border border-input bg-muted/40 px-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setAddingNote(false); setNewNoteText('') }}
                  className="flex-1 min-h-[44px] rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  aria-label="save"
                  disabled={!newNoteText.trim() || loading === 'add'}
                  onClick={handleAddNote}
                  className="flex-[2] min-h-[44px] rounded-xl bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/20 text-sm font-semibold hover:bg-indigo-500/25 disabled:opacity-40 transition-all"
                >
                  {loading === 'add' ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              aria-label="add note"
              onClick={() => setAddingNote(true)}
              className="w-full min-h-[44px] rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-indigo-400/40 transition-colors"
            >
              + Add note
            </button>
          )}
        </section>

        {/* Auto-compact toggle + Compact now */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="auto-compact-toggle" className="text-xs text-muted-foreground cursor-pointer select-none">
              Auto-compact after 8 notes
            </label>
            <input
              id="auto-compact-toggle"
              type="checkbox"
              role="checkbox"
              aria-label="auto-compact"
              checked={autoCompact}
              onChange={handleAutoCompactToggle}
              className="w-9 h-5 cursor-pointer accent-indigo-500"
            />
          </div>
          <button
            type="button"
            aria-label="compact now"
            disabled={notes.length < 2 || loading === 'compact'}
            onClick={handleCompact}
            className="w-full min-h-[44px] rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
          >
            {loading === 'compact' ? 'Compacting…' : `Compact now${notes.length >= 2 ? ` (${notes.length} notes)` : ''}`}
          </button>
        </section>

        {/* Condensed History */}
        {meta.condensedHistory && (
          <section className="space-y-1.5">
            <button
              type="button"
              onClick={() => setHistoryOpen(p => !p)}
              className="w-full flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-muted-foreground min-h-[44px]"
            >
              <span>Condensed History</span>
              <span>{historyOpen ? '▲' : '▼'}</span>
            </button>
            {historyOpen && (
              <div className="bg-muted/20 rounded-xl border border-border px-3 py-2.5 space-y-1">
                <p className="text-xs text-muted-foreground leading-relaxed">{meta.condensedHistory}</p>
                {lastRun && <p className="text-[10px] text-muted-foreground/40">compacted {lastRun}</p>}
              </div>
            )}
          </section>
        )}

        {/* AI Summary */}
        <section className="space-y-1.5">
          <div className="flex items-center justify-between min-h-[44px]">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">AI Summary</p>
            <button
              type="button"
              aria-label="re-summarize"
              disabled={loading === 'summarize'}
              onClick={handleResummarize}
              className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-40 transition-colors"
            >
              {loading === 'summarize' ? 'Generating…' : '↻ Re-summarize'}
            </button>
          </div>
          {trigger.summary ? (
            <p className="text-xs text-foreground leading-relaxed">{trigger.summary}</p>
          ) : (
            <p className="text-xs text-muted-foreground/50 italic">No summary yet.</p>
          )}
        </section>

      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/components/MemoryPanel.test.tsx
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add components/MemoryPanel.tsx tests/components/MemoryPanel.test.tsx
git commit -m "feat: add MemoryPanel component"
```

---

## Task 12: Update TriggerEditSheet

**Files:**
- Modify: `components/TriggerEditSheet.tsx`

No new tests needed — existing snapshot/smoke tests cover the sheet rendering. The view-switching is behaviour-tested indirectly through MemoryPanel tests.

- [ ] **Step 1: Add view state, Memory link, and conditional render**

In `components/TriggerEditSheet.tsx`:

Add import:
```ts
import { MemoryPanel } from '@/components/MemoryPanel'
```

Add state after existing state declarations:
```ts
const [view, setView] = useState<'details' | 'memory'>('details')
```

Reset view on close — update the Sheet's `onOpenChange`:
```tsx
<Sheet open={open} onOpenChange={open => {
  onOpenChange(open)
  if (!open) { setError(null); setView('details') }
}}>
```

In the `SheetContent`, replace the inner body with a conditional render:

```tsx
{view === 'memory' ? (
  <MemoryPanel
    trigger={trigger!}
    onBack={() => setView('details')}
    onUpdate={onSuccess}
  />
) : (
  <>
    {/* ── Scrollable body ─────────────────────────────────── */}
    <form
      id="trigger-edit-form"
      onSubmit={handleSubmit}
      className="flex-1 overflow-y-auto px-6 py-6 space-y-6"
    >
      {/* Title, Priority, Review Interval, Notes/fullContent fieldsets — copy verbatim from current file */}

      {/* Memory link — at the bottom of the form, above footer */}
      <div className="flex justify-center pt-2">
        <button
          type="button"
          onClick={() => setView('memory')}
          className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          ✦ Memory ▾
        </button>
      </div>
    </form>

    {/* ── Sticky footer ───────────────────────────────────── */}
    <div className="shrink-0 px-6 py-4 border-t border-border bg-background/60 backdrop-blur-sm flex gap-2">
      {/* ... existing footer buttons unchanged ... */}
    </div>
  </>
)}
```

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add components/TriggerEditSheet.tsx
git commit -m "feat: add Memory view to TriggerEditSheet"
```

---

## Task 13: Update TriggerCard — replace onAcknowledge with AcknowledgeSheet

**Files:**
- Modify: `components/TriggerCard.tsx`
- Modify: `tests/components/TriggerCard.test.tsx`

- [ ] **Step 1: Update TriggerCard tests first**

In `tests/components/TriggerCard.test.tsx`:

- Remove `onAcknowledge` prop from all `render(...)` calls
- Replace the test `'calls onAcknowledge with triggerId when Acknowledge button is clicked'` with:

```ts
it('opens AcknowledgeSheet when Acknowledge button is clicked', () => {
  const trigger = makeTrigger()
  render(<TriggerCard trigger={trigger} categoryName="Work" onEdit={vi.fn()} onDelete={vi.fn()} onSuccess={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /acknowledge/i }))
  // AcknowledgeSheet should render (sheet opens)
  expect(screen.getByPlaceholderText(/What happened during review/i)).toBeTruthy()
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
npm test -- tests/components/TriggerCard.test.tsx
```

Expected: some tests FAIL (prop mismatch).

- [ ] **Step 3: Update TriggerCard**

In `components/TriggerCard.tsx`:

Add import:
```ts
import { AcknowledgeSheet } from '@/components/AcknowledgeSheet'
```

Update `TriggerCardProps` interface — remove `onAcknowledge`, add `onSuccess`:
```ts
interface TriggerCardProps {
  trigger: Trigger
  categoryName: string
  onSuccess: () => void   // replaces onAcknowledge
  onEdit: (triggerId: string) => void
  onDelete: (triggerId: string) => void
  onRetry?: (triggerId: string) => void
  isProcessing?: boolean
}
```

Add state:
```ts
const [acknowledgeOpen, setAcknowledgeOpen] = useState(false)
```

Replace the Acknowledge button's `onClick`:
```tsx
onClick={() => setAcknowledgeOpen(true)}
```

Add `AcknowledgeSheet` at the end of the component return (before the closing `</div>`):
```tsx
<AcknowledgeSheet
  trigger={trigger}
  open={acknowledgeOpen}
  onOpenChange={setAcknowledgeOpen}
  onSuccess={onSuccess}
/>
```

- [ ] **Step 4: Update all callers of TriggerCard**

Search for all usages of `onAcknowledge` prop and replace with `onSuccess`:

```bash
grep -r "onAcknowledge" C:/Users/czw53/Downloads/projects/reminders_tool/components C:/Users/czw53/Downloads/projects/reminders_tool/app
```

Expected files to update (verify with grep output):
- `app/category/[id]/page.tsx` — CategoryViewClient passes `onAcknowledge` to TriggerCard
- `app/review/page.tsx` — ReviewQueueClient passes `onAcknowledge` to TriggerCard
- Any other component that renders `<TriggerCard ... onAcknowledge={...} />`

In each file: rename the prop from `onAcknowledge={handler}` → `onSuccess={handler}`. The handler body itself (which calls `router.refresh()` or similar) stays the same.

Run `npx tsc --noEmit` after this step to confirm no callers were missed.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add components/TriggerCard.tsx tests/components/TriggerCard.test.tsx
git commit -m "feat: replace onAcknowledge with AcknowledgeSheet in TriggerCard"
```

---

## Task 14: Smoke test in dev

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify the full flow**

1. Open a trigger's Edit sheet — confirm "✦ Memory ▾" link appears at bottom of form
2. Tap the link — confirm MemoryPanel renders with correct sections
3. Add a note — confirm it appears in the list
4. Tap Acknowledge on a TriggerCard — confirm AcknowledgeSheet slides up
5. Enter a note and tap Acknowledge — confirm it acknowledges and note appears in Memory panel
6. Skip — confirm it acknowledges with no note
7. Tap Re-summarize — confirm summary updates
8. With 2+ notes, tap Compact now — confirm notes clear and Condensed History appears
9. Toggle Auto-compact — confirm preference persists across sheet close/reopen

- [ ] **Step 3: Final commit**

```bash
git add components/TriggerCard.tsx components/TriggerEditSheet.tsx components/MemoryPanel.tsx components/AcknowledgeSheet.tsx
git add app/api/triggers/[id]/route.ts app/api/triggers/[id]/notes/route.ts app/api/triggers/[id]/notes/[noteId]/route.ts
git add app/api/triggers/[id]/summarize/route.ts app/api/triggers/[id]/compact/route.ts
git add lib/db/schema.ts lib/db/notes.ts lib/services/compactor.ts lib/services/summarizer.ts
git commit -m "feat: Trigger Memory Panel complete"
```
