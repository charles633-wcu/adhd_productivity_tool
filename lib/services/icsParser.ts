/**
 * ICS Parser Service
 *
 * Fetches an ICS subscription URL and parses VEVENT blocks into typed events.
 * Hand-written line-by-line parser — no external dependencies, no rrule support needed.
 * (node-ical was removed: its rrule-temporal dep breaks Next.js SSR via @js-temporal/polyfill.)
 */

export interface IcsEvent {
  uid: string
  title: string
  startAt: Date
  endAt: Date
}

// ICS lines may be folded: continuation lines start with a space or tab
function unfold(text: string): string {
  return text.replace(/\r?\n[ \t]/g, '')
}

// Parse an ICS date value string (the part after the colon) into a JS Date
function parseIcsDate(value: string): Date {
  const clean = value.trim()

  if (clean.length === 8) {
    // Date-only: YYYYMMDD — treat as local noon to avoid day-boundary issues
    const y = +clean.slice(0, 4)
    const m = +clean.slice(4, 6) - 1
    const d = +clean.slice(6, 8)
    return new Date(y, m, d, 12, 0, 0)
  }

  // Date-time: YYYYMMDDTHHMMSS[Z]
  const y  = +clean.slice(0, 4)
  const mo = +clean.slice(4, 6) - 1
  const d  = +clean.slice(6, 8)
  const h  = +clean.slice(9, 11)
  const mi = +clean.slice(11, 13)
  const s  = +clean.slice(13, 15)

  return clean.endsWith('Z')
    ? new Date(Date.UTC(y, mo, d, h, mi, s))
    : new Date(y, mo, d, h, mi, s)
}

/**
 * Fetches a remote ICS document and parses its complete VEVENT entries.
 * @param url - HTTP(S) location of an ICS feed.
 * @returns A promise resolving to parsed events that contain UID, title, start, and end.
 * @throws If the remote response is not successful.
 */
export async function fetchAndParseIcs(url: string): Promise<IcsEvent[]> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ICS fetch failed: ${res.status}`)
  const text = await res.text()
  return parseIcsText(text)
}

/**
 * Parses VEVENT entries from unfolded iCalendar source text.
 * @param raw - Raw ICS document text, optionally containing folded lines.
 * @returns Complete events; incomplete VEVENT records are omitted.
 */
export function parseIcsText(raw: string): IcsEvent[] {
  const lines  = unfold(raw).split(/\r?\n/)
  const events: IcsEvent[] = []

  let inEvent = false
  let uid     = ''
  let title   = ''
  let startAt: Date | null = null
  let endAt:   Date | null = null

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true; uid = ''; title = ''; startAt = null; endAt = null
      continue
    }
    if (line === 'END:VEVENT') {
      inEvent = false
      if (uid && title && startAt && endAt) events.push({ uid, title, startAt, endAt })
      continue
    }
    if (!inEvent) continue

    // Split on first colon — everything before is prop+params, everything after is value
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const propFull = line.slice(0, colonIdx)  // e.g. "DTSTART;TZID=America/New_York"
    const value    = line.slice(colonIdx + 1) // e.g. "20260415T090000"
    const propName = propFull.split(';')[0].toUpperCase()

    switch (propName) {
      case 'UID':     uid   = value; break
      case 'SUMMARY': title = value; break
      case 'DTSTART': startAt = parseIcsDate(value); break
      case 'DTEND':   endAt   = parseIcsDate(value); break
    }
  }

  return events
}
