'use client'

// CategoryBubble — clickable tile representing one category on the Home screen.
// Displays icon, name, and active trigger count. Background color sourced from category.color.
// Renders as <a> when href is provided (server navigation), <button> when onClick is provided.

interface CategoryBubbleBaseProps {
  id: string
  name: string
  icon?: string | null
  color?: string | null
  count: number
}

interface CategoryBubbleLinkProps extends CategoryBubbleBaseProps {
  href: string
  onClick?: never
}

interface CategoryBubbleButtonProps extends CategoryBubbleBaseProps {
  onClick: (id: string) => void
  href?: never
}

type CategoryBubbleProps = CategoryBubbleLinkProps | CategoryBubbleButtonProps

export function CategoryBubble({ id, name, icon, color, count, href, onClick }: CategoryBubbleProps) {
  const bg = color ?? '#6366f1'
  const ariaLabel = `${name}, ${count} ${count !== 1 ? 'items' : 'item'}`

  // Derive a subtle glow from the bubble color
  const style = {
    backgroundColor: bg,
    boxShadow: `0 4px 24px ${bg}35, 0 1px 2px ${bg}20`,
  }

  const className = [
    'group relative flex flex-col items-start gap-2.5 p-4 rounded-xl',
    'hover:scale-[1.02] active:scale-[0.98]',
    'transition-all duration-200 ease-out',
    'overflow-hidden w-full text-left',
    // Subtle shine overlay on hover
    'before:absolute before:inset-0 before:bg-white/0 hover:before:bg-white/5 before:transition-colors before:duration-200',
  ].join(' ')

  const inner = (
    <>
      {/* Top row: icon + count badge */}
      <div className="relative z-10 flex items-center justify-between w-full">
        <span className="text-2xl drop-shadow-sm" aria-hidden="true">{icon ?? '📌'}</span>
        <span className="text-xs font-mono font-bold bg-black/20 text-white/90 px-2 py-0.5 rounded-full backdrop-blur-sm">
          {count}
        </span>
      </div>

      {/* Category name */}
      <span className="relative z-10 text-sm font-semibold text-white leading-tight">
        {name}
      </span>

      {/* Decorative corner gradient */}
      <div
        className="absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-white/10 blur-xl pointer-events-none"
        aria-hidden="true"
      />
    </>
  )

  if (href) {
    return (
      <a href={href} aria-label={ariaLabel} className={className} style={style}>
        {inner}
      </a>
    )
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => onClick!(id)}
      className={className}
      style={style}
    >
      {inner}
    </button>
  )
}
