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

  // Anchor today at mount time so calendarDays, todayKey, and todayDow
  // all stay consistent even if the component re-renders after midnight
  const [today] = useState(() => startOfLocalToday())
  const todayKey = toLocalDateKey(today)
  // Monday-indexed day offset for today (to pad the first calendar row)
  const todayDow = (today.getDay() + 6) % 7 // JS Sun=0 → Mon-indexed 0

  // 42 calendar days — stable because today is stable state (not recomputed each render)
  const calendarDays = useMemo(() => {
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      return d
    })
  }, [today])

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
              <span data-testid="hint-trigger-title" className="text-foreground font-medium">{selectedTrigger.title}</span>
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
                  data-testid={`day-${key}`}
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
                      data-testid="count-badge"
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
                    onClick={() => { setError(null); setSelectedId(isSelected ? null : t.id) }}
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
