# Trigger Scheduling & Distribution Calendar — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users manually set when each trigger's next review fires, and see the distribution across a 6-week calendar on the Home page so they can spread clustered reviews.

**Architecture:** Add `snapToDate` (noon-UTC normalizer) to `reviewClock.ts` and `rescheduleTrigger` (direct `nextReviewAt` override) to `triggers.ts`. Wire a new `rescheduleDate` field into the existing `PATCH /api/triggers/[id]` route. Build a `ScheduleCalendar` client component (6-week grid + trigger list, select-then-tap to reschedule) and mount it in `app/page.tsx` between the ReviewBanner and CategoryCanvas.

**Tech Stack:** Next.js 15 App Router · TypeScript · Drizzle ORM · better-sqlite3 · Tailwind CSS · Vitest · React Testing Library · Zod

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/services/reviewClock.ts` | Modify | Add `snapToDate` pure utility |
| `lib/db/triggers.ts` | Modify | Add `rescheduleTrigger` function |
| `app/api/triggers/[id]/route.ts` | Modify | Add `rescheduleDate` Zod field + reschedule branch |
| `app/page.tsx` | Modify | Add active trigger fetch, pass to `ScheduleCalendar` |
| `components/ScheduleCalendar.tsx` | Create | 6-week calendar grid + trigger list + reschedule UX |
| `tests/reviewClock.test.ts` | Modify | Add `snapToDate` unit tests |
| `tests/triggers.test.ts` | Modify | Add `rescheduleTrigger` unit tests |
| `tests/api.trigger-route.test.ts` | Modify | Add reschedule branch API tests |
| `tests/components/ScheduleCalendar.test.tsx` | Create | RTL tests for calendar, badges, select-tap flow |

---

## Task 1: `snapToDate` utility (TDD)

**Files:**
- Modify: `lib/services/reviewClock.ts`
- Modify: `tests/reviewClock.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `tests/reviewClock.test.ts` and add this import and describe block **after** the existing tests:

```ts
import { isDueSoon, daysElapsed, snapToDate } from '@/lib/services/reviewClock'

describe('snapToDate', () => {
  it('sets the time to 12:00:00.000 UTC regardless of input time', () => {
    const input = new Date('2026-05-10T03:00:00.000Z') // 3am UTC
    const result = snapToDate(input)
    expect(result.getUTCHours()).toBe(12)
    expect(result.getUTCMinutes()).toBe(0)
    expect(result.getUTCSeconds()).toBe(0)
    expect(result.getUTCMilliseconds()).toBe(0)
  })

  it('preserves the calendar date (UTC year/month/day) of the input', () => {
    const input = new Date('2026-05-10T23:59:00.000Z') // late UTC
    const result = snapToDate(input)
    expect(result.getUTCFullYear()).toBe(2026)
    expect(result.getUTCMonth()).toBe(4) // May = 4
    expect(result.getUTCDate()).toBe(10)
  })

  it('does not mutate the input date', () => {
    const input = new Date('2026-05-10T08:00:00.000Z')
    const original = input.getTime()
    snapToDate(input)
    expect(input.getTime()).toBe(original)
  })

  it('two dates on the same calendar day produce equal results', () => {
    const a = new Date('2026-06-15T01:00:00.000Z')
    const b = new Date('2026-06-15T23:00:00.000Z')
    expect(snapToDate(a).getTime()).toBe(snapToDate(b).getTime())
  })
})
```

- [ ] **Step 2: Run to confirm the tests fail**

```bash
cd C:\Users\czw53\Downloads\projects\reminders_tool
npm test -- --reporter=verbose tests/reviewClock.test.ts
```

Expected: 4 failures — `snapToDate is not a function` or similar import error.

- [ ] **Step 3: Implement `snapToDate` in `reviewClock.ts`**

Add this function at the end of `lib/services/reviewClock.ts`:

```ts
/**
 * Normalises a user-selected date to noon UTC to avoid timezone edge cases
 * where a day-boundary selection could land on the wrong calendar day.
 * This is a one-time override utility — it does not affect acknowledgeTrigger logic.
 * Returns a new Date; does not mutate the input.
 */
export function snapToDate(date: Date): Date {
  const d = new Date(date)
  d.setUTCHours(12, 0, 0, 0)
  return d
}
```

- [ ] **Step 4: Run to confirm all tests pass**

```bash
npm test -- --reporter=verbose tests/reviewClock.test.ts
```

Expected: all existing tests + 4 new `snapToDate` tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/services/reviewClock.ts tests/reviewClock.test.ts
git commit -m "feat: add snapToDate utility to reviewClock"
```

---

## Task 2: `rescheduleTrigger` DB function (TDD)

**Files:**
- Modify: `lib/db/triggers.ts`
- Modify: `tests/triggers.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `tests/triggers.test.ts`. Add `rescheduleTrigger` to the import line:

```ts
import { createTrigger, acknowledgeTrigger, getTriggersForCategory, rescheduleTrigger } from '@/lib/db/triggers'
```

Add this describe block after the existing tests:

```ts
describe('rescheduleTrigger', () => {
  it('sets nextReviewAt to the given date', async () => {
    const [trigger] = await db.insert(schema.triggers).values({
      userId,
      categoryId,
      title: 'Reschedule test',
      reviewIntervalDays: 7,
      nextReviewAt: new Date(),
    }).returning()

    const newDate = new Date('2026-06-01T12:00:00.000Z')
    const updated = await rescheduleTrigger(db, trigger.id, newDate)

    expect(updated.nextReviewAt.getTime()).toBe(newDate.getTime())
  })

  it('does NOT change lastReviewedAt', async () => {
    const originalLastReview = new Date('2026-04-01T12:00:00.000Z')
    const [trigger] = await db.insert(schema.triggers).values({
      userId,
      categoryId,
      title: 'No touch lastReviewedAt',
      reviewIntervalDays: 7,
      nextReviewAt: new Date(),
      lastReviewedAt: originalLastReview,
    }).returning()

    await rescheduleTrigger(db, trigger.id, new Date('2026-06-15T12:00:00.000Z'))
    const [row] = await db.select().from(schema.triggers).where(eq(schema.triggers.id, trigger.id))

    expect(row.lastReviewedAt?.getTime()).toBe(originalLastReview.getTime())
  })

  it('does NOT change reviewIntervalDays', async () => {
    const [trigger] = await db.insert(schema.triggers).values({
      userId,
      categoryId,
      title: 'No touch interval',
      reviewIntervalDays: 14,
      nextReviewAt: new Date(),
    }).returning()

    await rescheduleTrigger(db, trigger.id, new Date('2026-06-15T12:00:00.000Z'))
    const [row] = await db.select().from(schema.triggers).where(eq(schema.triggers.id, trigger.id))

    expect(row.reviewIntervalDays).toBe(14)
  })

  it('throws when trigger id does not exist', async () => {
    await expect(
      rescheduleTrigger(db, 'nonexistent-id', new Date())
    ).rejects.toThrow('not found')
  })
})
```

You also need to add `eq` to the import from `drizzle-orm` if it isn't already there. Check the top of the file — it imports `{ describe, it, expect, beforeEach }` from vitest and the schema. Add this after the schema import if missing:

```ts
import { eq } from 'drizzle-orm'
```

- [ ] **Step 2: Run to confirm the tests fail**

```bash
npm test -- --reporter=verbose tests/triggers.test.ts
```

Expected: 4 failures — `rescheduleTrigger is not a function`.

- [ ] **Step 3: Implement `rescheduleTrigger` in `triggers.ts`**

Add this function at the end of `lib/db/triggers.ts`:

```ts
/**
 * Directly overrides nextReviewAt for a trigger (one-time anchor override).
 * Does NOT touch lastReviewedAt or reviewIntervalDays — this is not an acknowledgement.
 * Subsequent acknowledgeTrigger calls will compute from the new anchor as normal.
 */
export async function rescheduleTrigger(
  db: DrizzleDb,
  triggerId: string,
  date: Date
): Promise<Trigger> {
  const [updated] = await db
    .update(triggers)
    .set({ nextReviewAt: date })
    .where(eq(triggers.id, triggerId))
    .returning()

  if (!updated) throw new Error(`Trigger ${triggerId} not found`)
  return updated
}
```

- [ ] **Step 4: Run to confirm all tests pass**

```bash
npm test -- --reporter=verbose tests/triggers.test.ts
```

Expected: all existing tests + 4 new `rescheduleTrigger` tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/db/triggers.ts tests/triggers.test.ts
git commit -m "feat: add rescheduleTrigger DB function"
```

---

## Task 3: PATCH API — reschedule branch (TDD)

**Files:**
- Modify: `app/api/triggers/[id]/route.ts`
- Modify: `tests/api.trigger-route.test.ts`

**Background:** `tests/api.trigger-route.test.ts` already exists (listed as untracked in git status). Open it to see its existing structure before adding tests. The pattern is similar to the trigger CRUD tests — in-memory DB, seeded user/category/trigger.

- [ ] **Step 1: Read the existing API route test file**

Open `tests/api.trigger-route.test.ts` and understand how it creates test triggers and calls the route handlers. The tests below assume the same `makeTestDb`, `userId`, `categoryId`, and `triggerId` setup pattern.

- [ ] **Step 2: Write the failing tests**

The existing test file uses `vi.hoisted` to mock `getCurrentUser`, `getDb`, and `acknowledgeTrigger`. You need to extend those same mocks to cover `rescheduleTrigger`.

**2a — Extend the hoisted mocks** at the top of `tests/api.trigger-route.test.ts`. Add `rescheduleTrigger` to the `vi.hoisted` block:

```ts
const {
  revalidatePath,
  getCurrentUser,
  getDb,
  acknowledgeTrigger,
  rescheduleTrigger,  // ADD THIS
} = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
  acknowledgeTrigger: vi.fn(),
  rescheduleTrigger: vi.fn(),  // ADD THIS
}))
```

**2b — Extend the `vi.mock('@/lib/db/triggers')` call** to also export `rescheduleTrigger`:

```ts
vi.mock('@/lib/db/triggers', () => ({
  acknowledgeTrigger,
  rescheduleTrigger,  // ADD THIS
}))
```

**2c — Add the reschedule describe block** after the existing test:

```ts
describe('PATCH rescheduleDate', () => {
  it('calls rescheduleTrigger and returns 200 when date is valid and user owns the trigger', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1' })

    // Ownership check returns the trigger (user owns it)
    const ownershipQuery = {
      limit: vi.fn().mockResolvedValue([
        { id: 'trigger-1', userId: 'user-1', categoryId: 'cat-1' },
      ]),
    }
    const rescheduledTrigger = {
      id: 'trigger-1',
      userId: 'user-1',
      categoryId: 'cat-1',
      title: 'Test',
      nextReviewAt: new Date('2026-08-01T12:00:00.000Z'),
    }
    rescheduleTrigger.mockResolvedValue(rescheduledTrigger)

    getDb.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ownershipQuery),
        })),
      })),
    })

    const res = await PATCH(
      new Request('http://localhost/api/triggers/trigger-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rescheduleDate: '2026-08-01T12:00:00.000Z' }),
      }),
      { params: Promise.resolve({ id: 'trigger-1' }) }
    )

    expect(res.status).toBe(200)
    expect(rescheduleTrigger).toHaveBeenCalledWith(
      expect.anything(),
      'trigger-1',
      expect.any(Date)
    )
  })

  it('returns 404 and does NOT call rescheduleTrigger when trigger belongs to a different user', async () => {
    // user-2 is authenticated but trigger-1 belongs to user-1
    getCurrentUser.mockResolvedValue({ id: 'user-2' })

    // Ownership SELECT returns empty — no match for user-2
    const ownershipQuery = {
      limit: vi.fn().mockResolvedValue([]),
    }
    getDb.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ownershipQuery),
        })),
      })),
    })

    const res = await PATCH(
      new Request('http://localhost/api/triggers/trigger-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rescheduleDate: '2026-08-01T12:00:00.000Z' }),
      }),
      { params: Promise.resolve({ id: 'trigger-1' }) }
    )

    expect(res.status).toBe(404)
    // Critical: rescheduleTrigger must NOT have been called (IDOR guard)
    expect(rescheduleTrigger).not.toHaveBeenCalled()
  })

  it('returns 400 when rescheduleDate is not a valid ISO datetime', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1' })
    getDb.mockReturnValue({})

    const res = await PATCH(
      new Request('http://localhost/api/triggers/trigger-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rescheduleDate: 'not-a-date' }),
      }),
      { params: Promise.resolve({ id: 'trigger-1' }) }
    )

    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 3: Run to confirm the tests fail**

```bash
npm test -- --reporter=verbose tests/api.trigger-route.test.ts
```

Expected: failures for the new reschedule tests.

- [ ] **Step 4: Update the PATCH route**

Open `app/api/triggers/[id]/route.ts`. Make two changes:

**4a — Add imports at the top:**

```ts
import { acknowledgeTrigger, rescheduleTrigger } from '@/lib/db/triggers'
import { snapToDate } from '@/lib/services/reviewClock'
```

(Replace the existing `acknowledgeTrigger` import line.)

**4b — Add `rescheduleDate` to the Zod schema** (add it inside `UpdateTriggerSchema`):

```ts
// Special field: when provided (ISO datetime), directly overrides nextReviewAt
rescheduleDate: z.string().datetime().optional(),
```

**4c — Add the reschedule branch** in the PATCH handler, right after the `acknowledge` branch (before the general field update):

```ts
// Reschedule branch — ownership check, date validation, then override nextReviewAt
if (parsed.data.rescheduleDate) {
  const [owned] = await db
    .select()
    .from(triggers)
    .where(and(eq(triggers.id, id), eq(triggers.userId, user.id)))
    .limit(1)
  if (!owned) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })

  const requestedDate = new Date(parsed.data.rescheduleDate)
  const snapped = snapToDate(requestedDate)
  // Reject past dates: compare noon UTC of requested day vs noon UTC of today
  if (snapped.getTime() < snapToDate(new Date()).getTime()) {
    return NextResponse.json(
      { error: 'rescheduleDate must be today or a future date', code: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const trigger = await rescheduleTrigger(db, id, snapped)
  revalidateTriggerViews(trigger.categoryId)
  return NextResponse.json(trigger)
}
```

**4d — Strip `rescheduleDate` from the general update path.** The existing destructure line strips `acknowledge` — extend it:

```ts
const { acknowledge: _, rescheduleDate: __, ...fields } = parsed.data
```

- [ ] **Step 5: Run to confirm all tests pass**

```bash
npm test -- --reporter=verbose tests/api.trigger-route.test.ts
```

Expected: all passing.

- [ ] **Step 6: Run the full test suite to check for regressions**

```bash
npm test
```

Expected: all tests passing.

- [ ] **Step 7: Commit**

```bash
git add app/api/triggers/[id]/route.ts tests/api.trigger-route.test.ts
git commit -m "feat: add rescheduleDate to PATCH /api/triggers/[id]"
```

---

## Task 4: Fetch active triggers in `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`

No dedicated test for this task — the data fetch is a server component concern exercised by the E2E smoke test in Task 6.

- [ ] **Step 1: Add the trigger fetch**

Open `app/page.tsx`. After the `categoryList` fetch (around line 29), add:

```ts
// Fetch all active triggers for the home-page scheduling calendar
const allActiveTriggers = await db
  .select()
  .from(triggers)
  .where(and(eq(triggers.userId, user.id), eq(triggers.status, 'active')))
```

Confirmed: `triggers` (from `@/lib/db/schema`) and `and`/`eq` (from `drizzle-orm`) are already imported at the top of `app/page.tsx`.

- [ ] **Step 2: Add the ScheduleCalendar import**

Add to the existing import block at the top:

```ts
import { ScheduleCalendar } from '@/components/ScheduleCalendar'
```

- [ ] **Step 3: Serialize trigger dates for the client component**

Next.js serializes props from server to client components as JSON — `Date` objects become ISO strings. Normalize before passing:

```ts
// Serialize Date fields so they survive the server→client boundary as strings
const serializedTriggers = allActiveTriggers.map(t => ({
  ...t,
  nextReviewAt: t.nextReviewAt.toISOString(),
  lastReviewedAt: t.lastReviewedAt?.toISOString() ?? null,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
}))
```

- [ ] **Step 4: Mount ScheduleCalendar in JSX**

In the JSX return, add `<ScheduleCalendar>` between `<ReviewBanner>` and the `<section>` that contains the categories. Place it inside the `max-w-2xl` container div:

```tsx
{/* ReviewBanner — only shown when items are due */}
<ReviewBanner count={Number(dueCount)} />

{/* Scheduling calendar — spread triggers across the next 6 weeks */}
<ScheduleCalendar triggers={serializedTriggers} />
```

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: fetch active triggers and mount ScheduleCalendar on home page"
```

---

## Task 5: `ScheduleCalendar` component (TDD)

**Files:**
- Create: `components/ScheduleCalendar.tsx`
- Create: `tests/components/ScheduleCalendar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/components/ScheduleCalendar.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ScheduleCalendar } from '@/components/ScheduleCalendar'

// Helper: create a serialized trigger (dates as ISO strings, matching server→client shape)
function makeTrigger(overrides: Record<string, unknown> = {}) {
  const base = new Date()
  base.setUTCHours(12, 0, 0, 0)
  return {
    id: 'trig-1',
    userId: 'user-1',
    categoryId: 'cat-1',
    title: 'Test trigger',
    fullContent: '',
    summary: null,
    summaryStatus: 'pending' as const,
    priority: 2,
    reviewIntervalDays: 7,
    lastReviewedAt: null,
    nextReviewAt: base.toISOString(),
    status: 'active' as const,
    notifyChannel: null,
    agentMetadata: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('ScheduleCalendar', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('renders the Schedule section header', () => {
    render(<ScheduleCalendar triggers={[]} />)
    expect(screen.getByText(/schedule/i)).toBeTruthy()
  })

  it('collapses and expands when the header is clicked', () => {
    render(<ScheduleCalendar triggers={[makeTrigger()]} />)
    // Starts open — trigger list visible
    expect(screen.getByText('Test trigger')).toBeTruthy()
    // Click header to collapse
    fireEvent.click(screen.getByRole('button', { name: /schedule/i }))
    expect(screen.queryByText('Test trigger')).toBeNull()
    // Click again to expand
    fireEvent.click(screen.getByRole('button', { name: /schedule/i }))
    expect(screen.getByText('Test trigger')).toBeTruthy()
  })

  it('shows a green badge for 1 trigger due on a day', () => {
    // Make a trigger due tomorrow at noon UTC so it lands in the calendar
    const tomorrow = new Date()
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    tomorrow.setUTCHours(12, 0, 0, 0)
    render(<ScheduleCalendar triggers={[makeTrigger({ nextReviewAt: tomorrow.toISOString() })]} />)
    // badge with count "1" and green styling
    const badge = screen.getByText('1')
    expect(badge.className).toContain('green')
  })

  it('shows a yellow badge for 2 triggers due on the same day', () => {
    const tomorrow = new Date()
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    tomorrow.setUTCHours(12, 0, 0, 0)
    const t1 = makeTrigger({ id: 'trig-1', title: 'T1', nextReviewAt: tomorrow.toISOString() })
    const t2 = makeTrigger({ id: 'trig-2', title: 'T2', nextReviewAt: tomorrow.toISOString() })
    render(<ScheduleCalendar triggers={[t1, t2]} />)
    const badge = screen.getByText('2')
    expect(badge.className).toContain('yellow')
  })

  it('shows a red badge for 4 triggers due on the same day', () => {
    const tomorrow = new Date()
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    tomorrow.setUTCHours(12, 0, 0, 0)
    const triggers = Array.from({ length: 4 }, (_, i) =>
      makeTrigger({ id: `trig-${i}`, title: `T${i}`, nextReviewAt: tomorrow.toISOString() })
    )
    render(<ScheduleCalendar triggers={triggers} />)
    const badge = screen.getByText('4')
    expect(badge.className).toContain('red')
  })

  it('selecting a trigger shows reschedule hint text', () => {
    render(<ScheduleCalendar triggers={[makeTrigger()]} />)
    fireEvent.click(screen.getByText('Test trigger'))
    expect(screen.getByText(/tap a day to reschedule/i)).toBeTruthy()
  })

  it('deselects a trigger when clicked a second time', () => {
    render(<ScheduleCalendar triggers={[makeTrigger()]} />)
    fireEvent.click(screen.getByText('Test trigger'))
    expect(screen.getByText(/tap a day to reschedule/i)).toBeTruthy()
    fireEvent.click(screen.getByText('Test trigger'))
    expect(screen.queryByText(/tap a day to reschedule/i)).toBeNull()
  })

  it('calls PATCH with rescheduleDate when a future day is clicked while a trigger is selected', async () => {
    // Make trigger due in the future
    const inFuture = new Date()
    inFuture.setUTCDate(inFuture.getUTCDate() + 10)
    inFuture.setUTCHours(12, 0, 0, 0)
    render(<ScheduleCalendar triggers={[makeTrigger({ nextReviewAt: inFuture.toISOString() })]} />)

    // Select the trigger
    fireEvent.click(screen.getByText('Test trigger'))
    // Find a future day button and click it (day 14 from today is always future and in the grid)
    const futureDay = new Date()
    futureDay.setDate(futureDay.getDate() + 14)
    const dayLabel = String(futureDay.getDate())
    // There may be multiple cells with the same date number — find one that is not disabled
    const dayButtons = screen.getAllByRole('button')
    const targetButton = dayButtons.find(
      b => b.textContent?.includes(dayLabel) && !b.hasAttribute('disabled')
    )
    if (targetButton) fireEvent.click(targetButton)

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/triggers/trig-1'),
        expect.objectContaining({ method: 'PATCH' })
      )
    })
  })

  it('shows an error message and rolls back when PATCH fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: async () => 'Server error' }))

    const inFuture = new Date()
    inFuture.setUTCDate(inFuture.getUTCDate() + 10)
    inFuture.setUTCHours(12, 0, 0, 0)
    render(<ScheduleCalendar triggers={[makeTrigger({ nextReviewAt: inFuture.toISOString() })]} />)

    fireEvent.click(screen.getByText('Test trigger'))
    const dayButtons = screen.getAllByRole('button')
    const futureDay = new Date()
    futureDay.setDate(futureDay.getDate() + 7)
    const targetButton = dayButtons.find(
      b => b.textContent?.includes(String(futureDay.getDate())) && !b.hasAttribute('disabled')
    )
    if (targetButton) fireEvent.click(targetButton)

    await waitFor(() => {
      expect(screen.getByText(/failed to reschedule/i)).toBeTruthy()
    })
  })
})
```

- [ ] **Step 2: Run to confirm the tests fail**

```bash
npm test -- --reporter=verbose tests/components/ScheduleCalendar.test.tsx
```

Expected: failures — `ScheduleCalendar` module not found.

- [ ] **Step 3: Create `components/ScheduleCalendar.tsx`**

Create `components/ScheduleCalendar.tsx` with the full implementation:

```tsx
/**
 * ScheduleCalendar — home-page scheduling distribution tool.
 * Shows a rolling 6-week calendar with trigger counts per day.
 * User selects a trigger from the list below, then taps a day to reschedule it.
 * This is NOT a full calendar product — it is a spreading/distribution utility.
 * The future AI calendar agent (Google Calendar integration) is a separate feature.
 */
'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { Trigger } from '@/lib/db/schema'

// Serialized shape from server component — Date fields arrive as ISO strings
type SerializedTrigger = Omit<Trigger, 'nextReviewAt' | 'lastReviewedAt' | 'createdAt' | 'updatedAt'> & {
  nextReviewAt: string
  lastReviewedAt: string | null
  createdAt: string
  updatedAt: string
}

interface ScheduleCalendarProps {
  triggers: SerializedTrigger[]
}

// --- Pure helpers ---

/** Start of today at local midnight */
function startOfLocalToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** Format a Date as YYYY-MM-DD in local time — used as a map key */
function toLocalDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Get 42 calendar days starting from today */
function getCalendarDays(): Date[] {
  const today = startOfLocalToday()
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    return d
  })
}

/** Count badge Tailwind color class */
function badgeColor(count: number): string {
  if (count === 1) return 'bg-green-500'
  if (count <= 3) return 'bg-yellow-500'
  return 'bg-red-500'
}

// Day-of-week header labels (Mon-indexed)
const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function ScheduleCalendar({ triggers: initialTriggers }: ScheduleCalendarProps) {
  const [isOpen, setIsOpen] = useState(true)
  // Local trigger state for optimistic updates — dates stored as ISO strings
  const [localTriggers, setLocalTriggers] = useState(initialTriggers)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const today = startOfLocalToday()
  const todayKey = toLocalDateKey(today)
  // Monday-indexed day offset for today (to pad the first calendar row)
  const todayDow = (today.getDay() + 6) % 7 // JS Sun=0 → Mon-indexed 0

  // 42 calendar days — stable reference (doesn't change during session)
  const calendarDays = useMemo(() => getCalendarDays(), [])

  // Group triggers by their nextReviewAt local date key
  const triggersByDate = useMemo(() => {
    const map = new Map<string, SerializedTrigger[]>()
    for (const t of localTriggers) {
      const key = toLocalDateKey(new Date(t.nextReviewAt))
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    return map
  }, [localTriggers])

  // Sorted trigger list for the spread panel
  const sortedTriggers = useMemo(
    () => [...localTriggers].sort((a, b) =>
      new Date(a.nextReviewAt).getTime() - new Date(b.nextReviewAt).getTime()
    ),
    [localTriggers]
  )

  async function handleDayClick(day: Date) {
    if (!selectedId) return
    if (day < today) return // past days are non-interactive

    // Snap to noon UTC
    const snapped = new Date(day)
    snapped.setUTCHours(12, 0, 0, 0)
    const snappedIso = snapped.toISOString()

    // Optimistic update
    const previous = localTriggers
    setLocalTriggers(prev =>
      prev.map(t => t.id === selectedId ? { ...t, nextReviewAt: snappedIso } : t)
    )
    setSelectedId(null)
    setError(null)

    try {
      const res = await fetch(`/api/triggers/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rescheduleDate: snappedIso }),
      })
      if (!res.ok) throw new Error(await res.text())
    } catch {
      // Roll back optimistic update and surface error
      setLocalTriggers(previous)
      setError('Failed to reschedule. Please try again.')
    }
  }

  const selectedTrigger = localTriggers.find(t => t.id === selectedId)

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Collapsible header */}
      <button
        aria-label="Schedule"
        className="w-full flex items-center justify-between px-4 py-3 bg-background hover:bg-muted/30 transition-colors"
        onClick={() => setIsOpen(o => !o)}
      >
        <span className="text-xs font-mono font-medium uppercase tracking-widest text-muted-foreground">
          Schedule
        </span>
        {isOpen
          ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground" />
        }
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-3">
          {/* Error feedback */}
          {error && (
            <p className="text-xs text-destructive pt-2">{error}</p>
          )}

          {/* Hint when a trigger is selected */}
          {selectedTrigger && (
            <p className="text-xs text-muted-foreground pt-2">
              Tap a day to reschedule{' '}
              <span className="text-foreground font-medium">{selectedTrigger.title}</span>
              {' '}— or tap the trigger again to cancel
            </p>
          )}

          {/* Day-of-week header row */}
          <div className="grid grid-cols-7 gap-1 text-center pt-1">
            {DOW_LABELS.map(d => (
              <div key={d} className="text-[10px] font-mono text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {/* Calendar grid — padded to align first day to its weekday */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: todayDow }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {calendarDays.map(day => {
              const key = toLocalDateKey(day)
              const dayTriggers = triggersByDate.get(key) ?? []
              const isPast = day < today
              const isToday = key === todayKey
              const isSelecting = !!selectedId

              return (
                <button
                  key={key}
                  disabled={isPast}
                  onClick={() => handleDayClick(day)}
                  className={[
                    'relative flex flex-col items-center justify-center rounded-lg py-1.5 text-xs transition-colors min-h-[2.5rem]',
                    isPast
                      ? 'opacity-30 cursor-not-allowed'
                      : isSelecting
                        ? 'hover:bg-primary/20 cursor-pointer'
                        : 'cursor-default',
                    isToday ? 'ring-1 ring-primary' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <span className={isToday ? 'font-bold text-primary' : 'text-foreground'}>
                    {day.getDate()}
                  </span>
                  {dayTriggers.length > 0 && (
                    <span
                      className={`mt-0.5 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center ${badgeColor(dayTriggers.length)}`}
                    >
                      {dayTriggers.length}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Spread triggers list */}
          <div className="space-y-1 pt-2 border-t border-border">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest pb-1">
              All triggers
            </p>
            {sortedTriggers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active triggers</p>
            ) : (
              sortedTriggers.map(t => {
                const isSelected = t.id === selectedId
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(isSelected ? null : t.id)}
                    className={[
                      'w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-colors',
                      isSelected
                        ? 'ring-2 ring-primary bg-primary/10'
                        : 'hover:bg-muted/50',
                    ].join(' ')}
                  >
                    <span className="truncate font-medium">{t.title}</span>
                    <span className="shrink-0 ml-2 font-mono text-muted-foreground">
                      {new Date(t.nextReviewAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the component tests**

```bash
npm test -- --reporter=verbose tests/components/ScheduleCalendar.test.tsx
```

Expected: all tests passing.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: all tests passing — no regressions.

- [ ] **Step 6: Commit**

```bash
git add components/ScheduleCalendar.tsx tests/components/ScheduleCalendar.test.tsx
git commit -m "feat: add ScheduleCalendar component"
```

---

## Task 6: Smoke test and final commit

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Open `http://localhost:3000` in a browser.

- [ ] **Step 2: Smoke test the calendar**

Check:
- [ ] The Schedule section appears between the ReviewBanner and the category bubbles
- [ ] Clicking the Schedule header collapses and re-expands it
- [ ] If you have active triggers, they appear in the "All triggers" list with dates
- [ ] Count badges appear on days that have triggers due
- [ ] Clicking a trigger in the list selects it (ring appears + hint text shows)
- [ ] Clicking a future day while a trigger is selected reschedules it (date updates in the list + badge moves on the calendar)
- [ ] Clicking the same trigger again deselects without making a network call
- [ ] Past days are dimmed and clicking them does nothing

- [ ] **Step 3: Verify no console errors**

Check the browser console and terminal for any TypeScript or runtime errors.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: trigger scheduling distribution calendar on home page"
```

---

## Reference: Running tests

```bash
npm test                          # All tests once
npm run test:watch                # Watch mode
npm test -- tests/reviewClock.test.ts   # Single file
npm test -- --reporter=verbose    # Verbose output
```
