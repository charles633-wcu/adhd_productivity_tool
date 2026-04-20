'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileText, CheckCircle2 } from 'lucide-react'

// ImportClient — handles CSV upload, parsing, preview, and bulk import.
// Supports Notion CSV exports with columns: Idea, Category, Priority, Review Deadline.
// User can override the review interval globally (any number of days) or use per-row values.

interface ParsedRow {
  title: string
  categoryName: string
  priority: number   // 0=Very High, 1=High, 2=Medium, 3=Low
  reviewIntervalDays: number
  fullContent: string
  summary: string
}

const PRIORITY_LABEL: Record<number, string> = { 0: 'Very High', 1: 'High', 2: 'Medium', 3: 'Low' }
const PRIORITY_COLOR: Record<number, string> = {
  0: 'text-red-400',
  1: 'text-rose-400',
  2: 'text-yellow-400',
  3: 'text-emerald-400',
}

// ── CSV helpers ──────────────────────────────────────────────────────────────

// Parse one CSV line, respecting double-quoted fields (handles commas inside quotes)
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = '' }
    else { current += ch }
  }
  result.push(current.trim())
  return result
}

function mapPriority(csv: string): number {
  const p = csv.toLowerCase().trim()
  if (p.includes('extremely') || p.includes('very')) return 0
  if (p === 'high') return 1
  if (p === 'medium' || p === 'med') return 2
  return 3 // low / unknown → backlog
}

// Parses the Notion CSV export. Tries to locate columns by common header names.
function parseNotionCSV(text: string): ParsedRow[] {
  const lines = text.trim().split('\n').filter(Boolean)
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim())

  // Flexible column matching
  const col = (candidates: string[]) =>
    headers.findIndex(h => candidates.some(c => h.includes(c)))

  const ideaIdx        = col(['idea', 'name', 'title', 'task', 'reminder'])
  const catIdx         = col(['category', 'cat', 'tag', 'group', 'type'])
  const priorityIdx    = col(['priority'])
  const daysIdx        = col(['deadline', 'interval', 'days', 'review'])
  const summaryIdx     = col(['summary', 'ai summary', 'aisummary'])
  const fullContentIdx = col(['fullcontent', 'full_content', 'notes', 'content'])

  return lines.slice(1).flatMap<ParsedRow>(line => {
    const cols = parseCSVLine(line)
    const title        = ideaIdx    >= 0 ? (cols[ideaIdx]     ?? '') : ''
    const categoryName = catIdx     >= 0 ? (cols[catIdx]      ?? 'General') : 'General'
    const priorityRaw  = priorityIdx >= 0 ? (cols[priorityIdx] ?? '') : ''
    const daysRaw      = daysIdx    >= 0 ? parseInt(cols[daysIdx] ?? '7', 10) : 7
    const summary      = summaryIdx     >= 0 ? (cols[summaryIdx]     ?? '').trim() : ''
    const fullContent  = fullContentIdx >= 0 ? (cols[fullContentIdx] ?? '').trim() : ''

    if (!title.trim()) return []  // skip blank rows

    return [{
      title: title.trim(),
      categoryName: (categoryName.trim() || 'General'),
      priority: mapPriority(priorityRaw),
      reviewIntervalDays: Number.isNaN(daysRaw) || daysRaw < 1 ? 7 : daysRaw,
      summary,
      fullContent,
    }]
  })
}

// ── Component ────────────────────────────────────────────────────────────────

export function ImportClient() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [rows,       setRows]       = useState<ParsedRow[] | null>(null)
  const [fileName,   setFileName]   = useState('')
  const [interval,   setInterval]   = useState('')   // global override — empty = use CSV values
  const [dragging,   setDragging]   = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [imported,   setImported]   = useState<number | null>(null)

  // ── File handling ──────────────────────────────────────────────────────────

  function processFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a .csv file')
      return
    }
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const parsed = parseNotionCSV(text)
      if (parsed.length === 0) {
        setError('No valid rows found. Make sure the CSV has Idea, Category, Priority, and Review Deadline columns.')
        return
      }
      setRows(parsed)
      setFileName(file.name)
      setError(null)
    }
    reader.readAsText(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  async function handleImport() {
    if (!rows) return
    setLoading(true)
    setError(null)

    const overridedays = interval ? parseInt(interval, 10) : null

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: rows.map(r => ({
            ...r,
            reviewIntervalDays: overridedays ?? r.reviewIntervalDays,
          })),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Import failed')
      }
      const data = await res.json()
      setImported(data.inserted)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────────

  if (imported !== null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center ring-1 ring-emerald-500/20">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">All done</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {imported} trigger{imported !== 1 ? 's' : ''} imported
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="mt-2 rounded-xl bg-primary text-primary-foreground px-6 py-2.5 text-sm font-semibold hover:bg-primary/90 transition-all active:scale-[0.98]"
        >
          Go to home
        </button>
      </div>
    )
  }

  const uniqueCategories = rows ? [...new Set(rows.map(r => r.categoryName))] : []
  const effectiveDays = interval ? parseInt(interval, 10) : null

  return (
    <div className="space-y-6">

      {/* ── Drop zone ─────────────────────────────────────────────────────── */}
      {!rows ? (
        <div
          role="button"
          tabIndex={0}
          className={[
            'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-16 text-center cursor-pointer transition-all',
            dragging
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-muted/20',
          ].join(' ')}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
        >
          <Upload className={`h-8 w-8 ${dragging ? 'text-primary' : 'text-muted-foreground'}`} />
          <div>
            <p className="text-sm font-medium">Drop your Notion CSV here</p>
            <p className="text-xs text-muted-foreground mt-0.5">or click to browse</p>
          </div>
          <p className="text-[10px] font-mono text-muted-foreground/50">
            expects: Idea · Category · Priority · Review Deadline
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>
      ) : (
        <>
          {/* ── File meta row ────────────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm text-muted-foreground truncate">{fileName}</span>
              <span className="text-xs font-mono text-muted-foreground/50 shrink-0">
                · {rows.length} row{rows.length !== 1 ? 's' : ''}
              </span>
            </div>
            <button
              type="button"
              onClick={() => { setRows(null); setFileName(''); setError(null); setInterval('') }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-4"
            >
              Change
            </button>
          </div>

          {/* ── Categories detected ───────────────────────────────────────── */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Categories found ({uniqueCategories.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {uniqueCategories.map(cat => (
                <span key={cat} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                  {cat}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/60">
              New categories will be created automatically with a default color you can change later.
            </p>
          </div>

          {/* ── Review interval override ──────────────────────────────────── */}
          <div className="space-y-1.5">
            <label
              htmlFor="import-interval"
              className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
            >
              Review interval
              <span className="normal-case tracking-normal font-normal ml-1 text-muted-foreground/60">
                — type any number of days, or leave blank to use each row&apos;s own value
              </span>
            </label>
            <div className="flex items-center gap-3">
              <input
                id="import-interval"
                type="number"
                min="1"
                max="365"
                placeholder="e.g. 7"
                value={interval}
                onChange={e => setInterval(e.target.value)}
                className="w-28 rounded-xl border border-input bg-muted/40 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"
              />
              {effectiveDays && effectiveDays > 0 ? (
                <span className="text-xs text-muted-foreground">
                  Every trigger will review every{' '}
                  <span className="font-semibold text-primary">{effectiveDays} day{effectiveDays !== 1 ? 's' : ''}</span>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground/60">Using each row&apos;s CSV value</span>
              )}
            </div>
          </div>

          {/* ── Preview table ─────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Preview
            </p>
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Title</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Category</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Priority</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className="border-t border-border/60 hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2 font-medium text-foreground max-w-[180px] truncate" title={row.title}>
                          {row.title}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{row.categoryName}</td>
                        <td className={`px-3 py-2 font-semibold ${PRIORITY_COLOR[row.priority]}`}>
                          {PRIORITY_LABEL[row.priority]}
                        </td>
                        <td className="px-3 py-2 font-mono">
                          {effectiveDays && effectiveDays > 0 ? (
                            <span className="text-primary font-semibold">{effectiveDays}d</span>
                          ) : (
                            <span className="text-muted-foreground">{row.reviewIntervalDays}d</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {/* ── Import button ─────────────────────────────────────────────────── */}
      {rows && (
        <button
          type="button"
          onClick={handleImport}
          disabled={loading}
          className="w-full rounded-xl bg-primary text-primary-foreground px-4 py-3 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.98]"
        >
          {loading ? 'Importing…' : `Import ${rows.length} trigger${rows.length !== 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  )
}
