'use client'

// CategoryBubble — clickable tile representing one category on the Home screen.
// Displays icon, name, and item count. Background color sourced from category.color.
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

  // Inner content is the same regardless of the root element
  const inner = (
    <>
      <div className="flex items-center justify-between w-full">
        <span className="text-2xl" aria-hidden="true">{icon ?? '📌'}</span>
        <span className="text-xs font-semibold bg-white/20 text-white px-2 py-0.5 rounded-full">
          {count}
        </span>
      </div>
      <span className="text-sm font-semibold text-white">{name}</span>
    </>
  )

  const className = "flex flex-col items-start gap-2 p-4 rounded-xl border border-white/10 hover:opacity-90 transition-opacity w-full text-left"

  if (href) {
    return (
      <a
        href={href}
        aria-label={ariaLabel}
        className={className}
        style={{ backgroundColor: bg }}
      >
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
      style={{ backgroundColor: bg }}
    >
      {inner}
    </button>
  )
}
