/**
 * CalendarClient — full-screen interactive calendar.
 * Owns all view state: current month, zoom level (month/sixMonth), day selection, modal state.
 * Three data sources: Sentinel trigger review dates (read-only), personal events (CRUD), ICS events (read-only).
 * Framer Motion handles zoom crossfade and month slide transitions.
 */
'use client'

import { useState, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, ZoomOut, ZoomIn, FolderOpen, Link2 } from 'lucide-react'
import { DayDetailModal } from '@/components/DayDetailModal'
import { EventCategoryModal } from '@/components/EventCategoryModal'
import { IcsModal } from '@/components/IcsModal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TriggerItem { id: string; title: string; nextReviewAt: string }
interface CalendarEventItem {
  occurrenceId: string; sourceEventId: string; title: string
  startAt: string; endAt: string; color?: string | null; categoryId?: string | null
}
interface IcsEventItem { uid: string; title: string; startAt: string; endAt: string }
interface EventCategory { id: string; name: string; color: string }

interface CalendarClientProps {
  initialTriggers: TriggerItem[]
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

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ── Component ─────────────────────────────────────────────────────────────────

export function CalendarClient({
  initialTriggers, initialEvents, initialIcsEvents, eventCategories: initialCategories, icsUrl: initialIcsUrl,
}: CalendarClientProps) {
  const [today] = useState(() => startOfLocalToday())
  const [currentMonth, setCurrentMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [view, setView] = useState<'month' | 'sixMonth'>('month')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [modalDay, setModalDay] = useState<string | null>(null)
  const [manageCatsOpen, setManageCatsOpen] = useState(false)
  const [icsOpen, setIcsOpen] = useState(false)
  const [categories, setCategories] = useState(initialCategories)
  const [localEvents, setLocalEvents] = useState(initialEvents)
  const [icsUrl, setIcsUrl] = useState(initialIcsUrl)
  const [direction, setDirection] = useState(1)

  // Build 42-day grid for month view (Mon-indexed)
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    const startDow = (firstDay.getDay() + 6) % 7
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
  const triggersByDate = useMemo(() => {
    const map = new Map<string, TriggerItem[]>()
    for (const t of initialTriggers) {
      const key = toLocalDateKey(new Date(t.nextReviewAt))
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    return map
  }, [initialTriggers])

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
    setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + delta, 1))
  }

  // Two-step day selection: first click selects (shows expand icon), second opens modal
  function handleDayClick(key: string) {
    if (selectedDay === key) {
      setModalDay(key)
    } else {
      setSelectedDay(key)
    }
  }

  const todayKey = toLocalDateKey(today)

  // Resolve modal date from YYYY-MM-DD key
  const modalDate = modalDay
    ? (() => { const [y, mo, d] = modalDay.split('-').map(Number); return new Date(y, mo - 1, d) })()
    : null

  const modalTriggers = modalDay ? (triggersByDate.get(modalDay) ?? []) : []
  const modalEvents = modalDay ? (eventsByDate.get(modalDay) ?? []) : []
  const modalIcsEvents = modalDay ? (icsEventsByDate.get(modalDay) ?? []) : []

  return (
    <div className="fixed inset-0 bg-background overflow-hidden flex flex-col pt-[60px]">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
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
            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 mb-1">
              {DOW.map(d => (
                <div key={d} className="text-center text-[10px] font-mono text-muted-foreground py-1">{d}</div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 flex-1 gap-0.5">
              {calendarDays.map(day => {
                const key = toLocalDateKey(day)
                const isCurrentMonth = day.getMonth() === currentMonth.getMonth()
                const isToday = key === todayKey
                const isSelected = key === selectedDay
                const dayTriggers = triggersByDate.get(key) ?? []
                const dayEvents = eventsByDate.get(key) ?? []
                const dayIcsEvts = icsEventsByDate.get(key) ?? []
                const totalDots = dayTriggers.length + dayEvents.length + dayIcsEvts.length

                return (
                  <motion.button
                    key={key}
                    onClick={() => { if (isCurrentMonth) handleDayClick(key) }}
                    whileHover={isCurrentMonth ? { scale: 1.05 } : {}}
                    whileTap={isCurrentMonth ? { scale: 0.95 } : {}}
                    className={[
                      'relative flex flex-col items-center justify-start pt-1 rounded-xl text-xs transition-colors min-h-[3.5rem]',
                      isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/40 cursor-default',
                      isToday ? 'ring-1 ring-primary' : '',
                      isSelected ? 'ring-2 ring-primary bg-primary/10' : isCurrentMonth ? 'hover:bg-muted/60' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <span className={isToday ? 'font-bold text-primary' : ''}>{day.getDate()}</span>

                    {/* Colored dots — up to 3 */}
                    {totalDots > 0 && (
                      <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center px-1">
                        {dayTriggers.slice(0, 1).map((_, i) => <span key={`t${i}`} className="w-1.5 h-1.5 rounded-full bg-primary" />)}
                        {dayEvents.slice(0, 1).map((ev, i) => {
                          const cat = categories.find(c => c.id === ev.categoryId)
                          return <span key={`e${i}`} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ev.color ?? cat?.color ?? '#6366f1' }} />
                        })}
                        {dayIcsEvts.slice(0, 1).map((_, i) => <span key={`i${i}`} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />)}
                        {totalDots > 3 && <span className="text-[8px] text-muted-foreground">+{totalDots - 3}</span>}
                      </div>
                    )}

                    {/* Expand icon — appears on selected day via spring animation */}
                    {isSelected && (
                      <motion.button
                        aria-label="Expand day"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                        onClick={e => { e.stopPropagation(); setModalDay(key) }}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center shadow-sm"
                      >
                        ⤢
                      </motion.button>
                    )}
                  </motion.button>
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
                const startDow = (firstDay.getDay() + 6) % 7
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
                        const hasDots = (triggersByDate.get(key)?.length ?? 0) + (eventsByDate.get(key)?.length ?? 0) + (icsEventsByDate.get(key)?.length ?? 0) > 0
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
          triggers={modalTriggers}
          events={modalEvents.map(ev => ({ ...ev, startAt: new Date(ev.startAt), endAt: new Date(ev.endAt) }))}
          icsEvents={modalIcsEvents.map(ev => ({ ...ev, startAt: new Date(ev.startAt), endAt: new Date(ev.endAt) }))}
          eventCategories={categories}
          onClose={() => { setModalDay(null); setSelectedDay(null) }}
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
