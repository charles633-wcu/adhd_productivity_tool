'use client'

import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { X, Plus, Minus } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

// CategoryCanvas — horizontal hex strip (6 rows tall) that grows sideways.
//
// Layout: axial coordinates (pointy-top). The strip is fixed at 6 rows
// (r ∈ [ROW_MIN, ROW_MAX]). Categories fill ring-order from center (0,0)
// outward. New columns are added on both sides as categories grow.
//
// Scroll: horizontal only. On mount, scrollLeft is set so the (0,0) hex sits
// at the horizontal center of the viewport (aligned with the page content col).
//
// Zoom: "logical zoom" — all pixel values are multiplied by `zoom`, so the
// scroll container sees the real scaled dimensions and works naturally.
// Mouse-wheel and pinch both zoom around the current visual center.
//
// Persistence: layout (categoryId → "q,r") saved to DB + localStorage cache.

interface CategoryItem {
  id: string; name: string; icon: string | null; color: string | null; count: number
}

// ── Hex geometry constants (unscaled; multiply by zoom for actual px) ─────────
const HEX_R     = 64
const HEX_W     = Math.round(Math.sqrt(3) * HEX_R)   // 111 px
const HEX_H     = HEX_R * 2                            // 128 px
const V_SPACING = Math.round(HEX_R * 1.5)              //  96 px

// Strip row bounds — 7 rows, r=0 sits near center vertically
const ROW_MIN   = -2
const ROW_MAX   =  4
const N_ROWS    = ROW_MAX - ROW_MIN + 1   // 7

// Extra empty columns beyond the last occupied column (3 empty hexes of buffer)
const COL_BUF   = 3

// Bubble size (unscaled)
const BUBBLE    = 99
const PANEL_W   = 252

// Zoom limits
const MIN_ZOOM  = 0.65
const MAX_ZOOM  = 1.75

// Fixed container height at zoom=1: spans 7 rows with padding
//   = (ROW_MAX - ROW_MIN) * V_SPACING + HEX_H + 32
//   = 6 * 96 + 128 + 32 = 736 px
const CONTAINER_H = (ROW_MAX - ROW_MIN) * V_SPACING + HEX_H + 32

// Extra (unscaled) vertical space above and below the hex strip so the user
// can pan up/down. Initial scrollTop = V_PAD * zoom centers the grid.
const V_PAD = 140

// Persistence store key
const STORE_KEY = 'sentinel-hex-cells-v3'

// ── Axial utilities ───────────────────────────────────────────────────────────
function axialRing(q: number, r: number) {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r))
}

// Ring-ordered cell list for a given column range (used for assignment)
// Filters to the 6-row strip.
function buildAssignCells(colRange: number): string[] {
  const cells: Array<{ q: number; r: number; ring: number; angle: number }> = []
  for (let r = ROW_MIN; r <= ROW_MAX; r++) {
    for (let q = -colRange; q <= colRange; q++) {
      cells.push({ q, r, ring: axialRing(q, r), angle: Math.atan2(r, q + r * 0.5) })
    }
  }
  cells.sort((a, b) => a.ring - b.ring || a.angle - b.angle)
  return cells.map(c => `${c.q},${c.r}`)
}

// Large fixed pool for assignment logic (handles up to ~600 categories)
const ASSIGN_POOL = buildAssignCells(60)
const ASSIGN_POOL_SET = new Set(ASSIGN_POOL)

// ── Persistence helpers ───────────────────────────────────────────────────────
function loadLocal(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') } catch { return {} }
}
function saveLocal(a: Record<string, string>) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(a)) } catch {}
}

function mergeAssignments(
  cats: CategoryItem[],
  saved: Record<string, string>,
  colRange: number
): Record<string, string> {
  const result: Record<string, string> = {}
  const taken = new Set<string>()

  // Keep valid saved positions within current strip bounds
  for (const cat of cats) {
    const k = saved[cat.id]
    if (k && ASSIGN_POOL_SET.has(k)) {
      const [q, r] = k.split(',').map(Number)
      if (Math.abs(q) <= colRange && !taken.has(k)) {
        result[cat.id] = k
        taken.add(k)
      }
    }
  }
  // Ring-order fill for unassigned categories
  for (const cat of cats) {
    if (!result[cat.id]) {
      const k = ASSIGN_POOL.find(c => {
        if (taken.has(c)) return false
        const [q] = c.split(',').map(Number)
        return Math.abs(q) <= colRange
      }) ?? null
      if (k) { result[cat.id] = k; taken.add(k) }
    }
  }
  return result
}

// ── Edit panel constants ──────────────────────────────────────────────────────
const COLOR_SWATCHES = [
  '#FF6B6B', '#FF9500', '#F59E0B', '#84CC16',
  '#10B981', '#14B8A6', '#3B82F6', '#8B5CF6',
  '#EC4899', '#F43F5E', '#A78BFA', '#6366F1',
]

// ── Component ─────────────────────────────────────────────────────────────────
export function CategoryCanvas({ categories }: { categories: CategoryItem[] }) {
  const router       = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)   // fixed-height outer div
  const scrollRef    = useRef<HTMLDivElement>(null)   // the scrollable div
  const saveTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Zoom state ─────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1)
  const prevZoom = useRef(1)   // for scroll-position adjustment in useLayoutEffect

  // Scaled geometry (all pixel values)
  const sR = HEX_R     * zoom
  const sW = HEX_W     * zoom
  const sH = HEX_H     * zoom
  const sV = V_SPACING * zoom
  const sB = Math.round(BUBBLE * zoom)        // scaled bubble diameter

  // ── Container width (responsive) ──────────────────────────────────────────
  const [containerWidth, setContainerWidth] = useState(800)
  useEffect(() => {
    function measure() {
      if (containerRef.current) setContainerWidth(containerRef.current.offsetWidth)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // ── Dynamic column range ───────────────────────────────────────────────────
  // Always at least 8 cols each side so there are plenty of empty cells visible
  const colRange = useMemo(
    () => Math.max(8, Math.ceil(categories.length / N_ROWS) + COL_BUF),
    [categories.length]
  )

  // All cells for SVG background rendering (row-major order for SVG perf)
  const bgCells = useMemo(() => {
    const cells: { q: number; r: number; key: string }[] = []
    for (let r = ROW_MIN; r <= ROW_MAX; r++)
      for (let q = -colRange; q <= colRange; q++)
        cells.push({ q, r, key: `${q},${r}` })
    return cells
  }, [colRange])

  // ── Canvas dimensions ─────────────────────────────────────────────────────
  // Ensure canvas always exceeds the viewport so pan works at any zoom level.
  // Without the Math.max, at MIN_ZOOM the scaled grid can be smaller than the
  // container, leaving scrollTop/scrollLeft with zero range.
  const PAN_MARGIN = 400   // px of extra space beyond the container edge
  const canvasW = Math.max(
    (2 * colRange + 1) * sW + sW / 2,
    containerWidth + PAN_MARGIN * 2
  )
  // Height = hex strip + vertical padding above & below (scaled)
  // This gives canvasH > CONTAINER_H so scrollTop has range [0, canvasH - CONTAINER_H]
  const vPad    = V_PAD * zoom
  const canvasH = Math.max(
    (ROW_MAX - ROW_MIN) * sV + sH + 32 + 2 * vPad,
    CONTAINER_H + PAN_MARGIN
  )

  // Grid center in canvas pixel space.
  // cx is always canvasW/2; cy shifts down by vPad so the hex strip sits in the middle.
  const cx = canvasW / 2
  const cy = vPad + (-ROW_MIN) * sV + sR + 16

  // Axial → pixel (uses scaled values)
  function axPx(q: number, r: number) {
    return { x: cx + sW * (q + r * 0.5), y: cy + sV * r }
  }

  function clampScroll(currentAssignments: Record<string, string>) {
    const el = scrollRef.current
    if (!el) return

    const placed = Object.entries(currentAssignments).map(([, cellKey]) => {
      const [q, r] = cellKey.split(',').map(Number)
      return axPx(q, r)
    })
    if (placed.length === 0) return

    const xs = placed.map(point => point.x)
    const ys = placed.map(point => point.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)

    const padX = 1.5 * sW
    const padY = 1.5 * sH
    const viewW = el.clientWidth
    const viewH = el.clientHeight

    const minScrollLeft = minX - padX - viewW
    const maxScrollLeft = maxX + padX
    const minScrollTop = minY - padY - viewH
    const maxScrollTop = maxY + padY

    el.scrollLeft = Math.max(minScrollLeft, Math.min(maxScrollLeft, el.scrollLeft))
    el.scrollTop = Math.max(minScrollTop, Math.min(maxScrollTop, el.scrollTop))
  }

  // SVG polygon for a pointy-top hex centered at (hx, hy) with radius sR
  function hexPts(hx: number, hy: number): string {
    return Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 6
      return `${hx + sR * Math.cos(a)},${hy + sR * Math.sin(a)}`
    }).join(' ')
  }

  // ── Initial scroll: center (0,0) hex horizontally, center strip vertically ─
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [layoutLoaded, setLayoutLoaded] = useState(false)
  const didInitScroll = useRef(false)
  useLayoutEffect(() => {
    if (!scrollRef.current || didInitScroll.current) return
    scrollRef.current.scrollLeft = cx - containerWidth / 2
    scrollRef.current.scrollTop  = vPad   // park at center of vertical buffer
    clampScroll(assignments)
    didInitScroll.current = true
  }, [cx, containerWidth, vPad, assignments])

  // ── Zoom: re-center both axes ─────────────────────────────────────────────
  // scrollLeft keeps (0,0) at viewport center; scrollTop keeps grid vertically
  // centered in the buffer (user can then pan away from there).
  useLayoutEffect(() => {
    if (!scrollRef.current) return
    if (prevZoom.current === zoom) return
    scrollRef.current.scrollLeft = cx - containerWidth / 2
    scrollRef.current.scrollTop  = vPad
    clampScroll(assignments)
    prevZoom.current = zoom
  }, [zoom, cx, containerWidth, vPad, assignments])

  // Zoom helper — clamps and updates
  const zoomRef = useRef(zoom)
  useEffect(() => { zoomRef.current = zoom }, [zoom])

  function applyZoom(factor: number) {
    setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)))
  }

  // ── Wheel zoom (non-passive so we can prevent page scroll) ────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      // ~33% less sensitive than original 0.92/1.09 steps
      applyZoom(e.deltaY > 0 ? 0.946 : 1.060)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Pinch zoom (two-finger) ────────────────────────────────────────────────
  const pinchRef = useRef<{ dist: number; startZoom: number } | null>(null)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY
        )
        pinchRef.current = { dist, startZoom: zoomRef.current }
      }
    }
    function onTouchMove(e: TouchEvent) {
      if (e.touches.length !== 2 || !pinchRef.current) return
      e.preventDefault()
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      )
      const raw = pinchRef.current.startZoom * (dist / pinchRef.current.dist)
      setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, raw)))
    }
    function onTouchEnd() { pinchRef.current = null }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  // ── Cell assignments: categoryId → "q,r" ──────────────────────────────────
  // Load from DB on mount (localStorage fallback)
  useEffect(() => {
    async function load() {
      let saved = loadLocal()
      try {
        const res = await fetch('/api/user/layout')
        if (res.ok) {
          const { layout } = await res.json()
          if (layout) { saved = JSON.parse(layout); saveLocal(saved) }
        }
      } catch { /* use localStorage */ }
      const result = mergeAssignments(categories, saved, colRange)
      setAssignments(result)
      setLayoutLoaded(true)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Rebuild when category list changes after initial load
  const catListKey = categories.map(c => c.id).join(',')
  useEffect(() => {
    if (!layoutLoaded) return
    setAssignments(prev => {
      const result = mergeAssignments(categories, prev, colRange)
      const changed = categories.some(c => prev[c.id] !== result[c.id])
      if (!changed) return prev
      persistLayout(result)
      return result
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catListKey, layoutLoaded, colRange])

  useEffect(() => {
    if (!layoutLoaded) return
    clampScroll(assignments)
  }, [layoutLoaded, assignments, zoom])

  // Debounced DB save
  function persistLayout(a: Record<string, string>) {
    saveLocal(a)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch('/api/user/layout', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ layout: JSON.stringify(a) }),
        })
      } catch { /* silent */ }
    }, 600)
  }

  // Reverse map: "q,r" → categoryId
  const catByCell = useMemo(() => {
    const m: Record<string, string> = {}
    Object.entries(assignments).forEach(([id, k]) => { m[k] = id })
    return m
  }, [assignments])

  // ── Drag state (bubble drag-to-rearrange) ────────────────────────────────
  const [draggingId,        setDraggingId]        = useState<string | null>(null)
  // Only true once the pointer has moved beyond the 6px click threshold —
  // prevents the scale-up jump on simple clicks
  const [isActuallyDragging, setIsActuallyDragging] = useState(false)
  const [dragPos,    setDragPos]    = useState<{ x: number; y: number } | null>(null)
  const [targetKey,  setTargetKey]  = useState<string | null>(null)
  const dragMeta = useRef<{ px: number; py: number; originalKey: string } | null>(null)

  // ── Pan state (empty-space drag to scroll the canvas) ────────────────────
  const [isPanning, setIsPanning] = useState(false)
  const panRef = useRef<{
    startX: number; startY: number
    startScrollLeft: number; startScrollTop: number
  } | null>(null)

  // Snap radius scales with zoom
  const snapR = HEX_W * 1.4 * zoom

  function startDrag(e: React.PointerEvent, catId: string) {
    if (editingId) { closeEdit(); return }
    e.stopPropagation()   // prevent pan from also starting on this pointer-down
    scrollRef.current?.setPointerCapture(e.pointerId)
    const rect = scrollRef.current!.getBoundingClientRect()
    const scrollX = scrollRef.current!.scrollLeft
    const scrollY = scrollRef.current!.scrollTop
    dragMeta.current = {
      px: e.clientX, py: e.clientY,
      originalKey: assignments[catId] ?? '0,0',
    }
    setDraggingId(catId)
    setDragPos({ x: e.clientX - rect.left + scrollX, y: e.clientY - rect.top + scrollY })
  }

  function startPan(e: React.PointerEvent) {
    if (draggingId) return
    // editingId is intentionally NOT blocked — the edit panel stops its own
    // pointer events, so background clicks can still pan the canvas
    scrollRef.current?.setPointerCapture(e.pointerId)
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startScrollLeft: scrollRef.current?.scrollLeft ?? 0,
      startScrollTop:  scrollRef.current?.scrollTop  ?? 0,
    }
    setIsPanning(true)
  }

  function handleMove(e: React.PointerEvent) {
    if (draggingId && scrollRef.current) {
      // ── Bubble drag ──────────────────────────────────────────────────────
      const rect  = scrollRef.current.getBoundingClientRect()
      const scrollX = scrollRef.current.scrollLeft
      const scrollY = scrollRef.current.scrollTop
      const mx = e.clientX - rect.left + scrollX
      const my = e.clientY - rect.top + scrollY
      setDragPos({ x: mx, y: my })
      // Only visually enter drag mode after pointer has moved enough
      if (dragMeta.current && !isActuallyDragging) {
        const moved = Math.hypot(e.clientX - dragMeta.current.px, e.clientY - dragMeta.current.py)
        if (moved > 6) setIsActuallyDragging(true)
      }

      let bestKey: string | null = null
      let bestDist = snapR
      for (const { q, r, key } of bgCells) {
        if (catByCell[key] && catByCell[key] !== draggingId) continue
        const { x, y } = axPx(q, r)
        const d = Math.hypot(mx - x, my - y)
        if (d < bestDist) { bestDist = d; bestKey = key }
      }
      setTargetKey(bestKey)
    } else if (panRef.current && scrollRef.current) {
      // ── Canvas pan ───────────────────────────────────────────────────────
      const dx = e.clientX - panRef.current.startX
      const dy = e.clientY - panRef.current.startY
      scrollRef.current.scrollLeft = panRef.current.startScrollLeft - dx
      // scrollTop works on overflow:hidden elements when set via JS
      scrollRef.current.scrollTop  = panRef.current.startScrollTop  - dy
      clampScroll(assignments)
    }
  }

  function handleUp(e: React.PointerEvent) {
    // ── End pan ──────────────────────────────────────────────────────────────
    if (panRef.current) {
      panRef.current = null
      setIsPanning(false)
      return
    }
    // ── End bubble drag ───────────────────────────────────────────────────────
    if (!draggingId || !dragMeta.current) {
      setDraggingId(null); setIsActuallyDragging(false); setDragPos(null); setTargetKey(null); return
    }
    const moved = Math.hypot(e.clientX - dragMeta.current.px, e.clientY - dragMeta.current.py)
    if (moved < 6) {
      router.push(`/category/${draggingId}`)
    } else if (targetKey) {
      const next = { ...assignments, [draggingId]: targetKey }
      const displaced = catByCell[targetKey]
      if (displaced && displaced !== draggingId) next[displaced] = dragMeta.current.originalKey
      setAssignments(next)
      persistLayout(next)
    }
    setDraggingId(null); setIsActuallyDragging(false); setDragPos(null); setTargetKey(null)
    dragMeta.current = null
  }

  // ── Hover & edit ───────────────────────────────────────────────────────────
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editColor, setEditColor] = useState('#6366f1')
  const [editName,  setEditName]  = useState('')
  const [editEmoji, setEditEmoji] = useState('📌')
  const [emojiLoading, setEmojiLoading] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const isEmojiManuallySet = useRef(false)
  const emojiDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function openEdit(e: React.MouseEvent | React.PointerEvent, cat: CategoryItem) {
    e.stopPropagation(); e.preventDefault()
    setEditingId(cat.id); setEditColor(cat.color ?? '#6366f1')
    setEditEmoji(cat.icon ?? '📌'); setEditName(cat.name); setSaveError(null)
    isEmojiManuallySet.current = false
  }
  function closeEdit() {
    setEditingId(null)
    setSaveError(null)
    if (emojiDebounceTimer.current) clearTimeout(emojiDebounceTimer.current)
    setEmojiLoading(false)
  }

  useEffect(() => {
    if (!editingId) return
    isEmojiManuallySet.current = false
    if (!editName.trim()) return
    if (emojiDebounceTimer.current) clearTimeout(emojiDebounceTimer.current)
    emojiDebounceTimer.current = setTimeout(async () => {
      if (isEmojiManuallySet.current) return
      setEmojiLoading(true)
      try {
        const res = await fetch('/api/emoji/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: editName }),
        })
        const { emoji } = await res.json()
        if (!isEmojiManuallySet.current) setEditEmoji(emoji)
      } catch {
        // Keep current emoji when the suggestion request fails.
      } finally {
        setEmojiLoading(false)
      }
    }, 500)
    return () => {
      if (emojiDebounceTimer.current) clearTimeout(emojiDebounceTimer.current)
    }
  }, [editName, editingId])

  async function regenerateEditEmoji() {
    if (!editName.trim()) return
    isEmojiManuallySet.current = true
    setEmojiLoading(true)
    try {
      const res = await fetch('/api/emoji/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName }),
      })
      const { emoji } = await res.json()
      setEditEmoji(emoji)
    } catch {
      // Keep current emoji when the suggestion request fails.
    } finally {
      setEmojiLoading(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editingId) return
    setSaving(true); setSaveError(null)
    try {
      const res = await fetch(`/api/categories/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          color: editColor,
          name: editName.trim() || undefined,
          icon: editEmoji !== '📌' ? editEmoji : null,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      closeEdit(); router.refresh()
    } catch { setSaveError('Could not save — try again') }
    finally { setSaving(false) }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    // Fixed-height container: clips vertically, scrolls horizontally
    <div
      ref={containerRef}
      className="relative w-full select-none touch-none"
      style={{ height: '100%', overflow: 'hidden' }}
    >
      {/* Horizontal scroll layer — pointer-down on empty space starts pan */}
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-auto"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.15) transparent',
          cursor: isPanning ? 'grabbing' : draggingId ? 'default' : 'grab',
        }}
        onPointerDown={startPan}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
      >
        {/* Inner canvas — sized to the scaled grid */}
        <div
          className="relative"
          style={{ width: canvasW, height: canvasH, minHeight: '100%' }}
        >
          {/* ── Hex background SVG ──────────────────────────────────────── */}
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{ width: canvasW, height: canvasH }}
          >
            {bgCells.map(({ q, r, key }) => {
              const { x, y } = axPx(q, r)
              const isTgt = key === targetKey && draggingId !== null
              const isOcc = Boolean(catByCell[key])
              return (
                <polygon
                  key={key}
                  points={hexPts(x, y)}
                  fill={
                    isTgt ? 'rgba(255,255,255,0.12)'
                    : isOcc ? 'rgba(255,255,255,0.04)'
                    : 'rgba(255,255,255,0.025)'
                  }
                  stroke={isTgt ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.08)'}
                  strokeWidth={isTgt ? 1.5 : 1}
                />
              )
            })}
          </svg>

          {/* ── Bubbles ─────────────────────────────────────────────────── */}
          {categories.map(cat => {
            const cellKey = assignments[cat.id]
            if (!cellKey) return null
            const [q, r]    = cellKey.split(',').map(Number)
            const { x, y }  = axPx(q, r)
            const isDragging = draggingId === cat.id
            // isActuallyDragging: only true after pointer moves 6px — prevents
            // scale-jump on simple clicks
            const isDragVisual = isDragging && isActuallyDragging
            const isHovered  = hoveredId  === cat.id
            const isEditing  = editingId  === cat.id
            const bg         = cat.color  ?? '#6366f1'

            const bx = isDragging && dragPos ? dragPos.x : x
            const by = isDragging && dragPos ? dragPos.y : y

            return (
              <div key={cat.id}>
                {/* Bubble wrapper */}
                <div
                  className="absolute"
                  style={{
                    left:   bx - sB / 2,
                    top:    by - sB / 2,
                    width:  sB,
                    height: sB,
                    zIndex: isDragging ? 60 : isEditing ? 40 : 2,
                    transform: isDragVisual ? 'scale(1.10)' : isHovered ? 'scale(1.05)' : 'scale(1)',
                    transition: isDragVisual
                      ? 'transform 0.1s'
                      : 'transform 0.18s ease-out, left 0.15s ease-out, top 0.15s ease-out',
                    cursor: isDragVisual ? 'grabbing' : 'grab',
                    filter: isDragVisual ? `drop-shadow(0 12px 24px ${bg}80)` : 'none',
                  }}
                  onPointerDown={e => startDrag(e, cat.id)}
                  onMouseEnter={() => setHoveredId(cat.id)}
                  onMouseLeave={() => setHoveredId(p => p === cat.id ? null : p)}
                >
                  {/* Circle */}
                  <div
                    className="w-full h-full rounded-full relative overflow-hidden"
                    style={{
                      backgroundColor: bg,
                      boxShadow: isHovered
                        ? `0 8px 28px ${bg}60, 0 2px 8px ${bg}40`
                        : `0 4px 20px ${bg}45, 0 1px 4px ${bg}20`,
                      transition: 'box-shadow 0.2s ease-out',
                    }}
                  >
                    <div className="absolute inset-0 pointer-events-none" style={{
                      background: 'linear-gradient(160deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.04) 55%, transparent 100%)',
                    }} />
                    <div className="relative z-10 flex flex-col items-center justify-center h-full gap-1">
                      <div className="flex items-center gap-0">
                        <span
                          className="inline-flex items-center justify-center leading-none drop-shadow-sm"
                          style={{ fontSize: Math.round(26 * zoom), width: Math.round(32 * zoom) }}
                          aria-hidden="true"
                        >
                          {cat.icon ?? '📌'}
                        </span>
                        {cat.count > 0 && (
                          <div
                            className="flex items-center justify-center rounded-full border border-white/40 bg-black/40 px-1"
                            style={{ minWidth: Math.round(20 * zoom), height: Math.round(20 * zoom) }}
                          >
                            <span
                              className="font-bold text-white leading-none"
                              style={{ fontSize: Math.round(11 * zoom) }}
                            >
                              {cat.count}
                            </span>
                          </div>
                        )}
                      </div>
                      <span
                        className="font-semibold text-white/90 leading-tight text-center px-2 max-w-full"
                        style={{
                          fontSize: Math.round(13 * zoom),
                          textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                        }}
                      >
                        {cat.name.length > 10 ? `${cat.name.slice(0, 9)}…` : cat.name}
                      </span>
                    </div>
                  </div>

                  {/* Hamburger edit button */}
                  {(isHovered || isEditing) && !isDragging && (
                    <button
                      type="button"
                      aria-label="Edit category"
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => isEditing ? closeEdit() : openEdit(e, cat)}
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 z-30
                        flex items-center justify-center rounded-full
                        bg-black/70 border border-white/10 px-2.5 py-1 shadow-lg
                        text-white/80 hover:text-white transition-colors"
                    >
                      {isEditing
                        ? <X className="h-3 w-3" />
                        : <svg width="14" height="10" viewBox="0 0 14 10" fill="currentColor">
                            <rect y="0" width="14" height="1.5" rx="1" />
                            <rect y="4" width="14" height="1.5" rx="1" />
                            <rect y="8" width="14" height="1.5" rx="1" />
                          </svg>
                      }
                    </button>
                  )}
                </div>

                {/* Edit handled by Sheet below */}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Zoom controls (fixed over the hex panel, don't scroll) ─────────── */}
      {(() => {
        const editingCat = categories.find(category => category.id === editingId) ?? null
        return (
          <Sheet open={Boolean(editingId)} onOpenChange={(open) => { if (!open) closeEdit() }}>
            <SheetContent
              side="right"
              showCloseButton={false}
              className="w-full sm:max-w-sm p-0 flex flex-col gap-0"
            >
              <SheetHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
                <SheetTitle className="text-base font-semibold tracking-tight">
                  Edit Category
                </SheetTitle>
              </SheetHeader>

              <form
                id="edit-cat-form"
                onSubmit={handleSave}
                className="flex-1 overflow-y-auto px-5 py-5 space-y-5"
              >
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Name
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={regenerateEditEmoji}
                        disabled={emojiLoading}
                        className={[
                          'flex items-center justify-center rounded-xl border border-input min-h-[44px] min-w-[44px] text-xl',
                          'bg-muted/40 hover:bg-muted/70 transition-colors',
                          emojiLoading ? 'animate-pulse' : '',
                        ].join(' ')}
                        aria-label="Regenerate emoji"
                        title="AI suggested · tap to regenerate"
                      >
                        {editEmoji}
                      </button>
                      <span className="absolute -bottom-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-primary text-[9px] leading-none border border-background pointer-events-none" aria-hidden="true">
                        ✨
                      </span>
                    </div>
                    <input
                      id="ce-name"
                      type="text"
                      value={editName}
                      maxLength={50}
                      onChange={e => setEditName(e.target.value)}
                      className="flex-1 rounded-xl border border-input bg-muted/40 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground/60">AI suggested · tap emoji to regenerate</p>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Color</label>
                  <div className="grid grid-cols-8 gap-2">
                    {COLOR_SWATCHES.map(sw => (
                      <button
                        key={sw}
                        type="button"
                        onClick={() => setEditColor(sw)}
                        className="relative h-10 w-full rounded-full transition-transform hover:scale-110 active:scale-95 focus:outline-none"
                        style={{ backgroundColor: sw }}
                        aria-label={sw}
                      >
                        {editColor === sw && (
                          <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editColor}
                      onChange={e => setEditColor(e.target.value)}
                      className="h-7 w-10 cursor-pointer rounded-md border border-input bg-transparent p-0.5 shrink-0"
                    />
                    <span className="text-xs font-mono text-muted-foreground">{editColor}</span>
                  </div>
                </div>

                {editingCat && (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <div
                      className="w-16 h-16 rounded-full flex flex-col items-center justify-center relative overflow-hidden"
                      style={{ backgroundColor: editColor, boxShadow: `0 4px 20px ${editColor}55` }}
                    >
                      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.22) 0%, transparent 60%)' }} />
                      <span className="text-xl relative z-10">{editEmoji}</span>
                      <span className="relative z-10 text-[9px] font-semibold text-white/90 px-1 text-center leading-tight">
                        {editName.length > 10 ? `${editName.slice(0, 9)}…` : editName}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">preview</span>
                  </div>
                )}

                {saveError && (
                  <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
                    {saveError}
                  </p>
                )}
              </form>

              <div className="shrink-0 px-5 py-4 border-t border-border bg-background/60 backdrop-blur-sm flex gap-2">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="flex-1 rounded-xl border border-border px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="edit-cat-form"
                  disabled={saving}
                  className="flex-1 rounded-xl bg-primary text-primary-foreground px-3 py-3 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </SheetContent>
          </Sheet>
        )
      })()}

      <div className="absolute bottom-3 right-3 z-50 flex items-center gap-2">
        {/* Vertical zoom level bar */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-white/30 font-mono" style={{ fontSize: 8 }}>
            {Math.round(zoom * 100)}%
          </span>
          <div
            className="relative rounded-full bg-white/10 border border-white/10"
            style={{ width: 4, height: 52 }}
            title={`Zoom: ${Math.round(zoom * 100)}%`}
          >
            {/* Filled portion — grows from bottom (min) toward top (max) */}
            <div
              className="absolute bottom-0 left-0 right-0 rounded-full bg-white/50 transition-all duration-150"
              style={{
                height: `${((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* +/- buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => applyZoom(1 / 1.25)}
            aria-label="Zoom out"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 border border-white/10 text-white/70 hover:text-white hover:bg-black/80 transition-colors shadow-lg"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            aria-label="Reset zoom"
            className="px-2 h-7 rounded-full bg-black/60 border border-white/10 text-white/50 hover:text-white hover:bg-black/80 transition-colors shadow-lg font-mono text-[10px]"
          >
            1×
          </button>
          <button
            type="button"
            onClick={() => applyZoom(1.25)}
            aria-label="Zoom in"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 border border-white/10 text-white/70 hover:text-white hover:bg-black/80 transition-colors shadow-lg"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
