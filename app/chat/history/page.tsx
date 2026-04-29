// Conversation History: skeleton placeholder for saved chat browser.
// Full implementation is a future feature.

import Link from 'next/link'
import { AppHeader } from '@/components/AppHeader'

export default function ChatHistoryPage() {
  return (
    <div className="min-h-screen bg-background pt-[60px]">
      <AppHeader />

      <main className="px-6 py-10 max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Back to triggers
          </Link>
          <span className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Coming soon
          </span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight mb-2">Conversation History</h1>
        <p className="text-sm text-muted-foreground mb-8">Your saved chats will appear here.</p>

        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="rounded-xl border border-border bg-muted/30 px-4 py-4 flex items-center gap-3 opacity-50"
            >
              <div className="h-4 w-4 rounded-full bg-muted-foreground/30 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-3/4 rounded bg-muted-foreground/20" />
                <div className="h-2.5 w-1/3 rounded bg-muted-foreground/15" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
