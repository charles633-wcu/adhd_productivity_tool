# Sentinel — Design Spec
**Date:** 2026-04-10
**Status:** Approved
**Author:** Collaborative design session

---

## 1. Overview

Sentinel is a local-first "Jarvis-lite" intelligence layer that transitions the user from a flat system of 170+ unprioritized reminders into an executive dashboard. It surfaces what matters now, suppresses everything else, and is designed from day one to accept autonomous AI agents as future collaborators.

**Working name:** Sentinel
**Target user (MVP):** Single user (CS student / systems architect)
**Long-term target:** Multi-user SaaS — marketed as a "to-do list agent"

---

## 2. Stack

| Layer | Technology | Notes |
|---|---|---|
| UI Framework | Next.js 15 (App Router) | |
| Components | shadcn/ui + Tailwind CSS | `frontend-design` skill used during implementation |
| Database | SQLite via `better-sqlite3` | Local dev only |
| ORM | Drizzle ORM | DB-agnostic schema; Turso migration = config swap |
| AI Summarization | `@google/genai` → `gemini-3.1-flash-lite-preview` | |
| Auth | `next-auth` v5 | Stubbed for MVP (single seeded user), email login later |
| Testing | Vitest + React Testing Library | TDD enforced |
| Env Config | `.env.local` → `GOOGLE_API_KEY` | Gitignored |

**DB migration path:** SQLite (dev) → Turso/libSQL (prod). Drizzle schema is unchanged; only the client driver swaps (`better-sqlite3` → `@libsql/client`).

---

## 3. File Structure

```
reminders_tool/
├── app/
│   ├── page.tsx                   # Home — category bubbles + Review Soon banner
│   ├── category/
│   │   └── [id]/
│   │       └── page.tsx           # Cards within a specific category
│   ├── review/
│   │   └── page.tsx               # Review queue — all triggers due within 1 day
│   └── api/
│       ├── triggers/
│       │   ├── route.ts           # GET (list by user+category), POST (create)
│       │   └── [id]/
│       │       └── route.ts       # PATCH (update summary/ack), DELETE
│       ├── categories/
│       │   └── route.ts           # GET (list), POST (create)
│       └── summarize/
│           └── route.ts           # POST — triggers async Gemini summarization
│
├── components/
│   ├── CategoryBubble.tsx         # Colored bubble: icon + name + item count
│   ├── TriggerCard.tsx            # Intel Card — face always visible, details expandable
│   ├── ReviewBanner.tsx           # Amber banner: "X items need review soon"
│   └── QuickAddForm.tsx           # Slide-over panel for creating new triggers
│
├── lib/
│   ├── db/
│   │   ├── schema.ts              # Drizzle table definitions — single source of truth
│   │   ├── client.ts              # Singleton DB connection (better-sqlite3)
│   │   └── migrations/            # Auto-generated Drizzle migration SQL files
│   ├── services/
│   │   ├── summarizer.ts          # Wraps Gemini API — AGENT HOOK 1 (see Section 6)
│   │   ├── reviewClock.ts         # isDueSoon(), daysElapsed() — pure timing logic
│   │   └── notificationDispatch.ts  # dispatchReviewNotification() — AGENT HOOK 2 (see Section 6)
│   └── auth.ts                    # next-auth config stub (single seeded user)
│
├── context/                       # Shared memory: Claude Code + Cursor (gitignored)
│   ├── MEMORY.md
│   ├── project_state.md
│   ├── lessons_learned.md
│   └── docs/superpowers/
│       └── decision_logs/
│
├── tests/
│   ├── reviewClock.test.ts
│   ├── summarizer.test.ts
│   ├── triggers.test.ts
│   └── components/
│       ├── TriggerCard.test.tsx
│       └── ReviewBanner.test.tsx
│
├── .env.local                     # GOOGLE_API_KEY (gitignored)
├── .gitignore
├── CLAUDE.md
├── drizzle.config.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 4. Data Schema

```typescript
// lib/db/schema.ts (Drizzle)

// Users — multi-user ready; MVP seeds a single local user
users {
  id          string (cuid)  PK
  email       string         UNIQUE
  name        string?
  created_at  timestamp      DEFAULT now()
}

// Categories — user-scoped, created on the fly
categories {
  id          string (cuid)  PK
  user_id     string         FK → users.id  ON DELETE CASCADE
  name        string
  color       string?        // hex color e.g. "#6366f1" for bubble background
  icon        string?        // emoji e.g. "💼" or lucide icon name e.g. "briefcase"
  created_at  timestamp      DEFAULT now()
}

// Triggers — core entity
triggers {
  id                    string (cuid)  PK
  user_id               string         FK → users.id  ON DELETE CASCADE
  category_id           string         FK → categories.id  ON DELETE CASCADE

  // Content
  title                 string
  full_content          text
  summary               string?        // AI-generated, stored once, null until generated
  summary_status        enum('pending', 'generated', 'manual')
                                       // pending  = not yet sent to Gemini
                                       // generated = Gemini returned a summary
                                       // manual   = user wrote summary themselves

  // Priority: 0 = Critical, 1 = High, 2 = Medium, 3 = Backlog
  priority              integer        CHECK (priority >= 0 AND priority <= 3)

  // Review clock
  review_interval_days  integer        CHECK (review_interval_days >= 1 AND review_interval_days <= 365)
  last_reviewed_at      timestamp?     // null until first acknowledgement
  next_review_at        timestamp      // stored value: last_reviewed_at + interval
                                       // on first insert: created_at + interval

  // Lifecycle
  status                enum('active', 'snoozed', 'archived')  DEFAULT 'active'

  // Agent hooks (future — not active in MVP)
  notify_channel        enum('email', 'sms', 'push') | null    DEFAULT null
                                       // null = in-app only (MVP default)
  agent_metadata        json?          // shape: { lastAgentRun?: string (ISO), agentNotes?: string }
                                       // reserved for future autonomous agent state

  created_at            timestamp      DEFAULT now()
  updated_at            timestamp      DEFAULT now()
                                       // Drizzle: .$onUpdate(() => new Date()) — auto-updates on every PATCH
}
```

### Acknowledge Action (field writes)
When the user clicks **[✓ Acknowledge]** on a TriggerCard:
1. `last_reviewed_at` → `now()`
2. `next_review_at` → `now() + review_interval_days`
3. `updated_at` → `now()`
No other fields change. The trigger stays `active`.

---

## 5. UI/UX Flow

### Review Clock Display Format
The review clock badge on each card reads: **`[D/Id ⚠]`**
- `D` = days elapsed since `last_reviewed_at` (or since `created_at` if never reviewed). Computed by `daysElapsed(trigger)` in `lib/services/reviewClock.ts`
- `I` = `review_interval_days`
- `⚠` warning icon appears when `isDueSoon(trigger)` returns `true`: defined as `next_review_at <= now() + 1 day`
- Example: trigger with 7-day interval, last reviewed 6 days ago → `[6/7d ⚠]`
- Example: trigger with 30-day interval, last reviewed 10 days ago → `[10/30d]`

Both `daysElapsed` and `isDueSoon` are exported from `lib/services/reviewClock.ts` and used by both UI components and tests.

### Screen 1 — Home (`/`)
- **ReviewBanner** (amber, full-width): exact copy `"You have {N} item{s} that need review soon"`
  - `{N}` = count of active triggers due within 1 day; `{s}` = `"s"` when N > 1, `""` when N = 1
  - Renders only when `COUNT(triggers WHERE next_review_at <= now() + 1 day AND status = 'active') > 0`
  - Clicking navigates to `/review`
  - Hidden (returns null) when count = 0
- **CategoryBubble grid** (2–3 columns): one bubble per category
  - Each bubble: background color, icon, category name, item count badge
  - Clicking navigates to `/category/[id]`
  - **[+ New Category]** bubble at end of grid — opens inline sub-form: name (text, required, max 50 chars), color (color picker, default random from preset palette), icon (emoji or text). Same validation and save path as Quick-Add inline category creation (POST `/api/categories`)
- **[+ Add]** button (top right): opens QuickAddForm slide-over

### Screen 2 — Category View (`/category/[id]`)
- Header: back arrow, category icon + name, `[+ Add]` button
- Sort bar: **Priority** (default) | **Review Date** (next_review_at ascending)
- Filter bar: **All** (default) | **Due Soon** (next_review_at <= now() + 1 day)
- **TriggerCard** per trigger (sorted, filtered):
  - **Always visible (card face):**
    - Priority badge: `P0` (red) / `P1` (orange) / `P2` (yellow) / `P3` (gray)
    - Title line: AI `summary` if `summary_status = 'generated'` or `'manual'`; raw `title` + spinner if `summary_status = 'pending'`
    - Review clock badge (format defined above)
    - Metadata row: `📅 Last: [date or "Never"]` | `🏷 [category name]`
    - **[✓ Acknowledge]** button (writes described in Section 4)
    - **[▼ Details]** toggle
  - **Expandable details (hidden by default):**
    - Full `full_content` text
    - Links (extracted from full_content or entered separately — MVP: render full_content as-is)
    - If `summary_status = 'pending'`: "Generating summary..." + **[↺ Retry]** button
    - `agent_metadata` display (MVP: hidden; shown only if non-null)

### Screen 3 — Review Queue (`/review`)
- Header: back arrow, "⚠ Review Soon (X items)"
- All `active` triggers where `next_review_at <= now() + 1 day`
- Grouped by category (category name as section header)
- Same TriggerCard layout as Screen 2

### Quick-Add Slide-Over
Opened by any `[+ Add]` button. Fields:
| Field | Type | Validation |
|---|---|---|
| Title | text input | required, max 200 chars |
| Category | select dropdown | required; includes "+ Create new" option |
| Priority | segmented control (P0/P1/P2/P3) | required, default P2 |
| Review interval | select (7d / 14d / 30d / Custom) | required; custom: integer 1–365 |
| Full content | textarea | optional, no max |

**Inline category creation:** selecting "+ Create new" expands an inline sub-form with: name (text, required), color (color picker, default random from preset palette), icon (emoji picker or text input). Saving the sub-form creates the category and selects it in the dropdown.

**On save:**
1. INSERT trigger with `summary_status = 'pending'`, `next_review_at = created_at + review_interval_days`
2. Fire async POST to `/api/summarize` with body `{ triggerId: string, content: string }` (content = `full_content || title`)
3. Slide-over closes; card appears immediately with `title` + spinner
4. `/api/summarize` route (server-side): calls `summarizeTrigger(content)`, then PATCHes the trigger row directly in the DB (`summary = result`, `summary_status = 'generated'`), returns `{ summary: string }` on success or `{ error: string }` on failure
5. Client on success: re-renders card with returned summary. Client on failure: leaves card in `pending` state with `[↺ Retry]` visible

---

## 6. Agent Hook Contracts

Two stubs exist in the codebase. No agent logic is implemented in the MVP — only the typed interface and a `// AGENT HOOK` comment.

### Hook 1 — `lib/services/summarizer.ts`
```typescript
// AGENT HOOK: Replace the Gemini implementation with an autonomous summarization agent.
// Contract: receives raw content string, returns a one-sentence summary string.
// Input constraints: content must be a non-empty string, max 10,000 characters.
//   - Empty string → throw Error("Content must not be empty")
//   - content.length > 10000 → truncate to first 10,000 chars before sending to model
// Failure contract: throw Error("Summarization failed") on any model/network error.
//   Caller catches and leaves summary_status = 'pending' — never rethrows to UI.

export async function summarizeTrigger(content: string): Promise<string>
// MVP implementation: calls gemini-3.1-flash-lite-preview, returns response text
// Future agent: replace body only — signature must not change
```

### Hook 2 — `lib/services/notificationDispatch.ts`
```typescript
// AGENT HOOK: Replace the no-op dispatch with an agent that sends external notifications.
// Lives in lib/services/notificationDispatch.ts (separate from reviewClock.ts timing logic).
// Contract: receives a full Trigger object, returns void, throws on failure.
// Dispatch is fire-and-forget from the caller's perspective (not awaited in UI path).
// notify_channel field on the trigger determines the delivery method.

export type Trigger = {
  id: string
  title: string
  summary: string | null
  summary_status: 'pending' | 'generated' | 'manual'  // allows agent to gate on summary availability
  next_review_at: Date
  notify_channel: 'email' | 'sms' | 'push' | null
}

export async function dispatchReviewNotification(trigger: Trigger): Promise<void>
// MVP implementation: no-op (logs to console only)
// Future agent: replace body only — signature must not change
```

---

## 7. Error Handling

| Scenario | Behavior |
|---|---|
| Gemini call fails / times out | `summary_status` stays `'pending'`; `[↺ Retry]` button visible in card expander; no user-blocking |
| DB error on API route | Route returns `{ error: string, code: string }` with appropriate HTTP status; UI shows shadcn `<Sonner />` toast |
| Auth (MVP) | Single user seeded at app startup; if session missing, placeholder `/login` page renders (non-functional) |
| Invalid review interval | Zod schema on QuickAddForm validates `review_interval_days` as `z.number().int().min(1).max(365)` before API call |
| Category not found | `/category/[id]` returns 404 page with back button |

---

## 8. Testing Strategy (TDD)

All features follow: write failing test (red) → implement (green) → refactor. Tests are co-located in `tests/`.

### `reviewClock.test.ts` — Unit
```
isDueSoon(trigger) → true
  when: next_review_at = now() + 0 days (overdue)
  when: next_review_at = now() + 1 day (exactly on threshold)

isDueSoon(trigger) → false
  when: next_review_at = now() + 2 days (future)

daysElapsed(trigger) → number
  when: last_reviewed_at = 6 days ago, interval = 7 → returns 6
  when: last_reviewed_at = null, created_at = 3 days ago → returns 3 (falls back to created_at)
```

### `summarizer.test.ts` — Unit (Gemini mocked)
```
summarizeTrigger(content) → string
  when: Gemini returns text → returns trimmed summary string
  when: Gemini throws → throws Error with message "Summarization failed"
  when: content is empty string → throws Error("Content must not be empty")
  when: content is 15,000 chars → prompt sent to Gemini contains first 10,000 chars only
  assert: prompt sent to Gemini contains the content string
  assert: function is async and returns Promise<string>
```

### `triggers.test.ts` — Unit (in-memory SQLite)
```
createTrigger(data) → Trigger
  when: valid data → inserts row, returns full object with generated id and cuid
  when: missing title → throws validation error

acknowledgeTrigger(id) → Trigger
  when: called → last_reviewed_at within 5s of now(), next_review_at within 5s of (now() + review_interval_days)

getTriggersForCategory(categoryId) → Trigger[]
  when: category has 3 triggers → returns all 3 sorted by priority ASC, then next_review_at ASC as tiebreaker
```

### `TriggerCard.test.tsx` — Component
```
renders summary text when summary_status = 'generated'
renders raw title + spinner when summary_status = 'pending'
[✓ Acknowledge] button calls onAcknowledge(triggerId) when clicked
[▼ Details] expander shows full_content when toggled
[↺ Retry] button visible inside expander when summary_status = 'pending'
```

### `ReviewBanner.test.tsx` — Component
```
renders amber banner with "You have 3 items that need review soon" when count = 3
renders nothing (null) when count = 0
clicking banner navigates to /review (router.push called with '/review')
```

---

## 9. Multi-User & Deployment Path

**MVP:** Single user seeded in `users` table on first `db:migrate`. `user_id` FK on `triggers` and `categories`. Auth is a hardcoded session stub returning the seeded user.

**Phase 2 (auth):** Wire NextAuth email provider. All queries already scoped by `user_id` — no schema migration needed.

**Phase 3 (deploy):** Swap `better-sqlite3` for `@libsql/client` (Turso). Update `lib/db/client.ts` only. Add `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` to env. Drizzle schema unchanged.

---

## 10. Out of Scope (MVP)

- Background notification daemon
- External notifications via email/SMS/push (notify_channel schema field exists; dispatch is a no-op console.log stub — **not** wired to any external service)
- Bulk import of existing items (manual Quick-Add only)
- Agent implementation (hooks + typed contracts exist; agents do not)
- Real authentication (next-auth stub only; single seeded user)
- Snooze / archive UI (status field exists in schema; no UI to change it)
