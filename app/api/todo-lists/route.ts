// Todo Lists API - list all lists (lazy Inbox creation) and create new lists.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createId } from '@paralleldrive/cuid2'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { todoLists } from '@/lib/db/schema'
import { ensureTodoListsForUser } from '@/lib/db/todoLists'

const CreateListSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().optional(),
  emoji: z.string().optional(),
})

/**
 * GET /api/todo-lists - returns all lists; lazily inserts "Inbox" if none exist.
 */
export async function GET(_request: Request) {
  try {
    const user = await getCurrentUser()
    const lists = await ensureTodoListsForUser(user.id)
    return NextResponse.json(lists)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

/**
 * POST /api/todo-lists - create a new list.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    const body = await request.json()
    const parsed = CreateListSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }
    const db = getDb()
    const [list] = await db
      .insert(todoLists)
      .values({ id: createId(), userId: user.id, ...parsed.data })
      .returning()
    return NextResponse.json(list, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
