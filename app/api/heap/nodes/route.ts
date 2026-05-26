import { NextResponse } from 'next/server'
import { z } from 'zod'
import { and, count, eq, getTableColumns } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { heapNodeTodos, heapNodes } from '@/lib/db/schema'

/**
 * Schema for validating GET query parameters — type and projectId are both optional filters.
 * The user_id filter is always applied separately as an IDOR guard.
 */
const GetNodesQuerySchema = z.object({
  type: z.enum(['task_cluster', 'note', 'goal', 'reference', 'brain_dump', 'project']).optional(),
  projectId: z.string().optional(),
})

/**
 * Schema for creating a new heap node. Includes 'project' as a valid type
 * and optional projectId to associate a node with a project.
 */
const CreateNodeSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(['task_cluster', 'note', 'goal', 'reference', 'brain_dump', 'project']).default('brain_dump'),
  body: z.string().max(10000).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  posX: z.number().finite().optional(),
  posY: z.number().finite().optional(),
  projectId: z.string().optional(),
})

/**
 * GET /api/heap/nodes
 * Returns all heap nodes for the current user. Optionally filters by:
 *   - type: one of the HeapNodeType enum values
 *   - projectId: only nodes belonging to that project
 * The userId condition is always included as an IDOR guard.
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser()
    const { searchParams } = new URL(request.url)
    const query = GetNodesQuerySchema.safeParse({
      type: searchParams.get('type') ?? undefined,
      projectId: searchParams.get('projectId') ?? undefined,
    })
    if (!query.success) {
      return NextResponse.json({ error: query.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const db = getDb()
    // Always filter by userId first — additional filters are layered on top
    const conditions = [eq(heapNodes.userId, user.id)]
    if (query.data.type) conditions.push(eq(heapNodes.type, query.data.type))
    if (query.data.projectId) conditions.push(eq(heapNodes.projectId, query.data.projectId))

    const nodes = await db
      .select({ ...getTableColumns(heapNodes), todoCount: count(heapNodeTodos.todoId) })
      .from(heapNodes)
      .leftJoin(heapNodeTodos, eq(heapNodeTodos.nodeId, heapNodes.id))
      .where(and(...conditions))
      .groupBy(heapNodes.id)
    return NextResponse.json(nodes)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

/**
 * POST /api/heap/nodes
 * Creates a new heap node for the current user.
 * Validates:
 *   - project nodes cannot be nested inside another project (type=project + projectId is rejected)
 *   - if projectId is provided, it must exist and belong to the current user and be type='project'
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    const body = await request.json()
    const parsed = CreateNodeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    // Project nodes cannot be nested (no projectId allowed when type=project)
    if (parsed.data.type === 'project' && parsed.data.projectId) {
      return NextResponse.json({ error: 'Project nodes cannot be nested inside another project', code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const db = getDb()

    // Validate projectId ownership and type — ensures no IDOR on project association
    if (parsed.data.projectId) {
      const [projectNode] = await db.select().from(heapNodes)
        .where(and(eq(heapNodes.id, parsed.data.projectId), eq(heapNodes.userId, user.id)))
      if (!projectNode || projectNode.type !== 'project') {
        return NextResponse.json({ error: 'Invalid projectId', code: 'VALIDATION_ERROR' }, { status: 400 })
      }
    }

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
