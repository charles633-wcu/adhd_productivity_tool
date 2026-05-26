'use client'

import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'

interface Suggestion {
  nodeId: string
  firstStep: string
  effort: 'quick' | 'medium' | 'deep'
}

interface AgentSuggestButtonProps {
  scope: 'overview' | 'project'
  projectId?: string
  label: string
  onSuggestions?: (nodeIds: string[]) => void
}

const EFFORT_COLORS: Record<Suggestion['effort'], string> = {
  quick: 'bg-emerald-500/20 text-emerald-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  deep: 'bg-red-500/20 text-red-400',
}

/**
 * AgentSuggestButton — fires the /api/heap/agent/suggest endpoint and renders
 * suggestion chips inline. Used on both the overview and inside project canvases.
 */
export function AgentSuggestButton({ scope, projectId, label, onSuggestions }: AgentSuggestButtonProps) {
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [degraded, setDegraded] = useState(false)

  async function handleClick() {
    setLoading(true)
    setSuggestions([])
    setDegraded(false)
    try {
      const res = await fetch('/api/heap/agent/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, projectId: projectId ?? null }),
      })
      const data = await res.json() as { suggestions: Suggestion[]; degraded?: boolean }
      if (data.degraded) {
        setDegraded(true)
      } else {
        setSuggestions(data.suggestions)
        onSuggestions?.(data.suggestions.map((s) => s.nodeId))
      }
    } catch {
      setDegraded(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-2 rounded-full border border-border bg-card text-sm text-muted-foreground hover:text-foreground hover:border-primary transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {label}
      </button>
      {degraded && (
        <p className="text-xs text-muted-foreground px-1">Suggestions unavailable</p>
      )}
      {suggestions.map((s) => (
        <div key={s.nodeId} className="rounded-lg border border-border bg-card/80 p-3 text-sm">
          <p className="text-foreground">{s.firstStep}</p>
          <span className={`mt-1 inline-block text-xs px-2 py-0.5 rounded-full ${EFFORT_COLORS[s.effort]}`}>
            {s.effort}
          </span>
        </div>
      ))}
    </div>
  )
}
