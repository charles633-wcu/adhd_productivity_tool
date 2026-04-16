# Spec — Trigger Memory Panel

**Date:** 2026-04-16
**Status:** Approved for implementation
**Feature:** Per-trigger review note log with AI-assisted summarization, compaction, and a Memory panel UI

---

## Overview

Each trigger gains a **Memory panel** — an agent-assisted note log that accumulates observations across review cycles. Notes feed into an evolving AI summary that replaces the current one-shot stateless summarization. The panel is accessible from the Edit Trigger sheet via a subtle "✦ Memory ▾" link. The Acknowledge flow gains an optional quick-note bottom sheet.

---

## 1. Data Model

**File:** `lib/db/schema.ts`

No SQL migration required. The `agentMetadata` column already exists as a JSON blob on the `triggers` table. Update its TypeScript type only:

```ts
// Before
agentMetadata: {
  lastAgentRun?: string
  agentNotes?: string
}

// After
agentMetadata: {
  notes?: { id: string, date: string, text: string }[]
  condensedHistory?: string
  autoCompact?: boolean
  lastAgentRun?: string
}
```

- `notes` — append-only in normal use; each note gets a `cuid` ID for stable edit/delete
- `condensedHistory` — agent-written compression of old notes; read-only in UI
- `autoCompact` — user preference; when `true`, compact runs automatically when `notes.length >= 8`
- `lastAgentRun` — ISO timestamp of last summarize or compact run

`fullContent` (the original trigger content) is never modified. It is the permanent anchor for all summarization.

---

## 2. API

### Extended: `PATCH /api/triggers/[id]`

Add two optional fields to `UpdateTriggerSchema`:

```ts
note: z.string().max(500).optional()       // appended to notes when acknowledge: true
autoCompact: z.boolean().optional()         // persisted to agentMetadata.autoCompact
```

When `acknowledge: true` and `note` is provided:
1. Call `acknowledgeTrigger()` (existing)
2. Append `{ id: cuid(), date: now.toISOString(), text: note }` to `agentMetadata.notes`
3. If `autoCompact === true` and `notes.length >= 8`, run compaction before returning

### New routes under `app/api/triggers/[id]/`

| Method | Path | Body | Action |
|---|---|---|---|
| `POST` | `notes/route.ts` | `{ text: string }` | Append note with generated ID + current date |
| `PATCH` | `notes/[noteId]/route.ts` | `{ text: string }` | Update note text by ID |
| `DELETE` | `notes/[noteId]/route.ts` | — | Remove note by ID |
| `POST` | `summarize/route.ts` | — | Re-summarize using fullContent + condensedHistory + notes |
| `POST` | `compact/route.ts` | — | Compact notes into condensedHistory |

**All new routes:**
- Call `getCurrentUser()` and verify trigger ownership (`userId` match) before acting
- Return 404 if trigger not found or not owned
- Return updated trigger on success

**Auto-compact trigger** (shared logic, extracted to helper):
After any note append (manual or via acknowledge), if `agentMetadata.autoCompact === true` and `notes.length >= 8`, run `compactNotes()` and write result to `condensedHistory`, clearing compacted notes.

**Compact behavior:** All current notes are compacted. After compaction, `agentMetadata.notes` is reset to `[]`. The condensed result is written to `agentMetadata.condensedHistory`. `lastAgentRun` is updated.

---

## 3. Services

### `lib/services/summarizer.ts` — extended (backwards-compatible)

```ts
export async function summarizeTrigger(
  content: string,
  context?: {
    condensedHistory?: string
    notes?: { date: string, text: string }[]
  }
): Promise<string>
```

When `context` is provided, prompt becomes:

```
Original content: [content]
History: [condensedHistory]          ← omitted if absent
Recent notes (chronological):
- [date]: [text]
...

Summarize in one clear, actionable sentence incorporating all of the above.
```

When `context` is absent, behavior is identical to today. Existing callers (`/api/summarize`) pass only `content` and are unaffected.

Input constraints unchanged: empty string throws, content truncated to 10,000 chars.

### New: `lib/services/compactor.ts`

```ts
export async function compactNotes(
  notes: { date: string, text: string }[],
  existingHistory?: string
): Promise<string>
```

Prompt:
```
You have these review notes: [notes]
Existing condensed history (if any): [existingHistory]

Compress into 2-3 sentences of condensed history.
Preserve only facts still relevant. Drop anything superseded by later notes.
```

- Uses `gpt-4o-mini`, same client pattern as `summarizer.ts`
- Throws `Error('Compaction failed')` on any model/network error
- Caller writes result to `agentMetadata.condensedHistory` and clears notes

---

## 4. Components

### New: `components/AcknowledgeSheet.tsx`

Mini bottom sheet shown when Acknowledge is tapped on a `TriggerCard`.

**Props:**
```ts
interface AcknowledgeSheetProps {
  trigger: Trigger
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}
```

**Layout:**
- Drag handle at top
- Label: "Any notes?" with "(optional)" secondary text
- Textarea: 2 rows, placeholder "What happened during review…"
- Two buttons: **Skip** (full width, muted) | **✓ Acknowledge** (2× width, emerald)

**Behavior:**
- Skip → `PATCH /api/triggers/[id]` with `{ acknowledge: true }`, no note
- Acknowledge → same PATCH with `{ acknowledge: true, note: text }` if text is non-empty
- Sheet closes and `onSuccess()` fires on either path
- Empty note on Acknowledge behaves same as Skip (no empty note appended)

### New: `components/MemoryPanel.tsx`

Rendered inside `TriggerEditSheet` when Memory view is active.

**Props:**
```ts
interface MemoryPanelProps {
  trigger: Trigger
  onBack: () => void
  onUpdate: () => void  // refresh parent after any mutation
}
```

**Layout (top → bottom):**
1. Header row: `← Details` back link | `✦ Memory` title | `last run: [date]` (if lastAgentRun set)
2. **Review Notes** section
   - List of notes, most recent first
   - Each note: date label + text, tappable to edit inline, `✕` to delete (with confirm)
   - `+ Add note` button at bottom of list
3. **Settings row:** "Auto-compact after 8 notes" label + toggle switch
4. **Compact now** button — disabled if `notes.length < 2`; shows note count
5. **Condensed History** — collapsible accordion (collapsed by default), shows `condensedHistory` text + date compacted
6. **AI Summary** section
   - Read-only summary text (or "No summary yet." if absent)
   - `↻ Re-summarize` button beside section label; disabled while loading

**Touch targets:** All interactive elements minimum 44×44pt for iPad.

### Modified: `components/TriggerEditSheet.tsx`

- Add `view: 'details' | 'memory'` state, default `'details'`
- At the bottom of the Details form scrollable area (above the Save/Cancel footer), add:
  ```
  ✦ Memory ▾
  ```
  as a centered, subtle link (`text-indigo-400`, `text-sm`)
- When `view === 'memory'`, render `<MemoryPanel>` instead of the form; hide the Save/Cancel footer
- Reset `view` to `'details'` on `onOpenChange(false)`

### Modified: `components/TriggerCard.tsx`

- Add `acknowledgeOpen: boolean` state, default `false`
- Acknowledge button sets `acknowledgeOpen: true` instead of calling `onAcknowledge` directly
- Render `<AcknowledgeSheet trigger={trigger} open={acknowledgeOpen} onOpenChange={setAcknowledgeOpen} onSuccess={onSuccess} />`
- Remove direct `onAcknowledge` prop (or keep for backwards compat and wire through AcknowledgeSheet)

---

## 5. Testing

### Service tests (`tests/`)

**`tests/summarizer.test.ts`** — extend existing file:
- `summarizeTrigger` with `context.notes` — verify notes appear in prompt
- `summarizeTrigger` with `context.condensedHistory` — verify history appears in prompt
- `summarizeTrigger` with no context — existing behavior unchanged

**New `tests/compactor.test.ts`**:
- `compactNotes` with notes array — verify prompt structure, returns string
- `compactNotes` with existing history — verify history included in prompt
- `compactNotes` model error — throws `Error('Compaction failed')`

### API route tests (`tests/api/`)

**New `tests/api/trigger-notes.test.ts`**:
- `POST .../notes` — appends note with ID and date
- `POST .../notes` with autoCompact=true and 8 notes — triggers compaction
- `PATCH .../notes/[noteId]` — updates text; 404 on unknown noteId
- `DELETE .../notes/[noteId]` — removes note; 404 on unknown noteId
- IDOR: all routes return 404 for triggers owned by another user

**New `tests/api/trigger-summarize.test.ts`**:
- `POST .../summarize` — calls summarizer with full context, writes summary + status + lastAgentRun

**New `tests/api/trigger-compact.test.ts`**:
- `POST .../compact` — calls compactor, writes condensedHistory, clears notes, updates lastAgentRun

**Existing `tests/api.trigger-route.test.ts`** — extend:
- `PATCH` with `{ acknowledge: true, note }` — acknowledges + appends note
- `PATCH` with `{ autoCompact: true }` — persists preference to agentMetadata

### Component tests (`tests/components/`)

**New `tests/components/AcknowledgeSheet.test.tsx`**:
- Skip — fires PATCH without note, calls onSuccess
- Acknowledge with note — fires PATCH with note text, calls onSuccess
- Acknowledge with empty textarea — fires PATCH without note (same as skip)

**New `tests/components/MemoryPanel.test.tsx`**:
- Renders notes list
- Add note — POST request fires, list updates
- Edit note — inline edit, PATCH fires on save
- Delete note — confirm + DELETE fires
- Re-summarize button — POST fires, summary updates
- Compact now button — POST fires, condensedHistory updates
- Auto-compact toggle — PATCH fires with autoCompact value

**Existing `tests/components/TriggerCard.test.tsx`** — extend:
- Acknowledge button opens AcknowledgeSheet (not direct call)

---

## 6. iPad Considerations

- `AcknowledgeSheet` uses bottom sheet pattern with drag handle — native feel on iPad
- `MemoryPanel` renders inside the existing full-width `TriggerEditSheet` (`w-full sm:max-w-[420px]`)
- All interactive elements meet 44pt minimum touch target
- Note inline editing uses a native `<textarea>` that auto-grows
- Compact / Re-summarize buttons show loading state (disabled + spinner text) during async calls

---

## 7. Out of Scope

- Cross-trigger note search
- Note history / undo after delete
- Sharing or exporting notes
- Multi-user note attribution
- Push notification on re-summarize complete
