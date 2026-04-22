/**
 * CalendarClient — full-screen interactive calendar.
 * Owns all view state: current month, zoom level (month/sixMonth), day selection, modal state.
 * Three data sources: Sentinel trigger review dates (read-only), personal events (CRUD), ICS events (read-only).
 * Framer Motion handles zoom crossfade and month slide transitions.
 */
'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, ZoomOut, ZoomIn, FolderOpen, Link2, CalendarDays, Plus } from 'lucide-react'
import { DayDetailModal } from '@/components/DayDetailModal'
import { EventCategoryModal } from '@/components/EventCategoryModal'
import { IcsModal } from '@/components/IcsModal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CalendarEventItem {
  occurrenceId: string; sourceEventId: string; title: string
  startAt: string; endAt: string; color?: string | null; categoryId?: string | null
}
interface IcsEventItem { uid: string; title: string; startAt: string; endAt: string }
interface EventCategory { id: string; name: string; color: string }

interface CalendarClientProps {
  initialEvents: CalendarEventItem[]
  initialIcsEvents: IcsEventItem[]
  eventCategories: EventCategory[]
  icsUrl: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toLocalDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfLocalToday() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d
}

function monthLabel(d: Date) {
  return d.toLocaleString('default', { month: 'long', year: 'numeric' })
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ── Component ─────────────────────────────────────────────────────────────────

export function CalendarClient({
  initialEvents, initialIcsEvents, eventCategories: initialCategories, icsUrl: initialIcsUrl,
}: CalendarClientProps) {
  const [today] = useState(() => startOfLocalToday())
  const [currentMonth, setCurrentMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [view, setView] = useState<'month' | 'sixMonth'>('month')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [modalDay, setModalDay] = useState<string | null>(null)
  const [modalStartsInAddMode, setModalStartsInAddMode] = useState(false)
  const [manageCatsOpen, setManageCatsOpen] = useState(false)
  const [icsOpen, setIcsOpen] = useState(false)
  const [categories, setCategories] = useState(initialCategories)
  const [localEvents, setLocalEvents] = useState(initialEvents)
  const [icsUrl, setIcsUrl] = useState(initialIcsUrl)
  const [direction, setDirection] = useState(1)

  // Build 42-day grid for month view (Sun-indexed)
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    const startDow = firstDay.getDay()
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(firstDay)
      d.setDate(1 - startDow + i)
      return d
    })
  }, [currentMonth])

  // Build 6 months starting from currentMonth for zoom-out view
  const sixMonths = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) =>
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + i, 1),
    )
  }, [currentMonth])

  // Index events by local date key for O(1) lookups
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEventItem[]>()
    for (const ev of localEvents) {
      const key = toLocalDateKey(new Date(ev.startAt))
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(ev)
    }
    return map
  }, [localEvents])

  const icsEventsByDate = useMemo(() => {
    const map = new Map<string, IcsEventItem[]>()
    for (const ev of initialIcsEvents) {
      const key = toLocalDateKey(new Date(ev.startAt))
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(ev)
    }
    return map
  }, [initialIcsEvents])

  function navigate(delta: number) {
    setDirection(delta)
    setSelectedDay(null)
    setModalStartsInAddMode(false)
    setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + delta, 1))
  }

  // Day click only selects the day; adding is handled by the explicit selected-day action.
  function handleDayClick(key: string) {
    setSelectedDay(key)
  }

  function handleAddEventClick(key: string) {
    setModalStartsInAddMode(true)
    setModalDay(key)
  }

  const todayKey = toLocalDateKey(today)

  // Resolve modal date from YYYY-MM-DD key
  const modalDate = modalDay
    ? (() => { const [y, mo, d] = modalDay.split('-').map(Number); return new Date(y, mo - 1, d) })()
    : null

  const modalEvents = modalDay ? (eventsByDate.get(modalDay) ?? []) : []
  const modalIcsEvents = modalDay ? (icsEventsByDate.get(modalDay) ?? []) : []

  return (
    <div className="fixed inset-0 bg-background overflow-hidden flex flex-col pt-[60px]">
      {/* ── App Nav Pill — mirrors HomePill toolbar ─────────────────────────── */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 rounded-full border border-border/50 bg-background/90 backdrop-blur-md shadow-lg px-4 py-0">
        <span className="text-[13px] font-extrabold tracking-widest text-foreground select-none">SENTINEL</span>
        <div className="h-5 w-px bg-border/60" aria-hidden="true" />
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-xl px-4 min-h-[44px] text-[13px] font-medium text-muted-foreground hover:bg-muted/60 transition-colors"
        >
          <span aria-hidden="true">🎯</span>
          Triggers
        </Link>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-4 min-h-[44px] text-[13px] font-semibold cursor-default"
          aria-current="page"
        >
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          Calendar
        </button>
      </div>

      {/* ── Calendar Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <button aria-label="Previous month" onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h1 className="text-sm font-semibold min-w-[140px] text-center">{monthLabel(currentMonth)}</h1>
          <button aria-label="Next month" onClick={() => navigate(1)} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setManageCatsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Categories
          </button>
          <button
            onClick={() => setIcsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <Link2 className="h-3.5 w-3.5" />
            {icsUrl ? 'Calendar connected' : 'Connect Calendar'}
          </button>
          <button
            aria-label={view === 'month' ? 'Zoom out' : 'Zoom in'}
            onClick={() => setView(v => v === 'month' ? 'sixMonth' : 'month')}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            {view === 'month' ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* ── Calendar Body ────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait" initial={false}>
        {view === 'month' ? (
          <motion.div
            key={`month-${currentMonth.toISOString()}`}
            initial={{ opacity: 0, x: direction * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -40 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="flex-1 overflow-hidden flex flex-col px-2 py-2"
          >
            {/* Day-of-week headers — today's column label is primary-colored */}
            <div className="grid grid-cols-7 mb-1">
              {DOW.map((d, i) => {
                const isTodayCol = i === today.getDay()
                return (
                  <div key={d} className="text-center py-1">
                    <span className={`text-[10px] font-mono ${isTodayCol ? 'text-primary font-bold' : 'text-muted-foreground'}`}>{d}</span>
                  </div>
                )
              })}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 flex-1 gap-0.5">
              {calendarDays.map(day => {
                const key = toLocalDateKey(day)
                const isCurrentMonth = day.getMonth() === currentMonth.getMonth()
                const isToday = key === todayKey
                const isSelected = key === selectedDay
                const dayEvents = eventsByDate.get(key) ?? []
                const dayIcsEvts = icsEventsByDate.get(key) ?? []
                const totalDots = dayEvents.length + dayIcsEvts.length

                return (
                  // motion.div (not button) so the expand button inside is valid HTML
                  <motion.div
                    key={key}
                    data-testid={`calendar-day-${key}`}
                    role={isCurrentMonth ? 'button' : undefined}
                    aria-label={isCurrentMonth ? `Select ${day.toLocaleDateString(undefined, {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}` : undefined}
                    tabIndex={isCurrentMonth ? 0 : -1}
                    onClick={() => { if (isCurrentMonth) handleDayClick(key) }}
                    onKeyDown={e => { if (isCurrentMonth && (e.key === 'Enter' || e.key === ' ')) handleDayClick(key) }}
                    whileHover={isCurrentMonth ? { scale: 1.04 } : {}}
                    whileTap={isCurrentMonth ? { scale: 0.96 } : {}}
                    className={[
                      'relative flex flex-col items-center justify-start pt-1 rounded-xl text-xs min-h-[3.5rem]',
                      isCurrentMonth ? 'text-foreground cursor-pointer' : 'text-muted-foreground/40 cursor-default',
                    ].filter(Boolean).join(' ')}
                  >
                    {/* Sliding selection background — follows selected day, iOS circle sits on top */}
                    {isSelected && (
                      <motion.div
                        layoutId="day-selection"
                        className="absolute inset-0 rounded-xl bg-muted shadow-sm"
                        transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                      />
                    )}

                    {/* Date number — plain for all days; today gets bold primary text only */}
                    <span className={[
                      'relative z-10 text-xs font-medium w-6 h-6 flex items-center justify-center',
                      isToday ? 'font-bold text-primary' : '',
                    ].filter(Boolean).join(' ')}>
                      {day.getDate()}
                    </span>

                    {/* Today dot — always visible below today's number to mark the current date */}
                    {isToday && (
                      <span className="relative z-10 w-1 h-1 rounded-full bg-primary" />
                    )}

                    {/* Colored dots — up to 3 */}
                    {totalDots > 0 && (
                      <div className="relative z-10 flex gap-0.5 mt-0.5 flex-wrap justify-center px-1">
                        {dayEvents.slice(0, 2).map((ev, i) => {
                          const cat = categories.find(c => c.id === ev.categoryId)
                          return <span key={`e${i}`} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ev.color ?? cat?.color ?? '#6366f1' }} />
                        })}
                        {dayIcsEvts.slice(0, 1).map((_, i) => <span key={`i${i}`} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />)}
                        {totalDots > 3 && <span className="text-[8px] text-muted-foreground">+{totalDots - 3}</span>}
                      </div>
                    )}

                    {/* Selected-day add action — explicit instead of double-click opening */}
                    {isSelected && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.78, y: 6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 30, mass: 0.5 }}
                        onClick={e => {
                          e.stopPropagation()
                          handleAddEventClick(key)
                        }}
                        className="absolute bottom-1 left-1/2 -translate-x-1/2 h-7 rounded-full bg-primary text-primary-foreground px-3 text-[10px] font-semibold flex items-center gap-1 shadow-sm z-20"
                      >
                        <Plus className="h-3 w-3" aria-hidden="true" />
                        <span>Add event</span>
                      </motion.button>
                    )}
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="sixMonth"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="flex-1 overflow-auto px-4 py-4"
          >
            <p className="text-xs text-muted-foreground text-center mb-3">6 months — tap a month to zoom in</p>
            <div className="grid grid-cols-2 gap-4">
              {sixMonths.map(month => {
                const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
                const startDow = firstDay.getDay()
                const days = Array.from({ length: 35 }, (_, i) => {
                  const d = new Date(firstDay); d.setDate(1 - startDow + i); return d
                })
                return (
                  <button
                    key={month.toISOString()}
                    onClick={() => { setCurrentMonth(month); setView('month') }}
                    className="rounded-xl border border-border p-3 text-left hover:bg-muted/50 transition-colors"
                  >
                    <p className="text-xs font-semibold mb-2">{month.toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
                    <div className="grid grid-cols-7 gap-0.5">
                      {days.map(d => {
                        const key = toLocalDateKey(d)
                        const hasDots = (eventsByDate.get(key)?.length ?? 0) + (icsEventsByDate.get(key)?.length ?? 0) > 0
                        const inMonth = d.getMonth() === month.getMonth()
                        return (
                          <div key={key} className={`relative flex items-center justify-center rounded text-[7px] h-4 ${inMonth ? 'text-foreground' : 'text-muted-foreground/20'}`}>
                            {d.getDate()}
                            {hasDots && inMonth && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0.5 h-0.5 rounded-full bg-primary" />}
                          </div>
                        )
                      })}
                    </div>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      {modalDay && modalDate && (
        <DayDetailModal
          date={modalDate}
          events={modalEvents.map(ev => ({ ...ev, startAt: new Date(ev.startAt), endAt: new Date(ev.endAt) }))}
          icsEvents={modalIcsEvents.map(ev => ({ ...ev, startAt: new Date(ev.startAt), endAt: new Date(ev.endAt) }))}
          eventCategories={categories}
          startInAddMode={modalStartsInAddMode}
          onClose={() => {
            setModalDay(null)
            setSelectedDay(null)
            setModalStartsInAddMode(false)
          }}
          onEventCreated={ev => setLocalEvents(prev => [
            ...prev,
            { ...ev, startAt: ev.startAt.toISOString(), endAt: ev.endAt.toISOString() },
          ])}
          onEventDeleted={id => setLocalEvents(prev => prev.filter(e => e.sourceEventId !== id))}
        />
      )}

      {manageCatsOpen && (
        <EventCategoryModal
          categories={categories}
          onClose={() => setManageCatsOpen(false)}
          onChange={setCategories}
        />
      )}

      {icsOpen && (
        <IcsModal
          currentUrl={icsUrl}
          onClose={() => setIcsOpen(false)}
          onSaved={url => setIcsUrl(url)}
          onDeleted={() => setIcsUrl(null)}
        />
      )}
    </div>
  )
}
