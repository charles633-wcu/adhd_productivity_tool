'use client'

import { useState, useEffect, FormEvent } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { Trigger } from '@/lib/db/schema'

const PRIORITY_OPTIONS = [
  { value: 3, label: 'Low',       activeClass: 'bg-emerald-500/20 text-emerald-300', dotClass: 'bg-emerald-400' },
  { value: 2, label: 'Medium',    activeClass: 'bg-yellow-500/20 text-yellow-300',   dotClass: 'bg-yellow-400' },
  { value: 1, label: 'High',      activeClass: 'bg-rose-500/20 text-rose-300',       dotClass: 'bg-rose-400' },
  { value: 0, label: 'Very High', activeClass: 'bg-red-500/20 text-red-300',         dotClass: 'bg-red-400',
    activeStyle: { boxShadow: '0 0 12px oklch(0.55 0.22 25 / 0.35)' } },
] as const

interface TriggerEditSheetProps {
  trigger: Trigger | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function TriggerEditSheet({ trigger, open, onOpenChange, onSuccess }: TriggerEditSheetProps) {
  const [title, setTitle] = useState('')
  const [fullContent, setFullContent] = useState('')
  const [priority, setPriority] = useState(2)
  const [intervalDays, setIntervalDays] = useState(7)
  const [intervalTyping, setIntervalTyping] = useState(false)
  const [intervalInput, setIntervalInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (trigger && open) {
      setTitle(trigger.title)
      setFullContent(trigger.fullContent ?? '')
      setPriority(trigger.priority)
      setIntervalDays(Math.max(0, Math.min(30, trigger.reviewIntervalDays ?? 7)))
      setIntervalTyping(false)
      setIntervalInput('')
      setError(null)
    }
  }, [trigger, open])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!trigger) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/triggers/${trigger.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          fullContent,
          priority,
          reviewIntervalDays: intervalDays,
        }),
      })
      if (!res.ok) throw new Error('Failed to update trigger')
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={nextOpen => {
        onOpenChange(nextOpen)
        if (!nextOpen) {
          setError(null)
        }
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-[420px] p-0 flex flex-col gap-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <SheetTitle className="text-base font-semibold tracking-tight">Edit Trigger</SheetTitle>
        </SheetHeader>

        <>
          <form
            id="trigger-edit-form"
            onSubmit={handleSubmit}
            className="flex-1 overflow-y-auto px-6 py-6 space-y-6"
          >
              <fieldset className="space-y-1.5">
                <label
                  htmlFor="tef-title"
                  className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                >
                  Title *
                </label>
                <input
                  id="tef-title"
                  type="text"
                  required
                  autoFocus
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="What do you need to review?"
                  className="w-full rounded-xl border border-input bg-muted/40 px-4 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"
                />
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Priority
                </legend>
                <div className="flex rounded-xl border border-border overflow-hidden">
                  {PRIORITY_OPTIONS.map((option, index) => {
                    const isActive = priority === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setPriority(option.value)}
                        className={[
                          'flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-all',
                          index > 0 ? 'border-l border-border' : '',
                          isActive ? option.activeClass : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
                        ].join(' ')}
                        style={isActive && 'activeStyle' in option ? option.activeStyle : undefined}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full transition-opacity ${option.dotClass} ${isActive ? 'opacity-100' : 'opacity-30'}`} />
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Review Interval
                </legend>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={30}
                      value={intervalDays}
                      onChange={e => setIntervalDays(Number(e.target.value))}
                      className="flex-1 h-1.5 accent-primary cursor-pointer"
                    />
                    {intervalTyping ? (
                      <input
                        type="number"
                        min={0}
                        max={30}
                        value={intervalInput}
                        autoFocus
                        onChange={e => setIntervalInput(e.target.value)}
                        onBlur={() => {
                          const value = Math.max(0, Math.min(30, parseInt(intervalInput, 10) || 0))
                          setIntervalDays(value)
                          setIntervalTyping(false)
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const value = Math.max(0, Math.min(30, parseInt(intervalInput, 10) || 0))
                            setIntervalDays(value)
                            setIntervalTyping(false)
                          }
                          if (e.key === 'Escape') setIntervalTyping(false)
                        }}
                        className="w-12 text-center rounded-lg border border-input bg-muted/40 px-1 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/50"
                      />
                    ) : (
                      <button
                        type="button"
                        title="Click to type a value"
                        onClick={() => {
                          setIntervalTyping(true)
                          setIntervalInput(String(intervalDays))
                        }}
                        className="w-12 text-center rounded-lg border border-transparent hover:border-input hover:bg-muted/40 px-1 py-1 text-sm font-mono text-foreground transition-colors"
                      >
                        {intervalDays}
                      </button>
                    )}
                    <span className="text-xs text-muted-foreground shrink-0 w-7">
                      {intervalDays === 1 ? 'day' : 'days'}
                    </span>
                  </div>
                  <div className="flex justify-between text-[9px] text-muted-foreground/40 px-0.5">
                    <span>0</span>
                    <span>15</span>
                    <span>30</span>
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-1.5">
                <label
                  htmlFor="tef-content"
                  className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                >
                  Original Content
                </label>
                <textarea
                  id="tef-content"
                  value={fullContent}
                  onChange={e => setFullContent(e.target.value)}
                  rows={4}
                  placeholder="Optional context"
                  className="w-full rounded-xl border border-input bg-muted/40 px-4 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow resize-none"
                />
              </fieldset>

              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
                >
                  {error}
                </p>
              )}
          </form>

          <div className="shrink-0 px-6 py-4 border-t border-border bg-background/60 backdrop-blur-sm flex gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 rounded-xl border border-border px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="trigger-edit-form"
              disabled={loading}
              className="flex-1 rounded-xl bg-primary text-primary-foreground px-3 py-3 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              {loading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      </SheetContent>
    </Sheet>
  )
}
