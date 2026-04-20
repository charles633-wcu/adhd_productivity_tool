# Audit — 2026-04-20

**Scope:** Review scheduling logic — `reviewClock.ts`, `lib/db/triggers.ts`, `app/api/triggers/route.ts`, `app/api/triggers/[id]/route.ts`, `components/TriggerCard.tsx`
**Auditor:** Claude Sonnet 4.6 + Codex (review-clock-clarity worktree)
**Status:** 2 fixed inline · 0 open

---

## Findings

### [FIXED] A-001 — Stale `nextReviewAt` when `reviewIntervalDays` is changed via PATCH

**File:** `app/api/triggers/[id]/route.ts`
**Severity:** High
**Type:** State machine

**Description:** When a user edited a trigger's review interval (e.g., changed from 14 days to 4 days), the PATCH handler saved the new `reviewIntervalDays` value but did not recompute `nextReviewAt`. This caused a visible inconsistency: the card would display "last reviewed 5 days ago / every 4 days" — clearly overdue — but the alert and review queue remained silent because `isDueSoon()` checks `nextReviewAt`, which still pointed to the old (stale) future date. The trigger appeared missed but received no alert.

**Plain English:** Imagine changing your alarm to go off every 4 hours, but the actual alarm hardware still has the old 2-week schedule. Your clock display says you're late, but the bell never rings.

**Fix:** PATCH now fetches the current trigger row and recomputes `nextReviewAt = deriveNextReviewAt(lastReviewedAt ?? createdAt, newInterval)` whenever `reviewIntervalDays` is in the update payload. A shared `deriveNextReviewAt()` helper in `reviewClock.ts` is now used by creation, acknowledgement, and interval-edit paths for consistency.

---

### [FIXED] A-002 — Missing 65-minute grace period on `acknowledgeTrigger`

**File:** `lib/db/triggers.ts`
**Severity:** Medium
**Type:** State machine

**Description:** After the `deriveNextReviewAt` refactor, `acknowledgeTrigger` used `lastReviewedAt + interval` exactly, with no buffer. For a 1-day interval trigger, `nextReviewAt` would land exactly equal to `now + 1 day`, which is the `isDueSoon` boundary condition (`nextReviewAt <= now + 1 day`). The trigger would immediately re-appear in the review banner the moment after being acknowledged.

**Plain English:** You clear a reminder, and it instantly reappears because the next due time is exactly "now + 24 hours" and the alert window is "anything within the next 24 hours."

**Fix:** Restored the 65-minute grace: `acknowledgeTrigger` schedules from the original due date (`nextReviewAt + interval`) to preserve stagger, falling back to `now + interval + 65min` when very overdue. The 65-minute buffer ensures a just-acknowledged trigger is safely outside the 24-hour alert window.
