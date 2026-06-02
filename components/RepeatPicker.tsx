/**
 * RepeatPicker selects and edits an RRULE recurrence string.
 */
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { RRule, Weekday } from 'rrule'
import { DatePickerMini } from '@/components/DatePickerMini'

interface RepeatPickerProps {
  value: string | null
  onChange: (rrule: string | null) => void
}

type Freq = typeof RRule.DAILY | typeof RRule.WEEKLY | typeof RRule.MONTHLY | typeof RRule.YEARLY
type EndMode = 'never' | 'until' | 'count'
type PatternMode = 'date' | 'weekday'

interface PickerState {
  freq: Freq
  interval: number
  byweekday: Weekday[]
  bymonthday: number | null
  bysetpos: number | null
  bymonth: number | null
  endMode: EndMode
  until: Date | null
  count: number | null
  patternMode: PatternMode
}

const WEEKDAYS = [RRule.SU, RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA]
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const SETPOS_OPTIONS = [
  { label: 'first', value: 1 },
  { label: 'second', value: 2 },
  { label: 'third', value: 3 },
  { label: 'fourth', value: 4 },
  { label: 'last', value: -1 },
]

const DEFAULT_STATE: PickerState = {
  freq: RRule.DAILY,
  interval: 1,
  byweekday: [],
  bymonthday: 1,
  bysetpos: null,
  bymonth: null,
  endMode: 'never',
  until: null,
  count: null,
  patternMode: 'date',
}

function stripRRulePrefix(value: string) {
  return value.replace(/^DTSTART[^\n]*\n/, '').replace(/^RRULE:/, '')
}

function normalizeWeekdays(value: unknown): Weekday[] {
  if (!value) return []
  const values = Array.isArray(value) ? value : [value]
  return values.map(item => {
    if (item instanceof Weekday) return item
    if (typeof item === 'number') return [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA, RRule.SU][item]
    return null
  }).filter((item): item is Weekday => item != null)
}

function parseValue(value: string | null): PickerState {
  if (!value) return DEFAULT_STATE
  try {
    const opts = RRule.parseString(value)
    const byweekday = normalizeWeekdays(opts.byweekday)
    const bymonthday = Array.isArray(opts.bymonthday) ? opts.bymonthday[0] : opts.bymonthday ?? null
    const bysetpos = Array.isArray(opts.bysetpos) ? opts.bysetpos[0] : opts.bysetpos ?? null
    const bymonth = Array.isArray(opts.bymonth) ? opts.bymonth[0] : opts.bymonth ?? null
    return {
      freq: (opts.freq ?? RRule.DAILY) as Freq,
      interval: opts.interval ?? 1,
      byweekday,
      bymonthday,
      bysetpos,
      bymonth,
      endMode: opts.until ? 'until' : opts.count ? 'count' : 'never',
      until: opts.until ?? null,
      count: opts.count ?? null,
      patternMode: bysetpos != null ? 'weekday' : 'date',
    }
  } catch {
    return DEFAULT_STATE
  }
}

function buildRRule(state: PickerState): string {
  const opts: ConstructorParameters<typeof RRule>[0] = {
    freq: state.freq,
    interval: state.interval,
  }

  if (state.freq === RRule.WEEKLY && state.byweekday.length > 0) {
    opts.byweekday = state.byweekday
  }

  if (state.freq === RRule.MONTHLY) {
    if (state.patternMode === 'weekday') {
      opts.byweekday = state.byweekday[0] ? [state.byweekday[0]] : [RRule.MO]
      opts.bysetpos = state.bysetpos ?? 1
    } else if (state.bymonthday) {
      opts.bymonthday = state.bymonthday
    }
  }

  // Only constrain by month/day when the user has explicitly chosen them.
  // Without BYMONTH, FREQ=YEARLY naturally recurs on the same month+day as dtstart.
  if (state.freq === RRule.YEARLY && state.bymonth !== null) {
    opts.bymonth = state.bymonth
    if (state.patternMode === 'weekday') {
      opts.byweekday = state.byweekday[0] ? [state.byweekday[0]] : [RRule.MO]
      opts.bysetpos = state.bysetpos ?? 1
    } else if (state.bymonthday) {
      opts.bymonthday = state.bymonthday
    }
  }

  if (state.endMode === 'until' && state.until) opts.until = state.until
  if (state.endMode === 'count' && state.count) opts.count = state.count

  return stripRRulePrefix(new RRule(opts).toString())
}

function summary(value: string | null) {
  if (!value) return 'Never'
  const state = parseValue(value)
  const freq = state.freq === RRule.DAILY ? 'day'
    : state.freq === RRule.WEEKLY ? 'week'
      : state.freq === RRule.MONTHLY ? 'month'
        : 'year'
  return state.interval === 1 ? `Every ${freq}` : `Every ${state.interval} ${freq}s`
}

function freqLabel(freq: Freq) {
  if (freq === RRule.DAILY) return 'Daily'
  if (freq === RRule.WEEKLY) return 'Weekly'
  if (freq === RRule.MONTHLY) return 'Monthly'
  return 'Yearly'
}

function freqUnitLabel(freq: Freq) {
  if (freq === RRule.DAILY) return 'days'
  if (freq === RRule.WEEKLY) return 'weeks'
  if (freq === RRule.MONTHLY) return 'months'
  return 'years'
}

function NumberScroller({
  label,
  value,
  max = 120,
  onSelect,
  buttonLabel,
}: {
  label: string
  value: number
  max?: number
  onSelect: (value: number) => void
  buttonLabel?: (value: number) => string
}) {
  return (
    <div
      aria-label={label}
      className="h-24 w-20 overflow-y-auto rounded-lg border border-border bg-muted/30"
      style={{ scrollSnapType: 'y mandatory' }}
    >
      {Array.from({ length: max }, (_, index) => index + 1).map(number => (
        <button
          key={number}
          type="button"
          aria-label={buttonLabel?.(number)}
          onClick={() => onSelect(number)}
          style={{ scrollSnapAlign: 'start' }}
          className={`flex h-8 w-full items-center justify-center text-sm transition-colors ${
            number === value ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-muted'
          }`}
        >
          {number}
        </button>
      ))}
    </div>
  )
}

export function RepeatPicker({ value, onChange }: RepeatPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [state, setState] = useState<PickerState>(() => parseValue(value))

  useEffect(() => setState(parseValue(value)), [value])

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setCustomOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const presetOptions = useMemo(() => [
    { label: 'Never', value: null },
    { label: 'Every day', value: buildRRule({ ...DEFAULT_STATE, freq: RRule.DAILY }) },
    { label: 'Every week', value: buildRRule({ ...DEFAULT_STATE, freq: RRule.WEEKLY }) },
    { label: 'Every 2 weeks', value: buildRRule({ ...DEFAULT_STATE, freq: RRule.WEEKLY, interval: 2 }) },
    { label: 'Every month', value: buildRRule({ ...DEFAULT_STATE, freq: RRule.MONTHLY, bymonthday: null }) },
    { label: 'Every year', value: buildRRule({ ...DEFAULT_STATE, freq: RRule.YEARLY }) },
  ], [])

  function commit(next: PickerState) {
    setState(next)
    onChange(buildRRule(next))
  }

  function toggleWeekday(day: Weekday) {
    const exists = state.byweekday.some(item => item.weekday === day.weekday)
    const byweekday = exists
      ? state.byweekday.filter(item => item.weekday !== day.weekday)
      : [...state.byweekday, day]
    commit({ ...state, byweekday })
  }

  function selectPreset(option: { label: string; value: string | null }) {
    if (!option.value) {
      onChange(null)
      setState(DEFAULT_STATE)
      setOpen(false)
      return
    }
    // Merge new frequency with existing end condition so users don't lose their "For" setting
    const presetState = parseValue(option.value)
    const merged: PickerState = { ...presetState, endMode: state.endMode, until: state.until, count: state.count }
    setState(merged)
    onChange(buildRRule(merged))
    // Only close when no end condition is active (simple / quick-pick case)
    if (state.endMode === 'never') setOpen(false)
  }

  function presetMatchesValue(presetValue: string | null) {
    if (value === presetValue) return true
    if (!value || !presetValue) return false
    const v = parseValue(value)
    const p = parseValue(presetValue)
    return v.freq === p.freq && v.interval === p.interval
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Repeat"
        onClick={() => {
          setOpen(next => !next)
          setCustomOpen(false)
        }}
        className="flex w-full items-center justify-between rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm hover:bg-muted/60"
      >
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Repeat</span>
        <span className="flex items-center gap-1">
          {summary(value)}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        </span>
      </button>

      {open && !customOpen && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-border bg-background shadow-lg">
          {presetOptions.map(option => (
            <button
              key={option.label}
              type="button"
              onClick={() => selectPreset(option)}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted ${
                presetMatchesValue(option.value) ? 'font-semibold text-primary' : ''
              }`}
            >
              {option.label}
            </button>
          ))}

          {/* Ends section — Pocket Informant style: visible directly in the preset dropdown */}
          {value !== null && (
            <div className="border-t border-border px-2 pb-2 pt-2">
              <p className="px-1 pb-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Ends</p>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/60 p-1">
                {(['never', 'until', 'count'] as EndMode[]).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    aria-label={mode === 'count' ? 'For' : mode === 'until' ? 'Until' : 'Never'}
                    onClick={() => {
                      if (mode === 'never') {
                        const next: PickerState = { ...state, endMode: 'never', until: null, count: null }
                        setState(next)
                        onChange(buildRRule(next))
                        setOpen(false)
                      } else {
                        setState(prev => ({ ...prev, endMode: mode }))
                      }
                    }}
                    className={`rounded-md py-1.5 text-xs font-medium ${
                      state.endMode === mode
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {mode === 'count' ? 'For' : mode === 'until' ? 'Until' : 'Never'}
                  </button>
                ))}
              </div>

              {state.endMode === 'count' && (
                <div className="mt-2 flex items-center gap-2 px-1">
                  <span className="text-sm text-muted-foreground">For</span>
                  <input
                    type="number"
                    aria-label="Occurrence count"
                    min={1}
                    max={999}
                    value={state.count ?? 10}
                    onChange={e => {
                      const count = Math.max(1, parseInt(e.target.value, 10) || 1)
                      setState(prev => ({ ...prev, count }))
                    }}
                    className="w-20 rounded-md border border-input bg-muted/40 px-2 py-1.5 text-center text-sm"
                  />
                  <span className="text-sm text-muted-foreground">times</span>
                </div>
              )}

              {state.endMode === 'until' && (
                <input
                  type="date"
                  aria-label="End date"
                  value={state.until ? state.until.toISOString().split('T')[0] : ''}
                  onChange={e => {
                    const date = e.target.value ? new Date(`${e.target.value}T12:00:00`) : null
                    setState(prev => ({ ...prev, until: date }))
                  }}
                  className="mt-2 w-full rounded-md border border-input bg-muted/40 px-2 py-1.5 text-sm"
                />
              )}

              {state.endMode !== 'never' && (
                <button
                  type="button"
                  onClick={() => {
                    onChange(buildRRule(state))
                    setOpen(false)
                  }}
                  className="mt-2 w-full rounded-lg bg-primary py-1.5 text-xs font-semibold text-primary-foreground"
                >
                  Done
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setCustomOpen(true)}
            className="flex w-full items-center justify-between border-t border-border px-3 py-2 text-left text-sm hover:bg-muted"
          >
            Custom
          </button>
        </div>
      )}

      {open && customOpen && (
        <div className="absolute z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] space-y-3 rounded-xl border border-border bg-background p-3 shadow-lg">
          <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted/60 p-1">
            {[RRule.DAILY, RRule.WEEKLY, RRule.MONTHLY, RRule.YEARLY].map(freq => (
              <button
                key={freq}
                type="button"
                onClick={() => commit({ ...state, freq: freq as Freq })}
                className={`rounded-md px-2 py-1.5 text-xs font-medium ${
                  state.freq === freq ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {freqLabel(freq as Freq)}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-center gap-3">
            <span className="text-sm text-muted-foreground">Every</span>
            <NumberScroller
              label="Repeat interval scroller"
              value={state.interval}
              onSelect={interval => commit({ ...state, interval })}
              buttonLabel={interval => `Repeat every ${interval}`}
            />
            <span className="min-w-14 text-sm text-muted-foreground">{freqUnitLabel(state.freq)}</span>
          </div>

          {state.freq === RRule.WEEKLY && (
            <div className="flex gap-1">
              {WEEKDAYS.map((day, index) => {
                const selected = state.byweekday.some(item => item.weekday === day.weekday)
                return (
                  <button
                    key={day.weekday}
                    type="button"
                    onClick={() => toggleWeekday(day)}
                    className={`h-8 flex-1 rounded-md text-xs font-semibold ${selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                  >
                    {WEEKDAY_LABELS[index]}
                  </button>
                )
              })}
            </div>
          )}

          {(state.freq === RRule.MONTHLY || state.freq === RRule.YEARLY) && (
            <div className="space-y-2">
              {state.freq === RRule.YEARLY && (
                <select
                  aria-label="Month"
                  value={state.bymonth ?? 1}
                  onChange={event => commit({ ...state, bymonth: Number(event.target.value) })}
                  className="w-full rounded-lg border border-input bg-muted/40 px-2 py-1.5 text-sm"
                >
                  {MONTHS.map((month, index) => (
                    <option key={month} value={index + 1}>{month}</option>
                  ))}
                </select>
              )}
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1">
                <button type="button" onClick={() => commit({ ...state, patternMode: 'date' })} className={`rounded-md py-1.5 text-xs ${state.patternMode === 'date' ? 'bg-background shadow-sm' : ''}`}>
                  On date
                </button>
                <button type="button" onClick={() => commit({ ...state, patternMode: 'weekday' })} className={`rounded-md py-1.5 text-xs ${state.patternMode === 'weekday' ? 'bg-background shadow-sm' : ''}`}>
                  On weekday
                </button>
              </div>
              {state.patternMode === 'date' ? (
                <input
                  aria-label="Month day"
                  type="number"
                  min={1}
                  max={31}
                  value={state.bymonthday ?? 1}
                  onChange={event => commit({ ...state, bymonthday: Number(event.target.value) })}
                  className="w-full rounded-lg border border-input bg-muted/40 px-2 py-1.5 text-sm"
                />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <select
                    aria-label="Week position"
                    value={state.bysetpos ?? 1}
                    onChange={event => commit({ ...state, bysetpos: Number(event.target.value) })}
                    className="rounded-lg border border-input bg-muted/40 px-2 py-1.5 text-sm"
                  >
                    {SETPOS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Weekday"
                    value={state.byweekday[0]?.weekday ?? RRule.MO.weekday}
                    onChange={event => commit({
                      ...state,
                      byweekday: [[RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA, RRule.SU][Number(event.target.value)]],
                    })}
                    className="rounded-lg border border-input bg-muted/40 px-2 py-1.5 text-sm"
                  >
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, index) => (
                      <option key={day} value={index}>{day}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/60 p-1">
            {(['never', 'until', 'count'] as EndMode[]).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => commit({ ...state, endMode: mode })}
                className={`rounded-md py-1.5 text-xs ${state.endMode === mode ? 'bg-background shadow-sm' : ''}`}
              >
                {mode === 'count' ? 'For' : mode === 'until' ? 'Until' : 'Never'}
              </button>
            ))}
          </div>

          {state.endMode === 'until' && (
            <DatePickerMini value={state.until} onChange={date => commit({ ...state, until: date })} />
          )}

          {state.endMode === 'count' && (
            <div className="flex items-center justify-center gap-3">
              <span className="text-sm text-muted-foreground">For</span>
              <NumberScroller
              label="Occurrence count scroller"
              value={state.count ?? 10}
                onSelect={count => commit({ ...state, count })}
                buttonLabel={count => String(count)}
              />
              <span className="min-w-14 text-sm text-muted-foreground">times</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              onChange(buildRRule(state))
              setOpen(false)
              setCustomOpen(false)
            }}
            className="w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground"
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}
