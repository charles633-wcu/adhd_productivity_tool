// Server component — fetches all calendar data and passes to CalendarClient.
// Re-fetches ICS in background if stale (>1 hour).
export const dynamic = 'force-dynamic'

import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import {
  listEventCategories, listEventsInRange,
  getIcsSubscription, upsertIcsSubscription,
} from '@/lib/db/calendar'
import { fetchAndParseIcs } from '@/lib/services/icsParser'
import { expandRepeatingEvent } from '@/lib/services/repeatExpander'
import { CalendarClient } from '@/components/CalendarClient'

export default async function CalendarPage() {
  const user = await getCurrentUser()
  const db = getDb()

  // Date window: 3 months back to 6 months forward to cover all dots in view
  const rangeFrom = new Date()
  rangeFrom.setMonth(rangeFrom.getMonth() - 3)
  const rangeTo = new Date()
  rangeTo.setMonth(rangeTo.getMonth() + 6)

  const [eventRows, categoryRows, [icsSub]] = await Promise.all([
    listEventsInRange(db, user.id, rangeFrom, rangeTo),
    listEventCategories(db, user.id),
    getIcsSubscription(db, user.id),
  ])

  // Background ICS re-fetch if stale (>1 hour) — fire-and-forget, don't block page render
  let icsEvents: { uid: string; title: string; startAt: string; endAt: string }[] = []
  if (icsSub) {
    const staleMs = 60 * 60 * 1000
    const isStale = !icsSub.lastFetchedAt || Date.now() - icsSub.lastFetchedAt.getTime() > staleMs
    if (isStale) {
      fetchAndParseIcs(icsSub.url)
        .then(events => upsertIcsSubscription(db, user.id, icsSub.url, JSON.stringify(events), new Date()))
        .catch(() => { /* silent — cached events still shown */ })
    }
    if (icsSub.cachedEventsJson) {
      try {
        const parsed = JSON.parse(icsSub.cachedEventsJson) as Array<{ uid: string; title: string; startAt: string; endAt: string }>
        icsEvents = parsed
      } catch { /* bad cache — skip */ }
    }
  }

  // Expand repeating events into occurrences within range
  const expandedEvents = eventRows.flatMap(ev =>
    expandRepeatingEvent(
      {
        ...ev,
        startAt: ev.startAt,
        endAt: ev.endAt,
        repeatFrequency: ev.repeatFrequency ?? null,
        repeatInterval: ev.repeatInterval ?? null,
        repeatEndsAt: ev.repeatEndsAt ?? null,
      },
      rangeFrom,
      rangeTo,
    ).map(occ => ({
      ...occ,
      startAt: occ.startAt.toISOString(),
      endAt: occ.endAt.toISOString(),
      color: ev.color ?? null,
      categoryId: ev.categoryId ?? null,
    })),
  )

  return (
    <CalendarClient
      initialEvents={expandedEvents}
      initialIcsEvents={icsEvents}
      eventCategories={categoryRows}
      icsUrl={icsSub?.url ?? null}
    />
  )
}
