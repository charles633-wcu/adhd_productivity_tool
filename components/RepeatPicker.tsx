/**
 * RepeatPicker selects a repeat schedule from presets or a custom interval panel.
 */
'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { RepeatFrequency, RepeatValue } from '@/lib/types/calendar'

interface RepeatPickerProps {
  value: RepeatValue
  onChange: (value: RepeatValue) => void
}

type TabMode = RepeatFrequency

const PRESET_OPTIONS: Array<{ label: string; value: RepeatValue }> = [
  { label: 'Never', value: { frequency: null, interval: 1 } },
  { label: 'Every day', value: { frequency: 'day', interval: 1 } },
  { label: 'Every week', value: { frequency: 'week', interval: 1 } },
  { label: 'Every 2 weeks', value: { frequency: 'week', interval: 2 } },
  { label: 'Every month', value: { frequency: 'month', interval: 1 } },
  { label: 'Every year', value: { frequency: 'year', interval: 1 } },
]

const TAB_MODES: TabMode[] = ['day', 'week', 'month', 'year']
const TAB_LABELS: Record<TabMode, string> = {
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
  year: 'Yearly',
}

const UNIT_LABELS: Record<TabMode, { singular: string; plural: string }> = {
  day: { singular: 'day', plural: 'days' },
  week: { singular: 'week', plural: 'weeks' },
  month: { singular: 'month', plural: 'months' },
  year: { singular: 'year', plural: 'years' },
}

function valuesMatch(a: RepeatValue, b: RepeatValue) {
  return a.frequency === b.frequency && a.interval === b.interval
}

function unitLabel(frequency: RepeatFrequency, interval: number) {
  const unit = UNIT_LABELS[frequency]
  return `${interval} ${interval === 1 ? unit.singular : unit.plural}`
}

function repeatSummary(value: RepeatValue) {
  if (value.frequency === null) return 'Never'
  if (value.interval === 1) return `Every ${UNIT_LABELS[value.frequency].singular}`
  return `Every ${value.interval} ${UNIT_LABELS[value.frequency].plural}`
}

function initialTab(value: RepeatValue): TabMode {
  return value.frequency ?? 'day'
}

export function RepeatPicker({ value, onChange }: RepeatPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [tab, setTab] = useState<TabMode>(() => initialTab(value))
  const [localInterval, setLocalInterval] = useState(value.frequency ? value.interval : 1)

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

  function selectPreset(next: RepeatValue) {
    onChange(next)
    setOpen(false)
    setCustomOpen(false)
  }

  function showCustomPanel() {
    setTab(initialTab(value))
    setLocalInterval(value.frequency ? value.interval : 1)
    setCustomOpen(true)
  }

  function confirmCustom() {
    onChange({ frequency: tab, interval: localInterval })
    setOpen(false)
    setCustomOpen(false)
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
          {repeatSummary(value)}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        </span>
      </button>

      {open && !customOpen && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-border bg-background shadow-lg">
          {PRESET_OPTIONS.map(option => (
            <button
              key={option.label}
              type="button"
              onClick={() => selectPreset(option.value)}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted ${
                valuesMatch(value, option.value) ? 'font-semibold text-primary' : ''
              }`}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            onClick={showCustomPanel}
            className="flex w-full items-center justify-between border-t border-border px-3 py-2 text-left text-sm hover:bg-muted"
          >
            Custom
          </button>
        </div>
      )}

      {open && customOpen && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-border bg-background shadow-lg">
          <div className="flex gap-0.5 border-b border-border p-2">
            {TAB_MODES.map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setTab(mode)}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  tab === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {TAB_LABELS[mode]}
              </button>
            ))}
          </div>

          <div className="px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">Every</span>
              <div
                className="h-24 flex-1 overflow-y-auto rounded-lg border border-border bg-muted/30"
                style={{ scrollSnapType: 'y mandatory' }}
                aria-label="Interval"
              >
                {Array.from({ length: 120 }, (_, index) => index + 1).map(interval => (
                  <button
                    key={interval}
                    type="button"
                    onClick={() => setLocalInterval(interval)}
                    style={{ scrollSnapAlign: 'start' }}
                    className={`flex h-8 w-full items-center justify-center text-sm transition-colors ${
                      interval === localInterval ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-muted'
                    }`}
                  >
                    {unitLabel(tab, interval)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-border p-2">
            <button
              type="button"
              onClick={confirmCustom}
              className="w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
