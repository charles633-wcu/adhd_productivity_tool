// chatToolDefs.ts — client-safe list of tool names and descriptions.
// CHAT_TOOL_DEFS: array for DevTrace (client component) iteration
// CHAT_TOOL_DESCS: const record for chatTools.ts (type-safe key access, no ! needed)
// Contains NO server-only imports.

export interface ChatToolDef {
  name: string
  description: string
}

export const CHAT_TOOL_DESCS = {
  search_triggers:    "Search the user's triggers by keyword across title and content. Optionally filter by category.",
  search_categories:  'Return all categories for the user including trigger counts.',
  get_due_triggers:   'Return triggers due for review within the next N days (default 7, max 90).',
  get_trigger_detail: 'Return full details for a single trigger including notes, summary, and review history.',
  get_due_todos:      "Return the user's incomplete to-do tasks that have a due date within the next N days (default 7, max 365), including overdue tasks. Ordered by due date. Use this to brief the user on actionable tasks.",
  get_calendar:       "Return the user's calendar events (recurring events expanded into individual occurrences) for the next N days (default 7, max 90). Ordered by start time.",
  get_heap_nodes:     "Return the user's Mind/heap knowledge-graph nodes (ideas, goals, notes, projects). Optionally filter by priority ('low'|'normal'|'high'|'critical'). Ordered by priority then recency.",
} as const

// Derived array for DevTrace iteration
export const CHAT_TOOL_DEFS: ChatToolDef[] = (Object.entries(CHAT_TOOL_DESCS) as [keyof typeof CHAT_TOOL_DESCS, string][]).map(
  ([name, description]) => ({ name, description })
)
