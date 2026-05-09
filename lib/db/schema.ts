// Database schema — Drizzle ORM table definitions and inferred TypeScript types.
// Single source of truth for all DB column shapes; consumed by lib/db/client.ts,
// lib/db/triggers.ts, and all API route and service functions.
import { sqliteTable, text, integer, real, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { createId } from '@paralleldrive/cuid2'
import { sql } from 'drizzle-orm'

// Users table — multi-user ready; MVP seeds a single local user
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  email: text('email').notNull().unique(),
  name: text('name'),
  // JSON: Record<categoryId, "q,r"> — hex grid layout persisted server-side
  hexLayout: text('hex_layout'),
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
// Notification channel enum — null means in-app only (MVP default)
export type NotifyChannel = 'email' | 'sms' | 'push' | null

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
  notifyChannel: text('notify_channel').$type<NonNullable<NotifyChannel>>(),
  // shape: { notes?: ..., condensedHistory?: string, autoCompact?: boolean, lastAgentRun?: string (ISO) }
  agentMetadata: text('agent_metadata', { mode: 'json' }).$type<{
    notes?: { id: string; date: string; text: string }[]
    condensedHistory?: string
    autoCompact?: boolean
    lastAgentRun?: string
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

// Saved chat conversations — user-scoped, messages stored as JSON
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Auto-generated from first user message, truncated to 60 chars
  title: text('title').notNull(),
  // JSON array of { role: 'user'|'assistant', content: string }
  messages: text('messages', { mode: 'json' }).$type<{ role: string; content: string }[]>().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

// Calendar: event_categories — isolated from Sentinel categories
export const eventCategories = sqliteTable('event_categories', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6366f1'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`).$onUpdate(() => new Date()),
})

// Calendar: personal events with optional RRULE repeat rules
export const calendarEvents = sqliteTable('calendar_events', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  startAt: integer('start_at', { mode: 'timestamp' }).notNull(),
  endAt: integer('end_at', { mode: 'timestamp' }).notNull(),
  color: text('color'),
  notes: text('notes'),
  rrule: text('rrule'),
  exdates: text('exdates', { mode: 'json' }).$type<string[]>(),
  categoryId: text('category_id').references(() => eventCategories.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`).$onUpdate(() => new Date()),
})

// Calendar: per-occurrence overrides for recurring events (RECURRENCE-ID model)
export const calendarEventOverrides = sqliteTable(
  'calendar_event_overrides',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    masterEventId: text('master_event_id')
      .notNull()
      .references(() => calendarEvents.id, { onDelete: 'cascade' }),
    originalDate: text('original_date').notNull(),
    title: text('title').notNull(),
    startAt: integer('start_at', { mode: 'timestamp' }).notNull(),
    endAt: integer('end_at', { mode: 'timestamp' }).notNull(),
    notes: text('notes'),
  },
  (t) => ({
    masterOriginalUniq: uniqueIndex('cal_evt_override_master_original_uniq')
      .on(t.masterEventId, t.originalDate),
  }),
)

// Calendar: ICS subscription — one per user
export const icsSubscriptions = sqliteTable('ics_subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  url: text('url').notNull(),
  lastFetchedAt: integer('last_fetched_at', { mode: 'timestamp' }),
  cachedEventsJson: text('cached_events_json'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`).$onUpdate(() => new Date()),
})

// ── To-Do Feature ─────────────────────────────────────────────────────────────

// todo_lists — named project lists; "Inbox" is auto-created per user
export const todoLists = sqliteTable('todo_lists', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color'),
  emoji: text('emoji'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)
    .$onUpdate(() => new Date()),
})

// todo_labels — tags for cross-list filtering
export const todoLabels = sqliteTable('todo_labels', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

// todos — core task entity; parentId makes it a subtask (one level only)
export const todos = sqliteTable('todos', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  listId: text('list_id').notNull().references(() => todoLists.id, { onDelete: 'cascade' }),
  parentId: text('parent_id'),  // FK to todos.id enforced at API layer
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority').$type<'high' | 'medium' | 'low' | 'none'>().notNull().default('none'),
  dueDate: text('due_date'),    // YYYY-MM-DD
  dueTime: text('due_time'),    // HH:MM
  completed: integer('completed').notNull().default(0),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)
    .$onUpdate(() => new Date()),
})

// todo_task_labels — junction: many todos ↔ many labels (composite PK prevents duplicates)
export const todoTaskLabels = sqliteTable('todo_task_labels', {
  todoId: text('todo_id').notNull().references(() => todos.id, { onDelete: 'cascade' }),
  labelId: text('label_id').notNull().references(() => todoLabels.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.todoId, table.labelId] }),
}))

// Heap Knowledge Graph
// Shape options for heap canvas nodes
export type HeapNodeShape = 'rectangle' | 'circle' | 'diamond' | 'pill'
export type HeapNodeType = 'task_cluster' | 'note' | 'goal' | 'reference' | 'brain_dump'

// heap_nodes - spatial knowledge graph nodes; posX/posY are canvas coordinates
export const heapNodes = sqliteTable('heap_nodes', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').$type<HeapNodeType>().notNull().default('brain_dump'),
  title: text('title').notNull(),
  body: text('body'),
  color: text('color'),
  posX: real('pos_x').notNull().default(0),
  posY: real('pos_y').notNull().default(0),
  // Visual shape — defaults to rectangle so existing nodes are unchanged
  shape: text('shape').$type<HeapNodeShape>().notNull().default('rectangle'),
  // Persisted dimensions — null means use per-shape component default; only used for circle resize
  width: real('width'),
  height: real('height'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`).$onUpdate(() => new Date()),
})

// heap_edges - directed connections between nodes; unique per user+source+target
export const heapEdges = sqliteTable('heap_edges', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sourceId: text('source_id').notNull().references(() => heapNodes.id, { onDelete: 'cascade' }),
  targetId: text('target_id').notNull().references(() => heapNodes.id, { onDelete: 'cascade' }),
  label: text('label'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => ({
  uniqueSourceTarget: uniqueIndex('heap_edges_user_source_target_idx').on(t.userId, t.sourceId, t.targetId),
}))

// heap_node_todos - junction: many heap_nodes to many todos (cascade on both sides)
export const heapNodeTodos = sqliteTable('heap_node_todos', {
  nodeId: text('node_id').notNull().references(() => heapNodes.id, { onDelete: 'cascade' }),
  todoId: text('todo_id').notNull().references(() => todos.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.nodeId, t.todoId] }),
}))

// heap_node_triggers - junction: many heap_nodes to many triggers (cascade on both sides)
export const heapNodeTriggers = sqliteTable('heap_node_triggers', {
  nodeId: text('node_id').notNull().references(() => heapNodes.id, { onDelete: 'cascade' }),
  triggerId: text('trigger_id').notNull().references(() => triggers.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.nodeId, t.triggerId] }),
}))

// Infer TypeScript types from schema
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert
export type Trigger = typeof triggers.$inferSelect
export type NewTrigger = typeof triggers.$inferInsert
export type Conversation = typeof conversations.$inferSelect
export type NewConversation = typeof conversations.$inferInsert
export type EventCategory = typeof eventCategories.$inferSelect
export type NewEventCategory = typeof eventCategories.$inferInsert
export type CalendarEvent = typeof calendarEvents.$inferSelect
export type NewCalendarEvent = typeof calendarEvents.$inferInsert
export type CalendarEventOverride = typeof calendarEventOverrides.$inferSelect
export type NewCalendarEventOverride = typeof calendarEventOverrides.$inferInsert
export type IcsSubscription = typeof icsSubscriptions.$inferSelect
export type NewIcsSubscription = typeof icsSubscriptions.$inferInsert
export type TodoList = typeof todoLists.$inferSelect
export type NewTodoList = typeof todoLists.$inferInsert
export type TodoLabel = typeof todoLabels.$inferSelect
export type NewTodoLabel = typeof todoLabels.$inferInsert
export type Todo = typeof todos.$inferSelect
export type NewTodo = typeof todos.$inferInsert
export type TodoTaskLabel = typeof todoTaskLabels.$inferSelect
export type NewTodoTaskLabel = typeof todoTaskLabels.$inferInsert
export type TodoPriority = 'high' | 'medium' | 'low' | 'none'
export type HeapNode = typeof heapNodes.$inferSelect
export type NewHeapNode = typeof heapNodes.$inferInsert
export type HeapEdge = typeof heapEdges.$inferSelect
export type NewHeapEdge = typeof heapEdges.$inferInsert
export type HeapNodeTodo = typeof heapNodeTodos.$inferSelect
export type HeapNodeTrigger = typeof heapNodeTriggers.$inferSelect
export type NewHeapNodeTrigger = typeof heapNodeTriggers.$inferInsert
