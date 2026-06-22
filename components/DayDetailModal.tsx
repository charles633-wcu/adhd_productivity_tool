/**
 * DayDetailModal - centered overlay showing all items for a selected calendar day.
 * Three sections (personal events, ICS imports) plus add-event editor.
 * Calls onEventCreated / onEventDeleted to let CalendarClient update local state.
 * Each event row is an Informant-style tappable button that calls onEditEvent.
 */
'use client'

import { FormEvent, useRef, useState, type PointerEvent } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { RepeatPicker } from '@/components/RepeatPicker'
import { CategoryPicker } from '@/components/CategoryPicker'
import type { EventOccurrence } from '@/lib/types/calendar'

interface IcsEventItem { uid: string; title: string; startAt: Date; endAt: Date }
interface EventCategoryItem { id: string; name: string; color: string }

interface CreatedCalendarEventItem {
  id: string
  title: string
  startAt: string
  endAt: string
  color?: string | null
  categoryId?: string | null
  rrule?: string | null
  exdates?: string[] | null
}

interface DayDetailModalProps {
  date: Date
  events: EventOccurrence[]
  icsEvents: IcsEventItem[]
  eventCategories: EventCategoryItem[]
  startInAddMode?: boolean
  onClose: () => void
  onEventCreated: (event: CreatedCalendarEventItem) => void
  onEventDeleted?: (sourceEventId: string) => void
  onEditEvent?: (event: EventOccurrence) => void
  onCategoriesChange?: (categories: EventCategoryItem[]) => void
}

function formatTime(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function formatHeading(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

function addOneMinute(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const next = h * 60 + m + 1
  return `${String(Math.floor(next / 60) % 24).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && target.closest('button, input, select, textarea, a, [role="button"]') !== null
}

export function DayDetailModal({
  date, events, icsEvents, eventCategories, startInAddMode = false, onClose, onEventCreated, onEventDeleted = () => {}, onEditEvent = () => {}, onCategoriesChange = () => {},
}: DayDetailModalProps) {
  const [showForm, setShowForm] = useState(startInAddMode)
  const [title, setTitle] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [rrule, setRrule] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragStart, setDragStart] = useState<{
    pointerX: number
    pointerY: number
    originX: number
    originY: number
  } | null>(null)
  const formRef = useRef<HTMLFormElement | null>(null)

  const isEmpty = events.length === 0 && icsEvents.length === 0
  // Color the new event will be added with (its category's color, gray if none).
  const selectedColor = eventCategories.find(c => c.id === categoryId)?.color ?? '#6b7280'

  function buildDateTime(time: string) {
    const [h, m] = time.split(':').map(Number)
    const d = new Date(date)
    d.setHours(h, m, 0, 0)
    return d.toISOString()
  }

  function closeForm() {
    setShowForm(false)
    setError(null)
  }

  function startDrag(e: PointerEvent<HTMLDivElement>) {
    if (isInteractiveTarget(e.target)) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDragStart({
      pointerX: e.clientX,
      pointerY: e.clientY,
      originX: position.x,
      originY: position.y,
    })
  }

  function moveDrag(e: PointerEvent<HTMLDivElement>) {
    if (!dragStart) return
    setPosition({
      x: dragStart.originX + e.clientX - dragStart.pointerX,
      y: dragStart.originY + e.clientY - dragStart.pointerY,
    })
  }

  function stopDrag(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    setDragStart(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (endTime < startTime) {
      setError('End time must be after start time')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        title,
        startAt: buildDateTime(startTime),
        endAt: buildDateTime(endTime),
        categoryId: categoryId || null,
        notes: notes.trim() ? notes.trim() : undefined,
        rrule,
      }
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      const created = await res.json()
      onEventCreated(created)
      closeForm()
      onClose()
      setTitle('')
      setStartTime('09:00')
      setEndTime('10:00')
      setRrule(null)
      setCategoryId('')
      setNotes('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      data-testid="add-event-editor-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        data-testid="add-event-editor-panel"
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      >
        <div
          data-testid="add-event-editor-drag-handle"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          className="flex cursor-move touch-none select-none items-center justify-between border-b border-border px-5 py-4"
        >
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <h2 className="text-sm font-semibold">{showForm ? 'Add Event' : formatHeading(date)}</h2>
          {showForm ? (
            <button
              type="button"
              onClick={() => {
                formRef.current?.requestSubmit()
              }}
              disabled={saving || !title.trim()}
              className="cursor-pointer text-sm font-semibold text-primary disabled:opacity-50"
              aria-label="Done"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'Done'}
            </button>
          ) : (
            <span className="w-11" aria-hidden="true" />
          )}
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-4">
          {isEmpty && !showForm && (
            <p className="py-4 text-center text-sm text-muted-foreground">Nothing scheduled</p>
          )}

          {events.length > 0 && (
            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Your events</p>
              <ul className="space-y-1">
                {events.map(ev => {
                  const cat = eventCategories.find(c => c.id === ev.categoryId)
                  return (
                    <li key={ev.occurrenceId}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-lg bg-muted/40 px-3 py-2.5 text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                        onClick={() => onEditEvent(ev)}
                        aria-label={`Edit event: ${ev.title} at ${formatTime(ev.startAt)}`}
                      >
                        <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground text-left">
                          {formatTime(ev.startAt)}
                        </span>
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: ev.color ?? cat?.color ?? '#6366f1' }}
                        />
                        <span className="flex-1 truncate font-medium text-left">{ev.title}</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" aria-hidden="true" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {icsEvents.length > 0 && (
            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Imported</p>
              <ul className="space-y-1">
                {icsEvents.map(ev => (
                  <li key={ev.uid} className="flex items-center gap-2 rounded-lg bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/40" />
                    <span>{ev.title}</span>
                    <span className="ml-auto text-xs">{formatTime(ev.startAt)} - {formatTime(ev.endAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {showForm && (
            <form ref={formRef} id="add-event-form" onSubmit={handleSubmit} className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center gap-2">
                {/* Live preview of the color this event will be added with */}
                <span
                  data-testid="add-event-color-preview"
                  aria-label="Event color"
                  className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-inset ring-white/20"
                  style={{ backgroundColor: selectedColor }}
                />
                <input
                  required
                  placeholder="Title"
                  aria-label="Title"
                  autoFocus
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  maxLength={100}
                  className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Start</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => {
                      const next = e.target.value
                      setStartTime(next)
                      if (endTime <= next) setEndTime(addOneMinute(next))
                    }}
                    className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">End</label>
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm" />
                </div>
              </div>
              <RepeatPicker value={rrule} onChange={setRrule} />
              <CategoryPicker
                categories={eventCategories}
                value={categoryId}
                onChange={setCategoryId}
                onCategoryCreated={cat => onCategoriesChange([...eventCategories, cat])}
              />
              <textarea
                placeholder="Notes (optional)"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm resize-none"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </form>
          )}
        </div>

        {!showForm && (
          <div className="border-t border-border px-5 py-4">
            <button
              onClick={() => setShowForm(true)}
              className="w-full rounded-xl bg-primary/10 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
            >
              + Add Event
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
