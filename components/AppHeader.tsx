'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ComponentType } from 'react'
import { Brain, CalendarDays, Target } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export type AppHeaderActive = 'triggers' | 'calendar' | 'todos' | 'heap' | 'review' | 'import' | 'chat'

interface AppHeaderProps {
  active?: AppHeaderActive
  position?: 'sticky' | 'fixed'
  className?: string
}

const featureLinks: Array<{
  key: AppHeaderActive
  label: string
  href: string
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
}> = [
  { key: 'triggers', label: 'Triggers', href: '/', icon: Target },
  { key: 'calendar', label: 'Calendar', href: '/calendar', icon: CalendarDays },
  { key: 'todos', label: '✓ To-Dos', href: '/todos' },
  { key: 'heap', label: 'Mind', href: '/heap', icon: Brain },
]

export function AppHeader({ active, className }: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <div
        data-testid="app-header-pill"
        className={cn(
          'fixed top-3 left-1/2 -translate-x-1/2 z-50 flex max-w-[calc(100vw-1rem)] items-center gap-2.5 overflow-x-auto rounded-full border border-border/50 bg-background/90 backdrop-blur-md shadow-lg px-4 py-0',
          className,
        )}
      >
        <Link
          href="/"
          className="shrink-0 whitespace-nowrap text-[13px] font-extrabold uppercase tracking-widest text-foreground select-none hover:text-primary transition-colors"
        >
          SENTINEL
        </Link>

        <div className="h-5 w-px bg-border/60" aria-hidden="true" />

        <nav
          aria-label="Feature navigation"
          className="flex items-center gap-2.5"
        >
          {featureLinks.map(({ key, label, href, icon: Icon }) => {
            const isActive = active === key
            return (
              <Link
                key={key}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-4 min-h-[44px] text-[13px] transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground font-semibold cursor-default'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="h-5 w-px bg-border/60" aria-hidden="true" />

        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
          className="flex flex-col items-center justify-center gap-[4px] min-h-[44px] min-w-[44px] rounded-xl hover:bg-muted/60 transition-colors"
        >
          <span className="block w-4 h-[1.5px] bg-foreground/70 rounded-full" />
          <span className="block w-4 h-[1.5px] bg-foreground/70 rounded-full" />
          <span className="block w-4 h-[1.5px] bg-foreground/70 rounded-full" />
        </button>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xs p-0 flex flex-col gap-0">
          <SheetHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
            <SheetTitle className="text-base font-semibold tracking-tight">Subfeatures</SheetTitle>
          </SheetHeader>
          <div className="px-5 py-5">
            <p className="text-sm text-muted-foreground">No subfeatures yet.</p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
