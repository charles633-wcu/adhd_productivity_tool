'use client'

// ChatFab — draggable circular floating action button.
// Tap (movement < 6px) opens ChatSheet.
// Drag updates position, clamped to viewport with 16px padding.
// Position persisted in localStorage across sessions; clamped on mount to handle resize.

import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageCircle } from 'lucide-react'
import { ChatSheet } from '@/components/ChatSheet'

const LS_KEY = 'sentinel-chat-fab-pos'
const DRAG_THRESHOLD = 6   // px — below this total movement is treated as a tap
const PADDING = 16         // px — minimum distance from viewport edge
const FAB_SIZE = 52        // px

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function clampToViewport(x: number, y: number) {
  return {
    x: clamp(x, PADDING, window.innerWidth - FAB_SIZE - PADDING),
    y: clamp(y, PADDING, window.innerHeight - FAB_SIZE - PADDING),
  }
}

function defaultPosition() {
  return {
    x: window.innerWidth - FAB_SIZE - PADDING - 80,
    y: window.innerHeight - FAB_SIZE - PADDING - 160,
  }
}

export function ChatFab() {
  // -1 = not yet hydrated (prevents position flash on mount)
  const [pos, setPos] = useState({ x: -1, y: -1 })
  const [chatOpen, setChatOpen] = useState(false)
  const dragStart = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null)
  const moved = useRef(false)
  // Track latest pos in a ref so pointerUp handler can read it without stale closure
  const posRef = useRef(pos)
  useEffect(() => { posRef.current = pos }, [pos])

  // Hydrate position from localStorage on mount, clamp to current viewport
  useEffect(() => {
    let initial = defaultPosition()
    try {
      const saved = localStorage.getItem(LS_KEY)
      if (saved) initial = JSON.parse(saved) as { x: number; y: number }
    } catch { /* ignore */ }
    setPos(clampToViewport(initial.x, initial.y))
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* jsdom doesn't support setPointerCapture */ }
    moved.current = false
    dragStart.current = { x: e.clientX, y: e.clientY, posX: posRef.current.x, posY: posRef.current.y }
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
      moved.current = true
    }
    if (moved.current) {
      setPos(clampToViewport(dragStart.current.posX + dx, dragStart.current.posY + dy))
    }
  }, [])

  const handlePointerUp = useCallback(() => {
    if (!moved.current) {
      setChatOpen(true)
    } else {
      // Persist final position after drag ends
      try { localStorage.setItem(LS_KEY, JSON.stringify(posRef.current)) } catch { /* ignore */ }
    }
    dragStart.current = null
    moved.current = false
  }, [])

  // Don't render until hydrated — avoids layout flash at wrong position
  if (pos.x === -1) return null

  return (
    <>
      <button
        type="button"
        aria-label="Open chat"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          left: pos.x,
          top: pos.y,
          width: FAB_SIZE,
          height: FAB_SIZE,
          boxShadow: '0 4px 20px color-mix(in srgb, var(--primary) 40%, transparent)',
        }}
        className="fixed z-50 rounded-full bg-primary text-primary-foreground flex items-center justify-center touch-none select-none hover:brightness-110 active:scale-95 transition-[transform,filter]"
      >
        <MessageCircle className="h-5 w-5" aria-hidden="true" />
      </button>

      <ChatSheet open={chatOpen} onOpenChange={setChatOpen} />
    </>
  )
}
