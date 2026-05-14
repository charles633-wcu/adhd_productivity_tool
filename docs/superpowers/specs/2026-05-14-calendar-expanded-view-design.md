# Calendar Expanded View — Design Spec

**Date:** 2026-05-14
**Component:** `components/CalendarClient.tsx`
**Status:** Approved by user

---

## Existing code context

| Symbol | Kind | Notes |
|---|---|---|
| `isExpanded` | `boolean` state (`useState(false)`) | Toggled by month title click and new corner button |
| `renderCalendarCard(month, role)` | function | Renders all 3 cards. `role: 'prev' \| 'center' \| 'next'` |
| `navigateToMonth(month: Date)` | function | Sets `direction`, clears `selectedDay`, updates `currentMonth` — independent state slices |
| `buildMonthDays(month: Date): Date[]` | function | Returns flat array of **42** `Date` objects (6×7). Out-of-month: `day.getMonth() !== month.getMonth()` |
| `eventsByDate` | `Map<string, CalendarEventItem[]>` | Component-level. Own events keyed by `"YYYY-MM-DD"`. 3mo back → 6mo forward |
| `icsEventsByDate` | `Map<string, IcsEventItem[]>` | Component-level. ICS events, same key/range |
| `categories` | `EventCategory[]` | Component-level state from `initialCategories` prop. Shape: `{ id: string; name: string; color: string }[]` |
| `compactTimeLabel(iso): string` | function | `"9am"`, `"10:30pm"` etc. |
| `toLocalDateKey(d): string` | function | `"YYYY-MM-DD"` |
| `todayKey` | `string` | Component-level. Local date key for today |

**Already imported in the file:**
- `AnimatePresence, LayoutGroup, motion` from `framer-motion`
- `ChevronLeft, ChevronRight` from `lucide-react`

**New imports needed:**
- `Maximize2, Minimize2` from `lucide-react`

**Center card `motion.div` already has `relative` in its className** — the absolute-positioned corner button will position correctly without any additional change.

**`CalendarEventItem`** key fields: `{ occurrenceId, title, startAt: string (ISO), color: string|null, categoryId: string|null }`

**`IcsEventItem`** key fields: `{ uid, title, startAt: string (ISO) }` — no `color` or `categoryId`

---

## 1. Layout & Expand Mechanism

### Mounting strategy

All three cards are always mounted — no conditional mount/unmount. The side card `motion.div` switches its Tailwind class string based on `isExpanded`; the `layout` prop animates the width change automatically via `LayoutGroup`.

### Corner expand button

Add as first child inside the center card `motion.div` (the card already has `relative` — no change needed):

```tsx
<button
  type="button"
  aria-label={isExpanded ? 'Collapse calendar' : 'Expand calendar'}
  onClick={() => setIsExpanded(prev => !prev)}
  className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-muted/40 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
>
  <AnimatePresence mode="wait" initial={false}>
    <motion.span
      key={isExpanded ? 'min' : 'max'}
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.7 }}
      transition={{ duration: 0.15 }}
    >
      {isExpanded
        ? <Minimize2 className="h-3.5 w-3.5" />
        : <Maximize2 className="h-3.5 w-3.5" />}
    </motion.span>
  </AnimatePresence>
</button>
```

- `aria-label` is **dynamic** — changes with `isExpanded`
- `key` on `motion.span` triggers the `AnimatePresence mode="wait"` exit+enter cycle for the icon swap

### Month title click (unchanged)

Already calls `setIsExpanded(prev => !prev)`. No change.

### Side card className (inside `renderCalendarCard`, `role !== 'center'`)

```ts
className={isExpanded
  ? 'hidden md:flex w-[52px] self-stretch flex-col items-center justify-center gap-3 p-2 cursor-pointer hover:bg-muted/50 rounded-2xl border border-border bg-card shadow-sm'
  : 'hidden w-[18rem] shrink-0 flex-col p-3 opacity-70 cursor-pointer hover:bg-muted/50 hover:opacity-90 md:flex'
}
```

### Side card body (inside `renderCalendarCard`, `role !== 'center'`)

The existing non-center card body (month label + numbered day grid) is **kept for collapsed mode** and replaced by new strip content in expanded mode. Use a conditional render:

```tsx
{isExpanded ? (
  /* New strip content — slides in from the card edge */
  <motion.div
    className="flex flex-col items-center gap-3 w-full"
    initial={{ opacity: 0, x: role === 'prev' ? -8 : 8 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: role === 'prev' ? -8 : 8 }}
    transition={{ duration: 0.2 }}
  >
    {role === 'prev' && <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />}
    <MiniDotGrid
      month={month}
      todayKey={todayKey}
      eventsByDate={eventsByDate}
      icsEventsByDate={icsEventsByDate}
    />
    <span className="text-[9px] font-mono text-muted-foreground uppercase">
      {month.toLocaleString(undefined, { month: 'short' })}
    </span>
    {role === 'next' && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
  </motion.div>
) : (
  /* Existing mini-preview — unchanged */
  <>
    <motion.span layoutId={`${monthKey}-label`} …>{label}</motion.span>
    {/* existing numbered day grid */}
  </>
)}
```

Wrap the conditional in `<AnimatePresence mode="wait">` so the old content fades out before the strip fades in on toggle.

### `MiniDotGrid` component

Defined **outside** `CalendarClient` (module level), receiving the three component-level values as explicit props:

```tsx
interface MiniDotGridProps {
  month: Date
  todayKey: string
  eventsByDate: Map<string, unknown[]>
  icsEventsByDate: Map<string, unknown[]>
}

function MiniDotGrid({ month, todayKey, eventsByDate, icsEventsByDate }: MiniDotGridProps) {
  const days = buildMonthDays(month) // always 42 items — safe
  return (
    <div className="grid grid-cols-7 gap-[1px]">
      {days.map((day, i) => {
        const key = toLocalDateKey(day)
        const isToday = key === todayKey
        const outOfMonth = day.getMonth() !== month.getMonth()
        const hasEvents =
          (eventsByDate.get(key)?.length ?? 0) + (icsEventsByDate.get(key)?.length ?? 0) > 0
        // First matching rule wins:
        const bg = isToday
          ? 'bg-primary'
          : outOfMonth
            ? 'bg-muted/30'
            : hasEvents
              ? 'bg-muted-foreground/40'
              : 'bg-muted'
        return <div key={i} className={`h-[5px] w-[5px] rounded-sm ${bg}`} />
      })}
    </div>
  )
}
```

No dot interaction.

### Side strip click

```ts
function handleSideStripClick(month: Date) {
  setIsExpanded(true)
  navigateToMonth(month)
  // React 18 automatically batches both state updates in the same event handler flush.
  // No sequencing workaround (useEffect, flushSync) is needed.
}
```

Strip's `onClick`: `() => handleSideStripClick(month)`.

---

## 2. Event Bars in Expanded Mode

### Cell height

```ts
// Replace existing 'h-24 sm:h-28' in the expanded branch:
isExpanded ? 'h-36' : 'h-24 sm:h-28'
```

### Bar rendering

Define a discriminated union for the combined bar pool:

```ts
type CalBar = CalendarEventItem & { type: 'cal' }
type IcsBar = IcsEventItem & { type: 'ics' }
type EventBar = CalBar | IcsBar

const allBars: EventBar[] = [
  ...dayEvents.map(ev => ({ ...ev, type: 'cal' as const })),
  ...dayIcsEvents.map(ev => ({ ...ev, type: 'ics' as const })),
]
// Array.slice is safe when length < cap — produces a shorter array, not an error
const visibleBars = allBars.slice(0, 8)
const overflowCount = allBars.length - 8  // negative when ≤8; overflow label guards on > 0
```

Render by mapping `visibleBars`:

```tsx
{visibleBars.map((ev, i) => {
  const resolvedColor = ev.type === 'cal'
    ? (ev.color ?? categories.find(c => c.id === ev.categoryId)?.color ?? '#6366f1')
    : '#6366f1'
  return (
    <div key={i} className="flex min-w-0 items-center gap-1 rounded bg-muted/55 px-1 py-0.5 text-[9px] leading-none text-foreground">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: resolvedColor }} />
      <span className="shrink-0 font-medium tabular-nums">{compactTimeLabel(ev.startAt)}</span>
      <span className="min-w-0 max-w-[13ch] truncate text-left text-muted-foreground">{ev.title}</span>
    </div>
  )
})}
```

- `ev.type === 'cal'` guard ensures TypeScript knows `ev.color` and `ev.categoryId` exist only on own-event bars
- `ev.type === 'ics'` bars use the fixed `'#6366f1'` color

### Overflow label (last item in the cell flex column)

```tsx
{overflowCount > 0 && (
  <span className="pl-1 text-[9px] leading-none text-muted-foreground">
    +{overflowCount} more
  </span>
)}
```

No click behavior. N = `allBars.length - 8`.

### Collapsed mode

Completely untouched.

---

## 3. Animation

| Effect | Mechanism |
|---|---|
| Center card grows / side card shrinks | `LayoutGroup` + `layout` prop — already wired, no new code |
| Corner button icon swap | `AnimatePresence mode="wait"` + `key` on `motion.span` (Section 1) |
| Strip content slides in | Conditional render inside `AnimatePresence mode="wait"`; `motion.div` with `initial/animate/exit` (Section 1) |
| Month carousel slide | Untouched — `navigateToMonth` fires existing `x: direction * 80` animation |

---

## 4. Edge Cases

| Case | Behaviour |
|---|---|
| Mobile (`< md`) | Side strips `hidden md:flex` — never appear; center takes full width in both modes |
| >8 events on a day | 8 bars + `+N more` label; N = total minus 8 |
| 0 events on a day | Day number only; no change |
| 4-week month in dot-grid | Last 14 cells out-of-month (`bg-muted/30`) |
| 6-week month in dot-grid | All 42 cells used; no clipping |
| Today has events (dot-grid) | `bg-primary` wins — first matching rule |
| Tab to corner button | `focus-visible:ring-2 ring-ring`; `z-10` above grid cells |
| Arrow keys | Existing carousel handler unchanged |
| Short viewport | Existing `h-[min(42rem,calc(100vh-14rem))]` unchanged |
| Month title click | Toggles `isExpanded` — existing behavior, unchanged |

---

## Files Changed

| File | Change |
|---|---|
| `components/CalendarClient.tsx` | Corner button, side strip conditional body, `MiniDotGrid` component, `handleSideStripClick`, bar count/height/truncation, `Maximize2`/`Minimize2` imports |

No schema changes. No API changes. No new package dependencies.
