// Category detail API — update and delete individual categories.
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import { categories } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { eq, and } from 'drizzle-orm'

const PatchCategorySchema = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  // null explicitly clears the icon; undefined means "don't touch this field"
  icon: z.string().max(10).nullable().optional(),
  name: z.string().min(1).max(50).optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'At least one field required' })

/**
 * PATCH /api/categories/[id] — update color, icon, or name of a category
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const body = await request.json()
    const parsed = PatchCategorySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }
    const db = getDb()
    const [updated] = await db
      .update(categories)
      .set(parsed.data)
      .where(and(eq(categories.id, id), eq(categories.userId, user.id)))
      .returning()
    if (!updated) {
      return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}

/**
 * DELETE /api/categories/[id] — remove a category and all its triggers (cascade).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const db = getDb()
    // Verify ownership before deleting
    const [owned] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, user.id)))
      .limit(1)
    if (!owned) return new NextResponse(null, { status: 204 })
    await db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, user.id)))
    revalidatePath('/')
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return NextResponse.json({ error: String(error), code: 'DB_ERROR' }, { status: 500 })
  }
}
