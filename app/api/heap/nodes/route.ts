import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { heapNodes } from '@/lib/db/schema'

const CreateNodeSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(['task_cluster', 'note', 'goal', 'reference', 'brain_dump']).default('brain_dump'),
  body: z.string().max(10000).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  posX: z.number().finite().optional(),
  posY: z.number().finite().optional(),
})

export async function GET() {
  try {
    const user = await getCurrentUser()
    const db = getDb()
    const nodes = await db.select().from(heapNodes).where(eq(heapNodes.userId, user.id))
    return NextResponse.json(nodes)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    const body = await request.json()
    const parsed = CreateNodeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const db = getDb()
    const { posX = 0, posY = 0, ...rest } = parsed.data
    const [node] = await db.insert(heapNodes).values({
      id: createId(),
      userId: user.id,
      posX,
      posY,
      ...rest,
    }).returning()

    return NextResponse.json(node, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
