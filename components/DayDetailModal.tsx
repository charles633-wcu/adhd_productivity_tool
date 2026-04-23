/**
 * DayDetailModal - centered overlay showing all items for a selected calendar day.
 * Three sections (personal events, ICS imports) plus inline add-event form.
 * Calls onEventCreated / onEventDeleted to let CalendarClient update local state.
 */
'use client'

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'

interface CalendarEventItem {
  occurrenceId: string; sourceEventId: string; title: string
  startAt: Date; endAt: Date; color?: string | null; categoryId?: string | null
}
interface IcsEventItem { uid: string; title: string; startAt: Date; endAt: Date }
interface EventCategoryItem { id: string; name: string; color: string }

type RepeatMode = 'never' | 'daily' | 'weekly' | 'monthly' | 'yearly'
type RepeatTabMode = Exclude<RepeatMode, 'never'>

interface RepeatConfig {
  mode: RepeatMode
  every: number
}

interface DayDetailModalProps {
  date: Date
  events: CalendarEventItem[]
  icsEvents: IcsEventItem[]
  eventCategories: EventCategoryItem[]
  startInAddMode?: boolean
  onClose: () => void
  onEventCreated: (event: CalendarEventItem) => void
  onEventDeleted: (sourceEventId: string) => void
}

function formatTime(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function formatHeading(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

function weekdayLabel(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: 'long' })
}

function monthlyAnchorLabel(d: Date) {
  return d.toLocaleDateString(undefined, { day: 'numeric' })
}

function yearlyAnchorLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
}

function repeatSummary(config: RepeatConfig, date: Date) {
  if (config.mode === 'never') return 'Never'
  if (config.mode === 'daily') return `Every ${config.every} day${config.every === 1 ? '' : 's'}`
  if (config.mode === 'weekly') return `Every ${config.every} week${config.every === 1 ? '' : 's'} on ${weekdayLabel(date)}`
  if (config.mode === 'monthly') return `Every ${config.every} month${config.every === 1 ? '' : 's'} on day ${monthlyAnchorLabel(date)}`
  return `Every ${config.every} year${config.every === 1 ? '' : 's'} on ${yearlyAnchorLabel(date)}`
}

function repeatUnitLabel(mode: Exclude<RepeatMode, 'never'>, every: number) {
  if (mode === 'daily') return `day${every === 1 ? '' : 's'}`
  if (mode === 'weekly') return `week${every === 1 ? '' : 's'}`
  if (mode === 'monthly') return `month${every === 1 ? '' : 's'}`
  return `year${every === 1 ? '' : 's'}`
}

const repeatTabModes: RepeatTabMode[] = ['daily', 'weekly', 'monthly', 'yearly']

export function DayDetailModal({
  date, events, icsEvents, eventCategories, startInAddMode = false, onClose, onEventCreated, onEventDeleted,
}: DayDetailModalProps) {
  const [showForm, setShowForm] = useState(startInAddMode)
  const [title, setTitle] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [repeatOpen, setRepeatOpen] = useState(false)
  const [repeatPresetOpen, setRepeatPresetOpen] = useState(false)
  const [repeatConfig, setRepeatConfig] = useState<RepeatConfig>({ mode: 'never', every: 1 })
  const [categoryId, setCategoryId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const repeatControlRef = useRef<HTMLDivElement>(null)
  const repeatTabRefs = useRef<Partial<Record<RepeatTabMode, HTMLButtonElement | null>>>({})

  const isEmpty = events.length === 0 && icsEvents.length === 0
  const customRepeatMode: RepeatTabMode = repeatConfig.mode === 'never' ? 'daily' : repeatConfig.mode

  function buildDateTime(time: string) {
    const [h, m] = time.split(':').map(Number)
    const d = new Date(date)
    d.setHours(h, m, 0, 0)
    return d.toISOString()
  }

  function closeRepeatMenus() {
    setRepeatOpen(false)
    setRepeatPresetOpen(false)
  }

  function selectRepeatPreset(mode: RepeatMode) {
    setRepeatConfig({ mode, every: 1 })
    closeRepeatMenus()
  }

  function openCustomRepeat() {
    setRepeatPresetOpen(false)
    setRepeatOpen(true)
    setRepeatConfig(current => ({
      mode: current.mode === 'never' ? 'daily' : current.mode,
      every: current.every,
    }))
  }

  function handleRepeatTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'] as const
    if (!keys.includes(event.key as typeof keys[number])) return

    event.preventDefault()

    let nextIndex = index
    if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = repeatTabModes.length - 1
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % repeatTabModes.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + repeatTabModes.length) % repeatTabModes.length

    const nextMode = repeatTabModes[nextIndex]
    setRepeatConfig(current => ({ ...current, mode: nextMode }))
    repeatTabRefs.current[nextMode]?.focus()
  }

  function closeForm() {
    setShowForm(false)
    closeRepeatMenus()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        title,
        startAt: buildDateTime(startTime),
        endAt: buildDateTime(endTime),
        categoryId: categoryId || null,
        notes: notes.trim() ? notes.trim() : undefined,
        repeatIntervalDays: repeatConfig.mode === 'daily' ? repeatConfig.every : null,
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
      setTitle('')
      setStartTime('09:00')
      setEndTime('10:00')
      setRepeatConfig({ mode: 'never', every: 1 })
      setCategoryId('')
      setNotes('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(sourceEventId: string) {
    try {
      await fetch(`/api/calendar/events/${sourceEventId}`, { method: 'DELETE' })
      onEventDeleted(sourceEventId)
    } catch {
      // Silent; parent handles state.
    }
  }

  useEffect(() => {
    if (!repeatOpen) return

    repeatTabRefs.current[customRepeatMode]?.focus()
  }, [customRepeatMode, repeatOpen])

  useEffect(() => {
    if (!repeatOpen && !repeatPresetOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (repeatControlRef.current?.contains(event.target as Node)) return
      closeRepeatMenus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [repeatOpen, repeatPresetOpen])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={e => {
        if (e.key === 'Escape' && (repeatOpen || repeatPresetOpen)) {
          e.stopPropagation()
          closeRepeatMenus()
        }
      }}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">{formatHeading(date)}</h2>
          <button onClick={onClose} className="text-lg leading-none text-muted-foreground hover:text-foreground">x</button>
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
                    <li key={ev.occurrenceId} className="group flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: ev.color ?? cat?.color ?? '#6366f1' }}
                      />
                      <span className="flex-1 font-medium">{ev.title}</span>
                      <span className="text-xs text-muted-foreground">{formatTime(new Date(ev.startAt))} - {formatTime(new Date(ev.endAt))}</span>
                      <button
                        onClick={() => handleDelete(ev.sourceEventId)}
                        className="ml-1 text-xs text-destructive opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Delete event"
                      >x</button>
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
                    <span className="ml-auto text-xs">{formatTime(new Date(ev.startAt))} - {formatTime(new Date(ev.endAt))}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {showForm && (
            <form onSubmit={handleSubmit} className="space-y-3 border-t border-border pt-4">
              <input
                required
                placeholder="Title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={100}
                className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Start</label>
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm" />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">End</label>
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex gap-2">
                <div ref={repeatControlRef} className="relative flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      setRepeatOpen(false)
                      setRepeatPresetOpen(open => !open)
                    }}
                    className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 text-left text-sm hover:bg-muted/60"
                    aria-expanded={repeatPresetOpen || repeatOpen}
                    aria-label={`Repeat ${repeatSummary(repeatConfig, date)}`}
                  >
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Repeat</span>
                    <span>{repeatOpen ? 'Custom' : repeatSummary(repeatConfig, date)}</span>
                  </button>

                  {repeatPresetOpen && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-2 rounded-xl border border-border bg-background p-2 shadow-xl">
                      <div className="space-y-1">
                        <button type="button" onClick={() => selectRepeatPreset('never')} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">Never</button>
                        <button type="button" onClick={() => selectRepeatPreset('daily')} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">Every day</button>
                        <button type="button" onClick={() => selectRepeatPreset('weekly')} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">Every week</button>
                        <button type="button" onClick={() => selectRepeatPreset('monthly')} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">Every month</button>
                        <button type="button" onClick={() => selectRepeatPreset('yearly')} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">Every year</button>
                        <button type="button" onClick={openCustomRepeat} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">Custom</button>
                      </div>
                    </div>
                  )}

                  {repeatOpen && (
                    <div
                      className="absolute left-0 right-0 top-full z-10 mt-2 space-y-3 rounded-xl border border-border bg-background p-3 shadow-xl"
                      role="dialog"
                      aria-label="Custom repeat builder"
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          e.stopPropagation()
                          closeRepeatMenus()
                        }
                      }}
                    >
                      <div role="tablist" aria-label="Repeat frequency" className="grid grid-cols-4 gap-1 rounded-lg bg-muted/60 p-1">
                        {repeatTabModes.map((mode, index) => (
                          <button
                            key={mode}
                            type="button"
                            role="tab"
                            id={`repeat-tab-${mode}`}
                            aria-selected={customRepeatMode === mode}
                            aria-controls="repeat-panel"
                            tabIndex={customRepeatMode === mode ? 0 : -1}
                            ref={el => { repeatTabRefs.current[mode] = el }}
                            onClick={() => setRepeatConfig(current => ({ ...current, mode }))}
                            onKeyDown={event => handleRepeatTabKeyDown(event, index)}
                            className={`rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors ${customRepeatMode === mode ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                      <div
                        role="tabpanel"
                        id="repeat-panel"
                        aria-labelledby={`repeat-tab-${customRepeatMode}`}
                        className="space-y-3"
                      >
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-sm text-muted-foreground">Every</span>
                          <select
                            value={repeatConfig.every}
                            onChange={e => setRepeatConfig(current => ({ ...current, every: parseInt(e.target.value, 10) }))}
                            className="w-24 rounded-lg border border-input bg-muted/40 px-3 py-2 text-center text-sm"
                            aria-label="Repeat interval"
                          >
                            {Array.from({ length: 120 }, (_, index) => index + 1).map(value => (
                              <option key={value} value={value}>{value}</option>
                            ))}
                          </select>
                          <span className="text-sm capitalize text-muted-foreground">{repeatUnitLabel(customRepeatMode, repeatConfig.every)}</span>
                        </div>
                        <p className="text-center text-xs text-muted-foreground">{repeatSummary(repeatConfig, date)}</p>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={closeRepeatMenus}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <select
                  value={categoryId}
                  onChange={e => setCategoryId(e.target.value)}
                  className="flex-1 rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm"
                >
                  <option value="">No category</option>
                  {eventCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <textarea
                placeholder="Notes (optional)"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm resize-none"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={closeForm} className="flex-1 rounded-lg border border-border py-2 text-sm text-muted-foreground hover:bg-muted">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
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
