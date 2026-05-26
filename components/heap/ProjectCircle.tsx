'use client'

import Link from 'next/link'

interface ProjectCircleProps {
  id: string
  title: string
  color: string | null
  childCount: number
}

/**
 * ProjectCircle — a large colored bubble representing one project in the overview.
 * Tapping navigates to /heap/[id] with a viewTransition morph into ProjectHeader.
 */
export function ProjectCircle({ id, title, color, childCount }: ProjectCircleProps) {
  const accentColor = color ?? '#64748b'

  return (
    <Link
      href={`/heap/${id}`}
      className="group flex flex-col items-center justify-center gap-2 rounded-full aspect-square w-40 border-4 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary"
      style={{
        borderColor: accentColor,
        background: `${accentColor}18`,
        viewTransitionName: `project-${id}`,
      } as React.CSSProperties}
      aria-label={`Open project ${title}`}
    >
      <span className="text-sm font-semibold text-center px-3 leading-tight line-clamp-3 text-foreground">
        {title}
      </span>
      {childCount > 0 && (
        <span className="text-xs text-muted-foreground">{childCount} nodes</span>
      )}
    </Link>
  )
}
