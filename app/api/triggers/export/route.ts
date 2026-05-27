// Export route — returns all active triggers as a Notion-compatible CSV file download.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { getCurrentUser } from '@/lib/auth'
import { getCsvString } from '@/lib/services/csvExport'

/**
 * GET /api/triggers/export — download all active triggers as a Notion-compatible CSV.
 * Uses getCsvString() directly — safe in serverless environments (no disk write).
 */
export async function GET() {
  try {
    await getCurrentUser()
    const db = getDb()
    const csv = await getCsvString(db)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="triggers_export.csv"',
      },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
