/**
 * VerticalCalendar — Informant-style vertical continuous scroll of month grids.
 *
 * Presentational: it does not own event data or modals. The parent shell
 * (CalendarClient) supplies the loaded month range, event maps, and callbacks.
 * Each month is a sticky-headed <section> with a 7-col grid; each day cell shows
 * up to DAY_EVENT_CAP event chips (title truncated to MAX_TITLE_CHARS) and a
 * "+N more" overflow row. Tapping a day calls onSelectDay so the shell can open
 * the day-detail modal.
 */
'use client'

import React, { useEffect, useRef } from 'react'
import {
  DOW, DAY_EVENT_CAP, monthAnchorKey, toLocalDateKey, monthLabel,
  formatAccessibleDate, compactTimeLabel, truncateTitle, capDayEvents, buildMonthDays,
} from '@/lib/calendar/calendarView'

type CalendarEventItem = {
  occurrenceId: string
  sourceEventId: string
  title: string
  startAt: string
  endAt: string
  color?: string | null
  categoryId?: string | null
}

interface IcsEventItem {
  uid: string
  title: string
  startAt: string
  endAt: string
}

interface EventCategory {
  id: string
  name: string
  color: string
}

interface VerticalCalendarProps {
  today: Date
  months: Date[]
  eventsByDate: Map<string, CalendarEventItem[]>
  icsEventsByDate: Map<string, IcsEventItem[]>
  categories: EventCategory[]
  onSelectDay: (key: string) => void
  onReachEnd?: (side: 'past' | 'future') => void
}

const DEFAULT_DOT = '#6366f1'
const ICS_DOT = '#94a3b8'

// A normalized chip — own events and ICS events render the same way.
interface Chip {
  id: string
  startAt: string
  title: string
  color: string
}

export function VerticalCalendar({
  today, months, eventsByDate, icsEventsByDate, categories, onSelectDay, onReachEnd,
}: VerticalCalendarProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const topSentinel = useRef<HTMLDivElement | null>(null)
  const bottomSentinel = useRef<HTMLDivElement | null>(null)
  const todayKey = toLocalDateKey(today)

  // Resolve a chip's color: explicit event color → category color → default.
  function resolveColor(ev: CalendarEventItem): string {
    return ev.color ?? categories.find(c => c.id === ev.categoryId)?.color ?? DEFAULT_DOT
  }

  // Merge own + ICS events for a day into time-sorted chips.
  function chipsForDay(key: string): Chip[] {
    const own = (eventsByDate.get(key) ?? []).map(ev => ({
      id: ev.occurrenceId, startAt: ev.startAt, title: ev.title, color: resolveColor(ev),
    }))
    const ics = (icsEventsByDate.get(key) ?? []).map(ev => ({
      id: ev.uid, startAt: ev.startAt, title: ev.title, color: ICS_DOT,
    }))
    return [...own, ...ics].sort((a, b) => a.startAt.localeCompare(b.startAt))
  }

  // Observe top/bottom sentinels to lazily extend the loaded range.
  useEffect(() => {
    if (!onReachEnd || typeof IntersectionObserver === 'undefined') return
    const root = scrollRef.current
    const obs = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        if (entry.target === topSentinel.current) onReachEnd('past')
        else if (entry.target === bottomSentinel.current) onReachEnd('future')
      }
    }, { root, rootMargin: '400px' })
    if (topSentinel.current) obs.observe(topSentinel.current)
    if (bottomSentinel.current) obs.observe(bottomSentinel.current)
    return () => obs.disconnect()
  }, [onReachEnd, months.length])

  return (
    <div
      ref={scrollRef}
      data-testid="vertical-calendar"
      className="h-full w-full overflow-y-auto"
    >
      <div ref={topSentinel} aria-hidden="true" className="h-px w-full" />

      {months.map(month => {
        const days = buildMonthDays(month)
        const label = monthLabel(month)
        return (
          <section key={monthAnchorKey(month)} data-month={monthAnchorKey(month)} className="mb-2">
            {/* Sticky month header (the quick-jump pill is added in a later task) */}
            <div className="sticky top-0 z-10 bg-background/95 px-3 py-2 backdrop-blur">
              <span className="text-base font-semibold text-foreground">{label}</span>
            </div>

            {/* Day-of-week header */}
            <div className="grid grid-cols-7 px-2">
              {DOW.map(d => (
                <div key={d} className="py-1 text-center text-[10px] font-mono text-muted-foreground">{d}</div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-1 px-2">
              {days.map(day => {
                const key = toLocalDateKey(day)
                const isCurrentMonth = day.getMonth() === month.getMonth()
                const isToday = key === todayKey
                const { shown, overflow } = capDayEvents(chipsForDay(key), DAY_EVENT_CAP)

                return (
                  <div
                    key={key}
                    data-testid={`vcal-day-${key}`}
                    role={isCurrentMonth ? 'button' : undefined}
                    aria-label={isCurrentMonth ? `Select ${formatAccessibleDate(day)}` : undefined}
                    tabIndex={isCurrentMonth ? 0 : -1}
                    onClick={() => { if (isCurrentMonth) onSelectDay(key) }}
                    onKeyDown={e => {
                      if (isCurrentMonth && (e.key === 'Enter' || e.key === ' ')) {
                        if (e.key === ' ') e.preventDefault()
                        onSelectDay(key)
                      }
                    }}
                    className={[
                      'flex min-h-[7.5rem] flex-col gap-0.5 rounded-lg p-1',
                      isCurrentMonth ? 'cursor-pointer text-foreground hover:bg-muted/40' : 'text-muted-foreground/30',
                    ].join(' ')}
                  >
                    <span className={[
                      'flex h-6 w-6 items-center justify-center self-start text-xs font-medium',
                      isToday ? 'rounded-full bg-primary font-bold text-primary-foreground' : '',
                    ].filter(Boolean).join(' ')}>
                      {day.getDate()}
                    </span>

                    {shown.map(chip => (
                      <div
                        key={chip.id}
                        data-testid="vcal-chip"
                        className="flex min-w-0 items-center gap-1 rounded bg-muted/55 px-1 py-0.5 text-[9px] leading-none"
                        title={`${compactTimeLabel(chip.startAt)} ${chip.title}`}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: chip.color }} />
                        <span className="shrink-0 font-medium tabular-nums">{compactTimeLabel(chip.startAt)}</span>
                        <span className="min-w-0 truncate text-muted-foreground">{truncateTitle(chip.title)}</span>
                      </div>
                    ))}

                    {overflow > 0 && (
                      <span className="pl-1 text-[9px] leading-none text-muted-foreground">+{overflow} more</span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      <div ref={bottomSentinel} aria-hidden="true" className="h-px w-full" />
    </div>
  )
}
