'use client'

// HomePill — floating overlay controls for the home canvas.
//
// Renders three overlay zones:
//   1. Top-center pill: brand label + app switcher + hamburger menu trigger
//   2. Bottom-right FABs: + Trigger and + Category buttons
//   3. Sheets: hamburger menu (settings + schedule + import),
//              new category form, quick-add trigger form
//
// All state for sheet open/close and form fields lives here.
// Calls router.refresh() after successful mutations.

import { useState, useEffect, useRef, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Brain, CalendarDays, FileUp, FolderPlus, MessageCircle, Plus } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { QuickAddForm } from '@/components/QuickAddForm'
import { ScheduleCalendar } from '@/components/ScheduleCalendar'
import type { Trigger } from '@/lib/db/schema'

// ── Types ─────────────────────────────────────────────────────────────────────
// Matches the serialized shape expected by ScheduleCalendar — Date fields arrive as ISO strings
type SerializedTrigger = Omit<Trigger, 'nextReviewAt' | 'lastReviewedAt' | 'createdAt' | 'updatedAt'> & {
  nextReviewAt: string
  lastReviewedAt: string | null
  createdAt: string
  updatedAt: string
}

interface HomePillProps {
  categories: Array<{ id: string; name: string; color: string | null; icon: string | null }>
  triggers: SerializedTrigger[]
  todayTodoCount: number
}

// ── Constants ─────────────────────────────────────────────────────────────────
const COLOR_SWATCHES = [
  '#FF6B6B', '#FF9500', '#F59E0B', '#84CC16',
  '#10B981', '#14B8A6', '#3B82F6', '#8B5CF6',
  '#EC4899', '#F43F5E', '#A78BFA', '#6366F1',
]

// Appearance settings keys — mirrors what was in SettingsSheet
const LS_PRIMARY = 'sentinel-primary-color'
const LS_BG      = 'sentinel-bg-color'
const DEFAULT_PRIMARY = '#22c55e'
const DEFAULT_BG      = '#161b2e'

function applyColors(primary: string, bg: string) {
  document.documentElement.style.setProperty('--primary', primary)
  document.documentElement.style.setProperty('--ring', primary)
  document.documentElement.style.setProperty('--background', bg)
  document.documentElement.style.setProperty('--sidebar-primary', primary)
  document.documentElement.style.setProperty('--sidebar-ring', primary)
  document.documentElement.style.setProperty('--chart-1', primary)
}

// ── AI Emoji hook ─────────────────────────────────────────────────────────────
// Reusable logic for auto-suggesting an emoji from a category name.
function useEmojiSuggest(name: string) {
  const [emoji, setEmoji] = useState('📌')
  const [isLoading, setIsLoading] = useState(false)
  const isManuallySet = useRef(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-suggest on name change (debounced 500ms)
  useEffect(() => {
    isManuallySet.current = false
    if (!name.trim()) return
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(async () => {
      if (isManuallySet.current) return
      setIsLoading(true)
      try {
        const res = await fetch('/api/emoji/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        })
        const { emoji: suggested } = await res.json()
        if (!isManuallySet.current) setEmoji(suggested)
      } catch {
        // keep current emoji on error
      } finally {
        setIsLoading(false)
      }
    }, 500)
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }
  }, [name])

  // Manual regenerate — always writes back regardless of flag
  async function regenerate() {
    if (!name.trim()) return
    isManuallySet.current = true
    setIsLoading(true)
    try {
      const res = await fetch('/api/emoji/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const { emoji: suggested } = await res.json()
      setEmoji(suggested)
    } catch {
      // keep current emoji
    } finally {
      setIsLoading(false)
    }
  }

  return { emoji, setEmoji, isLoading, regenerate }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function HomePill({ categories, triggers, todayTodoCount }: HomePillProps) {
  const router = useRouter()

  // Sheet open states
  const [menuOpen,     setMenuOpen]     = useState(false)
  const [addOpen,      setAddOpen]      = useState(false)
  const [newCatOpen,   setNewCatOpen]   = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)

  // New Category form state
  const [catName,    setCatName]    = useState('')
  const [catColor,   setCatColor]   = useState('#6366f1')
  const [catError,   setCatError]   = useState<string | null>(null)
  const [catLoading, setCatLoading] = useState(false)

  // AI emoji for new category
  const { emoji: catEmoji, setEmoji: setCatEmoji, isLoading: emojiLoading, regenerate: regenerateEmoji } = useEmojiSuggest(catName)

  // Appearance settings state
  const [primary, setPrimary] = useState(DEFAULT_PRIMARY)
  const [bg, setBg]           = useState(DEFAULT_BG)

  // Load saved appearance on mount
  useEffect(() => {
    const savedPrimary = localStorage.getItem(LS_PRIMARY) ?? DEFAULT_PRIMARY
    const savedBg      = localStorage.getItem(LS_BG)      ?? DEFAULT_BG
    setPrimary(savedPrimary)
    setBg(savedBg)
    applyColors(savedPrimary, savedBg)
  }, [])

  function handlePrimaryChange(value: string) {
    setPrimary(value)
    localStorage.setItem(LS_PRIMARY, value)
    applyColors(value, bg)
  }

  function handleBgChange(value: string) {
    setBg(value)
    localStorage.setItem(LS_BG, value)
    applyColors(primary, value)
  }

  function handleResetColors() {
    setPrimary(DEFAULT_PRIMARY)
    setBg(DEFAULT_BG)
    localStorage.removeItem(LS_PRIMARY)
    localStorage.removeItem(LS_BG)
    applyColors(DEFAULT_PRIMARY, DEFAULT_BG)
  }

  // New Category submit
  async function handleNewCategory(e: FormEvent) {
    e.preventDefault()
    setCatLoading(true)
    setCatError(null)
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: catName,
          color: catColor,
          icon: catEmoji !== '📌' ? catEmoji : undefined,
        }),
      })
      if (!res.ok) throw new Error('Failed to create category')
      setCatName('')
      setCatColor('#6366f1')
      setCatEmoji('📌')
      setCatError(null)
      setNewCatOpen(false)
      router.refresh()
    } catch (err) {
      setCatError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setCatLoading(false)
    }
  }

  return (
    <>
      {/* ── Floating Pill Toolbar — fixed top-center ────────────────────────── */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex max-w-[calc(100vw-1rem)] items-center gap-2.5 overflow-x-auto rounded-full border border-border/50 bg-background/90 backdrop-blur-md shadow-lg px-4 py-0">

        {/* Brand */}
        <span className="shrink-0 whitespace-nowrap text-[13px] font-extrabold tracking-widest text-foreground select-none">
          SENTINEL
        </span>

        {/* Divider */}
        <div className="h-5 w-px bg-border/60" aria-hidden="true" />

        {/* App switcher — Triggers (active). Future apps added here. */}
        <button
          type="button"
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-primary text-primary-foreground px-4 min-h-[44px] text-[13px] font-semibold cursor-default"
          aria-current="page"
        >
          <span aria-hidden="true">🎯</span>
          Triggers
        </button>

        {/* Calendar app — navigates to /calendar */}
        <Link
          href="/calendar"
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-4 min-h-[44px] text-[13px] font-medium text-muted-foreground hover:bg-muted/60 transition-colors"
        >
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          Calendar
        </Link>

        {/* To-Dos app — navigates to /todos with today count badge */}
        <Link
          href="/todos"
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-4 min-h-[44px] text-[13px] font-medium text-muted-foreground hover:bg-muted/60 transition-colors"
        >
          ✓ To-Dos
          {todayTodoCount > 0 && (
            <span className="ml-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
              {todayTodoCount}
            </span>
          )}
        </Link>

        {/* Mind app — navigates to /heap */}
        <Link
          href="/heap"
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-4 min-h-[44px] text-[13px] font-medium text-muted-foreground hover:bg-muted/60 transition-colors"
        >
          <Brain className="h-4 w-4" aria-hidden="true" />
          Mind
        </Link>

        {/* Divider */}
        <div className="h-5 w-px bg-border/60" aria-hidden="true" />

        {/* Hamburger — opens Menu Sheet */}
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
          className="flex flex-col items-center justify-center gap-[4px] min-h-[44px] min-w-[44px] rounded-xl hover:bg-muted/60 transition-colors"
        >
          <span className="block w-4 h-[1.5px] bg-foreground/70 rounded-full" />
          <span className="block w-4 h-[1.5px] bg-foreground/70 rounded-full" />
          <span className="block w-4 h-[1.5px] bg-foreground/70 rounded-full" />
        </button>
      </div>

      {/* ── FAB Cluster — fixed bottom-right ───────────────────────────────── */}
      <div className="fixed bottom-6 right-5 z-50 flex items-center gap-3">
        {/* + Category */}
        <button
          type="button"
          onClick={() => setNewCatOpen(true)}
          className="flex items-center gap-2 rounded-full border border-border bg-background/90 backdrop-blur-sm text-foreground px-5 min-h-[48px] text-sm font-semibold shadow-lg hover:bg-muted transition-colors"
        >
          <FolderPlus className="h-4 w-4" aria-hidden="true" />
          Category
        </button>

        {/* + Trigger */}
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 min-h-[48px] text-sm font-semibold shadow-lg hover:bg-primary/90 transition-colors"
          style={{ boxShadow: '0 4px 20px color-mix(in srgb, var(--primary) 40%, transparent)' }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Trigger
        </button>
      </div>

      {/* ── Menu Sheet (hamburger) ──────────────────────────────────────────── */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xs p-0 flex flex-col gap-0">
          <SheetHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
            <SheetTitle className="text-base font-semibold tracking-tight">Menu</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            {/* Navigate section */}
            <div className="px-5 py-4 border-b border-border space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Navigate</p>

              {/* Schedule row — toggles inline calendar */}
              <button
                type="button"
                onClick={() => setScheduleOpen(v => !v)}
                className="w-full flex items-center gap-3 rounded-xl px-3 min-h-[44px] text-sm font-medium text-foreground hover:bg-muted/60 transition-colors text-left"
              >
                <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                Schedule
                <span className="ml-auto text-muted-foreground/50 text-xs">{scheduleOpen ? '▲' : '▼'}</span>
              </button>

              {/* Inline schedule calendar */}
              {scheduleOpen && (
                <div className="px-2 py-2">
                  <ScheduleCalendar triggers={triggers} />
                </div>
              )}

              {/* Import row */}
              <a
                href="/import"
                className="w-full flex items-center gap-3 rounded-xl px-3 min-h-[44px] text-sm font-medium text-foreground hover:bg-muted/60 transition-colors"
              >
                <FileUp className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                Import CSV
              </a>

              {/* Chat History row */}
              <a
                href="/chat/history"
                className="w-full flex items-center gap-3 rounded-xl px-3 min-h-[44px] text-sm font-medium text-foreground hover:bg-muted/60 transition-colors"
              >
                <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                Chat History
              </a>
            </div>

            {/* Appearance section */}
            <div className="px-5 py-4 space-y-5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Appearance</p>

              {/* Button color */}
              <div className="space-y-2">
                <label htmlFor="menu-primary" className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Button Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="menu-primary"
                    type="color"
                    value={primary}
                    onChange={e => handlePrimaryChange(e.target.value)}
                    className="h-10 w-14 cursor-pointer rounded-lg border border-input bg-transparent p-0.5"
                  />
                  <span className="text-xs font-mono text-muted-foreground">{primary}</span>
                  <div className="ml-auto h-8 w-8 rounded-lg shrink-0" style={{ backgroundColor: primary }} />
                </div>
              </div>

              {/* Background color */}
              <div className="space-y-2">
                <label htmlFor="menu-bg" className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Background Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="menu-bg"
                    type="color"
                    value={bg}
                    onChange={e => handleBgChange(e.target.value)}
                    className="h-10 w-14 cursor-pointer rounded-lg border border-input bg-transparent p-0.5"
                  />
                  <span className="text-xs font-mono text-muted-foreground">{bg}</span>
                  <div className="ml-auto h-8 w-8 rounded-lg border border-border shrink-0" style={{ backgroundColor: bg }} />
                </div>
              </div>

              {/* Reset */}
              <button
                type="button"
                onClick={handleResetColors}
                className="w-full rounded-xl border border-border px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Reset to defaults
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── New Category Sheet ──────────────────────────────────────────────── */}
      <Sheet
        open={newCatOpen}
        onOpenChange={(open) => { setNewCatOpen(open); if (!open) setCatError(null) }}
      >
        <SheetContent side="right" className="w-full sm:max-w-sm p-0 flex flex-col gap-0">
          <SheetHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
            <SheetTitle className="text-base font-semibold tracking-tight">New Category</SheetTitle>
          </SheetHeader>

          <form
            id="new-cat-form"
            onSubmit={handleNewCategory}
            className="flex-1 overflow-y-auto px-5 py-5 space-y-5"
          >
            {/* Name + AI Emoji composite */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Name *
              </label>
              <div className="flex items-center gap-3">
                {/* AI Emoji button */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={regenerateEmoji}
                    disabled={emojiLoading}
                    className={[
                      'flex items-center justify-center rounded-xl border border-input min-h-[44px] min-w-[44px] text-xl',
                      'bg-muted/40 hover:bg-muted/70 transition-colors',
                      emojiLoading ? 'animate-pulse' : '',
                    ].join(' ')}
                    aria-label="Regenerate emoji"
                    title="AI suggested · tap to regenerate"
                  >
                    {catEmoji}
                  </button>
                  {/* ✨ badge */}
                  <span className="absolute -bottom-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-primary text-[9px] leading-none border border-background pointer-events-none" aria-hidden="true">
                    ✨
                  </span>
                </div>
                <input
                  id="cat-name"
                  type="text"
                  required
                  autoFocus
                  maxLength={50}
                  placeholder="e.g. CS Projects"
                  value={catName}
                  onChange={e => setCatName(e.target.value)}
                  className="flex-1 rounded-xl border border-input bg-muted/40 px-4 py-3 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"
                />
              </div>
              <p className="text-[10px] text-muted-foreground/60">AI suggested · tap emoji to regenerate</p>
            </div>

            {/* Color swatches — 8 per row */}
            <div className="space-y-2">
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Color
              </label>
              <div className="grid grid-cols-8 gap-2">
                {COLOR_SWATCHES.map(swatch => (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => setCatColor(swatch)}
                    className="relative h-10 w-full rounded-full transition-transform hover:scale-110 active:scale-95 focus:outline-none"
                    style={{ backgroundColor: swatch }}
                    aria-label={swatch}
                  >
                    {catColor === swatch && (
                      <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold drop-shadow-sm">✓</span>
                    )}
                  </button>
                ))}
              </div>
              {/* Custom hex */}
              <div className="flex items-center gap-2 pt-0.5">
                <input
                  type="color"
                  value={catColor}
                  onChange={e => setCatColor(e.target.value)}
                  className="h-7 w-10 cursor-pointer rounded-md border border-input bg-transparent p-0.5 shrink-0"
                />
                <span className="text-xs font-mono text-muted-foreground">{catColor}</span>
              </div>
            </div>

            {/* Live preview */}
            {catName && (
              <div className="flex flex-col items-center gap-2 py-2">
                <div
                  className="w-16 h-16 rounded-full flex flex-col items-center justify-center relative overflow-hidden"
                  style={{
                    backgroundColor: catColor,
                    boxShadow: `0 4px 20px ${catColor}55`,
                  }}
                >
                  <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.22) 0%, transparent 60%)' }} />
                  <span className="text-xl relative z-10">{catEmoji}</span>
                  <span className="relative z-10 text-[9px] font-semibold text-white/90 px-1 text-center leading-tight">
                    {catName.length > 10 ? `${catName.slice(0, 9)}…` : catName}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">preview</span>
              </div>
            )}

            {catError && (
              <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
                {catError}
              </p>
            )}
          </form>

          {/* Sticky footer */}
          <div className="shrink-0 px-5 py-4 border-t border-border bg-background/60 backdrop-blur-sm flex gap-2">
            <button
              type="button"
              onClick={() => { setNewCatOpen(false); setCatError(null) }}
              className="flex-1 rounded-xl border border-border px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="new-cat-form"
              disabled={catLoading}
              className="flex-1 rounded-xl bg-primary text-primary-foreground px-3 py-3 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              {catLoading ? 'Creating…' : 'Create'}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── QuickAdd Trigger Sheet ──────────────────────────────────────────── */}
      <QuickAddForm
        categories={categories}
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => router.refresh()}
      />
    </>
  )
}
