import { cn } from '@/lib/utils'

interface TriggerStatusSummaryProps {
  active: number
  snoozed: number
  archived: number
  className?: string
}

const STATUS_ITEMS = [
  { key: 'active', label: 'Active', tone: 'text-foreground', surface: 'border-primary/25 bg-background/30' },
  { key: 'snoozed', label: 'Snoozed', tone: 'text-muted-foreground', surface: 'border-border/70 bg-background/18' },
  { key: 'archived', label: 'Archived', tone: 'text-muted-foreground', surface: 'border-border/60 bg-background/14' },
] as const

export function TriggerStatusSummary({ active, snoozed, archived, className }: TriggerStatusSummaryProps) {
  const counts = { active, snoozed, archived }

  return (
    <section
      aria-label="Trigger status summary"
      className={cn('flex flex-col gap-1.5', className)}
    >
      {STATUS_ITEMS.map(item => (
        <div
          key={item.key}
          className={cn(
            'pointer-events-auto rounded-xl border px-3 py-2.5 backdrop-blur-sm shadow-[0_10px_30px_rgba(0,0,0,0.16)]',
            item.surface
          )}
        >
          <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {item.label}
          </p>
          <p className={`mt-0.5 text-xl font-semibold tracking-tight ${item.tone}`}>
            {counts[item.key]}
          </p>
        </div>
      ))}
    </section>
  )
}
