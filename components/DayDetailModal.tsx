/**
 * DayDetailModal — centered overlay showing all items for a selected calendar day.
 * Three sections (triggers due, personal events, ICS imports) + inline add-event form.
 * Calls onEventCreated / onEventDeleted to let CalendarClient update local state.
 */
'use client'

import { useState, FormEvent } from 'react'

interface TriggerItem { id: string; title: string }
interface CalendarEventItem {
  occurrenceId: string; sourceEventId: string; title: string
  startAt: Date; endAt: Date; color?: string | null; categoryId?: string | null
}
interface IcsEventItem { uid: string; title: string; startAt: Date; endAt: Date }
interface EventCategoryItem { id: string; name: string; color: string }

interface DayDetailModalProps {
  date: Date
  triggers: TriggerItem[]
  events: CalendarEventItem[]
  icsEvents: IcsEventItem[]
  eventCategories: EventCategoryItem[]
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

export function DayDetailModal({
  date, triggers, events, icsEvents, eventCategories, onClose, onEventCreated, onEventDeleted,
}: DayDetailModalProps) {
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [repeatDays, setRepeatDays] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEmpty = triggers.length === 0 && events.length === 0 && icsEvents.length === 0

  function buildDateTime(time: string) {
    const [h, m] = time.split(':').map(Number)
    const d = new Date(date)
    d.setHours(h, m, 0, 0)
    return d.toISOString()
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
        notes: notes || null,
        repeatIntervalDays: repeatDays ? parseInt(repeatDays) : null,
      }
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      const created = await res.json()
      onEventCreated(created)
      setShowForm(false)
      setTitle(''); setStartTime('09:00'); setEndTime('10:00'); setRepeatDays(''); setCategoryId(''); setNotes('')
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
    } catch { /* silent — parent handles state */ }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-background border border-border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold">{formatHeading(date)}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
        </div>

        <div className="overflow-y-auto max-h-[70vh] px-5 py-4 space-y-5">
          {isEmpty && !showForm && (
            <p className="text-sm text-muted-foreground text-center py-4">Nothing scheduled</p>
          )}

          {/* Triggers due */}
          {triggers.length > 0 && (
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-2">Triggers due</p>
              <ul className="space-y-1">
                {triggers.map(t => (
                  <li key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-sm">
                    <span className="text-primary">🎯</span>
                    <span className="font-medium">{t.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Personal events */}
          {events.length > 0 && (
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Your events</p>
              <ul className="space-y-1">
                {events.map(ev => {
                  const cat = eventCategories.find(c => c.id === ev.categoryId)
                  return (
                    <li key={ev.occurrenceId} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 text-sm group">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: ev.color ?? cat?.color ?? '#6366f1' }}
                      />
                      <span className="flex-1 font-medium">{ev.title}</span>
                      <span className="text-xs text-muted-foreground">{formatTime(new Date(ev.startAt))} – {formatTime(new Date(ev.endAt))}</span>
                      <button
                        onClick={() => handleDelete(ev.sourceEventId)}
                        className="opacity-0 group-hover:opacity-100 text-destructive text-xs ml-1 transition-opacity"
                        aria-label="Delete event"
                      >✕</button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* ICS events — read-only */}
          {icsEvents.length > 0 && (
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Imported</p>
              <ul className="space-y-1">
                {icsEvents.map(ev => (
                  <li key={ev.uid} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/20 text-sm text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-muted-foreground/40" />
                    <span>{ev.title}</span>
                    <span className="ml-auto text-xs">{formatTime(new Date(ev.startAt))} – {formatTime(new Date(ev.endAt))}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Add event inline form */}
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
                  <label className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Start</label>
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm" />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">End</label>
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Repeat every N days (0 = none)"
                  value={repeatDays}
                  onChange={e => setRepeatDays(e.target.value)}
                  min={1}
                  className="flex-1 rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm"
                />
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
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-lg border border-border py-2 text-sm text-muted-foreground hover:bg-muted">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-primary text-primary-foreground py-2 text-sm font-semibold disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        {!showForm && (
          <div className="px-5 py-4 border-t border-border">
            <button
              onClick={() => setShowForm(true)}
              className="w-full rounded-xl bg-primary/10 text-primary py-2.5 text-sm font-semibold hover:bg-primary/20 transition-colors"
            >
              + Add Event
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
