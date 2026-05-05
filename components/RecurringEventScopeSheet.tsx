/**
 * RecurringEventScopeSheet asks which portion of a recurring series to edit/delete.
 */
'use client'

export type RecurScope = 'this' | 'thisAndFollowing' | 'all'

interface RecurringEventScopeSheetProps {
  action: 'edit' | 'delete'
  onSelect: (scope: RecurScope) => void
  onCancel: () => void
}

const OPTIONS: Array<{ scope: RecurScope; label: string; sublabel: string }> = [
  { scope: 'this', label: 'This event', sublabel: 'Only the selected occurrence' },
  { scope: 'thisAndFollowing', label: 'This and following events', sublabel: 'This occurrence and future ones' },
  { scope: 'all', label: 'All events', sublabel: 'Every occurrence in the series' },
]

export function RecurringEventScopeSheet({ action, onSelect, onCancel }: RecurringEventScopeSheetProps) {
  return (
    <div
      data-testid="scope-sheet-overlay"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={event => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold">
            {action === 'delete' ? 'Delete recurring event?' : 'Edit recurring event?'}
          </h3>
        </div>
        <div className="divide-y divide-border">
          {OPTIONS.map(option => (
            <button
              key={option.scope}
              type="button"
              onClick={() => onSelect(option.scope)}
              className="flex w-full flex-col items-start px-5 py-3.5 text-left transition-colors hover:bg-muted/50"
            >
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.sublabel}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-xl py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
