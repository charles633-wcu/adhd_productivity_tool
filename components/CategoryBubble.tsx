'use client'

// CategoryBubble — clickable tile representing one category on the Home screen.
// Displays icon, name, and item count. Background color sourced from category.color.
interface CategoryBubbleProps {
  id: string
  name: string
  icon?: string | null
  color?: string | null
  count: number
  onClick: (id: string) => void
}

export function CategoryBubble({ id, name, icon, color, count, onClick }: CategoryBubbleProps) {
  const bg = color ?? '#6366f1'

  return (
    <button
      type="button"
      aria-label={`${name}, ${count} ${count !== 1 ? 'items' : 'item'}`}
      onClick={() => onClick(id)}
      className="flex flex-col items-start gap-2 p-4 rounded-xl border border-white/10 hover:opacity-90 transition-opacity w-full text-left"
      style={{ backgroundColor: bg }}
    >
      <div className="flex items-center justify-between w-full">
        <span className="text-2xl" aria-hidden="true">{icon ?? '📌'}</span>
        <span className="text-xs font-semibold bg-white/20 text-white px-2 py-0.5 rounded-full">
          {count}
        </span>
      </div>
      <span className="text-sm font-semibold text-white">{name}</span>
    </button>
  )
}
