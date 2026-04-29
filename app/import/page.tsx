import { ImportClient } from '@/components/ImportClient'
import { AppHeader } from '@/components/AppHeader'

// Import page: lets users upload a Notion CSV export and bulk-create triggers.
export default function ImportPage() {
  return (
    <div className="min-h-screen flex flex-col pt-[60px]">
      <AppHeader />

      <div className="border-b border-border bg-background/55">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <h1 className="text-lg font-bold leading-none">Import CSV</h1>
          <span className="ml-auto text-xs font-mono text-muted-foreground">Notion export</span>
        </div>
      </div>

      <main className="max-w-2xl mx-auto w-full px-4 py-6">
        <ImportClient />
      </main>
    </div>
  )
}
