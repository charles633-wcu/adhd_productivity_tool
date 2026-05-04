/**
 * DatePickerMini renders a compact inline calendar for selecting or clearing one date.
 */
'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface DatePickerMiniProps {
  value: Date | null
  onChange: (date: Date | null) => void
}

const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function buildMonthCells(year: number, month: number): Array<Date | null> {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: Array<Date | null> = []
  for (let i = 0; i < firstDay; i += 1) cells.push(null)
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function dayAriaLabel(cell: Date) {
  return `${MONTH_NAMES[cell.getMonth()]} ${cell.getDate()}, ${cell.getFullYear()}`
}

export function DatePickerMini({ value, onChange }: DatePickerMiniProps) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(value?.getFullYear() ?? today.getFullYear())
  const [viewMonth, setViewMonth] = useState(value?.getMonth() ?? today.getMonth())
  const [yearPickerOpen, setYearPickerOpen] = useState(false)
  const cells = buildMonthCells(viewYear, viewMonth)
  const years = Array.from({ length: 10 }, (_, index) => today.getFullYear() + index)

  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear(year => year - 1)
      setViewMonth(11)
    } else {
      setViewMonth(month => month - 1)
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear(year => year + 1)
      setViewMonth(0)
    } else {
      setViewMonth(month => month + 1)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-background p-3 shadow-md" aria-label="Date picker">
      {yearPickerOpen ? (
        <div>
          <div className="mb-2 text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Year
          </div>
          <div className="grid grid-cols-3 gap-1">
            {years.map(year => (
              <button
                key={year}
                type="button"
                onClick={() => {
                  setViewYear(year)
                  setYearPickerOpen(false)
                }}
                className={`rounded-lg py-1.5 text-sm font-medium transition-colors ${
                  year === viewYear ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={prevMonth} aria-label="Previous month" className="rounded p-1 hover:bg-muted">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setYearPickerOpen(true)}
              className="text-sm font-semibold hover:text-primary"
            >
              {MONTH_NAMES[viewMonth]} {viewYear}
            </button>
            <button type="button" onClick={nextMonth} aria-label="Next month" className="rounded p-1 hover:bg-muted">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7">
            {DAY_HEADERS.map(day => (
              <div key={day} className="text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((cell, index) =>
              cell ? (
                <button
                  key={dayAriaLabel(cell)}
                  type="button"
                  onClick={() => onChange(cell)}
                  aria-label={dayAriaLabel(cell)}
                  className={`flex h-7 w-full items-center justify-center rounded-full text-xs font-medium transition-colors ${
                    value && sameDay(cell, value) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  }`}
                >
                  {cell.getDate()}
                </button>
              ) : (
                <div key={`empty-${index}`} className="h-7" />
              ),
            )}
          </div>

          <div className="mt-2 border-t border-border pt-2 text-center">
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        </>
      )}
    </div>
  )
}
