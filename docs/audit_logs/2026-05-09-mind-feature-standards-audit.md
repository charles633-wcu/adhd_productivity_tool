# Audit - 2026-05-09

**Scope:** Mind / Heap feature API routes, React Flow canvas integration, task overlay, node detail sheet, Drizzle migration workflow, and related tests.
**Auditor:** Codex (GPT-5)
**Status:** 4 fixed inline · 4 open

## Findings

### [FIXED] A-001 - Failed optimistic writes could leave Mind UI inconsistent

**File:** `components/heap/NodeDetailSheet.tsx`, `components/heap/HeapTodoOverlay.tsx`
**Severity:** High
**Type:** State machine

**Description:** Several UI actions updated local state after a failed network write: node type/color changes, node task linking, trigger linking, quick-add task linking, and task completion. Normal network/API failures could make the canvas or task overlay show data that did not persist.

**Fix / Recommended fix:** Added failure-state regression tests and changed the handlers to update local state only after successful responses. Inputs now remain intact when link operations fail.

### [FIXED] A-002 - Heap node task badges were never populated

**File:** `app/api/heap/nodes/route.ts`
**Severity:** Medium
**Type:** API correctness

**Description:** `HeapNodeData` and `HeapNode` supported `todoCount`, but `GET /api/heap/nodes` returned raw nodes without computing linked task counts. The UI badge path existed but would always default to zero.

**Fix / Recommended fix:** `GET /api/heap/nodes` now selects node columns plus `count(heap_node_todos.todo_id)` using a left join and groups by node id. Added route coverage that verifies the count query shape.

### [FIXED] A-003 - Server components called the app through `localhost`

**File:** `app/heap/page.tsx`, `app/todos/page.tsx`, `app/api/todo-lists/route.ts`, `lib/db/todoLists.ts`
**Severity:** Medium
**Type:** API correctness

**Description:** `/heap` called `fetch(NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000')` from a server component only to trigger lazy Inbox creation. This is brittle in previews, production, and non-3000 local ports.

**Fix / Recommended fix:** Added `ensureTodoListsForUser()` as a shared DB helper and reused it from the todo-lists API plus `/heap` and `/todos` pages. Server components now bootstrap Inbox without an internal HTTP round trip.

### [FIXED] A-004 - Lazy Inbox creation logic was duplicated across call sites

**File:** `lib/db/todoLists.ts`, `app/api/todo-lists/route.ts`, `app/todos/page.tsx`, `app/heap/page.tsx`
**Severity:** Low
**Type:** Code smell

**Description:** Inbox bootstrap behavior lived inside the API route while server components had to know to call that API. This made the invariant "a user has an Inbox after first use" harder to reuse safely.

**Fix / Recommended fix:** Centralized the invariant in `ensureTodoListsForUser()` and added helper tests for existing-list and first-run creation paths.

### [OPEN] A-005 - Drizzle migration generation is not non-interactive

**File:** `lib/db/migrations/meta/_journal.json`, `lib/db/migrations/meta/`
**Severity:** High
**Type:** API correctness

**Description:** The journal lists migrations `0006` through `0009`, but snapshot files only exist through `0005`. Running `npm run db:generate` currently enters a Drizzle conflict prompt and fails in non-interactive shells.

**Fix / Recommended fix:** Reconcile migration snapshots with the current schema in a dedicated migration-maintenance pass. The specific risk of keeping it this way is that future schema changes may not generate reproducibly in CI or agent sessions, increasing the chance of hand-written migration drift.

### [OPEN] A-006 - Heap route coverage is mostly mocked

**File:** `tests/api/heap-*.test.ts`
**Severity:** Medium
**Type:** API correctness

**Description:** The heap route tests mock Drizzle chains heavily. That covers route branching but does not prove real SQLite constraints, migrations, joins, cascade delete behavior, or count aggregation.

**Fix / Recommended fix:** Add in-memory SQLite integration tests that run `migrate()` and exercise heap node, edge, todo link, and trigger link routes against the real schema.

### [OPEN] A-007 - React Flow graph interactions have no browser smoke coverage

**File:** `components/heap/HeapCanvas.tsx`, `app/heap/page.tsx`
**Severity:** Medium
**Type:** State machine

**Description:** React Flow is mocked in component tests. That leaves gaps around actual pointer interactions: connecting nodes, drag persistence, resize persistence, refresh behavior, and overlay positioning.

**Fix / Recommended fix:** Add Playwright or equivalent browser tests for `/heap`: create node, open sheet, link task, connect two nodes, refresh, and verify persisted graph state.

### [OPEN] A-008 - Heap API error responses expose raw exception text

**File:** `app/api/heap/**/*.ts`
**Severity:** Medium
**Type:** Security

**Description:** Several heap API catch blocks return `String(error)` to the client. In development this is convenient, but in production it can leak SQL details, filesystem paths, or internal implementation messages.

**Fix / Recommended fix:** Replace raw exception messages with stable public messages and log details server-side. The specific risk of keeping it this way is information disclosure during unexpected DB or validation failures.
