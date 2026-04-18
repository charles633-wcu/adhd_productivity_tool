'use client'

// ChatSheet — bottom-sheet chat UI.
// Manages in-session message history in React state.
// Sends messages to /api/chat and displays replies.
// Save button writes to /api/chat/conversations when there are 2+ turns.

import { useState, useRef, useEffect, FormEvent } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
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

  // Reset state when sheet closes
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="w-full max-h-[75vh] p-0 flex flex-col rounded-t-2xl"
      >
        {/* Header */}
        <SheetHeader className="px-5 pt-4 pb-3 border-b border-border shrink-0 flex flex-row items-center justify-between">
          <SheetTitle className="text-base font-semibold tracking-tight">Sentinel AI</SheetTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-1.5 hover:bg-muted transition-colors"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        </SheetHeader>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center mt-8">
              Hi, I&apos;m Sentinel AI. Ask me anything about your triggers or categories.
            </p>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={[
                'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap',
                msg.role === 'user'
                  ? 'ml-auto bg-primary text-primary-foreground rounded-br-sm'
                  : 'mr-auto bg-muted text-foreground rounded-bl-sm',
              ].join(' ')}
            >
              {msg.content}
            </div>
          ))}
          {loading && (
            <div className="mr-auto bg-muted rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-muted-foreground flex gap-1 items-center">
              <span className="animate-bounce inline-block" style={{ animationDelay: '0ms' }}>·</span>
              <span className="animate-bounce inline-block" style={{ animationDelay: '150ms' }}>·</span>
              <span className="animate-bounce inline-block" style={{ animationDelay: '300ms' }}>·</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border bg-background/80 backdrop-blur-sm px-4 pt-3 pb-4 space-y-2">
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask anything about your triggers…"
              disabled={loading}
              className="flex-1 rounded-xl border border-input bg-muted/40 px-4 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
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
            className="w-full rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors"
          >
            {saved ? 'Saved ✓' : 'Save conversation'}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
