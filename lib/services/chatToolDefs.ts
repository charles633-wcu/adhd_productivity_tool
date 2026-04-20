// chatToolDefs.ts — client-safe list of tool names and descriptions.
// Imported by DevTrace (client component) and chatTools.ts (server).
// Contains NO server-only imports.

export interface ChatToolDef {
  name: string
  description: string
}

export const CHAT_TOOL_DEFS: ChatToolDef[] = [
  {
    name: 'search_triggers',
    description: "Search the user's triggers by keyword across title and content. Optionally filter by category.",
  },
  {
    name: 'search_categories',
    description: 'Return all categories for the user including trigger counts.',
  },
  {
    name: 'get_due_triggers',
    description: 'Return triggers due for review within the next N days (default 7, max 90).',
  },
  {
    name: 'get_trigger_detail',
    description: 'Return full details for a single trigger including notes, summary, and review history.',
  },
]
