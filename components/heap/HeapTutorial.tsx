'use client'

import { X } from 'lucide-react'

/**
 * Modal overlay explaining how to use the Mind canvas.
 * Clicking the backdrop or "Got it" closes it.
 */

interface HeapTutorialProps {
  onClose: () => void
}

const STEPS = [
  {
    icon: '＋',
    title: 'Create a node',
    body: 'Click the + button (bottom-left) to add a new card to the canvas.',
  },
  {
    icon: '✏️',
    title: 'Edit a node',
    body: 'Click any card to open the detail panel on the right. Change its title, type, color, and notes.',
  },
  {
    icon: '↔',
    title: 'Connect nodes',
    body: 'Hover near the edge of a card to reveal the connector dot. Drag from it to another card to draw a link.',
  },
  {
    icon: '⌫',
    title: 'Delete a connection',
    body: 'Click a line between cards to select it, then press Delete or Backspace.',
  },
  {
    icon: '✓',
    title: 'Linked tasks',
    body: 'In the detail panel, type a task name and press Enter to create and attach it to the node.',
  },
  {
    icon: '🔍',
    title: 'Navigate',
    body: 'Drag the background to pan. Scroll or pinch to zoom.',
  },
]

export function HeapTutorial({ onClose }: HeapTutorialProps) {
  return (
    <div
      data-testid="heap-tutorial-backdrop"
      className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-foreground">How to use Mind</h2>
          <button type="button" onClick={onClose} aria-label="Close tutorial" className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <ul className="flex flex-col gap-3.5">
          {STEPS.map((step) => (
            <li key={step.title} className="flex items-start gap-3">
              <span className="text-base leading-none mt-0.5 w-6 text-center flex-shrink-0 select-none">{step.icon}</span>
              <div>
                <p className="text-sm font-medium text-foreground">{step.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.body}</p>
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
