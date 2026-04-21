/**
 * ICS Parser Service
 *
 * Fetches an ICS subscription URL and parses it into typed calendar events.
 * Uses node-ical for parsing. All dates are returned as JS Date objects.
 *
 * node-ical is a CommonJS module — imported with `import * as ical` to avoid
 * ESM/CJS interop issues.
 */
import * as ical from 'node-ical'

export interface IcsEvent {
  uid: string
  title: string
  startAt: Date
  endAt: Date
}

/**
 * Fetches an ICS file from the given URL and parses it into a list of events.
 *
 * @param url - Public or authenticated ICS subscription URL
 * @returns Array of parsed calendar events (VEVENT components only)
 * @throws Error if the HTTP response is not 2xx
 */
export async function fetchAndParseIcs(url: string): Promise<IcsEvent[]> {
  // Fetch the raw ICS text from the remote URL
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ICS fetch failed: ${res.status}`)
  const text = await res.text()

  // Parse the ICS text into an object keyed by UID/component-id
  const parsed = ical.sync.parseICS(text)
  const events: IcsEvent[] = []

  for (const key of Object.keys(parsed)) {
    const comp = parsed[key]

    // Skip non-event components (VTIMEZONE, VALARM, etc.)
    if (comp.type !== 'VEVENT') continue

    // Skip events missing required fields
    if (!comp.start || !comp.end || !comp.summary) continue

    events.push({
      uid: comp.uid ?? key,
      title: String(comp.summary),
      startAt: new Date(comp.start),
      endAt: new Date(comp.end),
    })
  }

  return events
}
