import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { createId } from '@paralleldrive/cuid2'
import { sql } from 'drizzle-orm'

// Users table — multi-user ready; MVP seeds a single local user
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

// Categories — user-scoped, created on the fly
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // hex color e.g. "#6366f1" for bubble background
  color: text('color'),
  // emoji e.g. "💼" or lucide icon name e.g. "briefcase"
  icon: text('icon'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

// Summary status enum values
export type SummaryStatus = 'pending' | 'generated' | 'manual'
// Trigger lifecycle status enum values
export type TriggerStatus = 'active' | 'snoozed' | 'archived'

// Triggers — core entity (each reminder/alarm item)
export const triggers = sqliteTable('triggers', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  categoryId: text('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),

  // Content fields
  title: text('title').notNull(),
  fullContent: text('full_content').notNull().default(''),
  summary: text('summary'),
  // pending = not yet sent to Gemini, generated = Gemini returned result, manual = user-written
  summaryStatus: text('summary_status').$type<SummaryStatus>().notNull().default('pending'),

  // Priority: 0 = Critical, 1 = High, 2 = Medium, 3 = Backlog
  priority: integer('priority').notNull().default(2),

  // Review clock fields
  reviewIntervalDays: integer('review_interval_days').notNull().default(7),
  lastReviewedAt: integer('last_reviewed_at', { mode: 'timestamp' }),
  nextReviewAt: integer('next_review_at', { mode: 'timestamp' }).notNull(),

  // Lifecycle
  status: text('status').$type<TriggerStatus>().notNull().default('active'),

  // Agent hook fields (not active in MVP)
  notifyChannel: text('notify_channel').$type<'email' | 'sms' | 'push'>(),
  // shape: { lastAgentRun?: string (ISO), agentNotes?: string }
  agentMetadata: text('agent_metadata', { mode: 'json' }).$type<{
    lastAgentRun?: string
    agentNotes?: string
  }>(),

  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  // .$onUpdate ensures this column updates automatically on every PATCH
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)
    .$onUpdate(() => new Date()),
})

// Infer TypeScript types from schema
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert
export type Trigger = typeof triggers.$inferSelect
export type NewTrigger = typeof triggers.$inferInsert
