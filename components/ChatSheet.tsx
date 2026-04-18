'use client'

// ChatSheet — floating resizable chat panel, styled like a website chatbot widget.
// Manages in-session message history in React state.
// Sends messages to /api/chat and displays replies.
// Save button writes to /api/chat/conversations when there are 2+ turns.

import { useState, useRef, useEffect, FormEvent } from 'react'
import { X } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChatSheet({ open, onOpenChange }: ChatSheetProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on new messages or loading state change
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages, loading])

  // Reset state when panel closes
  useEffect(() => {
    if (!open) {
      setMessages([])
      setInput('')
      setError(null)
      setSaved(false)
    }
  }, [open])

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    const newMessages: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })
      if (!res.ok) throw new Error('API error')
      const data = await res.json() as { reply: string }
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (messages.length < 2) return
    try {
      await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      })
      setSaved(true)
    } catch {
      setError('Could not save conversation.')
    }
  }

  const canSave = messages.length >= 2 && !saved

  if (!open) return null

  return (
    // Floating panel — fixed bottom-right, resizable via the browser's native resize handle
    <div
      style={{
        width: 380,
        height: 520,
        minWidth: 300,
        minHeight: 380,
        maxWidth: 640,
        maxHeight: '80vh',
        resize: 'both',
        overflow: 'hidden',
      }}
      className="fixed bottom-24 right-4 z-[60] flex flex-col rounded-2xl border border-border bg-background shadow-[0_8px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <span className="text-sm font-semibold tracking-tight">Sentinel AI</span>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="rounded-lg p-1.5 hover:bg-muted transition-colors"
          aria-label="Close chat"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center mt-6 px-2">
            Hi I&apos;m Your Sentinel, How can I help?
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={[
              'max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed',
              msg.role === 'user'
                ? 'ml-auto bg-primary text-primary-foreground rounded-br-sm'
                : 'mr-auto bg-muted text-foreground rounded-bl-sm',
            ].join(' ')}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div className="mr-auto bg-muted rounded-2xl rounded-bl-sm px-3 py-2 text-sm text-muted-foreground flex gap-1 items-center">
            <span className="animate-bounce inline-block" style={{ animationDelay: '0ms' }}>·</span>
            <span className="animate-bounce inline-block" style={{ animationDelay: '150ms' }}>·</span>
            <span className="animate-bounce inline-block" style={{ animationDelay: '300ms' }}>·</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-border px-3 pt-2.5 pb-3 space-y-2 bg-background/80">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask anything about your triggers…"
            disabled={loading}
            className="flex-1 rounded-xl border border-input bg-muted/40 px-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="rounded-xl bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            Send
          </button>
        </form>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="w-full rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors"
        >
          {saved ? 'Saved ✓' : 'Save conversation'}
        </button>
      </div>
    </div>
  )
}
