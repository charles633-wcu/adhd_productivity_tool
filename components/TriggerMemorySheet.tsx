'use client'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { MemoryPanel } from '@/components/MemoryPanel'
import type { Trigger } from '@/lib/db/schema'

interface TriggerMemorySheetProps {
  trigger: Trigger
  open: boolean
  onOpenChange: (open: boolean) => void
  startInAddNoteMode?: boolean
}

export function TriggerMemorySheet({ trigger, open, onOpenChange, startInAddNoteMode = false }: TriggerMemorySheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[420px] p-0 flex flex-col gap-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <SheetTitle className="text-base font-semibold tracking-tight">Trigger Memory</SheetTitle>
        </SheetHeader>

        <MemoryPanel
          trigger={trigger}
          onBack={() => onOpenChange(false)}
          onUpdate={() => {}}
          startInAddNoteMode={startInAddNoteMode}
        />
      </SheetContent>
    </Sheet>
  )
}
