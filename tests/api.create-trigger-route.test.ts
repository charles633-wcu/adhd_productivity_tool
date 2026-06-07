import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getCurrentUser,
  getDb,
  createTrigger,
  acknowledgeTrigger,
  maybeAutoCompact,
  makeNote,
  revalidatePath,
  logTriggerAction,
  syncTriggerToNotion,
  regenerateCsv,
} = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
  createTrigger: vi.fn(),
  acknowledgeTrigger: vi.fn(),
  maybeAutoCompact: vi.fn(),
  makeNote: vi.fn(),
  revalidatePath: vi.fn(),
  logTriggerAction: vi.fn(),
  syncTriggerToNotion: vi.fn(),
  regenerateCsv: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath,
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUser,
}))

vi.mock('@/lib/db/client', () => ({
  getDb,
}))

vi.mock('@/lib/db/triggers', () => ({
  createTrigger,
  acknowledgeTrigger,
  rescheduleTrigger: vi.fn(),
}))

vi.mock('@/lib/db/notes', () => ({
  makeNote,
  mergeMetadata: vi.fn((existing: Record<string, unknown> | null, patch: Record<string, unknown>) => ({ ...(existing ?? {}), ...patch })),
  maybeAutoCompact,
  NOTE_LIMIT: 50,
}))

vi.mock('@/lib/dev/triggerActionLogger', () => ({
  logTriggerAction,
}))

vi.mock('@/lib/services/notionSync', () => ({ syncTriggerToNotion }))
vi.mock('@/lib/services/csvExport', () => ({ regenerateCsv }))

import { POST } from '@/app/api/triggers/route'

describe('trigger create route scheduling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'))
  })

  it('schedules new triggers exactly reviewIntervalDays after creation', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1' })

    const ownershipQuery = {
      limit: vi.fn().mockResolvedValue([{ id: 'cat-1' }]),
    }

    getDb.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ownershipQuery),
        })),
      })),
    })

    createTrigger.mockResolvedValue({
      id: 'trigger-1',
      userId: 'user-1',
      categoryId: 'cat-1',
      title: 'Review auth flow',
      nextReviewAt: new Date('2026-04-22T12:00:00.000Z'),
    })

    const response = await POST(new Request('http://localhost/api/triggers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat-1',
        title: 'Review auth flow',
        reviewIntervalDays: 7,
      }),
    }))

    expect(response.status).toBe(201)
    expect(createTrigger).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        nextReviewAt: new Date('2026-04-22T12:00:00.000Z'),
      })
    )
    expect(logTriggerAction).toHaveBeenCalledWith('create', expect.objectContaining({
      id: 'trigger-1',
    }))
    expect(syncTriggerToNotion).toHaveBeenCalledOnce()
    expect(regenerateCsv).toHaveBeenCalledOnce()
  })
})

describe('PATCH /api/triggers/[id] — note on acknowledge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-16T12:00:00.000Z'))
    getCurrentUser.mockResolvedValue({ id: 'user-1' })
    // Best-effort mirrors are fired without await but with .catch(); mocks must return promises.
    syncTriggerToNotion.mockResolvedValue(undefined)
    regenerateCsv.mockResolvedValue(undefined)
  })

  it('appends note to agentMetadata when acknowledge + note provided', async () => {
    const existingTrigger = {
      id: 'trig-1', userId: 'user-1', categoryId: 'cat-1',
      agentMetadata: { notes: [] },
    }
    const updatedTrigger = { ...existingTrigger, agentMetadata: { notes: [{ id: 'note-1', date: '2026-04-16T12:00:00.000Z', text: 'test note' }] } }

    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([existingTrigger]) })) })) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([updatedTrigger]) })) })) })),
    }
    getDb.mockReturnValue(db)
    acknowledgeTrigger.mockResolvedValue(existingTrigger)
    makeNote.mockReturnValue({ id: 'note-1', date: '2026-04-16T12:00:00.000Z', text: 'test note' })
    maybeAutoCompact.mockResolvedValue({ notes: [{ id: 'note-1', date: '2026-04-16T12:00:00.000Z', text: 'test note' }] })

    const { PATCH } = await import('@/app/api/triggers/[id]/route')
    const res = await PATCH(
      new Request('http://localhost/api/triggers/trig-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledge: true, note: 'test note' }),
      }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )
    expect(res.status).toBe(200)
    expect(maybeAutoCompact).toHaveBeenCalled()
    expect(logTriggerAction).toHaveBeenCalledWith('acknowledge_note', expect.objectContaining({
      id: 'trig-1',
    }))
  })

  it('does not append empty note on acknowledge', async () => {
    const existingTrigger = { id: 'trig-1', userId: 'user-1', categoryId: 'cat-1', agentMetadata: null }
    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([existingTrigger]) })) })) })),
    }
    getDb.mockReturnValue(db)
    acknowledgeTrigger.mockResolvedValue(existingTrigger)

    const { PATCH } = await import('@/app/api/triggers/[id]/route')
    const res = await PATCH(
      new Request('http://localhost/api/triggers/trig-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledge: true, note: '   ' }),
      }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )
    expect(res.status).toBe(200)
    // maybeAutoCompact not called because no note was appended
    expect(maybeAutoCompact).not.toHaveBeenCalled()
    expect(logTriggerAction).toHaveBeenCalledWith('acknowledge', expect.objectContaining({
      id: 'trig-1',
    }))
  })

  it('persists autoCompact preference using shallow merge', async () => {
    const existingTrigger = {
      id: 'trig-1', userId: 'user-1', categoryId: 'cat-1',
      agentMetadata: { notes: [{ id: 'n1', date: '2026-04-01', text: 'existing note' }], condensedHistory: 'old history' },
    }
    let capturedSet: unknown
    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([existingTrigger]) })) })) })),
      update: vi.fn(() => ({ set: vi.fn((data: unknown) => { capturedSet = data; return { where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([existingTrigger]) })) } }) })),
    }
    getDb.mockReturnValue(db)

    const { PATCH } = await import('@/app/api/triggers/[id]/route')
    await PATCH(
      new Request('http://localhost/api/triggers/trig-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoCompact: true }),
      }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )
    // Shallow merge: existing notes and condensedHistory preserved
    const meta = (capturedSet as { agentMetadata: unknown }).agentMetadata as Record<string, unknown>
    expect(meta.autoCompact).toBe(true)
    expect(meta.notes).toHaveLength(1)
    expect(meta.condensedHistory).toBe('old history')
    expect(logTriggerAction).toHaveBeenCalledWith('toggle_auto_compact', expect.objectContaining({
      id: 'trig-1',
    }))
  })
})
