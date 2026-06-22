/**
 * EventDetailSheet - centered editor for editing/deleting calendar occurrences.
 */
'use client'

import { useEffect, useState, type PointerEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { RecurringEventScopeSheet, type RecurScope } from '@/components/RecurringEventScopeSheet'
import { RepeatPicker } from '@/components/RepeatPicker'
import { CategoryPicker, type PickerCategory } from '@/components/CategoryPicker'
import { toNormalizedIso } from '@/lib/services/repeatExpander'
import type { EventOccurrence } from '@/lib/types/calendar'

export interface EventDetailSheetProps {
  event: EventOccurrence | null
  categories: PickerCategory[]
  onClose: () => void
  onSaved: (sourceEventId: string) => void
  onDeleted: (sourceEventId: string) => void
  onCategoriesChange: (categories: PickerCategory[]) => void
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

function addOneMinute(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const next = h * 60 + m + 1
  return `${String(Math.floor(next / 60) % 24).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && target.closest('button, input, select, textarea, a, [role="button"]') !== null
}

export function EventDetailSheet({ event, categories, onClose, onSaved, onDeleted, onCategoriesChange }: EventDetailSheetProps) {
  const [title, setTitle] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [rrule, setRrule] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showScopeSheet, setShowScopeSheet] = useState(false)
  const [scopeAction, setScopeAction] = useState<'edit' | 'delete'>('edit')
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragStart, setDragStart] = useState<{
    pointerX: number
    pointerY: number
    originX: number
    originY: number
  } | null>(null)

  useEffect(() => {
    if (!event) return
    setTitle(event.title)
    setStartTime(toTimeStr(event.startAt))
    setEndTime(toTimeStr(event.endAt))
    setRrule(event.rrule)
    setCategoryId(event.categoryId ?? '')
    setShowScopeSheet(false)
    setError(null)
    setPosition({ x: 0, y: 0 })
    setDragStart(null)
  }, [event])

  if (!event) return null
  const occurrence = event

  function close() {
    onClose()
  }

  function startDrag(e: PointerEvent<HTMLDivElement>) {
    if (isInteractiveTarget(e.target)) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDragStart({ pointerX: e.clientX, pointerY: e.clientY, originX: position.x, originY: position.y })
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

  function occurrenceDate() {
    return occurrence.isOverride ? occurrence.originalDate! : toNormalizedIso(occurrence.startAt)
  }

  function handleDoneClick() {
    if (!title.trim()) return
    if (endTime < startTime) {
      setError('End time must be after start time')
      return
    }
    if (occurrence.rrule) {
      setScopeAction('edit')
      setShowScopeSheet(true)
    } else {
      void doSave('all')
    }
  }

  function handleDeleteClick() {
    if (occurrence.rrule) {
      setScopeAction('delete')
      setShowScopeSheet(true)
    } else {
      void doDelete('all')
    }
  }

  async function doSave(scope: RecurScope) {
    setSaving(true)
    setError(null)
    setShowScopeSheet(false)
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        startAt: buildDateTime(occurrence.startAt, startTime),
        endAt: buildDateTime(occurrence.endAt, endTime),
        rrule,
        categoryId: categoryId || null,
      }
      if (occurrence.rrule) {
        body.scope = scope
        body.occurrenceDate = occurrenceDate()
      }

      const res = await fetch(`/api/calendar/events/${occurrence.sourceEventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      onSaved(occurrence.sourceEventId)
      close()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save event'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function doDelete(scope: RecurScope) {
    setDeleting(true)
    setError(null)
    setShowScopeSheet(false)
    try {
      const params = occurrence.rrule
        ? `?scope=${scope}&occurrenceDate=${encodeURIComponent(occurrenceDate())}`
        : ''
      const res = await fetch(`/api/calendar/events/${occurrence.sourceEventId}${params}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      onDeleted(occurrence.sourceEventId)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete event')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div
        data-testid="event-editor-overlay"
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        onClick={e => { if (e.target === e.currentTarget) close() }}
      >
        <div
          data-testid="event-editor-panel"
          style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
          className="w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        >
          <div
            data-testid="event-editor-drag-handle"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
            className="flex cursor-move touch-none select-none items-center justify-between border-b border-border px-5 py-4"
          >
            <button type="button" onClick={close} className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <h2 className="text-sm font-semibold">Edit Event</h2>
            <button
              type="button"
              onClick={handleDoneClick}
              disabled={saving || deleting || !title.trim()}
              className="cursor-pointer text-sm font-semibold text-primary disabled:opacity-50"
              aria-label="Done"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'Done'}
            </button>
          </div>

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
                  onChange={e => {
                    const next = e.target.value
                    setStartTime(next)
                    if (endTime <= next) setEndTime(addOneMinute(next))
                  }}
                  className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="eds-end" className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  End
                </label>
                <input id="eds-end" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm" />
              </div>
            </div>
            <RepeatPicker value={rrule} onChange={setRrule} />
            <CategoryPicker
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              onCategoryCreated={cat => onCategoriesChange([...categories, cat])}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <div className="border-t border-border px-5 py-4">
            <button
              type="button"
              onClick={handleDeleteClick}
              disabled={deleting || saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'Delete event'}
            </button>
          </div>
        </div>
      </div>

      {showScopeSheet && (
        <RecurringEventScopeSheet
          action={scopeAction}
          onSelect={scope => {
            if (scopeAction === 'edit') void doSave(scope)
            else void doDelete(scope)
          }}
          onCancel={() => setShowScopeSheet(false)}
        />
      )}
    </>
  )
}
