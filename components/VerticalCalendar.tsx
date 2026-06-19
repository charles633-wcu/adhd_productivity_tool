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

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  DOW, MONTHS, DAY_EVENT_CAP, monthAnchorKey, toLocalDateKey, monthLabel,
  formatAccessibleDate, compactTimeLabel, truncateTitle, capDayEvents, buildContiguousDays,
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
  scrollToKey?: string | null
  onScrolled?: () => void
  zoom?: number
  onZoomDelta?: (delta: number) => void
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
  scrollToKey, onScrolled, zoom = 1, onZoomDelta,
}: VerticalCalendarProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const topSentinel = useRef<HTMLDivElement | null>(null)
  const bottomSentinel = useRef<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLDivElement | null>(null)
  const didInitScroll = useRef(false)
  const prevFirstKey = useRef<string | null>(null)
  const prevScrollHeight = useRef(0)
  const todayKey = toLocalDateKey(today)

  // Scroll a month's first-day anchor to just below the sticky HUD.
  function scrollToMonthKey(key: string, smooth: boolean): boolean {
    const root = scrollRef.current
    const el = root?.querySelector(`[data-month="${key}"]`) as HTMLElement | null
    if (!root || !el) return false
    const offset = headerRef.current?.offsetHeight ?? 0
    // offsetTop/offsetHeight are reported in unzoomed layout px, but scrollTop is
    // in rendered px — scale by the active zoom so the target lands correctly.
    const top = Math.max(0, (el.offsetTop - offset) * zoom)
    if (smooth && typeof root.scrollTo === 'function') {
      root.scrollTo({ top, behavior: 'smooth' })
    } else {
      root.scrollTop = top
    }
    return true
  }

  // The continuous, gapless day run (months flow into each other).
  const days = buildContiguousDays(months)

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
      scrollToMonthKey(monthAnchorKey(target), true)
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

  // On first mount, jump to today's month. The range spans ±12 months, so the
  // natural scrollTop=0 would open a year in the past AND leave the top sentinel
  // intersecting — which would trigger runaway backward extension. On later
  // prepends, preserve the viewport (shift scrollTop by the inserted height) so
  // the top sentinel scrolls out of view and the extension loop terminates.
  useLayoutEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const firstKey = months[0] ? monthAnchorKey(months[0]) : null
    if (!didInitScroll.current) {
      scrollToMonthKey(monthAnchorKey(today), false)
      didInitScroll.current = true
    } else if (prevFirstKey.current && firstKey !== prevFirstKey.current) {
      const added = root.scrollHeight - prevScrollHeight.current
      if (added > 0) root.scrollTop += added
    }
    prevFirstKey.current = firstKey
    prevScrollHeight.current = root.scrollHeight
  // Runs on mount (init scroll) and range changes (prepend preservation) only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months, today])

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
      // Ctrl+wheel zooms the calendar (not the page).
      if (e.ctrlKey) {
        e.preventDefault()
        onZoomDelta?.(e.deltaY < 0 ? 0.1 : -0.1)
        return
      }
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
  // onZoomDelta uses a functional state update, so a stable empty-deps listener is fine.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-scroll to a requested month (quick-jump outside range, or "Today")
  // once that section is present, then signal the parent to clear the request.
  useEffect(() => {
    if (!scrollToKey) return
    if (scrollToMonthKey(scrollToKey, true)) onScrolled?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToKey, months.length])

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
      className="relative h-full w-full overflow-auto"
    >
      {/* Zoomable content column — `zoom` scales the calendar within this
          scroll container only (the page is unaffected); fixed width so it
          centres and the container scrolls when zoomed past the viewport. */}
      <div className="mx-auto w-[52rem]" style={{ zoom }}>
      <div ref={topSentinel} aria-hidden="true" className="h-px w-full" />

      {/* Sticky HUD — translucent header carrying the quick-jump pill and the
          single day-of-week row that the continuous grid aligns to. */}
      <div ref={headerRef} className="sticky top-0 z-20 bg-background/55 px-2 pb-1 pt-2 backdrop-blur-md">
        <div className="relative px-1">
          <button
            type="button"
            data-testid="vcal-month-pill"
            onClick={openJump}
            aria-expanded={jumpOpen}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-base font-semibold text-foreground outline-none transition-all hover:ring-2 hover:ring-sky-400/70 hover:shadow-[0_0_16px_rgba(56,189,248,0.45)] focus-visible:ring-2 focus-visible:ring-sky-400/70"
          >
            {monthLabel(topMonth)}
            <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${jumpOpen ? 'rotate-90' : ''}`} />
          </button>

          {jumpOpen && (
            <div
              data-testid="vcal-jump-popover"
              className="absolute left-0 top-full z-30 mt-2 w-80 rounded-2xl border border-white/10 bg-background/50 p-4 shadow-2xl backdrop-blur-2xl"
            >
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Previous year"
                  onClick={() => setJumpYear(y => y - 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span data-testid="vcal-jump-year" className="text-base font-bold tracking-wide text-foreground">{jumpYear}</span>
                <button
                  type="button"
                  data-testid="vcal-jump-year-next"
                  aria-label="Next year"
                  onClick={() => setJumpYear(y => y + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {MONTHS.map((m, idx) => {
                  const isCurrent = monthAnchorKey(new Date(jumpYear, idx, 1)) === topMonthKey
                  return (
                    <button
                      key={m}
                      type="button"
                      data-testid="vcal-jump-month"
                      onClick={() => jumpToMonth(idx)}
                      className={[
                        'rounded-lg py-2 text-xs transition-colors',
                        isCurrent ? 'bg-sky-500/80 font-bold text-white' : 'text-foreground hover:bg-white/10',
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

        {/* Day-of-week header — aligns to the continuous grid below */}
        <div className="mt-1 grid grid-cols-7 px-1">
          {DOW.map(d => (
            <div key={d} className="py-1 text-center text-[10px] font-mono text-muted-foreground">{d}</div>
          ))}
        </div>
      </div>

      {/* Continuous grid — one gapless run of weeks. Months flow into each
          other; each month is faintly tinted and bounded by a bold top/bottom
          edge, and its first day carries a "Mon YYYY" tab instead of the "1". */}
      {/* gap-0 so cell edges touch and the blue month-divider segments join
          into one unbroken staircase line. */}
      <div className="grid grid-cols-7 gap-0 px-3 pb-8">
        {days.map(day => {
          const key = toLocalDateKey(day)
          const isToday = key === todayKey
          const isFirst = day.getDate() === 1
          // Continuous month divider: a glowing blue rule along the TOP of any
          // cell whose neighbour 7 days up is a different month, plus down the
          // LEFT of the month's first day when it isn't a Sunday. These segments
          // meet at the corner to form one unbroken staircase between months.
          const above = new Date(day); above.setDate(day.getDate() - 7)
          const isTopEdge = above.getMonth() !== day.getMonth()
          const isLeftEdge = isFirst && day.getDay() !== 0
          // Faint alternating tint per absolute month so bounds read at a glance.
          const tinted = ((day.getFullYear() * 12 + day.getMonth()) % 2) === 0
          const { shown, overflow } = capDayEvents(chipsForDay(key), DAY_EVENT_CAP)

          return (
            <div
              key={key}
              {...(isFirst ? { 'data-month': monthAnchorKey(day) } : {})}
              data-testid={`vcal-day-${key}`}
              role="button"
              aria-label={`Select ${formatAccessibleDate(day)}`}
              tabIndex={0}
              onClick={() => onSelectDay(key)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') { if (e.key === ' ') e.preventDefault(); onSelectDay(key) }
              }}
              className={[
                'flex min-h-[8.6rem] cursor-pointer flex-col gap-0.5 p-1 text-foreground transition-all',
                'hover:bg-sky-400/5 hover:ring-1 hover:ring-inset hover:ring-sky-400/60 hover:shadow-[0_0_14px_rgba(56,189,248,0.35)]',
                tinted ? 'bg-muted/20' : '',
                isTopEdge ? 'border-t-2 border-sky-400/80' : '',
                isLeftEdge ? 'border-l-2 border-sky-400/80' : '',
              ].filter(Boolean).join(' ')}
            >
              {isFirst ? (
                <span className="self-start rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-foreground">
                  {MONTHS[day.getMonth()].slice(0, 3)} {day.getFullYear()}
                </span>
              ) : (
                <span className={[
                  'flex h-6 w-6 items-center justify-center self-start text-xs font-medium',
                  isToday ? 'rounded-full bg-primary font-bold text-primary-foreground' : '',
                ].filter(Boolean).join(' ')}>
                  {day.getDate()}
                </span>
              )}

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

      <div ref={bottomSentinel} aria-hidden="true" className="h-px w-full" />
      </div>
    </div>
  )
}
