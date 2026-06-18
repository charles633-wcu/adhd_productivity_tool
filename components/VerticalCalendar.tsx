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

import React, { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  DOW, MONTHS, DAY_EVENT_CAP, monthAnchorKey, toLocalDateKey, monthLabel,
  formatAccessibleDate, compactTimeLabel, truncateTitle, capDayEvents, buildMonthDays,
  accelerationMultiplier,
} from '@/lib/calendar/calendarView'

// Window (ms) within which consecutive same-direction wheel events build a streak.
const ACCEL_WINDOW_MS = 250

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
  onJumpRequest?: (month: Date) => void
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
  today, months, eventsByDate, icsEventsByDate, categories, onSelectDay, onReachEnd, onJumpRequest,
}: VerticalCalendarProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const topSentinel = useRef<HTMLDivElement | null>(null)
  const bottomSentinel = useRef<HTMLDivElement | null>(null)
  const todayKey = toLocalDateKey(today)

  // Quick-jump: the month currently at the top of the viewport drives the pill
  // label; clicking it opens a year-stepper + 12-month grid popover.
  const [topMonthKey, setTopMonthKey] = useState(() => months[0] ? monthAnchorKey(months[0]) : '')
  const [jumpOpen, setJumpOpen] = useState(false)
  const [jumpYear, setJumpYear] = useState(() => (months[0] ?? today).getFullYear())

  const topMonth = months.find(m => monthAnchorKey(m) === topMonthKey) ?? months[0] ?? today
  const loadedKeys = new Set(months.map(monthAnchorKey))

  function openJump() {
    setJumpYear(topMonth.getFullYear())
    setJumpOpen(open => !open)
  }

  function jumpToMonth(monthIndex: number) {
    const target = new Date(jumpYear, monthIndex, 1)
    setJumpOpen(false)
    if (loadedKeys.has(monthAnchorKey(target))) {
      scrollRef.current
        ?.querySelector(`[data-month="${monthAnchorKey(target)}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      onJumpRequest?.(target)
    }
  }

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

  // Velocity fast-scroll: amplify vertical wheel deltas by a multiplier that
  // grows with a sustained same-direction streak, so a hard flick covers many
  // months quickly while a gentle scroll stays 1:1. Degrades to native scroll
  // under prefers-reduced-motion. Attached non-passively so preventDefault works.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const state = { direction: 0, lastAt: 0, streak: 0 }
    function onWheel(e: WheelEvent) {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return // horizontal intent — leave it
      const dir = e.deltaY > 0 ? 1 : -1
      const now = Date.now()
      if (dir === state.direction && now - state.lastAt < ACCEL_WINDOW_MS) state.streak += 1
      else state.streak = 1
      state.direction = dir
      state.lastAt = now

      const mult = accelerationMultiplier(state.streak)
      if (mult > 1) {
        e.preventDefault()
        el!.scrollTop += e.deltaY * mult
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Track the top-most visible month section to drive the quick-jump pill label.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const root = scrollRef.current
    const sections = root?.querySelectorAll('[data-month]')
    if (!sections?.length) return
    const obs = new IntersectionObserver(entries => {
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      const key = visible?.target.getAttribute('data-month')
      if (key) setTopMonthKey(key)
    }, { root, rootMargin: '0px 0px -85% 0px' })
    sections.forEach(s => obs.observe(s))
    return () => obs.disconnect()
  }, [months.length])

  return (
    <div
      ref={scrollRef}
      data-testid="vertical-calendar"
      className="h-full w-full overflow-y-auto"
    >
      <div ref={topSentinel} aria-hidden="true" className="h-px w-full" />

      {/* Sticky quick-jump pill — shows the top-most visible month; opens a
          year-stepper + 12-month grid popover. */}
      <div className="sticky top-0 z-20 flex items-start px-3 py-2 backdrop-blur bg-background/95">
        <div className="relative">
          <button
            type="button"
            data-testid="vcal-month-pill"
            onClick={openJump}
            aria-expanded={jumpOpen}
            className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            {monthLabel(topMonth)}
            <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${jumpOpen ? 'rotate-90' : ''}`} />
          </button>

          {jumpOpen && (
            <div
              data-testid="vcal-jump-popover"
              className="absolute left-0 top-full z-30 mt-2 w-60 rounded-2xl border border-border bg-card p-3 shadow-xl"
            >
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Previous year"
                  onClick={() => setJumpYear(y => y - 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/60 hover:bg-muted"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span data-testid="vcal-jump-year" className="text-sm font-bold text-foreground">{jumpYear}</span>
                <button
                  type="button"
                  data-testid="vcal-jump-year-next"
                  aria-label="Next year"
                  onClick={() => setJumpYear(y => y + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/60 hover:bg-muted"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {MONTHS.map((m, idx) => {
                  const isCurrent = monthAnchorKey(new Date(jumpYear, idx, 1)) === topMonthKey
                  return (
                    <button
                      key={m}
                      type="button"
                      data-testid="vcal-jump-month"
                      onClick={() => jumpToMonth(idx)}
                      className={[
                        'rounded-lg py-1.5 text-xs transition-colors',
                        isCurrent ? 'bg-primary font-bold text-primary-foreground' : 'bg-muted/40 text-foreground hover:bg-muted',
                      ].join(' ')}
                    >
                      {m.slice(0, 3)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {months.map(month => {
        const days = buildMonthDays(month)
        const label = monthLabel(month)
        return (
          <section key={monthAnchorKey(month)} data-month={monthAnchorKey(month)} className="mb-2">
            {/* Plain month divider label (the sticky pill above tracks the live month) */}
            <div className="px-3 pb-1 pt-2">
              <span className="text-sm font-semibold text-muted-foreground">{label}</span>
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
