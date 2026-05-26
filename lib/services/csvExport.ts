// CSV export service — generates a Notion-compatible CSV from all active triggers.
// getCsvString() is the canonical implementation; regenerateCsv() composes it for disk writes.
// regenerateCsv() is local-dev only — serverless deployments should use getCsvString() directly.
import * as fs from 'fs'
import * as path from 'path'
import { eq } from 'drizzle-orm'
import { triggers, categories } from '@/lib/db/schema'
import type { DrizzleDb } from '@/lib/db/client'

const PRIORITY_LABELS: Record<number, string> = {
  0: 'Extremely High',
  1: 'High',
  2: 'Medium',
  3: 'Low',
}

// Escape a CSV field: wrap in quotes if it contains comma, quote, or newline
function escapeField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Returns a Notion-compatible CSV string of all active triggers.
 * Column order matches the original Notion export exactly.
 */
export async function getCsvString(db: DrizzleDb): Promise<string> {
  const rows = await db
    .select({
      id: triggers.id,
      title: triggers.title,
      categoryName: categories.name,
      priority: triggers.priority,
      reviewIntervalDays: triggers.reviewIntervalDays,
      summary: triggers.summary,
    })
    .from(triggers)
    .leftJoin(categories, eq(triggers.categoryId, categories.id))
    .where(eq(triggers.status, 'active'))

  const header = 'Idea,Category,Last Reviewed,Review Deadline,Priority,Increment,AI summary,Formula'

  const dataRows = rows.map(row => {
    const fields = [
      escapeField(row.title),
      escapeField(row.categoryName ?? ''),
      '0',                                           // Last Reviewed — placeholder
      String(row.reviewIntervalDays),
      escapeField(PRIORITY_LABELS[row.priority] ?? 'Medium'),
      '',                                            // Increment — unused
      escapeField(row.summary ?? ''),
      '',                                            // Formula — unused
    ]
    return fields.join(',')
  })

  return [header, ...dataRows].join('\n')
}

/**
 * Regenerates notion_backup/latest/triggers_export.csv from the current DB state.
 * Local dev only — swallows all errors to never block trigger operations.
 */
export async function regenerateCsv(db: DrizzleDb): Promise<void> {
  try {
    const csv = await getCsvString(db)
    const dir = path.join(process.cwd(), 'notion_backup', 'latest')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'triggers_export.csv'), csv)
  } catch (err) {
    console.error('[csvExport] Failed to write CSV backup:', err)
  }
}
