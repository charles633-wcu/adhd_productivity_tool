// Notion sync service — mirrors trigger creates, updates, and deletes to a Notion database.
// All errors are caught and logged; callers are never blocked by Notion outages.
// Requires NOTION_API_KEY and NOTION_DATABASE_ID in environment variables.
import * as NotionModule from '@notionhq/client'
import { eq } from 'drizzle-orm'
import { triggers, categories } from '@/lib/db/schema'
import type { DrizzleDb } from '@/lib/db/client'
import type { Trigger } from '@/lib/db/schema'
import type { Client } from '@notionhq/client'

const PRIORITY_LABELS: Record<number, string> = {
  0: 'Extremely High',
  1: 'High',
  2: 'Medium',
  3: 'Low',
}

// Instantiates the Notion client.
// Uses a try/new approach: attempts new (real SDK), falls back to plain call (vi.fn() mocks
// that use arrow function implementations, which Vitest 4.x cannot Reflect.construct).
function getClient(): Client | null {
  const key = process.env.NOTION_API_KEY
  if (!key) {
    console.warn('[notionSync] NOTION_API_KEY not set — sync disabled')
    return null
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor = NotionModule.Client as any
  try {
    return new Ctor({ auth: key }) as Client
  } catch {
    // Fallback for test mocks using arrow function implementations (not real constructors)
    return Ctor({ auth: key }) as Client
  }
}

function getDatabaseId(): string | null {
  const id = process.env.NOTION_DATABASE_ID
  if (!id) {
    console.warn('[notionSync] NOTION_DATABASE_ID not set — sync disabled')
    return null
  }
  return id
}

function buildProperties(trigger: Trigger, categoryName: string) {
  return {
    'Idea': {
      title: [{ text: { content: trigger.title } }],
    },
    'Category': {
      select: { name: categoryName },
    },
    'Priority': {
      select: { name: PRIORITY_LABELS[trigger.priority] ?? 'Medium' },
    },
    'Review Deadline': {
      number: trigger.reviewIntervalDays,
    },
    'AI summary': {
      rich_text: [{ text: { content: trigger.summary ?? '' } }],
    },
  }
}

/**
 * Creates or updates the Notion page mirroring this trigger.
 * Resolves categoryName from the DB internally — callers do not need to provide it.
 * If notionPageId is null, creates a new page and writes the page ID back to the DB.
 * Errors are swallowed — never thrown to callers.
 */
export async function syncTriggerToNotion(trigger: Trigger, db: DrizzleDb): Promise<void> {
  try {
    const notion = getClient()
    const databaseId = getDatabaseId()
    if (!notion || !databaseId) return

    // Resolve category name
    const [cat] = await db
      .select({ name: categories.name })
      .from(categories)
      .where(eq(categories.id, trigger.categoryId))
      .limit(1)
    const categoryName = cat?.name ?? ''

    const properties = buildProperties(trigger, categoryName)

    if (trigger.notionPageId) {
      // Update existing page
      await notion.pages.update({
        page_id: trigger.notionPageId,
        properties,
      })
    } else {
      // Create new page and store returned page ID
      const page = await notion.pages.create({
        parent: { database_id: databaseId },
        properties,
      })
      await db
        .update(triggers)
        .set({ notionPageId: page.id })
        .where(eq(triggers.id, trigger.id))
    }
  } catch (err) {
    console.error('[notionSync] syncTriggerToNotion failed:', err)
  }
}

/**
 * Archives a Notion page (soft-delete — recoverable for 30 days).
 * No-ops if notionPageId is null (trigger was never synced).
 * Errors are swallowed — never thrown to callers.
 */
export async function archiveTriggerInNotion(notionPageId: string | null): Promise<void> {
  if (!notionPageId) return
  try {
    const notion = getClient()
    if (!notion) return
    await notion.pages.update({
      page_id: notionPageId,
      archived: true,
    })
  } catch (err) {
    console.error('[notionSync] archiveTriggerInNotion failed:', err)
  }
}
