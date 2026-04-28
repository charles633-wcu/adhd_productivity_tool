'use client'

// TodoSidebar — left navigation panel for the /todos page.
// Shows built-in views (Inbox, Today, Upcoming, All Tasks) and user's custom lists.
// Highlights the active view or list using URL search params (view= or listId=).
// "New List" button is a placeholder for a future dialog.

import { useSearchParams, useRouter } from 'next/navigation'
import { Inbox, CalendarDays, Calendar, List, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TodoList } from '@/lib/db/schema'

interface TodoSidebarProps {
  lists: TodoList[]
}

// Built-in view definitions — order matches Todoist convention
const VIEWS = [
  { key: 'inbox',    label: 'Inbox',     icon: Inbox },
  { key: 'today',    label: 'Today',     icon: CalendarDays },
  { key: 'upcoming', label: 'Upcoming',  icon: Calendar },
  { key: 'all',      label: 'All Tasks', icon: List },
] as const

export function TodoSidebar({ lists }: TodoSidebarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Active state: either a named view or a specific listId
  const activeView   = searchParams.get('view') ?? 'inbox'
  const activeListId = searchParams.get('listId')

  /** Push a new URL with only the given params (clears all others) */
  function navigate(params: Record<string, string>) {
    const sp = new URLSearchParams(params)
    router.push(`/todos?${sp.toString()}`)
  }

  return (
    <aside className="w-56 flex-shrink-0 border-r border-border bg-card flex flex-col gap-1 p-3 overflow-y-auto">

      {/* ── Built-in views ──────────────────────────────────────────────── */}
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-2 mb-1 mt-1">
        Views
      </p>

      {VIEWS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => navigate({ view: key })}
          className={cn(
            'flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors',
            activeView === key && !activeListId
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Icon className="w-4 h-4" />
          {label}
        </button>
      ))}

      {/* ── User lists ──────────────────────────────────────────────────── */}
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-2 mt-4 mb-1">
        Lists
      </p>

      {lists.map(list => (
        <button
          key={list.id}
          onClick={() => navigate({ listId: list.id })}
          className={cn(
            'flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors',
            activeListId === list.id
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          {/* Emoji icon or default clipboard */}
          <span className="text-base leading-none">{list.emoji ?? '📋'}</span>
          <span className="truncate">{list.name}</span>
        </button>
      ))}

      {/* New List — future dialog trigger */}
      <button
        onClick={() => { /* new-list dialog — future */ }}
        className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground mt-1"
      >
        <Plus className="w-4 h-4" />
        New List
      </button>
    </aside>
  )
}
