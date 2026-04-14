# Design: Trigger Scheduling & Distribution Calendar

**Date:** 2026-04-14
**Status:** Approved
**Author:** Claude (claude-sonnet-4-6)

---

## Problem

When multiple triggers are created in the same time window, they all become due on the same day (e.g., day 7 for all 7-day triggers). There is no way to spread them out — the user gets overwhelmed by a cluster of notifications at once.

## Goal

Give users per-trigger scheduling control: manually set when a trigger's next review fires, with a visual calendar to see the distribution and spread triggers across days.

## Out of scope

This is a **scheduling distribution tool**, not a full calendar product. A future AI-powered calendar feature will integrate with the user's real calendar (e.g., Google Calendar) via an agent. That feature is independent and should be designed separately.

---

## Approach

**Anchor date override** — `nextReviewAt` already exists on the trigger. Manual scheduling is a one-time direct override of that field. The review interval is unchanged; subsequent reviews continue from the new anchor using the existing `acknowledgeTrigger` logic.

Note: day-of-week pinning was considered but rejected — it only works cleanly for 7/14/21-day intervals and breaks for arbitrary intervals like 3 or 10 days.

---

## Data Model

No schema changes. No new migrations.

`nextReviewAt` on the `triggers` table is the single source of truth for when a trigger is due. Manual scheduling writes to this field directly via a new `rescheduleTrigger` function.

---

## Logic

### `snapToDate(date: Date): Date` — `lib/services/reviewClock.ts`

Pure utility. Normalizes a user-selected date to **noon UTC** to avoid timezone edge cases where a day-boundary selection could land on the wrong calendar day. This snap applies only to the manual override — it does not carry forward into subsequent `acknowledgeTrigger` calls, which continue to compute `nextReviewAt = now + intervalMs + graceMs` from the moment of acknowledgement as usual.

```ts
export function snapToDate(date: Date): Date {
  const d = new Date(date)
  d.setUTCHours(12, 0, 0, 0)
  return d
}
```

### `rescheduleTrigger(db, triggerId, date)` — `lib/db/triggers.ts`

Sets `nextReviewAt` directly. Does not touch `lastReviewedAt` or `reviewIntervalDays` — this is a one-time anchor override, not an acknowledgement.

```ts
export async function rescheduleTrigger(
  db: DrizzleDb,
  triggerId: string,
  date: Date
): Promise<Trigger>
```

### `PATCH /api/triggers/[id]`

Add `rescheduleDate` (ISO string, optional) to the Zod request schema. When present, calls `rescheduleTrigger`. Validated: must be today or a future date (using the user's local calendar date — see Timezone note below).

**Ownership:** Before calling `rescheduleTrigger`, the route must verify that the trigger belongs to the authenticated user — follow the same ownership-check pattern used by the existing `acknowledge` branch in this route. Skipping this check is an IDOR vulnerability.

---

## UI

### `ScheduleCalendar` component — `components/ScheduleCalendar.tsx`

A client component mounted in `app/page.tsx` between `<ReviewBanner>` and `<CategoryCanvas>`. Collapsible via a chevron toggle so it doesn't crowd the home when not in use.

**Calendar grid:**
- Rolling **6-week view** (42 days from today), laid out as a standard Mon–Sun grid
- Each day cell shows a count badge when triggers are due that day
  - No badge: no triggers due
  - Green (`bg-green-500`): 1 trigger
  - Yellow (`bg-yellow-500`): 2–3 triggers
  - Red (`bg-red-500`): 4+ triggers (cluster warning)
  - Colors use existing Tailwind utility classes (`bg-green-500`, `bg-yellow-500`, `bg-red-500`) — appropriate for the current single-theme scope; if a themed design system is added later, replace with semantic tokens
- Today is highlighted with a distinct border/background
- **Past days** are defined as any date before today in the user's local calendar date (i.e., `date < startOfLocalToday()`). Past days are dimmed and non-interactive. The API validation uses the same definition so a same-day selection is never incorrectly rejected.

**Spread triggers list:**
- Below the calendar: all active triggers sorted by `nextReviewAt`, grouped by date
- Clusters (multiple triggers on the same day) are visually grouped
- Tap a trigger → it becomes **selected** (highlighted ring). Tapping again deselects.
- While a trigger is selected, tapping any future day on the calendar sets its `nextReviewAt` to that day (via PATCH)
- The calendar and list update **optimistically** — on PATCH failure the optimistic update is rolled back and a visible error is shown (toast or inline message consistent with the existing `HomeClient` error pattern)

### `app/page.tsx`

Extend the server-side data fetch to include all active triggers for the user (in addition to the existing categories fetch). Pass triggers down as a prop to `ScheduleCalendar`. Note: this loads all active trigger rows on the home page — acceptable for MVP scale; revisit with pagination if trigger counts grow large.

---

## Files Changed

| File | Change |
|---|---|
| `lib/services/reviewClock.ts` | Add `snapToDate(date: Date): Date` |
| `lib/db/triggers.ts` | Add `rescheduleTrigger(db, triggerId, date): Promise<Trigger>` |
| `app/api/triggers/[id]/route.ts` | Add `rescheduleDate` to PATCH Zod schema, ownership check, call `rescheduleTrigger` |
| `components/ScheduleCalendar.tsx` | New component — 6-week grid, count badges, select-then-assign flow |
| `app/page.tsx` | Extend data fetch to include all active triggers; pass to `ScheduleCalendar` |

No new pages. No new DB columns. No new migrations.

---

## Testing

- Unit: `snapToDate` — noon UTC normalization, timezone edge cases, same-day selection not rejected
- Unit: `rescheduleTrigger` — sets `nextReviewAt`, does not mutate `lastReviewedAt` or interval
- Unit: `PATCH /api/triggers/[id]` — rescheduleDate validates (future only, rejects past dates, ownership check blocks cross-user access)
- RTL: `ScheduleCalendar` — count badges render correctly, select-then-tap flow updates the trigger list, optimistic rollback on failure

---

## Future considerations

- The future AI calendar agent will read the user's real calendar and present a smarter scheduling view. That is a separate feature and should not influence this design.
- If schedule templates become a UX concept ("apply Monday schedule to all Work triggers"), a separate `schedules` table can be introduced then. Not needed now.
