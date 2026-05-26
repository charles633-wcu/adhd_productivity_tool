'use client'

import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface ProjectHeaderProps {
  projectId: string
  title: string
  color: string | null
}

/**
 * ProjectHeader — fixed top bar for the project canvas page.
 * Shows the project name, color accent, and a back button to /heap.
 * Sets viewTransitionName to animate from/to the ProjectCircle on the overview.
 */
export function ProjectHeader({ projectId, title, color }: ProjectHeaderProps) {
  const router = useRouter()

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/95 backdrop-blur"
      style={{ viewTransitionName: `project-${projectId}` } as React.CSSProperties}
    >
      <button
        type="button"
        aria-label="Back to projects"
        onClick={() => router.push('/heap')}
        className="text-muted-foreground hover:text-foreground transition-colors"
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
      <h1 className="text-xl font-bold text-foreground truncate">{title}</h1>
    </div>
  )
}
