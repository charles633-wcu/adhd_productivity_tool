# Jarvis Agent — Design Spec

**Date:** 2026-04-22
**Status:** Approved for implementation

---

## Overview

A Jarvis-style AI agent that learns about the user over time and helps organize triggers and calendar via natural conversation. Built on top of existing triggers + calendar data. On-demand MVP, proactive mode post-MVP.

---

## Architecture

```
Chat UI (ChatSheet)
    ↓  user toggles "Jarvis" mode (header pill toggle)
POST /api/agent/jarvis
    Body: { message: string, history: { role: 'user'|'assistant', content: string }[] }

    1. Embed message (text-embedding-3-small) → sqlite-vec cosine search → top 5 memories
    2. Load due triggers + today/week calendar events
    3. Build system prompt with memories + context injected
    4. Call gpt-4o directly via OpenAI SDK (NOT chatProvider — see Model section)
    5. ReAct loop: think → tool call → tool result → think → respond
    6. Return full JSON response (same pattern as /api/chat — not SSE streaming for MVP)
```

Two endpoints, one UI surface:
- `/api/chat` — gpt-4o-mini, lightweight, current behavior, uses `chatProvider`
- `/api/agent/jarvis` — gpt-4o, ReAct loop, full tools + memory, calls OpenAI SDK directly

---

## Data Model

New table in existing SQLite schema (`lib/db/schema.ts`):

```ts
export const memories = sqliteTable('memories', {
  id: text('id').primaryKey(),                         // ulid
  userId: text('user_id').notNull(),
  content: text('content').notNull(),                  // "Charles avoids Fridays"
  source: text('source').notNull(),                    // 'observed' | 'explicit'
  embedding: blob('embedding', { mode: 'buffer' }),    // Float32Array serialized to Buffer
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  lastAccessedAt: integer('last_accessed_at', { mode: 'timestamp' }),
})
```

**Important:** sqlite-vec operations are raw SQL — NOT Drizzle ORM methods. `vec_search` uses a virtual table that Drizzle cannot query via `.select()`. All memory search queries use `db.run(sql\`...\`)` or `better-sqlite3`'s `.prepare()` directly.

Embedding serialization:
```ts
// Store: Float32Array → Buffer
const buf = Buffer.from(float32Array.buffer)
// Retrieve: Buffer → Float32Array
const vec = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
```

Embedding model: `text-embedding-3-small` (~$0.00002/call, 1536 dimensions).
Retrieval: cosine similarity via sqlite-vec `vec_cosine_distance`, top 5 results.
Scale: sqlite-vec works to ~100k rows; Turso supports it natively via `@libsql/client`.

### sqlite-vec Setup

```bash
npm install sqlite-vec
```

Load the extension in `lib/db/client.ts` on the raw `better-sqlite3` handle BEFORE wrapping with `drizzle()`:

```ts
import * as sqliteVec from 'sqlite-vec'

const sqlite = new Database('sentinel.db')
sqliteVec.load(sqlite)           // loads the extension onto raw handle
const db = drizzle(sqlite)
```

For Turso (`@libsql/client`): use `createClient({ url, authToken })` — sqlite-vec is pre-loaded on Turso; no manual `loadExtension()` needed.

---

## Model

`chatProvider.ts` hardcodes `gpt-4o-mini` and is not configurable. The Jarvis route bypasses `chatProvider` entirely and calls the OpenAI SDK directly:

```ts
import OpenAI from 'openai'
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [...systemMessage, ...history, userMessage],
  tools: jarvisToolDefs,
  tool_choice: 'auto',
})
```

This keeps `chatProvider` unchanged and avoids coupling the two agents.

---

## Tool Definitions + Handler Signature

All Jarvis tool handlers follow this interface:

```ts
interface JarvisToolContext {
  userId: string
  db: DrizzleDb
  openai: OpenAI    // needed by retrieve_memories and write_memory for embeddings
}

type JarvisToolHandler = (args: Record<string, unknown>, ctx: JarvisToolContext) => Promise<unknown>
```

Tools:

```ts
retrieve_memories(query: string)
  // Embeds query via text-embedding-3-small
  // Raw SQL vec_search on memories table, filtered by userId
  // Returns top 5 memory contents as string[]

write_memory(content: string, source: 'observed' | 'explicit')
  // Embeds content, inserts row into memories table
  // No deduplication for MVP (see Out of Scope)

read_triggers(limit?: number)
  // Reuses existing get_due_triggers handler logic from chatTools.ts
  // Do NOT duplicate — import and delegate

read_calendar(from: string, to: string)
  // Calls listEventsInRange() from lib/db/calendar.ts

create_calendar_event(title: string, startAt: string, endAt: string)
  // Calls existing POST /api/calendar/events logic (or directly inserts via db helper)
```

`read_triggers` explicitly reuses the existing `get_due_triggers` handler logic — do not create a parallel implementation.

---

## ReAct System Prompt

```
You are Jarvis, Charles's personal AI assistant.
Think step by step before acting.
Call retrieve_memories on every request before responding.
Write a memory (source: 'observed') when you learn something new about Charles from context.
Write a memory (source: 'explicit') when Charles tells you something directly.
Be concise, warm, and ADHD-aware: prioritize, don't overwhelm.
```

---

## Request / Response Shape

```ts
// POST /api/agent/jarvis
// Request body
{
  message: string
  history: { role: 'user' | 'assistant'; content: string }[]
}

// Response (JSON, same pattern as /api/chat)
{
  reply: string
  toolCalls?: { name: string; result: unknown }[]  // for DevTrace
}
```

Not SSE streaming for MVP — same `NextResponse.json()` pattern as `/api/chat`.

---

## UI — ChatSheet Mode Toggle

Option B: toggle in `ChatSheet` header between "Chat" and "Jarvis" mode.

- Default: Chat mode (existing behavior, gpt-4o-mini, `/api/chat`)
- Jarvis mode: calls `/api/agent/jarvis`, subtle header indicator (e.g. glow or "Jarvis" label)
- Visual: two-state pill toggle ("Chat" | "Jarvis") in the sheet header
- State: `useState<'chat' | 'jarvis'>('chat')` — resets on sheet close

---

## New Files

| File | Purpose |
|---|---|
| `lib/db/memories.ts` | `insertMemory`, `searchMemories` (raw SQL vec_search), `embedText` helper |
| `lib/services/jarvisTools.ts` | `JarvisToolHandler` type + all 5 tool handlers |
| `lib/services/jarvisSystemPrompt.ts` | System prompt builder (injects memories + context) |
| `app/api/agent/jarvis/route.ts` | ReAct loop, request body validation, JSON response |
| `components/ChatSheet.tsx` | Add mode toggle pill to header |

---

## Error Handling

- sqlite-vec not loaded → fall back to `LIKE '%query%'` keyword search, log warning
- Embedding API failure → skip memory retrieval, proceed without memory context
- Tool call failure → return `{ error: string }` to model, model decides how to recover
- gpt-4o rate limit → return 429 to client, UI shows "Jarvis is thinking, try again in a moment"

---

## Testing

- **Unit (`environment: 'node'`):** `lib/db/memories.ts` — insert + vec_search round-trip using real `better-sqlite3` instance with sqlite-vec loaded. Vitest jsdom cannot load native extensions — these tests must use `// @vitest-environment node` at the top of the file.
- **Unit:** `lib/services/jarvisTools.ts` — each handler with mocked DB and mocked OpenAI embedder
- **Integration:** `POST /api/agent/jarvis` — mock OpenAI `chat.completions.create`, verify ReAct loop runs at least one tool call and returns `{ reply: string }`
- **Component:** `ChatSheet` mode toggle renders both states, submit calls correct endpoint per mode

---

## Out of Scope (MVP)

- Proactive / cron-driven nudges (post-MVP)
- Google Calendar OAuth (post-MVP)
- Memory decay / pruning (`lastAccessedAt` captured for when this is ready)
- Memory deduplication — model may write the same fact multiple times; acceptable for MVP, prune in a future pass
- Multi-user memory isolation beyond `userId` FK (single user for now)
- SSE / true streaming response (full JSON for MVP, streaming can be added later)
