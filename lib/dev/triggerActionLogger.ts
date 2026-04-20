// Development-only trigger mutation audit logger.
// This is not core application behavior; it exists to help inspect local writes against the database.
import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const LOG_FILE_PATH = path.join(process.cwd(), 'docs', 'dev-trigger-actions.log')

type TriggerActionSnapshot = {
  id?: string
  title?: string
  [key: string]: unknown
}

export async function logTriggerAction(action: string, trigger: TriggerActionSnapshot): Promise<void> {
  if (process.env.NODE_ENV !== 'development') return

  const timestamp = new Date().toISOString()
  const line = [
    timestamp,
    `action=${action}`,
    `triggerId=${trigger.id ?? 'unknown'}`,
    `title=${JSON.stringify(trigger.title ?? '')}`,
    `state=${JSON.stringify(trigger)}`,
  ].join(' | ')

  await mkdir(path.dirname(LOG_FILE_PATH), { recursive: true })
  await appendFile(LOG_FILE_PATH, `${line}\n`, 'utf8')
}
