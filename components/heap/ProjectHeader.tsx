'use client'

import { useState } from 'react'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { AgentSuggestButton } from './AgentSuggestButton'

interface ProjectHeaderProps {
  projectId: string
  title: string
  color: string | null
}

/**
 * ProjectHeader — fixed top bar for the project canvas page.
 * Contains: back button, color dot, project title, and a collapsible AI suggest panel.
 * The viewTransitionName morphs from/to the ProjectCircle on the overview.
 */
export function ProjectHeader({ projectId, title, color }: ProjectHeaderProps) {
  const router = useRouter()
  const [showAgent, setShowAgent] = useState(false)

  return (
    <div
      style={{ viewTransitionName: `project-${projectId}` } as React.CSSProperties}
    >
      {/* Main header row */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/95 backdrop-blur">
        <button
          type="button"
          aria-label="Back to projects"
          onClick={() => router.push('/heap')}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        {color && (
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ background: color }}
            aria-hidden="true"
          />
        )}
        <h1 className="text-xl font-bold text-foreground truncate flex-1">{title}</h1>
        <button
          type="button"
          aria-label="Ask AI what's next"
          aria-pressed={showAgent}
          onClick={() => setShowAgent((v) => !v)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs shrink-0 transition-colors ${
            showAgent
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Ask AI
        </button>
      </div>

      {/* Collapsible AI suggest panel */}
      {showAgent && (
        <div className="border-b border-border bg-card/90 px-4 py-3">
          <AgentSuggestButton scope="project" projectId={projectId} label="What's next in here?" />
        </div>
      )}
    </div>
  )
}
