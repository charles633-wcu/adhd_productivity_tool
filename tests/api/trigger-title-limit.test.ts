import { beforeEach, describe, expect, it, vi } from 'vitest'

// Title-length validation for POST /api/triggers and PATCH /api/triggers/[id].
// Both routes must share the same limit (create used to cap at 200 while edit had none,
// so long titles saved via edit could never be re-created).

const {
  getCurrentUser,
  getDb,
  createTrigger,
  logTriggerAction,
  syncTriggerToNotion,
  regenerateCsv,
} = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
  createTrigger: vi.fn(),
  logTriggerAction: vi.fn(),
  syncTriggerToNotion: vi.fn(),
  regenerateCsv: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))
vi.mock('@/lib/db/triggers', () => ({
  createTrigger,
  acknowledgeTrigger: vi.fn(),
  rescheduleTrigger: vi.fn(),
}))
vi.mock('@/lib/dev/triggerActionLogger', () => ({ logTriggerAction }))
vi.mock('@/lib/services/notionSync', () => ({ syncTriggerToNotion, archiveTriggerInNotion: vi.fn() }))
vi.mock('@/lib/services/csvExport', () => ({ regenerateCsv }))

import { POST } from '@/app/api/triggers/route'
import { PATCH } from '@/app/api/triggers/[id]/route'
import { TRIGGER_TITLE_MAX } from '@/lib/validation/apiErrors'

function postTrigger(title: string) {
  return POST(new Request('http://localhost/api/triggers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoryId: 'cat-1', title }),
  }))
}

function patchTrigger(body: Record<string, unknown>) {
  return PATCH(
    new Request('http://localhost/api/triggers/trig-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'trig-1' }) }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  getCurrentUser.mockResolvedValue({ id: 'user-1' })
  syncTriggerToNotion.mockResolvedValue(undefined)
  regenerateCsv.mockResolvedValue(undefined)
  // Category ownership lookup succeeds
  getDb.mockReturnValue({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ id: 'cat-1' }]) })),
      })),
    })),
  })
  createTrigger.mockImplementation(async (_db, data) => ({ id: 'trig-1', ...data }))
})

describe('POST /api/triggers title limit', () => {
  it('accepts a title exactly at the limit', async () => {
    const res = await postTrigger('x'.repeat(TRIGGER_TITLE_MAX))
    expect(res.status).toBe(201)
    expect(createTrigger).toHaveBeenCalledOnce()
  })

  it('rejects a title one past the limit with a readable message', async () => {
    const res = await postTrigger('x'.repeat(TRIGGER_TITLE_MAX + 1))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
    expect(body.error).toBe(`Too many characters in Title: ${TRIGGER_TITLE_MAX + 1}/${TRIGGER_TITLE_MAX}`)
    expect(createTrigger).not.toHaveBeenCalled()
  })

  it('rejects an empty title as required', async () => {
    const res = await postTrigger('')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Title is required')
  })
})

describe('PATCH /api/triggers/[id] title limit', () => {
  it('rejects a title one past the limit with the same message as create', async () => {
    const res = await patchTrigger({ title: 'x'.repeat(TRIGGER_TITLE_MAX + 1) })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(
      `Too many characters in Title: ${TRIGGER_TITLE_MAX + 1}/${TRIGGER_TITLE_MAX}`
    )
  })

  it('rejects an empty title as required', async () => {
    const res = await patchTrigger({ title: '' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Title is required')
  })
})
