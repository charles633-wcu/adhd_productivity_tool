// Validation error helpers shared by API routes (server) and forms (client).
//
// Server: describeValidationError() turns Zod issues into a short human sentence
// ("Too many characters in Title: 523/500") instead of the raw JSON issue dump.
// Client: readApiError() pulls that sentence out of a failed response so forms can
// show what actually went wrong instead of a generic "Failed to save".
// Kept free of runtime zod imports so client components can use it cheaply.
import type { ZodError } from 'zod'

// Single source of truth for trigger title length — used by POST and PATCH routes and both forms
export const TRIGGER_TITLE_MAX = 500

// Friendly names for request fields; unknown fields fall back to their key
const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  fullContent: 'Notes',
  categoryId: 'Category',
  priority: 'Priority',
  reviewIntervalDays: 'Review interval',
  note: 'Note',
  summary: 'Summary',
  rescheduleDate: 'Reschedule date',
}

function labelFor(path: PropertyKey[]): string {
  const key = String(path[path.length - 1] ?? 'Request')
  return FIELD_LABELS[key] ?? key
}

// Walks the request body along an issue path to recover the offending value (Zod v4 omits it)
function valueAt(input: unknown, path: PropertyKey[]): unknown {
  let current = input
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<PropertyKey, unknown>)[key]
  }
  return current
}

/**
 * Client-side title check so the form can explain the problem before a round trip.
 * Returns null when valid, otherwise the same message the server would send.
 */
export function titleLengthError(title: string): string | null {
  if (!title.trim()) return 'Title is required'
  if (title.length > TRIGGER_TITLE_MAX) {
    return `Too many characters in Title: ${title.length}/${TRIGGER_TITLE_MAX}`
  }
  return null
}

/**
 * Converts a Zod validation error into a readable message, one clause per issue.
 *
 * @param error - The ZodError from safeParse
 * @param input - The raw request body, used to report actual string lengths
 */
export function describeValidationError(error: ZodError, input?: unknown): string {
  const messages = error.issues.map(issue => {
    const label = labelFor(issue.path)
    if (issue.code === 'too_big' && issue.origin === 'string') {
      const value = valueAt(input, issue.path)
      const count = typeof value === 'string' ? `${value.length}/${issue.maximum}` : `max ${issue.maximum}`
      return `Too many characters in ${label}: ${count}`
    }
    if (issue.code === 'too_small' && issue.origin === 'string') {
      return Number(issue.minimum) <= 1
        ? `${label} is required`
        : `${label} needs at least ${issue.minimum} characters`
    }
    if (issue.code === 'too_big') return `${label} must be at most ${issue.maximum}`
    if (issue.code === 'too_small') return `${label} must be at least ${issue.minimum}`
    if (issue.code === 'invalid_type') return `${label} is missing or invalid`
    // Anything else (refine messages, formats) — keep Zod's own text, prefixed when field-specific
    return issue.path.length ? `${label}: ${issue.message}` : issue.message
  })
  return messages.join('; ')
}

/**
 * Reads the `error` string from a failed API response, falling back to a generic
 * message with the HTTP status when the body is missing or not JSON.
 */
export async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json()
    if (body && typeof body.error === 'string' && body.error.trim()) return body.error
  } catch {
    // Non-JSON body (e.g. an HTML error page) — use the fallback below
  }
  return `${fallback} (HTTP ${res.status})`
}
