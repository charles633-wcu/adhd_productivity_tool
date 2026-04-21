/**
 * IcsModal — paste an ICS subscription URL to import an external calendar (read-only).
 * No OAuth required — uses Google Calendar's "Secret address in iCal format" or equivalent.
 */
'use client'

import { useState, FormEvent } from 'react'

interface IcsModalProps {
  currentUrl?: string | null
  onClose: () => void
  onSaved: (url: string) => void
  onDeleted: () => void
}

export function IcsModal({ currentUrl, onClose, onSaved, onDeleted }: IcsModalProps) {
  const [url, setUrl] = useState(currentUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/calendar/ics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) throw new Error(await res.text())
      onSaved(url)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect calendar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    try {
      await fetch('/api/calendar/ics', { method: 'DELETE' })
      onDeleted()
      onClose()
    } catch { /* silent */ }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-background border border-border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold">Connect Calendar</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
        </div>
        <form onSubmit={handleSave} className="px-5 py-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Paste your Google Calendar "Secret address in iCal format" (.ics URL). No login required.
          </p>
          <input
            required type="url" placeholder="https://calendar.google.com/...ics"
            value={url} onChange={e => setUrl(e.target.value)}
            className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            {currentUrl && (
              <button type="button" onClick={handleDelete} className="rounded-lg border border-destructive/30 text-destructive px-3 py-2 text-sm hover:bg-destructive/10">
                Disconnect
              </button>
            )}
            <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-primary text-primary-foreground py-2 text-sm font-semibold disabled:opacity-50">
              {saving ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
