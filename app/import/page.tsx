import { ImportClient } from '@/components/ImportClient'

// Import page — lets users upload a Notion CSV export and bulk-create triggers.
export default function ImportPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <a
            href="/"
            className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            ← back
          </a>
          <span className="text-muted-foreground/30">/</span>
          <h1 className="text-lg font-bold leading-none">Import CSV</h1>
          <span className="ml-auto text-xs font-mono text-muted-foreground">Notion export</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto w-full px-4 py-6">
        <ImportClient />
      </main>
    </div>
  )
}
