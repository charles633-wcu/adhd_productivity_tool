import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ChatFab } from '@/components/ChatFab'

Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 })
Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 768 })

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

describe('ChatFab', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  it('renders the FAB button', () => {
    render(<ChatFab />)
    expect(screen.getByRole('button', { name: /open chat/i })).toBeInTheDocument()
  })

  it('opens ChatSheet on tap (no drag)', async () => {
    render(<ChatFab />)
    const btn = screen.getByRole('button', { name: /open chat/i })
    fireEvent.pointerDown(btn, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(btn, { clientX: 100, clientY: 100 })
    expect(await screen.findByText(/Hi I'm Your Sentinel/i)).toBeInTheDocument()
  })

  it('does not open sheet when dragged beyond threshold', () => {
    render(<ChatFab />)
    const btn = screen.getByRole('button', { name: /open chat/i })
    fireEvent.pointerDown(btn, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(btn, { clientX: 120, clientY: 120 })
    fireEvent.pointerUp(btn, { clientX: 120, clientY: 120 })
    expect(screen.queryByText(/Hi I'm Your Sentinel/i)).not.toBeInTheDocument()
  })
})
