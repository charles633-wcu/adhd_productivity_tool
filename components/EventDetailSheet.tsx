/**
 * EventDetailSheet — nested bottom sheet for editing or deleting a single calendar event.
 * Slides up over DayDetailModal (z-60 > z-50). Informant iOS style: Cancel/Done header,
 * stacked form fields, red two-tap delete footer.
 */
'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { DatePickerMini } from '@/components/DatePickerMini'
import { RepeatPicker } from '@/components/RepeatPicker'
import type { RepeatFrequency, RepeatValue } from '@/lib/types/calendar'

interface CalendarEventItem {
  occurrenceId: string
  sourceEventId: string
  title: string
  startAt: Date
  endAt: Date
  color?: string | null
  categoryId?: string | null
  repeatFrequency?: RepeatFrequency | null
  repeatInterval?: number | null
  repeatEndsAt?: string | null
}

interface PatchedEvent {
  id: string
  title: string
  startAt: string
  endAt: string
  color?: string | null
  categoryId?: string | null
}

export interface EventDetailSheetProps {
  event: CalendarEventItem | null
  onClose: () => void
  onSaved: (updated: PatchedEvent) => void
  onDeleted: (sourceEventId: string) => void
}

function toTimeStr(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function buildDateTime(baseDate: Date, time: string): string {
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error('Invalid time')
  const [h, m] = time.split(':').map(Number)
  const d = new Date(baseDate)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

export function EventDetailSheet({ event, onClose, onSaved, onDeleted }: EventDetailSheetProps) {
  const [title, setTitle] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [repeat, setRepeat] = useState<RepeatValue>({ frequency: null, interval: 1 })
  const [repeatEndsAt, setRepeatEndsAt] = useState<Date | null>(null)
  const [showEndPicker, setShowEndPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  // Pre-fill fields whenever a new event is selected
  useEffect(() => {
    if (!event) { setDeleteConfirm(false); return }
    setTitle(event.title)
    setStartTime(toTimeStr(event.startAt))
    setEndTime(toTimeStr(event.endAt))
    setRepeat(
      event.repeatFrequency
        ? { frequency: event.repeatFrequency, interval: event.repeatInterval ?? 1 }
        : { frequency: null, interval: 1 },
    )
    setRepeatEndsAt(event.repeatEndsAt ? new Date(event.repeatEndsAt) : null)
    setShowEndPicker(false)
    setDeleteConfirm(false)
  }, [event])

  if (!event) return null

  // Resets transient UI state before delegating close to parent
  function close() { setDeleteConfirm(false); onClose() }

  async function handleSave() {
    if (!event) return
    setSaving(true)
    try {
      const res = await fetch(`/api/calendar/events/${event.sourceEventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          startAt: buildDateTime(event.startAt, startTime),
          endAt: buildDateTime(event.endAt, endTime),
          repeatFrequency: repeat.frequency,
          repeatInterval: repeat.frequency ? repeat.interval : null,
          repeatEndsAt: repeatEndsAt?.toISOString() ?? null,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const updated: PatchedEvent = await res.json()
      onSaved(updated)
      // onClose is NOT called here — the parent's onSaved handler owns closing
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save event')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!event) return
    if (!deleteConfirm) { setDeleteConfirm(true); return }
    setDeleting(true)
    try {
      const res = await fetch(`/api/calendar/events/${event.sourceEventId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      onDeleted(event.sourceEventId)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete event')
      setDeleteConfirm(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) close() }}
    >
      <div className="w-full max-w-md rounded-t-2xl border border-border bg-background shadow-2xl animate-in slide-in-from-bottom duration-200">

        {/* Header: Cancel · Edit Event · Done */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <button
            type="button"
            onClick={close}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <h2 className="text-sm font-semibold">Edit Event</h2>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || deleting || !title.trim()}
            className="text-sm font-semibold text-primary disabled:opacity-50"
            aria-label="Done"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'Done'}
          </button>
        </div>

        {/* Form fields */}
        <div className="space-y-3 px-5 py-4">
          <input
            placeholder="Title"
            aria-label="Title"
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={100}
            className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <label htmlFor="eds-start" className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Start
              </label>
              <input
                id="eds-start"
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="eds-end" className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                End
              </label>
              <input
                id="eds-end"
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <RepeatPicker value={repeat} onChange={setRepeat} />

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              End repeat
            </label>
            <button
              type="button"
              onClick={() => setShowEndPicker(open => !open)}
              aria-label="End repeat"
              className="flex w-full items-center justify-between rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm hover:bg-muted/60"
            >
              <span className={repeatEndsAt ? '' : 'text-muted-foreground'}>
                {repeatEndsAt ? repeatEndsAt.toLocaleDateString() : 'Never'}
              </span>
            </button>
            {showEndPicker && (
              <div className="mt-2">
                <DatePickerMini
                  value={repeatEndsAt}
                  onChange={date => {
                    setRepeatEndsAt(date)
                    setShowEndPicker(false)
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Delete footer — two-tap confirm, no dialog */}
        <div className="border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting || saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            {deleting
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              : deleteConfirm ? 'Tap again to confirm' : 'Delete event'}
          </button>
        </div>
      </div>
    </div>
  )
}
